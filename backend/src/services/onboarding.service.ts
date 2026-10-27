import type { DecodedIdToken } from "firebase-admin/auth";
import { AppError } from "../errors/appError.js";
import { postgresOnboardingRepository } from "../repositories/postgresOnboarding.repository.js";
import { authService } from "../modules/auth/auth.service.js";
import type {
  BusinessOnboardingInput,
  OnboardingPhoneCheckResult,
  OnboardingStatusResult,
} from "../types/onboarding.types.js";

const getVerifiedPhoneNumber = (token: DecodedIdToken) => {
  const phoneNumber = token.phone_number;
  const provider = token.firebase?.sign_in_provider;

  if (
    typeof phoneNumber !== "string" ||
    !phoneNumber.trim() ||
    provider !== "phone"
  ) {
    throw new AppError(
      403,
      "Verify your mobile number with OTP before continuing",
      "PHONE_VERIFICATION_REQUIRED",
    );
  }

  return phoneNumber.trim();
};

const createPostgresOnboardingSession = async (account: NonNullable<Awaited<ReturnType<typeof postgresOnboardingRepository.findAccount>>>) => ({
  mode: "postgres" as const,
  ...await authService.issueVerified(account.identity.userId),
  access: account.access,
  outlet: account.outlet,
});

export const onboardingService = {
  async checkPhoneNumber(
    phoneNumber: string,
  ): Promise<OnboardingPhoneCheckResult> {
    const exists = await postgresOnboardingRepository.accountExistsByPhoneNumber(
      phoneNumber,
    );
    return {
      exists,
      ...(exists ? { loginMethod: "otp" as const } : {}),
    };
  },

  async getStatus(
    uid: string,
    token: DecodedIdToken,
  ): Promise<OnboardingStatusResult> {
    const phoneNumber = getVerifiedPhoneNumber(token);
    const account = await postgresOnboardingRepository.findAccount(uid, phoneNumber);
    return account ? { exists: true, account: await createPostgresOnboardingSession(account) } : { exists: false };
  },

  async createBusiness(
    uid: string,
    token: DecodedIdToken,
    input: BusinessOnboardingInput,
  ) {
    const phoneNumber = getVerifiedPhoneNumber(token);
    const account = await postgresOnboardingRepository.createBusiness(uid, phoneNumber, input);
    return createPostgresOnboardingSession(account);
  },
};
