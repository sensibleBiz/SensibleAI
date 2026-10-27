import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import {
  PostgresAuthorizationRepository,
  postgresAuthorizationRepository,
} from "./postgresAuthorization.repository.js";
import {
  CurrentUserRepository,
  currentUserRepository,
} from "./currentUser.repository.js";
import type { CurrentUserProfileUpdateInput } from "./currentUser.validator.js";

export class CurrentUserService {
  constructor(
    private readonly repository: CurrentUserRepository = currentUserRepository,
    private readonly authorization: PostgresAuthorizationRepository = postgresAuthorizationRepository,
  ) {}

  async updateProfile(
    database: TransactionDatabase,
    userId: string,
    tenantId: string,
    input: CurrentUserProfileUpdateInput,
  ) {
    try {
      if (!await this.repository.updateProfile(database, userId, input)) {
        throw new AppError(404, "User profile was not found", "USER_PROFILE_NOT_FOUND");
      }
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new AppError(
          409,
          "An account already uses this email address",
          "EMAIL_ALREADY_EXISTS",
        );
      }
      throw error;
    }

    return this.authorization.getCurrentAccess(database, userId, tenantId);
  }
}

export const currentUserService = new CurrentUserService();
