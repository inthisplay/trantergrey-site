export type DeckHistoryMedia = { kind: 'image' | 'video' | 'audio' | 'embed' | 'file'; url: string; title: string; poster?: string };
export type DeckHistoryEvent = {
  id: string; occurredAt: string | null; actor: string; action: string; category: string;
  cardId: string | null; cardTitle: string | null; columnName: string | null; columnColor: string | null;
  summary: string; text: string; media: DeckHistoryMedia[]; redacted: boolean; source: string;
  changes: Array<{ label: string; before: string; after: string }>;
};
export type DeckHistoryPage = { events: DeckHistoryEvent[]; nextCursor: string | null };
