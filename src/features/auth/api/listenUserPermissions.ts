import { accessControlApi } from "@/features/access-control";
import { ApiError } from "@/shared/api/apiClient";
import { setPermissionRefreshError, updateUserAccessControl } from "../store/authSlice";
import { store } from "@/app/store";

const ACCESS_REFRESH_INTERVAL_MS = 30_000;

export const listenUserPermissions = (userId: string) => {
  void userId;
  let stopped = false;
  let activeController: AbortController | undefined;

  const refresh = async () => {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;

    try {
      const access = await accessControlApi.getMyAccess(controller.signal);
      if (!stopped) store.dispatch(updateUserAccessControl(access));
    } catch (error) {
      if (stopped || controller.signal.aborted) return;
      console.error("Failed to refresh user permissions", error);
      if (error instanceof ApiError && error.code === "USER_PROFILE_NOT_FOUND") {
        store.dispatch(
          setPermissionRefreshError(
            "Your user profile could not be refreshed. You may need to sign in again or reload the page.",
          ),
        );
        return;
      }
      store.dispatch(
        setPermissionRefreshError(
          "Your latest permissions could not be loaded. Access shown may be out of date. Check your connection or refresh the page.",
        ),
      );
    }
  };

  const handleFocus = () => void refresh();
  const intervalId = window.setInterval(
    () => {
      if (document.visibilityState === "visible") void refresh();
    },
    ACCESS_REFRESH_INTERVAL_MS,
  );
  window.addEventListener("focus", handleFocus);
  void refresh();

  return () => {
    stopped = true;
    activeController?.abort();
    window.clearInterval(intervalId);
    window.removeEventListener("focus", handleFocus);
  };
};
