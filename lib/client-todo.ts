export const TODO_ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

// Archive membership is derived from the completion date, so it takes effect
// without a scheduled job or destructive move. Reopening clears this date.
export function isArchivedTodo(item: {kind:string;completed:number;completed_at?:string|null}, now=Date.now()) {
  return item.kind==='todo' && item.completed===1 && Boolean(item.completed_at) && now-Date.parse(item.completed_at!)>TODO_ARCHIVE_AFTER_MS;
}
