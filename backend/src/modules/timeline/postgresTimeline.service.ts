import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import {
  postgresAuthorizationRepository,
  type PostgresAuthorizationRepository,
} from "../authorization/postgresAuthorization.repository.js";
import { postgresTimelineRepository, type PostgresTimelineRepository, type TimelineCursor } from "./postgresTimeline.repository.js";
import type { TimelinePage, TimelineQuery } from "./timeline.types.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const decodeCursor = (value?: string): TimelineCursor | undefined => {
  if (!value) return undefined;
  try {
    const [eventTime, id, ...extra] = Buffer.from(value, "base64url").toString("utf8").split("\n");
    if (extra.length > 0 || !eventTime || !id || !Number.isFinite(Date.parse(eventTime)) || !UUID_PATTERN.test(id)) {
      throw new Error("Invalid cursor");
    }
    return { eventTime: new Date(eventTime).toISOString(), id };
  } catch {
    throw new AppError(400, "Timeline cursor is invalid", "VALIDATION_ERROR");
  }
};

export class PostgresTimelineService {
  constructor(
    private readonly repository: Pick<PostgresTimelineRepository, "getLeadOutlet" | "getCustomerOutlet" | "list"> = postgresTimelineRepository,
    private readonly authorization: Pick<PostgresAuthorizationRepository, "hasOutletPermission"> = postgresAuthorizationRepository,
  ) {}

  async listLead(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    leadId: string,
    query: TimelineQuery,
  ): Promise<TimelinePage> {
    await this.assertCanRead(database, userId, tenantId, query.outletId, "leads.read");
    const outlet = await this.repository.getLeadOutlet(database, tenantId, query.outletId, leadId);
    if (!outlet) throw new AppError(404, "Lead was not found", "LEAD_NOT_FOUND");
    return this.listEvents(database, tenantId, query, "lead", leadId);
  }

  async listCustomer(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    customerId: string,
    query: TimelineQuery,
  ): Promise<TimelinePage> {
    await this.assertCanRead(database, userId, tenantId, query.outletId, "customers.read");
    const outlet = await this.repository.getCustomerOutlet(database, tenantId, query.outletId, customerId);
    if (!outlet) throw new AppError(404, "Customer was not found", "CUSTOMER_NOT_FOUND");
    return this.listEvents(database, tenantId, query, "customer", customerId);
  }

  private async assertCanRead(
    database: TransactionDatabase,
    userId: string,
    tenantId: string,
    outletId: string,
    permission: string,
  ) {
    const allowed = await this.authorization.hasOutletPermission(database, userId, tenantId, outletId, permission);
    if (!allowed) {
      throw new AppError(403, "You do not have permission to view this timeline", "POSTGRES_PERMISSION_DENIED");
    }
  }

  private async listEvents(
    database: TransactionDatabase,
    tenantId: string,
    query: TimelineQuery,
    entityType: "lead" | "customer",
    entityId: string,
  ): Promise<TimelinePage> {
    const rows = await this.repository.list(
      database, tenantId, query.outletId, entityType, entityId, query.limit, decodeCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const last = items.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(`${last.eventTime}\n${last.id}`, "utf8").toString("base64url")
      : null;
    return { items, nextCursor };
  }
}

export const postgresTimelineService = new PostgresTimelineService();
