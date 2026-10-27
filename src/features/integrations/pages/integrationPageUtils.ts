import type { IntegrationConfig } from "../types/types";

declare global {
  interface Window {
    FB?: {
      init: (params: {
        appId: string;
        cookie: boolean;
        xfbml: boolean;
        version: string;
      }) => void;
      login: (
        callback: (response: {
          authResponse?: { accessToken: string };
          status: string;
        }) => void,
        options?: { scope: string }
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const FACEBOOK_SDK_ID = "facebook-jssdk";
const FACEBOOK_SCOPES =
  "ads_read,leads_retrieval,pages_show_list,business_management";

export const maskIntegrationSecret = (value?: string | null) => {
  if (!value) return "-";
  const trimmed = String(value).trim();
  if (!trimmed) return "-";
  if (trimmed.length <= 4) return `${trimmed}****`;
  return `${trimmed.slice(0, 4)}****`;
};

const getFacebookAppId = () =>
  (import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined)?.trim() || "";

let facebookSdkPromise: Promise<void> | null = null;

const loadFacebookSdk = (appId: string) => {
  if (facebookSdkPromise) {
    return facebookSdkPromise;
  }

  facebookSdkPromise = new Promise<void>((resolve, reject) => {
    if (window.FB) {
      resolve();
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: false,
        version: "v21.0",
      });
      resolve();
    };

    if (document.getElementById(FACEBOOK_SDK_ID)) {
      const waitForSdk = window.setInterval(() => {
        if (window.FB) {
          window.clearInterval(waitForSdk);
          resolve();
        }
      }, 100);
      window.setTimeout(() => {
        window.clearInterval(waitForSdk);
        if (!window.FB) {
          reject(new Error("Facebook SDK failed to load"));
        }
      }, 10000);
      return;
    }

    const script = document.createElement("script");
    script.id = FACEBOOK_SDK_ID;
    script.async = true;
    script.defer = true;
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Facebook SDK failed to load"));
    document.body.appendChild(script);
  });

  return facebookSdkPromise;
};

export const loginWithFacebook = async (): Promise<
  Pick<IntegrationConfig, "accessToken" | "type">
> => {
  const appId = getFacebookAppId();
  if (!appId) {
    throw new Error("Facebook App ID is not configured.");
  }

  await loadFacebookSdk(appId);

  return new Promise((resolve, reject) => {
    window.FB?.login(
      (response) => {
        const accessToken = response.authResponse?.accessToken;
        if (!accessToken) {
          reject(new Error("Facebook login was cancelled or failed."));
          return;
        }

        resolve({
          accessToken,
          type: "FB",
        });
      },
      { scope: FACEBOOK_SCOPES }
    );
  });
};
