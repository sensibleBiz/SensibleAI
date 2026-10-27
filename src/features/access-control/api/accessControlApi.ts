import type { OutletPermissions, UserProfile } from "@/features/auth";
import type { PermissionDTO } from "../types/types";
import { postgresSession } from "@/features/auth";
import { apiRequest, type ApiAuthMode } from "@/shared/api/apiClient";

export interface PermissionUser extends UserProfile {
  department?: string;
  verified: boolean;
}

export interface PermissionUserDetail {
  user: PermissionUser;
  permissionMaster: PermissionDTO[];
  departments: string[];
}

export interface OutletSummary {
  id: string;
  name: string;
  branch?: string;
  city?: string;
  state?: string;
  active?: boolean;
  createdDate?: number;
  renewalDate?: number;
}

export interface OutletFeatureAccessResponse {
  outletId: string;
  enabledFeatureKeys: string[];
  isConfigured: boolean;
  revision: number;
  userCount?: number;
}

const accessAuthOptions = (authMode?: ApiAuthMode) =>
  authMode
    ? { authMode }
    : postgresSession.getAccessToken()
      ? { authMode: "postgres" as const }
      : {};

const withAuth = <T>(
  path: string,
  options: Parameters<typeof apiRequest<T>>[1] = {},
  authMode?: ApiAuthMode,
) => apiRequest<T>(path, { ...options, ...accessAuthOptions(authMode) });

const query = (outletId: string) =>
  new URLSearchParams({ outletId }).toString();

interface FeatureRequestCacheEntry {
  expiresAt: number;
  promise: Promise<OutletFeatureAccessResponse>;
}

const featureRequestCache = new Map<string, FeatureRequestCacheEntry>();
const FEATURE_REQUEST_CACHE_MS = 10_000;
const FEATURE_CACHE_SEPARATOR = "\u0000";

const getCachedOutletFeatures = (
  contextOutletId: string,
  targetOutletId: string,
  includeUserCount: boolean,
  signal?: AbortSignal,
  authMode?: ApiAuthMode,
) => {
  const search = new URLSearchParams({
    outletId: contextOutletId,
    ...(includeUserCount ? { includeUserCount: "true" } : {}),
  });
  const path = `/api/v1/access-control/outlets/${encodeURIComponent(targetOutletId)}/features?${search}`;
  const cacheKey = [authMode ?? "auto", contextOutletId, targetOutletId, String(includeUserCount)].join(
    FEATURE_CACHE_SEPARATOR,
  );
  const cached = featureRequestCache.get(cacheKey);
  const promise =
    cached && cached.expiresAt > Date.now()
      ? cached.promise
      : withAuth<OutletFeatureAccessResponse>(path, {}, authMode);
  if (!cached || cached.expiresAt <= Date.now()) {
    featureRequestCache.set(cacheKey, {
      expiresAt: Date.now() + FEATURE_REQUEST_CACHE_MS,
      promise,
    });
    void promise.catch(() => {
      if (featureRequestCache.get(cacheKey)?.promise === promise) {
        featureRequestCache.delete(cacheKey);
      }
    });
  }

  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<OutletFeatureAccessResponse>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
};

const invalidateOutletFeatureRequests = (targetOutletId: string) => {
  for (const key of featureRequestCache.keys()) {
    if (key.split(FEATURE_CACHE_SEPARATOR)[2] === targetOutletId) {
      featureRequestCache.delete(key);
    }
  }
};

export const accessControlApi = {
  getMyAccess(signal?: AbortSignal) {
    return withAuth<{ role?: string; permissions: OutletPermissions[] }>(
      "/api/v1/access-control/me",
      { signal },
    );
  },

  listPermissions(outletId: string, signal?: AbortSignal) {
    return withAuth<PermissionDTO[]>(
      `/api/v1/access-control/permissions?${query(outletId)}`,
      { signal },
    );
  },

  createPermission(outletId: string, permission: Omit<PermissionDTO, "id">) {
    return withAuth<PermissionDTO>("/api/v1/access-control/permissions", {
      method: "POST",
      body: { outletId, ...permission },
    });
  },

  updatePermission(
    outletId: string,
    permissionId: string,
    permission: Pick<PermissionDTO, "label" | "description" | "category">,
  ) {
    return withAuth<PermissionDTO>(
      `/api/v1/access-control/permissions/${encodeURIComponent(permissionId)}`,
      {
        method: "PATCH",
        body: {
          outletId,
          label: permission.label,
          description: permission.description,
          category: permission.category,
        },
      },
    );
  },

  deletePermission(outletId: string, permissionId: string) {
    return withAuth<{ permissionId: string; deleted: boolean; idempotent: boolean }>(
      `/api/v1/access-control/permissions/${encodeURIComponent(permissionId)}?${query(outletId)}`,
      { method: "DELETE" },
    );
  },

  listUsers(outletId: string, signal?: AbortSignal, authMode?: ApiAuthMode) {
    return withAuth<PermissionUser[]>(
      `/api/v1/access-control/users?${query(outletId)}`,
      { signal },
      authMode,
    );
  },

  getUser(outletId: string, userId: string, signal?: AbortSignal, authMode?: ApiAuthMode) {
    return withAuth<PermissionUserDetail>(
      `/api/v1/access-control/users/${encodeURIComponent(userId)}?${query(outletId)}`,
      { signal },
      authMode,
    );
  },

  updateUser(
    userId: string,
    input: {
      outletId: string;
      role: string;
      departmentAccessList: string[];
      outletPermissions: string[];
    },
    authMode?: ApiAuthMode,
  ) {
    return withAuth<{ userId: string; updatedAt: number }>(
      `/api/v1/access-control/users/${encodeURIComponent(userId)}`,
      { method: "PATCH", body: input },
      authMode,
    );
  },

  listOutlets(contextOutletId: string, signal?: AbortSignal) {
    return withAuth<OutletSummary[]>(
      `/api/v1/access-control/outlets?${query(contextOutletId)}`,
      { signal },
    );
  },

  getOutletFeatures(
    contextOutletId: string,
    targetOutletId: string,
    includeUserCount = false,
    signal?: AbortSignal,
    authMode?: ApiAuthMode,
  ) {
    return getCachedOutletFeatures(
      contextOutletId,
      targetOutletId,
      includeUserCount,
      signal,
      authMode,
    );
  },

  updateOutletFeatures(
    contextOutletId: string,
    targetOutletId: string,
    enabledFeatureKeys: string[],
    expectedRevision: number,
  ) {
    const request = withAuth<OutletFeatureAccessResponse>(
      `/api/v1/access-control/outlets/${encodeURIComponent(targetOutletId)}/features`,
      {
        method: "PATCH",
        body: {
          outletId: contextOutletId,
          enabledFeatureKeys,
          expectedRevision,
        },
      },
    );
    return request.then((response) => {
      invalidateOutletFeatureRequests(targetOutletId);
      return response;
    });
  },
};

export const OUTLET_FEATURE_ACCESS_UPDATED_EVENT =
  "outlet-feature-access-updated";
