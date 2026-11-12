'use client';

import { DndContext, DragEndEvent, DragOverlay, DragOverEvent, DragStartEvent, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ProductionCard } from './ProductionCard';

type Card = { id: string; title: string; client?: string; columnSourceId: string; position: number | null; archived: number; createdAt?: string; updatedAt?: string; dueOn?: string; completedAt?: string; commentsCount?: number };
type Column = { sourceId: string; name: string; cardsCount: number };
type BoardData = { columns: Column[]; cards: Card[]; clients: string[]; assignees: string[] };
type DropTargetData = { type?: string; columnSourceId?: string };

const cardFromLocation = () => new URLSearchParams(window.location.search).get('card') || '';
const newCardColumnFromLocation = () => new URLSearchParams(window.location.search).get('newCard') || '';
const byPosition = (first: Card, second: Card) => (first.position ?? Number.MAX_SAFE_INTEGER) - (second.position ?? Number.MAX_SAFE_INTEGER);
const shortDate = (value?: string) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '';
const cardAgeClass = (updatedAt?: string) => {
  const updated = updatedAt ? new Date(updatedAt).getTime() : NaN;
  const ageInDays = Number.isNaN(updated) ? 0 : (Date.now() - updated) / 86_400_000;
  return ageInDays >= 43 ? ' is-stale-six-weeks' : ageInDays >= 28 ? ' is-stale-four-weeks' : '';
};

function SortableProductionCard({ card, onOpen }: { card: Card; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { type: 'card', columnSourceId: card.columnSourceId } });
  const commentsCount = Number(card.commentsCount) || 0;
  const commentBadge = commentsCount > 0 && <span className="production-card-comment-count" aria-label={`${commentsCount} comment${commentsCount === 1 ? '' : 's'}`}>{commentsCount}</span>;
  return <a ref={setNodeRef} {...attributes} {...listeners} aria-grabbed={isDragging} className={`${isDragging ? 'is-dragging' : ''}${cardAgeClass(card.createdAt)}`} style={{ transform: CSS.Transform.toString(transform), transition }} href={`/admin/production?card=${encodeURIComponent(card.id)}`} onClick={(event) => { event.preventDefault(); if (!isDragging) onOpen(card.id); }}>{card.client ? <><small className="production-card-client">{card.client}</small><b>{card.title}</b></> : <b>{card.title}</b>}{(commentsCount > 0 || card.createdAt || card.updatedAt) && <div className="production-card-meta">{commentBadge}{(card.createdAt || card.updatedAt) && <small className="production-card-dates">{card.createdAt && `Created ${shortDate(card.createdAt)}`}{card.createdAt && card.updatedAt && ' · '}{card.updatedAt && `Updated ${shortDate(card.updatedAt)}`}</small>}</div>}{card.archived === 1 && <small>Archived</small>}{card.dueOn && <small>Due {card.dueOn}</small>}</a>;
}

function ProductionColumn({ column, cards, collapsedForDrawer, collapsedForCompact, expanded, isCollapsible, isDropTarget, menuOpen, onSelect, onOpenCard, onMenu, onAction }: { column: Column; cards: Card[]; collapsedForDrawer: boolean; collapsedForCompact: boolean; expanded: boolean; isCollapsible: boolean; isDropTarget: boolean; menuOpen: boolean; onSelect: () => void; onOpenCard: (id: string) => void; onMenu: () => void; onAction: (action: 'oldest' | 'newest' | 'add' | 'rename' | 'archive') => void }) {
  const { setNodeRef } = useDroppable({ id: column.sourceId, data: { type: 'column', columnSourceId: column.sourceId } });
  const collapsed = collapsedForDrawer || collapsedForCompact || (isCollapsible && !expanded);
  return <section ref={setNodeRef} className={`production-column${isCollapsible ? ' is-collapsible' : ''}${expanded ? ' is-expanded' : ''}${collapsedForDrawer ? ' is-drawer-collapsed' : ''}${collapsedForCompact ? ' is-compact-collapsed' : ''}${isDropTarget ? ' is-drop-target' : ''}`}>
    <header><button type="button" aria-expanded={!collapsedForDrawer && !collapsedForCompact && (!isCollapsible || expanded)} onClick={onSelect}><h2>{column.name}</h2></button><div className="production-column-menu"><button type="button" className="production-column-add-card" aria-label={`Add card to ${column.name}`} onClick={(event) => { event.stopPropagation(); onAction('add'); }}>+</button><span>{column.cardsCount}</span><button type="button" className="production-column-menu-trigger" aria-label={`Column options for ${column.name}`} aria-expanded={menuOpen} onClick={(event) => { event.stopPropagation(); onMenu(); }}>•••</button>{menuOpen && <div className="production-column-menu-popover" role="menu"><button type="button" role="menuitem" onClick={() => onAction('oldest')}>Sort by oldest first</button><button type="button" role="menuitem" onClick={() => onAction('newest')}>Sort by newest first</button><button type="button" role="menuitem" onClick={() => onAction('add')}>Add card</button><button type="button" role="menuitem" onClick={() => onAction('rename')}>Rename column</button><button type="button" role="menuitem" onClick={() => onAction('archive')}>Archive column</button></div>}</div></header>
    {collapsed && <span className="production-collapsed-count">{column.cardsCount}</span>}
    <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}><div>{cards.map((card) => <SortableProductionCard card={card} key={card.id} onOpen={onOpenCard} />)}</div></SortableContext>
  </section>;
}

function ProductionNewCard({ column, columns, clients, assignees, onCreated }: { column: Column; columns: Column[]; clients: string[]; assignees: string[]; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [client, setClient] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [notes, setNotes] = useState('');
  const [columnSourceId, setColumnSourceId] = useState(column.sourceId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) { setError('Add a title to create this card.'); return; }
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/production-board/cards', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ columnSourceId, title, client, assignedTo, dueOn, notes }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create this card.');
      onCreated(payload.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create this card.'); }
    finally { setSaving(false); }
  };
  return <form className="production-card is-drawer-card production-new-card" onSubmit={submit}>
    <div className="production-card-heading"><div><p className="eyebrow">New production card</p><input className="production-inline-title" aria-label="Card title" value={title} maxLength={240} placeholder="Untitled card" onChange={(event) => setTitle(event.target.value)} autoFocus disabled={saving} /></div></div>
    {error && <p className="production-save-error">{error}</p>}
    <dl className="production-properties production-inline-properties"><div><dt>Client</dt><dd><input value={client} list="production-new-client-list" maxLength={120} placeholder="Choose or type a client" onChange={(event) => setClient(event.target.value)} disabled={saving} /></dd></div><div><dt>Assigned to</dt><dd><input value={assignedTo} list="production-new-assignee-list" placeholder="Choose team members…" onChange={(event) => setAssignedTo(event.target.value)} disabled={saving} /></dd></div><div><dt>Due on</dt><dd><input type="date" value={dueOn} onChange={(event) => setDueOn(event.target.value)} disabled={saving} /></dd></div><div><dt>Status</dt><dd><select value={columnSourceId} onChange={(event) => setColumnSourceId(event.target.value)} disabled={saving}>{columns.map((item) => <option key={item.sourceId} value={item.sourceId}>{item.name}</option>)}</select></dd></div></dl>
    <section className="production-card-notes production-inline-notes"><div className="production-inline-notes-heading"><h2>Notes</h2></div><textarea value={notes} rows={6} placeholder="Add notes…" onChange={(event) => setNotes(event.target.value)} disabled={saving} /></section>
    <datalist id="production-new-client-list">{clients.map((item) => <option key={item} value={item} />)}</datalist><datalist id="production-new-assignee-list">{assignees.map((item) => <option key={item} value={item} />)}</datalist>
    <div className="production-new-card-actions"><button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create card'}</button></div>
  </form>;
}

export function ProductionBoard() {
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState('');
  const [cardId, setCardId] = useState('');
  const [newCardColumnId, setNewCardColumnId] = useState('');
  const [expandedColumnId, setExpandedColumnId] = useState('');
  const [compactBoard, setCompactBoard] = useState(false);
  const [phoneBoard, setPhoneBoard] = useState(false);
  const [activeDragCardId, setActiveDragCardId] = useState('');
  const [dropColumnId, setDropColumnId] = useState('');
  const [menuColumnId, setMenuColumnId] = useState('');
  const [movingCardId, setMovingCardId] = useState('');
  const dragOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const loadBoard = useCallback(() => fetch('/api/admin/production-board', { cache: 'no-store' }).then(async (response) => {
    if (response.status === 401) { location.replace('/login?next=/admin/production'); return null; }
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Unable to open the production board.');
    return payload as BoardData;
  }), []);

  useEffect(() => {
    setCardId(cardFromLocation());
    setNewCardColumnId(newCardColumnFromLocation());
    const onPopState = () => { setCardId(cardFromLocation()); setNewCardColumnId(newCardColumnFromLocation()); };
    addEventListener('popstate', onPopState);
    return () => removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    const query = matchMedia('(max-width: 980px)'); const phoneQuery = matchMedia('(max-width: 620px)');
    const update = () => { setCompactBoard(query.matches); setPhoneBoard(phoneQuery.matches); };
    update(); query.addEventListener('change', update); phoneQuery.addEventListener('change', update);
    return () => { query.removeEventListener('change', update); phoneQuery.removeEventListener('change', update); };
  }, []);
  useEffect(() => { loadBoard().then((payload) => payload && setData(payload)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to open the production board.')); }, [loadBoard]);
  useEffect(() => () => { if (dragOpenTimer.current) clearTimeout(dragOpenTimer.current); }, []);

  const selectedCard = useMemo(() => data?.cards.find((card) => card.id === cardId) || null, [cardId, data]);
  const activeDragCard = useMemo(() => data?.cards.find((card) => card.id === activeDragCardId) || null, [activeDragCardId, data]);
  const drawerColumnId = selectedCard?.columnSourceId || newCardColumnId;
  useEffect(() => { if (drawerColumnId) setExpandedColumnId(drawerColumnId); }, [cardId, newCardColumnId, drawerColumnId]);
  const clearDragOpenTimer = () => { if (dragOpenTimer.current) clearTimeout(dragOpenTimer.current); dragOpenTimer.current = null; };
  const setCardInUrl = (id = '') => {
    const url = new URL(location.href); if (id) url.searchParams.set('card', id); else url.searchParams.delete('card'); url.searchParams.delete('newCard');
    history.pushState({}, '', url);
    const nextCard = data?.cards.find((card) => card.id === id); if (nextCard) setExpandedColumnId(nextCard.columnSourceId);
    setCardId(id);
    setNewCardColumnId('');
  };
  const setNewCardInUrl = (columnSourceId = '') => {
    const url = new URL(location.href); url.searchParams.delete('card');
    if (columnSourceId) url.searchParams.set('newCard', columnSourceId); else url.searchParams.delete('newCard');
    history.pushState({}, '', url);
    if (columnSourceId) setExpandedColumnId(columnSourceId);
    setCardId(''); setNewCardColumnId(columnSourceId);
  };
  const selectColumn = (column: Column) => {
    if (cardId || compactBoard) { setExpandedColumnId(column.sourceId); return; }
    if (['triage', 'not now', 'done'].includes(column.name.toLowerCase())) setExpandedColumnId((current) => current === column.sourceId ? '' : column.sourceId);
  };
  const runColumnAction = async (column: Column, action: 'oldest' | 'newest' | 'add' | 'rename' | 'archive') => {
    setMenuColumnId(''); setError('');
    try {
      if (action === 'add') {
        setNewCardInUrl(column.sourceId); return;
      }
      if (action === 'rename') {
        const name = prompt('Column name', column.name); if (!name?.trim()) return;
        const response = await fetch(`/api/admin/production-board/columns/${encodeURIComponent(column.sourceId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'rename', name }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to rename column.');
      } else if (action === 'archive') {
        if (!confirm(`Archive “${column.name}”? Its cards will be preserved locally but hidden from the active board.`)) return;
        const response = await fetch(`/api/admin/production-board/columns/${encodeURIComponent(column.sourceId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'archive' }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to archive column.');
      } else {
        const response = await fetch(`/api/admin/production-board/columns/${encodeURIComponent(column.sourceId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sort', direction: action }) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to sort column.');
      }
      const refreshed = await loadBoard(); if (refreshed) setData(refreshed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update column.'); }
  };
  const moveCard = async (card: Card, columnSourceId: string, beforeCardId = '') => {
    if (!data) return;
    const previous = data;
    const targetCards = data.cards.filter((item) => item.columnSourceId === columnSourceId && item.id !== card.id).sort(byPosition);
    const targetIndex = beforeCardId ? targetCards.findIndex((item) => item.id === beforeCardId) : -1;
    const placementIndex = targetIndex < 0 ? targetCards.length : targetIndex;
    const orderedCards = [...targetCards]; orderedCards.splice(placementIndex, 0, card);
    const positions = new Map(orderedCards.map((item, index) => [item.id, (index + 1) * 1000]));
    const position = positions.get(card.id) || 0;
    setMovingCardId(card.id); setError(''); setDropColumnId('');
    setData({
      clients: data.clients,
      assignees: data.assignees,
      cards: data.cards.map((item) => item.id === card.id ? { ...item, columnSourceId, position } : item.columnSourceId === columnSourceId && positions.has(item.id) ? { ...item, position: positions.get(item.id) ?? item.position } : item),
      columns: data.columns.map((column) => card.columnSourceId !== columnSourceId && column.sourceId === card.columnSourceId ? { ...column, cardsCount: column.cardsCount - 1 } : card.columnSourceId !== columnSourceId && column.sourceId === columnSourceId ? { ...column, cardsCount: column.cardsCount + 1 } : column),
    });
    try {
      const response = await fetch(`/api/admin/production-board/${encodeURIComponent(card.id)}/move`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ columnSourceId, beforeCardId: beforeCardId || undefined }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Unable to move this card.');
      const refreshed = await loadBoard(); if (refreshed) setData(refreshed);
    } catch (cause) { setData(previous); setError(cause instanceof Error ? cause.message : 'Unable to move this card.'); }
    finally { setMovingCardId(''); }
  };
  const columnForDropTarget = (event: DragOverEvent | DragEndEvent) => (event.over?.data.current as DropTargetData | undefined)?.columnSourceId || '';
  const onDragStart = (event: DragStartEvent) => setActiveDragCardId(String(event.active.id));
  const onDragOver = (event: DragOverEvent) => {
    const columnSourceId = columnForDropTarget(event); setDropColumnId(columnSourceId);
    const column = data?.columns.find((item) => item.sourceId === columnSourceId);
    if (!column || !activeDragCardId) return;
    const drawerOpen = Boolean(selectedCard || newCardColumnId);
    const collapsed = drawerOpen ? column.sourceId !== (expandedColumnId || drawerColumnId) : compactBoard ? column.sourceId !== (expandedColumnId || data?.columns[0]?.sourceId) : ['triage', 'not now', 'done'].includes(column.name.toLowerCase()) && column.sourceId !== expandedColumnId;
    if (!collapsed || dragOpenTimer.current) return;
    dragOpenTimer.current = setTimeout(() => { setExpandedColumnId(column.sourceId); dragOpenTimer.current = null; }, 550);
  };
  const onDragEnd = (event: DragEndEvent) => {
    clearDragOpenTimer(); setDropColumnId(''); setActiveDragCardId('');
    if (!data || !event.over) return;
    const card = data.cards.find((item) => item.id === String(event.active.id));
    const columnSourceId = columnForDropTarget(event); if (!card || !columnSourceId) return;
    const destinationCards = data.cards.filter((item) => item.columnSourceId === columnSourceId && item.id !== card.id).sort(byPosition);
    const overCardId = String(event.over.id); const overCardIndex = destinationCards.findIndex((item) => item.id === overCardId);
    let beforeCardId = '';
    if (overCardIndex >= 0) {
      const translatedTop = event.active.rect.current.translated?.top ?? event.active.rect.current.initial?.top ?? 0;
      const overMiddle = event.over.rect.top + event.over.rect.height / 2;
      beforeCardId = translatedTop > overMiddle ? destinationCards[overCardIndex + 1]?.id || '' : overCardId;
    }
    void moveCard(card, columnSourceId, beforeCardId);
  };

  if (error) return <p className="admin-empty">{error}</p>;
  if (!data) return <p className="admin-empty">Opening the Basecamp archive…</p>;
  if (!data.columns.length) return <p className="admin-empty">The archive has not been imported yet. Run the read-only Basecamp importer after configuring its credentials and private attachment bucket.</p>;

  const isCollapsible = (column: Column) => ['triage', 'not now', 'done'].includes(column.name.toLowerCase());
  const drawerOpen = Boolean(selectedCard || newCardColumnId); const activeDrawerColumnId = expandedColumnId || drawerColumnId; const activeCompactColumnId = expandedColumnId || data.columns[0]?.sourceId || '';
  const compactRailWidth = phoneBoard ? '32px' : '52px'; const compactLaneWidth = phoneBoard ? 'minmax(160px, 1fr)' : 'minmax(240px, 1fr)';
  const gridTemplateColumns = data.columns.map((column) => drawerOpen ? column.sourceId === activeDrawerColumnId ? compactLaneWidth : compactRailWidth : compactBoard ? column.sourceId === activeCompactColumnId ? compactLaneWidth : compactRailWidth : isCollapsible(column) && column.sourceId !== expandedColumnId ? '58px' : 'minmax(0, 1fr)').join(' ');

  return <div className={`production-board-layout${drawerOpen ? ' is-drawer-open' : ''}`}>
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragCancel={() => { clearDragOpenTimer(); setDropColumnId(''); setActiveDragCardId(''); }} onDragEnd={onDragEnd}>
      <div className="production-board" style={{ gridTemplateColumns }} aria-label="The Deck">{data.columns.map((column) => {
        const collapsedForDrawer = drawerOpen && column.sourceId !== activeDrawerColumnId;
        const collapsedForCompact = !drawerOpen && compactBoard && column.sourceId !== activeCompactColumnId;
        const expanded = drawerOpen ? column.sourceId === activeDrawerColumnId : compactBoard ? column.sourceId === activeCompactColumnId : column.sourceId === expandedColumnId;
        const cards = data.cards.filter((card) => card.columnSourceId === column.sourceId).sort(byPosition);
        return <ProductionColumn column={column} cards={cards} collapsedForDrawer={collapsedForDrawer} collapsedForCompact={collapsedForCompact} expanded={expanded} isCollapsible={isCollapsible(column)} isDropTarget={dropColumnId === column.sourceId} menuOpen={menuColumnId === column.sourceId} onSelect={() => selectColumn(column)} onOpenCard={setCardInUrl} onMenu={() => setMenuColumnId((current) => current === column.sourceId ? '' : column.sourceId)} onAction={(action) => { void runColumnAction(column, action); }} key={column.sourceId} />;
      })}</div>
      <DragOverlay dropAnimation={null}>{activeDragCard && <div className="production-card-drag-overlay"><b>{activeDragCard.title}</b></div>}</DragOverlay>
    </DndContext>
    {(selectedCard || newCardColumnId) && <aside className="production-card-drawer" aria-label={selectedCard ? `${selectedCard.title} details` : 'New card'}><div className="production-drawer-topbar"><span>{selectedCard ? 'Production record' : 'New production card'}</span><button type="button" onClick={() => setCardInUrl()} aria-label="Close card details">Close ×</button></div>{selectedCard ? <ProductionCard id={selectedCard.id} drawer onUpdated={() => loadBoard().then((payload) => payload && setData(payload))} /> : (() => { const column = data.columns.find((item) => item.sourceId === newCardColumnId); return column ? <ProductionNewCard column={column} columns={data.columns} clients={data.clients || []} assignees={data.assignees || []} onCreated={(id) => { void loadBoard().then((payload) => { if (payload) setData(payload); setCardInUrl(id); }); }} /> : null; })()}</aside>}
  </div>;
}
