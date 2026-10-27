 import { withDatabaseContext } from "../../db/context.js";
import type { TransactionDatabase } from "../../db/context.js";
import {
  BIOMETRIC_INGEST_BOOTSTRAP_TENANT_ID,
  BIOMETRIC_INGEST_SYSTEM_USER_ID,
} from "../attendance/postgresBiometric.service.js";

export interface EventGatewayOutletContext {
  tenantId: string;
  businessId: string;
  outletId: string;
}

export const withEventGatewayDatabase = async <T>(
  outletId: string,
  operation: (database: TransactionDatabase, context: EventGatewayOutletContext) => Promise<T>,
): Promise<T> => {
  const bootstrap = {
    userId: BIOMETRIC_INGEST_SYSTEM_USER_ID,
    tenantId: BIOMETRIC_INGEST_BOOTSTRAP_TENANT_ID,
    isSuperAdmin: true,
  };
  const outletContext = await withDatabaseContext(bootstrap, async (database) => {
    const result = await database.client.query<{
      tenant_id: string;
      business_id: string;
      admin_user_id: string | null;
    }>(
      `SELECT o.tenant_id, o.business_id, m.user_id AS admin_user_id
       FROM tenancy.outlets o
       LEFT JOIN tenancy.tenant_memberships m
         ON m.tenant_id = o.tenant_id AND m.active = true AND m.is_tenant_admin = true
       WHERE o.id = $1 AND o.active = true
       ORDER BY m.created_at ASC
       LIMIT 1`,
      [outletId],
    );
    return result.rows[0] ?? null;
  });
  if (!outletContext) {
    throw new Error("Outlet not found");
  }

  // Use the tenant's admin user context so operations run with tenant-scoped authority
  // rather than a global superadmin bypass.
  const actingUserId = outletContext.admin_user_id ?? BIOMETRIC_INGEST_SYSTEM_USER_ID;
  const isSuperAdmin = !outletContext.admin_user_id;

  return withDatabaseContext(
    { userId: actingUserId, tenantId: outletContext.tenant_id, isSuperAdmin },
    async (database) =>
      operation(database, {
        tenantId: outletContext.tenant_id,
        businessId: outletContext.business_id,
        outletId,
      }),
  );
};
