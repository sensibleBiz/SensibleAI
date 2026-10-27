import type { TransactionDatabase } from "../../../db/context.js";
import { postgresAuthorizationRepository } from "../../authorization/postgresAuthorization.repository.js";
import { type PendingTargetAction, fmtINR, fmtMonthYear } from "./pendingActionsStore.js";

export async function executePendingAction(
  database: TransactionDatabase,
  action: PendingTargetAction,
  confirmedByUserId: string,
): Promise<string> {
  const canWrite = await postgresAuthorizationRepository.hasOutletPermission(
    database,
    confirmedByUserId,
    action.tenantId,
    action.outletId,
    "lead_targets.create",
  );
  if (!canWrite) {
    return "You no longer have permission to set employee targets.";
  }

  if (action.type === "single") {
    if (action.resolvedId !== null) {
      await database.client.query(
        `INSERT INTO crm.employee_sales_targets (
           id, tenant_id, outlet_id, sale_executive_user_id, created_by_user_id,
           updated_by_user_id, zone, sale_executive, forecast_net_sales,
           achieved_net_sales, display_order, target_month, target_year
         ) VALUES (
           public.uuid_generate_v7(), $1, $2, $3, $4, $4, $5, $6, $7, 0, 0, $8, $9
         )
         ON CONFLICT (tenant_id, outlet_id, sale_executive_user_id, zone, target_month, target_year)
           WHERE sale_executive_user_id IS NOT NULL
         DO UPDATE SET
           forecast_net_sales  = EXCLUDED.forecast_net_sales,
           updated_by_user_id  = EXCLUDED.updated_by_user_id,
           sale_executive      = EXCLUDED.sale_executive`,
        [
          action.tenantId, action.outletId,
          action.resolvedId,
          confirmedByUserId,
          action.zone, action.resolvedName, action.forecastNetSales,
          action.month, action.year,
        ],
      );
    } else {
      await database.client.query(
        `INSERT INTO crm.employee_sales_targets (
           id, tenant_id, outlet_id, sale_executive_user_id, created_by_user_id,
           updated_by_user_id, zone, sale_executive, forecast_net_sales,
           achieved_net_sales, display_order, target_month, target_year
         ) VALUES (
           public.uuid_generate_v7(), $1, $2, NULL, $3, $3, $4, $5, $6, 0, 0, $7, $8
         )
         ON CONFLICT (tenant_id, outlet_id, zone, lower(sale_executive), target_month, target_year)
           WHERE sale_executive_user_id IS NULL
         DO UPDATE SET
           forecast_net_sales  = EXCLUDED.forecast_net_sales,
           updated_by_user_id  = EXCLUDED.updated_by_user_id`,
        [
          action.tenantId, action.outletId,
          confirmedByUserId,
          action.zone, action.resolvedName, action.forecastNetSales,
          action.month, action.year,
        ],
      );
    }
    return (
      `Done! **${action.resolvedName}**'s target for ` +
      `**${fmtMonthYear(action.month, action.year)}** is now **${fmtINR(action.forecastNetSales)}** ` +
      `(${action.zone} zone).`
    );
  }

  await database.client.query("SAVEPOINT bulk_target");
  try {
    for (const emp of action.employees) {
      await database.client.query(
        `INSERT INTO crm.employee_sales_targets (
           id, tenant_id, outlet_id, sale_executive_user_id, created_by_user_id,
           updated_by_user_id, zone, sale_executive, forecast_net_sales,
           achieved_net_sales, display_order, target_month, target_year
         ) VALUES (
           public.uuid_generate_v7(), $1, $2, $3, $4, $4, $5, $6, $7, 0, 0, $8, $9
         )
         ON CONFLICT (tenant_id, outlet_id, sale_executive_user_id, zone, target_month, target_year)
           WHERE sale_executive_user_id IS NOT NULL
         DO UPDATE SET
           forecast_net_sales  = EXCLUDED.forecast_net_sales,
           updated_by_user_id  = EXCLUDED.updated_by_user_id,
           sale_executive      = EXCLUDED.sale_executive`,
        [
          action.tenantId, action.outletId,
          emp.userId,
          confirmedByUserId,
          emp.zone, emp.name, action.forecastNetSales,
          action.month, action.year,
        ],
      );
    }
    await database.client.query("RELEASE SAVEPOINT bulk_target");
  } catch (err) {
    await database.client.query("ROLLBACK TO SAVEPOINT bulk_target");
    console.error("Bulk target update failed — rolled back", err);
    return "The bulk target update failed and was rolled back. Please try again.";
  }

  return (
    `Done! Forecast target set to **${fmtINR(action.forecastNetSales)}** for ` +
    `**${action.employees.length} employees** in **${action.zoneSummary}** ` +
    `for **${fmtMonthYear(action.month, action.year)}**.`
  );
}
