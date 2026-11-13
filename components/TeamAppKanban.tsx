'use client';

import { DndContext, DragOverlay, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useState } from 'react';
import styles from '@/app/app/team-app.module.css';
import mobile from '@/app/app/mobile-first.module.css';
import deck from '@/app/app/team-deck.module.css';
import { TeamAppCard } from './TeamAppCard';

type Column = { id: string; name: string; cardCount: number };
type Card = { id: string; title: string; client: string; columnSourceId: string; dueOn: string | null };
type DropTargetData = { columnSourceId?: string };

function DraggableDeckCard({ card }: { card: Card }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id, data: { columnSourceId: card.columnSourceId } });
  return <article ref={setNodeRef} className={`${styles.card} ${deck.card}${isDragging ? ` ${deck.dragging}` : ''}`} style={{ transform: CSS.Translate.toString(transform) }}>
    <a href={`/app/deck?card=${encodeURIComponent(card.id)}`}><b>{card.title}</b><small>{card.client || 'Internal'}{card.dueOn ? ` · Due ${card.dueOn}` : ''}</small></a>
    <button className={deck.grabber} type="button" aria-label={`Drag ${card.title}`} {...attributes} {...listeners}><i /><i /><i /></button>
  </article>;
}

function DeckColumn({ column, cards, isInitiallyOpen, isDropTarget, activeDragColumnId }: { column: Column; cards: Card[]; isInitiallyOpen: boolean; isDropTarget: boolean; activeDragColumnId: string }) {
  const { isOver, setNodeRef } = useDroppable({ id: column.id, data: { columnSourceId: column.id }, disabled: activeDragColumnId === column.id });
  return <details ref={setNodeRef} className={`${styles.column} ${mobile.lane} ${deck.column}${isOver || isDropTarget ? ` ${deck.dropTarget}` : ''}`} open={isInitiallyOpen}>
    <summary><h2>{column.name}<small>{column.cardCount}</small></h2></summary>
    <div className={deck.cardList}>{cards.map((card) => <DraggableDeckCard card={card} key={card.id} />)}</div>
  </details>;
}

export function TeamAppKanban() {
  const [columns, setColumns] = useState<Column[] | null>(null); const [cards, setCards] = useState<Card[] | null>(null); const [error, setError] = useState(''); const [cardId, setCardId] = useState(''); const [activeDragId, setActiveDragId] = useState(''); const [dropColumnId, setDropColumnId] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));
  const load = useCallback(() => Promise.all([fetch('/api/internal/v1/boards/production', { cache: 'no-store' }), fetch('/api/internal/v1/cards?limit=100', { cache: 'no-store' })]).then(async ([boardResponse, cardResponse]) => {
    if (boardResponse.status === 401 || cardResponse.status === 401) { location.assign(`/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`); return null; }
    const [board, cardList] = await Promise.all([boardResponse.json(), cardResponse.json()]); if (!boardResponse.ok || !cardResponse.ok) throw new Error(board.error?.message || cardList.error?.message || 'Unable to load The Deck.'); return { columns: board.data.columns as Column[], cards: cardList.data as Card[] };
  }), []);
  useEffect(() => { setCardId(new URLSearchParams(location.search).get('card') || ''); }, []);
  useEffect(() => { load().then((data) => { if (data) { setColumns(data.columns); setCards(data.cards); } }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load The Deck.')); }, [load]);
  if (cardId) return <TeamAppCard id={cardId} />;
  const moveCard = async (event: DragEndEvent) => {
    const target = event.over?.data.current as DropTargetData | undefined;
    const columnSourceId = target?.columnSourceId; const card = cards?.find((item) => item.id === String(event.active.id));
    if (!card || !columnSourceId || card.columnSourceId === columnSourceId) return;
    setError('');
    try {
      const response = await fetch(`/api/internal/v1/cards/${encodeURIComponent(card.id)}/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ columnSourceId }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Unable to move this card.');
      const refreshed = await load(); if (refreshed) { setColumns(refreshed.columns); setCards(refreshed.cards); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to move this card.'); }
  };
  const showDropTarget = (event: DragOverEvent) => setDropColumnId(((event.over?.data.current as DropTargetData | undefined)?.columnSourceId) || '');
  const activeDragCard = cards?.find((card) => card.id === activeDragId);
  return <section className={`${styles.page} ${styles.deckPage}`}><header className={styles.header}><img src="/favicon.svg" alt="TranterGrey" /><div><p className={styles.eyebrow}>Production workspace</p><h1 className={styles.title}>The Deck</h1></div></header>{error ? <p className={styles.empty}>{error}</p> : !columns || !cards ? <p className={styles.empty}>Loading The Deck…</p> : <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={(event) => { setActiveDragId(String(event.active.id)); setDropColumnId(''); }} onDragOver={showDropTarget} onDragCancel={() => { setActiveDragId(''); setDropColumnId(''); }} onDragEnd={(event) => { setActiveDragId(''); setDropColumnId(''); void moveCard(event); }}><div className={styles.board}>{columns.map((column) => <DeckColumn column={column} cards={cards.filter((card) => card.columnSourceId === column.id)} isInitiallyOpen={['in progress', 'edit'].includes(column.name.toLowerCase())} isDropTarget={dropColumnId === column.id} activeDragColumnId={activeDragCard?.columnSourceId || ''} key={column.id} />)}</div><DragOverlay dropAnimation={null}>{activeDragCard && <article className={`${styles.card} ${deck.dragOverlay}`}><b>{activeDragCard.title}</b><small>{activeDragCard.client || 'Internal'}</small></article>}</DragOverlay></DndContext>}</section>;
}
