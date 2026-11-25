'use client';

import { DndContext, DragOverlay, PointerSensor, TouchSensor, MouseSensor, MeasuringStrategy, pointerWithin, useDroppable, useDndContext, useSensor, useSensors, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '@/app/app/team-app.module.css';
import mobile from '@/app/app/mobile-first.module.css';
import deck from '@/app/app/team-deck.module.css';
import { ColumnColorDialog } from './ColumnColorDialog';
import { UiIcon } from './UiIcon';
import { columnColorStyle } from '@/lib/deck-colors';
import type { CSSProperties } from 'react';
import { useDeckReturnAnimation } from './useDeckReturnAnimation';
import { TeamAppCard } from './TeamAppCard';
import { cardSignal, type CardSignalFields } from '@/lib/card-signal';
import { filmingDates } from '@/lib/filming-dates';

type Column = { id: string; name: string; cardCount: number; color?: string | null };
type Card = CardSignalFields & { id: string; title: string; client: string; columnSourceId: string; dueOn: string | null };
type ColumnCards = { items: Card[]; nextCursor: string | null; loading?: boolean };
type DropTargetData = { columnSourceId?: string };

function DraggableDeckCard({ card, done }: { card: Card; done: boolean }) {
  const signal = cardSignal(done ? { ...card, completedAt: card.completedAt || 'done' } : card);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: card.id, data: { columnSourceId: card.columnSourceId, type: 'card' } });
  return <article ref={setNodeRef} className={`${styles.card} ${deck.card}${isDragging ? ` ${deck.dragging}` : ''}`} style={{ transform: CSS.Translate.toString(transform) }}><a href={`/app/deck?card=${encodeURIComponent(card.id)}${signal ? `&focus=${encodeURIComponent(signal.target)}` : ''}`}><b>{card.title}</b><small>{card.client || 'Internal'}{card.dueOn ? ` · Due ${card.dueOn}` : ''}</small>{signal && <span className={`production-card-signal is-${signal.kind}`} title={signal.kind === 'date' ? `Filming dates: ${filmingDates(card.filmingOn).join(', ')}` : signal.label}>{signal.label}</span>}</a><button className={deck.grabber} type="button" aria-label={`Drag ${card.title}`} {...attributes} {...listeners}><i /><i /><i /></button></article>;
}

function DeckColumn({ column, cards, isOpen, isDropTarget, activeDragColumnId, onToggle, onLoadMore, onChangeColor }: { column: Column; cards: ColumnCards | undefined; isOpen: boolean; isDropTarget: boolean; activeDragColumnId: string; onToggle: (open: boolean) => void; onLoadMore: () => void; onChangeColor: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { measureDroppableContainers } = useDndContext();
  const { isOver, setNodeRef } = useDroppable({ id: column.id, data: { columnSourceId: column.id, type: 'column' } });
  return <details ref={setNodeRef} onAnimationEnd={() => measureDroppableContainers([])} data-column-color={column.color || undefined} data-drag-source={activeDragColumnId === column.id || undefined} style={columnColorStyle(column.color) as CSSProperties} className={`${styles.column} ${mobile.lane} ${deck.column}${isOver || isDropTarget ? ` ${deck.dropTarget}` : ''}`} open={isOpen} onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}><summary><h2>{column.name}<small>{column.cardCount}</small></h2><div className="deck-pwa-column-menu"><button type="button" aria-label={`Column options for ${column.name}`} aria-expanded={menuOpen} onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMenuOpen((open) => !open); }}><UiIcon name="more" /></button>{menuOpen && <div role="menu"><button type="button" role="menuitem" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); onChangeColor(); }}>Change color</button></div>}</div></summary><div className={deck.cardList}><SortableContext items={cards?.items.map(card => card.id) || []} strategy={verticalListSortingStrategy}>{cards?.items.map((card) => <DraggableDeckCard card={card} done={column.name.toLowerCase() === 'done'} key={card.id} />)}</SortableContext>{cards?.loading && <p className={styles.empty}>Loading cards…</p>}{cards && cards.nextCursor && !cards.loading && <button type="button" onClick={onLoadMore}>Load more</button>}</div></details>;
}

export function TeamAppKanban() {
  const { boardRef, prepareReturn } = useDeckReturnAnimation();
  const [colorColumn, setColorColumn] = useState<Column | null>(null);
  const [columns, setColumns] = useState<Column[] | null>(null); const [cardsByColumn, setCardsByColumn] = useState<Record<string, ColumnCards>>({}); const [openColumns, setOpenColumns] = useState<Record<string, boolean>>({}); const [error, setError] = useState(''); const [cardId, setCardId] = useState(''); const [activeDragId, setActiveDragId] = useState(''); const [dropColumnId, setDropColumnId] = useState('');
  const cardsByColumnRef = useRef<Record<string, ColumnCards>>({});
  useEffect(() => { cardsByColumnRef.current = cardsByColumn; }, [cardsByColumn]);
  const [focusTarget, setFocusTarget] = useState('');
  const [compactTouch, setCompactTouch] = useState(false);
  useEffect(() => { const query = matchMedia('(max-width: 980px) and (pointer: coarse)'); const update = () => setCompactTouch(query.matches); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));
  const touchSensors = useSensors(useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }), useSensor(MouseSensor, { activationConstraint: { distance: 7 } }));
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
  useEffect(() => { const params = new URLSearchParams(location.search); setCardId(params.get('card') || ''); setFocusTarget(params.get('focus') || ''); }, []);
  useEffect(() => { void loadBoard().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load The Deck.')); }, [loadBoard]);
  if (cardId) return <TeamAppCard id={cardId} focusTarget={focusTarget} />;
  const cards = Object.values(cardsByColumn).flatMap((bucket) => bucket.items);
  const moveCard = async (event: DragEndEvent) => {
    const columnSourceId = (event.over?.data.current as DropTargetData | undefined)?.columnSourceId; const card = cards.find((item) => item.id === String(event.active.id)); if (!card || !columnSourceId || event.over?.id === event.active.id) return;
    const destination = (cardsByColumn[columnSourceId]?.items || []).filter(item => item.id !== card.id);
    const overIndex = destination.findIndex(item => item.id === event.over?.id);
    const sourceIndex = cardsByColumn[card.columnSourceId]?.items.findIndex(item => item.id === card.id) ?? -1;
    const originalOverIndex = cardsByColumn[columnSourceId]?.items.findIndex(item => item.id === event.over?.id) ?? -1;
    const beforeCardId = overIndex < 0 ? undefined : card.columnSourceId === columnSourceId && sourceIndex < originalOverIndex ? destination[overIndex + 1]?.id : destination[overIndex].id;
    setError(''); try { const response = await fetch(`/api/internal/v1/cards/${encodeURIComponent(card.id)}/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ columnSourceId, beforeCardId }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || 'Unable to move this card.'); const moved = ({ ...card, ...payload.data?.card, columnSourceId }) as Card;
      setCardsByColumn((current) => { const next = { ...current }; if (next[card.columnSourceId]) next[card.columnSourceId] = { ...next[card.columnSourceId], items: next[card.columnSourceId].items.filter((item) => item.id !== card.id) }; if (next[columnSourceId]) next[columnSourceId] = { ...next[columnSourceId], items: (() => { const items = next[columnSourceId].items.filter(item => item.id !== card.id); const index = beforeCardId ? items.findIndex(item => item.id === beforeCardId) : -1; items.splice(index < 0 ? items.length : index, 0, moved); return items; })() }; return next; }); if (payload.data?.counts) setColumns((current) => current?.map((column) => ({ ...column, cardCount: payload.data.counts[column.id] ?? column.cardCount })) || null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to move this card.'); }
  };
  const activeDragCard = cards.find((card) => card.id === activeDragId);
  const splitDrag = compactTouch && Boolean(activeDragCard);
  return <section className={`${styles.page} ${styles.deckPage}`}><header className={styles.header}><img src="/favicon.svg" alt="TranterGrey" /><div><p className={styles.eyebrow}>Production workspace</p><h1 className={styles.title}>The Deck</h1></div></header>{error ? <p className={styles.empty}>{error}</p> : !columns ? <p className={styles.empty}>Loading The Deck…</p> : <DndContext sensors={compactTouch ? touchSensors : sensors} measuring={splitDrag ? { droppable: { strategy: MeasuringStrategy.Always } } : undefined} autoScroll={splitDrag ? { canScroll: element => element.classList.contains(deck.cardList), threshold: { x: 0, y: .2 } } : undefined} collisionDetection={args => { const hits = pointerWithin(args); const cardHits = hits.filter(hit => hit.id !== args.active.id && args.droppableContainers.find(container => container.id === hit.id)?.data.current?.type === 'card'); return cardHits.length ? cardHits : hits.some(hit => hit.id === args.active.id) ? hits.filter(hit => hit.id === args.active.id) : hits; }} onDragStart={(event) => { setActiveDragId(String(event.active.id)); setDropColumnId(''); }} onDragOver={(event: DragOverEvent) => setDropColumnId(((event.over?.data.current as DropTargetData | undefined)?.columnSourceId) || '')} onDragCancel={() => { prepareReturn(splitDrag); setActiveDragId(''); setDropColumnId(''); }} onDragEnd={(event) => { prepareReturn(splitDrag); setActiveDragId(''); setDropColumnId(''); void moveCard(event); }}><div ref={boardRef} className={`${styles.board}${splitDrag ? ` ${deck.splitDrag}` : ''}`} style={splitDrag ? { gridTemplateRows: `repeat(${Math.max(1, columns.length - 1)}, minmax(0, 1fr))` } : undefined}>{columns.map((column) => { const isOpen = splitDrag ? column.id === activeDragCard?.columnSourceId : openColumns[column.id] ?? ['in progress', 'edit'].includes(column.name.toLowerCase()); return <DeckColumn column={column} cards={cardsByColumn[column.id]} isOpen={isOpen} isDropTarget={dropColumnId === column.id} activeDragColumnId={activeDragCard?.columnSourceId || ''} onToggle={(open) => { if (splitDrag) return; setOpenColumns((current) => ({ ...current, [column.id]: open })); if (open && !cardsByColumn[column.id]) void loadColumn(column.id); }} onChangeColor={() => setColorColumn(column)} onLoadMore={() => void loadColumn(column.id, true)} key={column.id} />; })}</div><DragOverlay dropAnimation={null} zIndex={1200}>{activeDragCard && <article className={`${styles.card} ${deck.dragOverlay}`}><b>{activeDragCard.title}</b><small>{activeDragCard.client || 'Internal'}</small></article>}</DragOverlay></DndContext>}{colorColumn && <ColumnColorDialog columnId={colorColumn.id} name={colorColumn.name} color={colorColumn.color} onClose={() => setColorColumn(null)} onSaved={(color) => setColumns((current) => current?.map((column) => column.id === colorColumn.id ? { ...column, color } : column) || null)} />}</section>;
}
