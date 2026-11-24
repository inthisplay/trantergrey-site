import { closestCenter, closestCorners, pointerWithin, type CollisionDetection } from '@dnd-kit/core';

/** Resolve the lane first so nearby cards cannot steal a collapsed lane's drop. */
export const deckCollision: CollisionDetection = (args) => {
  const columns = args.droppableContainers.filter(item => item.data.current?.type === 'column');
  const columnHits = args.pointerCoordinates
    ? pointerWithin({ ...args, droppableContainers: columns })
    : closestCorners({ ...args, droppableContainers: columns });
  const column = columns.find(item => item.id === columnHits[0]?.id);
  if (!column) return [];
  if (column.data.current?.collapsed) return columnHits;
  const cards = args.droppableContainers.filter(item => item.data.current?.type === 'card' && item.data.current?.columnSourceId === column.id);
  if (!cards.length) return columnHits;
  const hits = args.pointerCoordinates ? pointerWithin({ ...args, droppableContainers: cards }) : [];
  if (hits.length) return hits;
  // Gaps and column padding still resolve to a card, not an accidental append.
  const point = args.pointerCoordinates;
  const collisionRect = point
    ? { left: point.x, right: point.x, top: point.y, bottom: point.y, width: 0, height: 0 }
    : args.collisionRect;
  return closestCenter({ ...args, collisionRect, droppableContainers: cards });
};

/** Same-column sorting follows the sortable preview; column-only drops append. */
export function deckDropPlacement(ids: string[], activeId: string, overId: string, sameColumn: boolean, after = false): string | null {
  if (activeId === overId) return null;
  const remaining = ids.filter(id => id !== activeId);
  const index = remaining.indexOf(overId);
  if (index < 0) return '';
  const movingDown = sameColumn ? ids.indexOf(activeId) < ids.indexOf(overId) : after;
  return movingDown ? remaining[index + 1] || '' : overId;
}
