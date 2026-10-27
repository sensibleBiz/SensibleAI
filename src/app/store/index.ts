import { configureStore, combineReducers, type Middleware } from "@reduxjs/toolkit";
import { signOut } from "firebase/auth";
import storage from "redux-persist/lib/storage";
import { createTransform, persistReducer, persistStore } from "redux-persist";
import authReducer, {
  type AuthState,
  loginUser,
  logout,
  postgresSessionExpired,
} from "@/features/auth/store/authSlice";
import appStateReducer from "./appStateSlice";
import { auth } from "@/shared/api/legacy-firebase/firebaseConfig";
import { clearSessionDataCache } from "@/shared/api/sessionDataCache";
import { postgresSession } from "@/features/auth";

const authBoundaryMiddleware: Middleware = () => (next) => (action) => {
  const result = next(action);
  if (logout.match(action)) {
    clearSessionDataCache();
    void postgresSession.logout();
    void signOut(auth);
  } else if (
    loginUser.fulfilled.match(action)
  ) {
    // Never allow data cached by a previous account in the same browser tab
    // to cross the authentication boundary.
    clearSessionDataCache();
  }
  return result;
};

const authPersistenceBoundary = createTransform<AuthState, AuthState>(
  (state) => state.authMode === "postgres"
    ? {
        ...state,
        postgresAccess: null,
        postgresStatus: "idle",
        isAuthenticated: false,
      }
    : state,
  (state) => state.authMode === "postgres"
    ? {
        ...state,
        postgresAccess: null,
        postgresStatus: "idle",
        isAuthenticated: false,
      }
    : state,
  { whitelist: ["auth"] },
);
const rootReducer = combineReducers({
  auth: authReducer,
  appState: appStateReducer,
});

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["auth","appState"],
  transforms: [authPersistenceBoundary],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  devTools: import.meta.env.DEV,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(authBoundaryMiddleware),
});

postgresSession.subscribeToClear(() => {
  store.dispatch(postgresSessionExpired());
});

export const persistor = persistStore(store);

// Type exports
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
export * from "./appStateSlice";
