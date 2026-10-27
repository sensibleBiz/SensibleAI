import type { EventMemberInput } from "./eventGateway.types.js";

export interface EventGatewayRepository {
  mergeEvent(
    outletId: string,
    eventId: string,
    patch: Record<string, unknown>,
    members?: EventMemberInput[],
  ): Promise<{ eventId: string; outletId: string }>;
  listEvents(params: {
    outletId: string;
    eventId?: string;
    isActive?: boolean;
    fromDate?: string;
    toDate?: string;
  }): Promise<Record<string, unknown>[]>;
  listEventTransactions(params: { outletId: string; eventId?: string }): Promise<Record<string, unknown>[]>;
  findTransactionById(outletId: string, transactionId: string): Promise<unknown | null>;
  addEventTransaction(outletId: string, transaction: Record<string, unknown>): Promise<void>;
  getEvent(outletId: string, eventId: string): Promise<Record<string, unknown> | null>;
  updateEventMembers(outletId: string, eventId: string, members: EventMemberInput[]): Promise<void>;
  saveMemberPendingPayment(params: {
    outletId: string;
    eventId: string;
    transactionId: string;
    intentString: string;
    mobile: string;
  }): Promise<void>;
}
