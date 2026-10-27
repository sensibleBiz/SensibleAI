import type { QueryResultRow } from "pg";
import { withDatabaseContext } from "../db/context.js";
import { ensureApplicationRole, getApplicationPool } from "../db/client.js";
import { AppError } from "../errors/appError.js";
import { PostgresAuthRepository } from "../modules/auth/auth.repository.js";
import { postgresAuthorizationRepository } from "../modules/authorization/postgresAuthorization.repository.js";
import { postgresOutletRepository } from "../modules/outlets/postgresOutlet.repository.js";
import type { BusinessOnboardingInput } from "../types/onboarding.types.js";

const authRepository = new PostgresAuthRepository();
export const normalizeIndianPhone = (phone: string) => `+91${phone.replace(/\D/g, "").slice(-10)}`;

const loadAccount = async (identifier: string) => {
  const identity = await authRepository.findByIdentifier(identifier);
  const membership = identity?.memberships.find((item) => item.active);
  if (!identity || !membership) return null;
  return withDatabaseContext({
    userId: identity.userId,
    tenantId: membership.tenantId,
  }, async (database) => {
    const access = await postgresAuthorizationRepository.getCurrentAccess(database, identity.userId, membership.tenantId);
    const outlets = await postgresOutletRepository.list(database, membership.tenantId);
    const outlet = outlets[0];
    if (!outlet) return null;
    return { identity, access, outlet };
  });
};

export const postgresOnboardingRepository = {
  async accountExistsByPhoneNumber(phoneNumber: string) {
    return Boolean(await authRepository.findByIdentifier(normalizeIndianPhone(phoneNumber)));
  },
  findAccount(_uid: string, phoneNumber: string) {
    return loadAccount(normalizeIndianPhone(phoneNumber));
  },
  async createBusiness(uid: string, phoneNumber: string, input: BusinessOnboardingInput) {
    await ensureApplicationRole();
    try {
      const result = await getApplicationPool().query<QueryResultRow & { account: Record<string, unknown> }>(
        `SELECT iam.bootstrap_phone_onboarding($1,$2,$3,$4,$5,$6,$7,$8,$9) AS account`,
        [uid, phoneNumber, input.ownerName, input.email, input.businessName, input.branch,
          input.address, input.city, input.state],
      );
      const account = await loadAccount(normalizeIndianPhone(phoneNumber));
      if (!result.rows[0]?.account || !account) throw new Error("Onboarding account was not created");
      return account;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AppError(
          409,
          "An account already exists for this mobile number or email address",
          "ACCOUNT_ALREADY_EXISTS",
        );
      }
      throw error;
    }
  },
};
