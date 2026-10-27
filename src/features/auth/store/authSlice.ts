// Authentication feature state
import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import type {
  OutletPermissions,
  UserProfile,
} from "../types/UserProfile";
import { authApi } from "../api/authApi";
import { getErrorMessage } from "@/shared/utils/errorUtils";
import {
  postgresSession,
  PostgresSessionError,
  type PostgresCurrentAccess,
} from "../api/postgresSession";

interface LoginPayload {
  username: string;
  password: string;
}

interface UserAccessControlPayload {
  permissions: OutletPermissions[];
  role?: string;
}

interface SidebarMenuOrderPayload {
  outletPreferenceKey: string;
  order: string[];
}

export interface AuthState {
  user: UserProfile | null;
  postgresAccess: PostgresCurrentAccess | null;
  authMode: "postgres" | null;
  postgresStatus: "idle" | "checking" | "authenticated" | "unauthenticated";
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  permissionRefreshError: string | null;
}

const initialState: AuthState = {
  user: null,
  postgresAccess: null,
  authMode: null,
  postgresStatus: "idle",
  loading: false,
  error: null,
  isAuthenticated: false,
  permissionRefreshError: null,
};

export const loginUser = createAsyncThunk<PostgresCurrentAccess, LoginPayload, { rejectValue: string }>(
  "auth/loginPostgresUser",
  async ({ username, password }, { rejectWithValue }) => {
    try {
      await authApi.loginPostgres(username, password);
      return await authApi.getPostgresCurrentAccess();
    } catch (err: unknown) {
      if (err instanceof PostgresSessionError && err.status === 401) {
        postgresSession.clearSession();
      }
      return rejectWithValue(getErrorMessage(err, "Login failed"));
    }
  },
);

export const restorePostgresSession = createAsyncThunk<
  PostgresCurrentAccess,
  void,
  { rejectValue: string }
>("auth/restorePostgresSession", async (_, { rejectWithValue }) => {
  try {
    await postgresSession.restoreSession();
    return await authApi.getPostgresCurrentAccess();
  } catch (err: unknown) {
    if (err instanceof PostgresSessionError && err.status === 401) {
      postgresSession.clearSession();
    }
    return rejectWithValue(getErrorMessage(err, "Session expired"));
  }
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    authenticatePostgresUser(state, action: PayloadAction<PostgresCurrentAccess>) {
      state.user = null;
      state.postgresAccess = action.payload;
      state.authMode = "postgres";
      state.postgresStatus = "authenticated";
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;
    },
    logout(state) {
      state.user = null;
      state.postgresAccess = null;
      state.authMode = null;
      state.postgresStatus = "unauthenticated";
      state.isAuthenticated = false;
      state.error = null;
      state.permissionRefreshError = null;
    },
    postgresSessionExpired(state) {
      if (state.authMode !== "postgres") return;
      state.user = null;
      state.postgresAccess = null;
      state.authMode = null;
      state.isAuthenticated = false;
      state.postgresStatus = "unauthenticated";
      state.error = null;
    },
    updatePermissions(state, action: PayloadAction<OutletPermissions[]>) {
    if (state.user) {
      state.user.permissions = action.payload;
    }
  },
    updateUserAccessControl(state, action: PayloadAction<UserAccessControlPayload>) {
      if (state.user) {
        state.user.permissions = action.payload.permissions;
        state.user.role = action.payload.role;
        delete state.user.outletRoles;
        delete state.user.departmentAccessList;
        delete state.user.permissionList;
        state.permissionRefreshError = null;
      }
    },
    setPermissionRefreshError(state, action: PayloadAction<string | null>) {
      state.permissionRefreshError = action.payload;
    },
    updateSidebarMenuOrder(state, action: PayloadAction<SidebarMenuOrderPayload>) {
      if (state.user) {
        state.user.sidebarMenuOrderByOutlet = {
          ...(state.user.sidebarMenuOrderByOutlet ?? {}),
          [action.payload.outletPreferenceKey]: action.payload.order,
        };
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.postgresStatus = "checking";
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action: PayloadAction<PostgresCurrentAccess>) => {
        state.user = null;
        state.postgresAccess = action.payload;
        state.authMode = "postgres";
        state.postgresStatus = "authenticated";
        state.isAuthenticated = true;
        state.loading = false;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.postgresStatus = "unauthenticated";
        state.isAuthenticated = false;
        state.error = action.payload || "Login failed";
      })
      .addCase(restorePostgresSession.pending, (state) => {
        state.postgresStatus = "checking";
        state.error = null;
      })
      .addCase(restorePostgresSession.fulfilled, (state, action) => {
        state.postgresAccess = action.payload;
        state.authMode = "postgres";
        state.postgresStatus = "authenticated";
        state.isAuthenticated = true;
      })
      .addCase(restorePostgresSession.rejected, (state, action) => {
        state.postgresAccess = null;
        state.postgresStatus = "unauthenticated";
        state.isAuthenticated = false;
        state.error = action.payload || "Session expired";
      });
  },
});

export const { authenticatePostgresUser, logout, postgresSessionExpired, updatePermissions, updateUserAccessControl, setPermissionRefreshError, updateSidebarMenuOrder } =
  authSlice.actions;
export default authSlice.reducer;
