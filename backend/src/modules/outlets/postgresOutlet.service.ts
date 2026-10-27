import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import { walletService } from "../billing/wallet.service.js";
import { createOutletCode } from "./outletCode.js";
import { postgresOutletRepository } from "./postgresOutlet.repository.js";
import type { PostgresOutlet, PostgresOutletCreateInput } from "./outlet.types.js";

const requireOutlet = async (database: TransactionDatabase, tenantId: string, outletId: string) => {
  const outlet = await postgresOutletRepository.find(database, tenantId, outletId);
  if (!outlet) throw new AppError(404, "Outlet not found", "OUTLET_NOT_FOUND");
  return outlet;
};

export const postgresOutletService = {
  list: postgresOutletRepository.list,
  async create(
    database: TransactionDatabase,
    tenantId: string,
    userId: string,
    input: PostgresOutletCreateInput,
  ) {
    const access = await postgresAuthorizationRepository.getCurrentAccess(database, userId, tenantId);
    if (!access.tenant.isTenantAdmin) {
      throw new AppError(
        403,
        "Tenant administrator access is required to create an outlet",
        "OUTLET_CREATE_FORBIDDEN",
      );
    }

    const businesses = await postgresOutletRepository.findCreationBusinesses(
      database,
      tenantId,
      input.businessId,
    );
    if (!businesses.length) {
      throw new AppError(
        409,
        "The selected business is not active or is not available to this account",
        "OUTLET_BUSINESS_NOT_FOUND",
      );
    }
    if (businesses.length > 1) {
      throw new AppError(
        409,
        "The account belongs to multiple businesses; provide businessId before creating an outlet",
        "OUTLET_BUSINESS_AMBIGUOUS",
      );
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const outletId = await postgresOutletRepository.create(
        database,
        tenantId,
        businesses[0]!.id,
        userId,
        createOutletCode(input.name),
        input,
      );
      if (!outletId) continue;
      // Wallet creation is part of the same transaction as outlet creation, so
      // every successfully onboarded outlet is immediately billable.
      await walletService.getOrCreateWallet(database, tenantId, outletId);
      return this.get(database, tenantId, outletId);
    }

    throw new AppError(
      409,
      "A unique outlet code could not be generated; retry the request",
      "OUTLET_CODE_CONFLICT",
    );
  },
  async get(database: TransactionDatabase, tenantId: string, outletId: string) {
    const outlet = await requireOutlet(database, tenantId, outletId);
    const subscription = await postgresOutletRepository.getSubscription(database, tenantId, outletId);
    return { outlet, subscription };
  },
  async update(database: TransactionDatabase, tenantId: string, userId: string, outletId: string,
    input: Partial<Pick<PostgresOutlet, "name" | "branch" | "address" | "city" | "state">>) {
    if (!await postgresAuthorizationRepository.hasOutletPermission(database, userId, tenantId, outletId, "outlets.manage")) {
      throw new AppError(403, "Outlet management permission is required", "OUTLET_MANAGE_FORBIDDEN");
    }
    await requireOutlet(database, tenantId, outletId);
    return postgresOutletRepository.update(database, tenantId, outletId, input);
  },
  getPlanCatalog: postgresOutletRepository.getPlanCatalog,
  async savePlanCatalog(database: TransactionDatabase, tenantId: string, userId: string, features: unknown[]) {
    const access = await postgresAuthorizationRepository.getCurrentAccess(database, userId, tenantId);
    if (!access.tenant.isTenantAdmin) {
      throw new AppError(403, "Tenant administrator access is required", "PLAN_MANAGE_FORBIDDEN");
    }
    return postgresOutletRepository.savePlanCatalog(database, tenantId, userId, features);
  },
};
