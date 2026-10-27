import { z } from "zod";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import type { UserTrackingCursor, UserTrackingPoint, UserTrackingQuery } from "../../types/userTracking.types.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { PostgresUserTrackingRepository, postgresUserTrackingRepository } from "./postgresUserTracking.repository.js";
import type { PostgresUserTrackingCreateInput, PostgresUserTrackingRecord } from "./userTracking.types.js";

const DAY_MS = 86_400_000;
const cursorSchema = z.object({ id: z.string().uuid(), timestamp: z.number().finite().nonnegative() });

const decodeCursor = (cursor?: string): UserTrackingCursor | undefined => {
  if (!cursor) return undefined;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")));
  } catch {
    throw new AppError(400, "Invalid pagination cursor", "INVALID_CURSOR");
  }
};

const encodeCursor = (record: PostgresUserTrackingRecord) =>
  Buffer.from(JSON.stringify({ id: record.id, timestamp: record.recordedAt.getTime() }), "utf8").toString("base64url");

const mapPoint = (record: PostgresUserTrackingRecord): UserTrackingPoint => ({
  id: record.id,
  userId: record.userId,
  latitude: record.latitude,
  longitude: record.longitude,
  address: record.address,
  name: record.name,
  timestamp: record.recordedAt.getTime(),
});

export class PostgresUserTrackingService {
  constructor(
    private readonly repository: PostgresUserTrackingRepository = postgresUserTrackingRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  async listHistory(
    database: TransactionDatabase,
    tenantId: string,
    actorUserId: string,
    query: UserTrackingQuery,
  ) {
    if (!await this.authorization.hasOutletPermission(database, actorUserId, tenantId, query.outletId, "tracking.read")) {
      throw new AppError(403, "Permission denied for tracking.read", "PERMISSION_DENIED");
    }
    const startDate = Date.parse(`${query.date}T00:00:00.000+05:30`);
    if (!Number.isFinite(startDate)) throw new AppError(400, "Date is invalid", "VALIDATION_ERROR");
    const records = await this.repository.listHistory(
      database, tenantId, query.outletId, query.userId, startDate, startDate + DAY_MS,
      decodeCursor(query.cursor), query.limit,
    );
    const hasMore = records.length > query.limit;
    const page = records.slice(0, query.limit);
    return {
      items: page.map(mapPoint),
      nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]!) : null,
    };
  }

  async create(
    database: TransactionDatabase,
    tenantId: string,
    actorUserId: string,
    input: PostgresUserTrackingCreateInput,
  ) {
    const userId = input.userId ?? actorUserId;
    if (!await this.authorization.hasOutletAccess(database, actorUserId, tenantId, input.outletId)) {
      throw new AppError(403, "Outlet access is required", "OUTLET_ACCESS_DENIED");
    }
    if (userId !== actorUserId && !await this.authorization.hasOutletPermission(
      database, actorUserId, tenantId, input.outletId, "tracking.write",
    )) {
      throw new AppError(403, "Permission denied for tracking.write", "PERMISSION_DENIED");
    }
    if (!await this.repository.userHasOutletAccess(database, tenantId, input.outletId, userId)) {
      throw new AppError(400, "Tracking user is inactive or does not belong to this outlet", "INVALID_TRACKING_USER");
    }
    return mapPoint(await this.repository.create(database, tenantId, actorUserId, { ...input, userId }));
  }
}

export const postgresUserTrackingService = new PostgresUserTrackingService();
