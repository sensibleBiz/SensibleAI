import type { AuthContext, AuthorizedUserProfile } from "./auth.types.js";
import type { TransactionDatabase } from "../db/context.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      postgresAuth?: {
        userId: string;
        tenantId: string;
        isTenantAdmin: boolean;
      };
      database?: TransactionDatabase;
      tenantId?: string;
      userId?: string;
      userProfile?: AuthorizedUserProfile;
      outletId?: string;
      validated?: {
        body?: unknown;
        params?: unknown;
        query?: unknown;
      };
    }
  }
}

export {};
