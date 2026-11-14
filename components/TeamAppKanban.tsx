'use client';

import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '@/app/app/team-app.module.css';
import mobile from '@/app/app/mobile-first.module.css';
import deck from '@/app/app/team-deck.module.css';
import { TeamAppCard } from './TeamAppCard';

type Column = { id: string; name: string; cardCount: number };
type Card = { id: string; title: string; client: string; columnSourceId: string; dueOn: string | null };
type ColumnCards = { items: Card[]; nextCursor: string | null; loading?: boolean };
type DropTargetData = { columnSourceId?: string };

function DraggableDeckCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, data: { columnSourceId: card.columnSourceId } });
  return <article ref={setNodeRef} className={`${styles.card} ${deck.card}${isDragging ? ` ${deck.dragging}` : ''}`} style={{ transform: CSS.Translate.toString(transform) }}><a href={`/app/deck?card=${encodeURIComponent(card.id)}`}><b>{card.title}</b><small>{card.client || 'Internal'}{card.dueOn ? ` · Due ${card.dueOn}` : ''}</small></a><button className={deck.grabber} type="button" aria-label={`Drag ${card.title}`} {...attributes} {...listeners}><i /><i /><i /></button></article>;
}

function DeckColumn({ column, cards, isOpen, isDropTarget, activeDragColumnId, onToggle, onLoadMore }: { column: Column; cards: ColumnCards | undefined; isOpen: boolean; isDropTarget: boolean; activeDragColumnId: string; onToggle: (open: boolean) => void; onLoadMore: () => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id, data: { columnSourceId: column.id }, disabled: activeDragColumnId === column.id });
  return <details ref={setNodeRef} className={`${styles.column} ${mobile.lane} ${deck.column}${isOver || isDropTarget ? ` ${deck.dropTarget}` : ''}`} open={isOpen} onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}><summary><h2>{column.name}<small>{column.cardCount}</small></h2></summary><div className={deck.cardList}>{cards?.items.map((card) => <DraggableDeckCard card={card} key={card.id} />)}{cards?.loading && <p className={styles.empty}>Loading cards…</p>}{cards && cards.nextCursor && !cards.loading && <button type="button" onClick={onLoadMore}>Load more</button>}</div></details>;
}

export function TeamAppKanban() {
  const [columns, setColumns] = useState<Column[] | null>(null); const [cardsByColumn, setCardsByColumn] = useState<Record<string, ColumnCards>>({}); const [openColumns, setOpenColumns] = useState<Record<string, boolean>>({}); const [error, setError] = useState(''); const [cardId, setCardId] = useState(''); const [activeDragId, setActiveDragId] = useState(''); const [dropColumnId, setDropColumnId] = useState('');
  const cardsByColumnRef = useRef<Record<string, ColumnCards>>({});
  useEffect(() => { cardsByColumnRef.current = cardsByColumn; }, [cardsByColumn]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));
  const loadColumn = useCallback(async (columnId: string, append = false) => {
    const previous = cardsByColumnRef.current[columnId]; const cursor = append ? previous?.nextCursor || '' : '';
    if (previous?.loading || (append && !cursor)) return;
    setCardsByColumn((current) => ({ ...current, [columnId]: { ...(current[columnId] || { items: [], nextCursor: null }), loading: true } }));
    try {
      const response = await fetch(`/api/internal/v1/cards?columnId=${encodeURIComponent(columnId)}&limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { cache: 'no-store' });
      if (response.status === 401) { location.assign(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`); return; }
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Unable to load cards.');
      setCardsByColumn((current) => ({ ...current, [columnId]: { items: append ? [...(current[columnId]?.items || []), ...payload.data] : payload.data, nextCursor: payload.meta?.nextCursor || null } }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load cards.'); setCardsByColumn((current) => ({ ...current, [columnId]: { ...(current[columnId] || { items: [], nextCursor: null }), loading: false } })); }
  }, []);
  const loadBoard = useCallback(async () => {
    const response = await fetch('/api/internal/v1/boards/production', { cache: 'no-store' }); if (response.status === 401) { location.assign(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`); return; }
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Unable to load The Deck.'); const nextColumns = payload.data.columns as Column[]; setColumns(nextColumns); await Promise.all(nextColumns.filter((column) => ['in progress', 'edit'].includes(column.name.toLowerCase())).map((column) => loadColumn(column.id)));
  }, [loadColumn]);
  useEffect(() => { setCardId(new URLSearchParams(location.search).get('card') || ''); }, []);
  useEffect(() => { void loadBoard().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load The Deck.')); }, [loadBoard]);
  if (cardId) return <TeamAppCard id={cardId} />;
  const cards = Object.values(cardsByColumn).flatMap((bucket) => bucket.items);
  const moveCard = async (event: DragEndEvent) => {
    const columnSourceId = (event.over?.data.current as DropTargetData | undefined)?.columnSourceId; const card = cards.find((item) => item.id === String(event.active.id)); if (!card || !columnSourceId || card.columnSourceId === columnSourceId) return;
    setError(''); try { const response = await fetch(`/api/internal/v1/cards/${encodeURIComponent(card.id)}/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ columnSourceId }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Unable to move this card.'); const moved = (payload.data?.card || { ...card, columnSourceId }) as Card;
      setCardsByColumn((current) => { const next = { ...current }; if (next[card.columnSourceId]) next[card.columnSourceId] = { ...next[card.columnSourceId], items: next[card.columnSourceId].items.filter((item) => item.id !== card.id) }; if (next[columnSourceId]) next[columnSourceId] = { ...next[columnSourceId], items: [...next[columnSourceId].items.filter((item) => item.id !== card.id), moved] }; return next; }); if (payload.data?.counts) setColumns((current) => current?.map((column) => ({ ...column, cardCount: payload.data.counts[column.id] ?? column.cardCount })) || null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to move this card.'); }
  };
  const activeDragCard = cards.find((card) => card.id === activeDragId);
  return <section className={`${styles.page} ${styles.deckPage}`}><header className={styles.header}><img src="/favicon.svg" alt="TranterGrey" /><div><p className={styles.eyebrow}>Production workspace</p><h1 className={styles.title}>The Deck</h1></div></header>{error ? <p className={styles.empty}>{error}</p> : !columns ? <p className={styles.empty}>Loading The Deck…</p> : <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(event) => { setActiveDragId(String(event.active.id)); setDropColumnId(''); }} onDragOver={(event: DragOverEvent) => setDropColumnId(((event.over?.data.current as DropTargetData | undefined)?.columnSourceId) || '')} onDragCancel={() => { setActiveDragId(''); setDropColumnId(''); }} onDragEnd={(event) => { setActiveDragId(''); setDropColumnId(''); void moveCard(event); }}><div className={styles.board}>{columns.map((column) => { const isOpen = openColumns[column.id] ?? ['in progress', 'edit'].includes(column.name.toLowerCase()); return <DeckColumn column={column} cards={cardsByColumn[column.id]} isOpen={isOpen} isDropTarget={dropColumnId === column.id} activeDragColumnId={activeDragCard?.columnSourceId || ''} onToggle={(open) => { setOpenColumns((current) => ({ ...current, [column.id]: open })); if (open && !cardsByColumn[column.id]) void loadColumn(column.id); }} onLoadMore={() => void loadColumn(column.id, true)} key={column.id} />; })}</div><DragOverlay dropAnimation={null}>{activeDragCard && <article className={`${styles.card} ${deck.dragOverlay}`}><b>{activeDragCard.title}</b><small>{activeDragCard.client || 'Internal'}</small></article>}</DragOverlay></DndContext>}</section>;
}
