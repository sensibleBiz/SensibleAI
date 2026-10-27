export interface TimelineEvent {
  id: string;
  entityType: "lead" | "customer";
  entityId: string;
  eventType: string;
  sourceEntityType: string;
  sourceEntityId: string;
  actorUserId: string | null;
  eventTime: string;
  summary: string;
  payload: Record<string, unknown>;
}

export interface TimelineQuery {
  outletId: string;
  limit: number;
  cursor?: string;
}

export interface TimelinePage {
  items: TimelineEvent[];
  nextCursor: string | null;
}
