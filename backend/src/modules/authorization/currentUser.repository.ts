import type { TransactionDatabase } from "../../db/context.js";
import type { CurrentUserProfileUpdateInput } from "./currentUser.validator.js";

export class CurrentUserRepository {
  async updateProfile(
    database: TransactionDatabase,
    userId: string,
    input: CurrentUserProfileUpdateInput,
  ): Promise<boolean> {
    const result = await database.client.query<{ id: string }>(`
      UPDATE iam.users
      SET display_name = coalesce($2, display_name),
          email = coalesce($3, email),
          updated_at = now()
      WHERE id = $1 AND active
      RETURNING id
    `, [userId, input.displayName ?? null, input.email ?? null]);

    return result.rowCount === 1;
  }
}

export const currentUserRepository = new CurrentUserRepository();
