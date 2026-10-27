import type { Pool, QueryResultRow } from "pg";
import { ensureApplicationRole, getApplicationPool } from "../../db/client.js";
import type { AuthMembership, LoginIdentity } from "./auth.types.js";

interface LoginIdentityRow extends QueryResultRow {
  user_id: string;
  legacy_id: string | null;
  email: string | null;
  phone: string | null;
  display_name: string;
  user_active: boolean;
  password_hash: string | null;
  credential_state: "legacy" | "argon2id";
  refresh_token_version: number;
  memberships: AuthMembership[];
}

export interface AuthRepository {
  findByIdentifier(identifier: string): Promise<LoginIdentity | null>;
  findByUserId(userId: string): Promise<LoginIdentity | null>;
  upgradeLegacyCredential(userId: string, passwordHash: string): Promise<boolean>;
  rotateRefreshToken(userId: string, expectedVersion: number): Promise<number | null>;
}

const mapRow = (row: LoginIdentityRow | undefined): LoginIdentity | null => row ? ({
  userId: row.user_id,
  legacyId: row.legacy_id,
  email: row.email,
  phone: row.phone,
  displayName: row.display_name,
  userActive: row.user_active,
  passwordHash: row.password_hash,
  credentialState: row.credential_state,
  refreshTokenVersion: row.refresh_token_version,
  memberships: row.memberships,
}) : null;

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly configuredPool?: Pool) {}

  private get pool() {
    return this.configuredPool ?? getApplicationPool();
  }

  async findByIdentifier(identifier: string) {
    if (!this.configuredPool) await ensureApplicationRole();
    const result = await this.pool.query<LoginIdentityRow>(
      "SELECT * FROM iam.lookup_login_identity($1)",
      [identifier],
    );
    return mapRow(result.rows[0]);
  }

  async findByUserId(userId: string) {
    if (!this.configuredPool) await ensureApplicationRole();
    const result = await this.pool.query<LoginIdentityRow>(
      "SELECT * FROM iam.lookup_login_identity_by_user_id($1)",
      [userId],
    );
    return mapRow(result.rows[0]);
  }

  async upgradeLegacyCredential(userId: string, passwordHash: string) {
    if (!this.configuredPool) await ensureApplicationRole();
    const result = await this.pool.query<{ upgraded: boolean }>(
      "SELECT iam.upgrade_legacy_credential($1, $2) AS upgraded",
      [userId, passwordHash],
    );
    return result.rows[0]?.upgraded === true;
  }

  async rotateRefreshToken(userId: string, expectedVersion: number) {
    if (!this.configuredPool) await ensureApplicationRole();
    const result = await this.pool.query<{ version: number }>(
      "SELECT iam.rotate_refresh_token($1, $2) AS version",
      [userId, expectedVersion],
    );
    return result.rows[0]?.version ?? null;
  }
}
