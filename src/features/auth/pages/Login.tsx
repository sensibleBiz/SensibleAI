import React, { useCallback, useEffect, useRef, useState } from "react";
import { QRCode, Spin } from "antd";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
} from "firebase/auth";
import {
  BarChart3,
  Building2,
  Check,
  LayoutDashboard,
  ListChecks,
  UsersRound,
} from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { useMessageApi } from "@/shared/hooks";
import { auth } from "@/shared/api/legacy-firebase/firebaseConfig";
import type { Outlet } from "@/features/outlets";
import { authApi, type BusinessOnboardingInput, type AnyOnboardingAccount } from "../api/authApi";
import { postgresSession } from "../../../shared/api/postgresSession";
import { teamTreeApi } from "@/features/team";
import { businessConfigurationApi } from "@/features/onboarding";
import { workspaceDestination } from "@/features/onboarding/setupNavigation";
import {
  clearOutletInfo,
  clearteamTreeData,
  setOutletInfo,
  setTeamTreeData,
} from "@/app/store";
import { authenticatePostgresUser, loginUser } from "../store/authSlice";
import type { AppDispatch, RootState } from "@/app/store";
import { APP_MESSAGES, ROUTES_PATHS } from "@/shared/lib/constants";
import { ApiError } from "@/shared/api/apiClient";

const QR_SESSION_DURATION_SECONDS = 30;
const QR_SESSION_DURATION_MS = QR_SESSION_DURATION_SECONDS * 1000;
const MAX_QR_GENERATIONS = 2;
const OTP_RESEND_SECONDS = 30;

const getLocalQrExpiryTime = (createdAt: number, expiryAt: number) => {
  const serverDuration = expiryAt - createdAt;
  const duration =
    Number.isFinite(serverDuration) && serverDuration > 0
      ? serverDuration
      : QR_SESSION_DURATION_MS;
  return Date.now() + duration;
};

type SignupStep = "phone" | "otp" | "profile" | "success";

interface LoginLocationState {
  returnTo?: string;
}

const emptyBusinessProfile: BusinessOnboardingInput = {
  ownerName: "",
  email: "",
  businessName: "",
  branch: "Main Branch",
  address: "",
  city: "",
  state: "",
};

const LoginPage: React.FC = () => {
  const startsWithOutletSignup =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("action") === "create-outlet";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [, setSessionId] = useState<string | null>(null);
  const [, setExpired] = useState(false);
  const [isPasswordLogin, setIsPasswordLogin] = useState(() =>
    typeof window !== "undefined"
      ? startsWithOutletSignup || window.matchMedia("(max-width: 767px)").matches
      : false
  );
  const [expiryTime, setExpiryTime] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(
    QR_SESSION_DURATION_SECONDS
  );
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [isQrGenerationLocked, setIsQrGenerationLocked] = useState(false);
  const qrGenerationCountRef = useRef(0);
  const qrGenerationInFlightRef = useRef(false);
  const qrExpiryTimeRef = useRef<number | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showMobileLogin, setShowMobileLogin] = useState(false);
  const [showIosComingSoon, setShowIosComingSoon] = useState(false);
  const [showOutletSignup, setShowOutletSignup] = useState(startsWithOutletSignup);
  const [signupStep, setSignupStep] = useState<SignupStep>("phone");
  const [signupPhone, setSignupPhone] = useState("");
  const [signupOtp, setSignupOtp] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [signupCheckingPhone, setSignupCheckingPhone] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [businessProfile, setBusinessProfile] = useState<BusinessOnboardingInput>(
    emptyBusinessProfile
  );
  const [createdBusinessName, setCreatedBusinessName] = useState("");
  const [createdOutletId, setCreatedOutletId] = useState("");
  const [returningAccount, setReturningAccount] = useState(false);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const dispatch = useDispatch<AppDispatch>();
  const { authMode, isAuthenticated, postgresStatus } = useSelector(
    (state: RootState) => state.auth
  );
  const location = useLocation();
  const navigate = useNavigate();
  const messageApi = useMessageApi();
  const requestedReturnTo = (location.state as LoginLocationState | null)
    ?.returnTo;
  const returnTo =
    typeof requestedReturnTo === "string" &&
    requestedReturnTo.startsWith("/") &&
    !requestedReturnTo.startsWith("//")
      ? requestedReturnTo
      : "";

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  useEffect(() => {
    if (!showOutletSignup || resendSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setResendSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendSeconds, showOutletSignup]);

  useEffect(
    () => () => {
      recaptchaVerifierRef.current?.clear();
    },
    []
  );

  const createQrSession = useCallback(async (): Promise<string | null> => {
    try {
      setQrError("");
      const session = await authApi.createQrSession();
      qrExpiryTimeRef.current = getLocalQrExpiryTime(
        session.createdAt,
        session.expiryAt
      );
      return session.id;
    } catch (error) {
      let message = "QR login is temporarily unavailable. You can still sign in with your password.";
      if (error instanceof ApiError) {
        if (error.status === 429 || error.code === "BACKEND_UNAVAILABLE" || error.code === "INVALID_API_RESPONSE") {
          message = error.message;
        }
      }
      setQrError(message);
      if (!(error instanceof ApiError && error.status === 429)) {
        console.error("Error creating QR session:", error);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(returnTo || ROUTES_PATHS.DASHBOARD, { replace: true });
    }
  }, [isAuthenticated, navigate, returnTo]);

  useEffect(() => {
    if (isPasswordLogin || !qrUrl || isQrLoading) return;

    const abortController = new AbortController();
    let stopped = false;
    let timeoutId: number | undefined;

    const poll = async () => {
      try {
        const session = await authApi.getQrSession(qrUrl, abortController.signal);
        if (session.status === "EXPIRED") {
          setExpired(true);
          stopped = true;
          return;
        }

        if (session.isLoggedIn && "userId" in session && session.userId) {
          const postgresAccount = await authApi.exchangeQrSession(qrUrl);
          postgresSession.acceptSession(postgresAccount);
          const access = await authApi.getPostgresCurrentAccess();
          const outlet = access.outlets[0];
          const configuration = outlet
            ? await businessConfigurationApi.get(outlet.id)
            : null;
          stopped = true;
          dispatch(authenticatePostgresUser(access));
          if (outlet) dispatch(setOutletInfo({ id: outlet.id, name: outlet.name, active: true, renewalDate: Number.MAX_SAFE_INTEGER } as Outlet));
          navigate(
            workspaceDestination(configuration, ROUTES_PATHS.DASHBOARD, returnTo),
            { replace: true },
          );
          return;
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error("Error polling QR session:", error);
        }
      }

      if (!stopped) {
        timeoutId = window.setTimeout(() => void poll(), 1000);
      }
    };

    void poll();

    return () => {
      stopped = true;
      abortController.abort();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [
    dispatch,
    isQrLoading,
    isPasswordLogin,
    navigate,
    qrUrl,
    returnTo,
  ]);

  const refreshQrCode = useCallback(async (isManualRetry = false) => {
    if (
      qrGenerationInFlightRef.current ||
      (!isManualRetry && qrGenerationCountRef.current >= MAX_QR_GENERATIONS)
    ) {
      return;
    }

    if (isManualRetry) {
      qrGenerationCountRef.current = 0;
      setIsQrGenerationLocked(false);
    }

    qrGenerationInFlightRef.current = true;
    setIsQrLoading(true);

    try {
      const id = await createQrSession();

      if (!id) {
        qrExpiryTimeRef.current = null;
        setQrUrl("");
        setExpiryTime(null);
        return;
      }

      qrGenerationCountRef.current += 1;
      const expiryAt = qrExpiryTimeRef.current;
      if (!expiryAt) return;
      setSessionId(id);
      setQrUrl(id);
      setExpiryTime(expiryAt);
      setRemainingSeconds(QR_SESSION_DURATION_SECONDS);
      setExpired(false);
      setIsQrGenerationLocked(false);
    } finally {
      qrGenerationInFlightRef.current = false;
      setIsQrLoading(false);
    }
  }, [createQrSession]);

  useEffect(() => {
    const isRestoringPostgresSession =
      authMode === "postgres" &&
      (postgresStatus === "idle" || postgresStatus === "checking");
    if (isPasswordLogin || isAuthenticated || isRestoringPostgresSession) return;

    const currentExpiryTime = qrExpiryTimeRef.current;
    if (currentExpiryTime && currentExpiryTime > Date.now()) return;

    if (qrGenerationCountRef.current >= MAX_QR_GENERATIONS) {
      qrExpiryTimeRef.current = null;
      setExpired(true);
      setExpiryTime(null);
      setIsQrGenerationLocked(true);
      return;
    }

    void refreshQrCode();
  }, [
    authMode,
    isAuthenticated,
    isPasswordLogin,
    postgresStatus,
    refreshQrCode,
  ]);

  useEffect(() => {
    if (isPasswordLogin || !expiryTime || isQrLoading) return;

    const interval = window.setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((expiryTime - Date.now()) / 1000)
      );
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        window.clearInterval(interval);

        if (qrGenerationCountRef.current >= MAX_QR_GENERATIONS) {
          qrExpiryTimeRef.current = null;
          setExpired(true);
          setExpiryTime(null);
          setIsQrGenerationLocked(true);
          return;
        }

        void refreshQrCode();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [expiryTime, isPasswordLogin, isQrLoading, refreshQrCode]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSigningIn(true);

    try {
      const result = await dispatch(loginUser({ username, password }));
      if (loginUser.fulfilled.match(result)) {
        dispatch(clearOutletInfo());
        dispatch(clearteamTreeData());
        const outlet = result.payload.outlets[0];
        if (outlet) {
          dispatch(setOutletInfo({
            id: outlet.id,
            name: outlet.name,
            active: true,
            renewalDate: Number.MAX_SAFE_INTEGER,
          } as Outlet));
          const canReadTeam =
            result.payload.tenant.isTenantAdmin ||
            outlet.permissions.includes("team.read") ||
            outlet.permissions.includes("CRM_TEAMTREE_VIEW");
          if (canReadTeam) {
            try {
              const team = await teamTreeApi.list(outlet.id, true);
              dispatch(setTeamTreeData(team.items));
            } catch (error) {
              console.error("Unable to preload Team Tree after login", error);
              dispatch(clearteamTreeData());
            }
          }
        }
        let configuration = null;
        if (outlet) {
          try {
            configuration = await businessConfigurationApi.get(outlet.id);
          } catch (configError) {
            console.warn("Unable to load business configuration on login:", configError);
          }
        }
        navigate(
          workspaceDestination(configuration, ROUTES_PATHS.DASHBOARD, returnTo),
          { replace: true },
        );
      } else {
        messageApi.error(result.payload ?? APP_MESSAGES.ERROR_GENERIC);
      }
    } catch (error) {
      messageApi.error(getSignupErrorMessage(error));
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleClear = () => {
    setUsername("");
    setPassword("");
  };

  const openOutletSignup = () => {
    setIsPasswordLogin(true);
    setSignupError("");
    setShowOutletSignup(true);
  };

  const closeOutletSignup = async () => {
    recaptchaVerifierRef.current?.clear();
    recaptchaVerifierRef.current = null;
    confirmationResultRef.current = null;
    if (signupStep !== "success") {
      await signOut(auth).catch(() => undefined);
    }
    setShowOutletSignup(false);
    setSignupStep("phone");
    setSignupOtp("");
    setSignupError("");
    setSignupLoading(false);
    setSignupCheckingPhone(false);
    setBusinessProfile(emptyBusinessProfile);
    setCreatedOutletId("");
  };

  const applyOnboardingAccount = async (account: AnyOnboardingAccount) => {
    postgresSession.acceptSession(account);
    dispatch(authenticatePostgresUser(account.access));
    dispatch(setOutletInfo(account.outlet));
    dispatch(setTeamTreeData([]));
    setCreatedBusinessName(account.outlet.name);
    setCreatedOutletId(account.outlet.id);
  };

  const getSignupErrorMessage = (error: unknown) => {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    if (code === "auth/too-many-requests") {
      return "Too many OTP requests. Please wait a few minutes and try again.";
    }
    if (code === "auth/unauthorized-domain") {
      return "OTP login is not configured for this web address. Ask the administrator to add this domain in Firebase Authentication > Settings > Authorized domains.";
    }
    if (code === "auth/operation-not-allowed") {
      return "Phone OTP sign-in is not enabled for this Firebase project. Enable the Phone provider in Firebase Authentication > Sign-in method.";
    }
    if (
      code === "auth/invalid-app-credential" ||
      code === "auth/captcha-check-failed" ||
      code === "auth/missing-app-credential"
    ) {
      return "OTP failed: reCAPTCHA could not verify this environment. To fix this on localhost go to Google Cloud Console → reCAPTCHA Enterprise → your site key → Add 'localhost' to allowed domains. Alternatively add a test phone number in Firebase → Authentication → Phone → Test phone numbers.";
    }
    if (code === "auth/invalid-verification-code") {
      return "The OTP is incorrect. Check the code and try again.";
    }
    if (code === "auth/code-expired") {
      return "This OTP has expired. Please request a new code.";
    }
    if (code === "auth/quota-exceeded") {
      return "OTP service is temporarily unavailable. Please contact support.";
    }
    if (error instanceof ApiError && error.status >= 500 && error.detail) {
      return `Server error: ${error.detail}`;
    }
    return error instanceof Error
      ? error.message
      : "Something went wrong. Please try again.";
  };

  const sendSignupOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(signupPhone)) {
      setSignupError("Enter a valid 10-digit Indian mobile number.");
      return;
    }

    // Create the verifier before any state updates to keep it attached to a stable DOM node
    recaptchaVerifierRef.current?.clear();
    recaptchaVerifierRef.current = null;
    const verifier = new RecaptchaVerifier(auth, "outlet-signup-recaptcha", {
      size: "invisible",
    });
    recaptchaVerifierRef.current = verifier;

    setSignupLoading(true);
    setSignupCheckingPhone(true);
    setSignupError("");
    try {
      const phoneStatus = await authApi.checkOnboardingPhone(signupPhone);
      if (phoneStatus.exists && phoneStatus.loginMethod !== "otp") {
        setSignupError(
          "An account already exists for this mobile number. Please sign in instead."
        );
        return;
      }
      setSignupCheckingPhone(false);

      confirmationResultRef.current = await signInWithPhoneNumber(
        auth,
        `+91${signupPhone}`,
        verifier
      );
      setSignupOtp("");
      setSignupStep("otp");
      setResendSeconds(OTP_RESEND_SECONDS);
    } catch (error) {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      setSignupError(getSignupErrorMessage(error));
    } finally {
      setSignupLoading(false);
      setSignupCheckingPhone(false);
    }
  };

  const verifySignupOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(signupOtp)) {
      setSignupError("Enter the 6-digit OTP sent to your mobile.");
      return;
    }
    if (!confirmationResultRef.current) {
      setSignupError("Request a new OTP before continuing.");
      setSignupStep("phone");
      return;
    }

    setSignupLoading(true);
    setSignupError("");
    try {
      const credential = await confirmationResultRef.current.confirm(signupOtp);
      await credential.user.getIdToken(true);
      const status = await authApi.getOnboardingStatus();
      if (status.exists && status.account) {
        await applyOnboardingAccount(status.account);
        setReturningAccount(true);
        setSignupStep("success");
        return;
      }
      setBusinessProfile((profile) => ({
        ...profile,
        email: credential.user.email ?? profile.email,
      }));
      setReturningAccount(false);
      setSignupStep("profile");
    } catch (error) {
      setSignupError(getSignupErrorMessage(error));
    } finally {
      setSignupLoading(false);
    }
  };

  const createBusinessProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSignupLoading(true);
    setSignupError("");
    try {
      const account = await authApi.createBusiness(businessProfile);
      await applyOnboardingAccount(account);
      setReturningAccount(false);
      navigate("/setup", { replace: true });
    } catch (error) {
      setSignupError(getSignupErrorMessage(error));
    } finally {
      setSignupLoading(false);
    }
  };

  const updateBusinessProfile = (
    field: keyof BusinessOnboardingInput,
    value: string
  ) => {
    setBusinessProfile((profile) => ({ ...profile, [field]: value }));
  };

  const openWorkspace = async () => {
    try {
      const configuration = await businessConfigurationApi.get(
        createdOutletId,
      );
      navigate(
        workspaceDestination(configuration, ROUTES_PATHS.DASHBOARD),
        { replace: true },
      );
    } catch (error) {
      messageApi.error(getSignupErrorMessage(error));
    }
  };

  if (showOutletSignup) {
    const stepNumber =
      signupStep === "phone" ? 1 : signupStep === "otp" ? 1 : signupStep === "profile" ? 2 : 3;

    return (
      <main className="login-page outlet-signup-page">
        <span aria-hidden="true" className="login-orb login-orb--one" />
        <span aria-hidden="true" className="login-orb login-orb--two" />
        <div className="outlet-signup-shell">
          <header className="outlet-signup-header">
            <img src="./images/logo1.jpeg" alt="Sensible Connect" />
            {signupStep !== "success" && (
              <button type="button" onClick={() => void closeOutletSignup()}>
                Back to sign in
              </button>
            )}
          </header>

          <section className="outlet-signup-card">
            <aside className="outlet-signup-aside">
              <span className="login-hero-badge">New CRM workspace</span>
              <h1>Bring your outlet online in a few minutes.</h1>
              <p>
                Verify the owner mobile number, add the business details already
                used by Sensible CRM, and start with the essential sales tools.
              </p>
              <ol className="outlet-signup-progress" aria-label="Signup progress">
                {[
                  [1, "Verify mobile"],
                  [2, "Business profile"],
                  [3, "Start using CRM"],
                ].map(([number, label]) => (
                  <li
                    className={stepNumber >= Number(number) ? "active" : ""}
                    key={String(label)}
                  >
                    <span>
                      {stepNumber > Number(number) ? <Check size={14} /> : number}
                    </span>
                    {label}
                  </li>
                ))}
              </ol>
            </aside>

            <div className="outlet-signup-content">
              {signupStep === "phone" && (
                <form
                  className="outlet-signup-form outlet-signup-form--compact"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void sendSignupOtp();
                  }}
                >
                  <div className="outlet-signup-title">
                    <span className="outlet-signup-icon"><Building2 size={22} /></span>
                    <div>
                      <span className="login-eyebrow">Step 1 of 3</span>
                      <h2>Create a new outlet</h2>
                    </div>
                  </div>
                  <p className="outlet-signup-description">
                    We will send an OTP to confirm that this number belongs to
                    the business owner.
                  </p>
                  <div className="login-field">
                    <label htmlFor="outlet-signup-phone">Mobile number</label>
                    <div className="outlet-phone-input">
                      <span>+91</span>
                      <input
                        autoComplete="tel-national"
                        autoFocus
                        id="outlet-signup-phone"
                        inputMode="numeric"
                        maxLength={10}
                        onChange={(event) => {
                          setSignupPhone(event.target.value.replace(/\D/g, ""));
                          setSignupError("");
                        }}
                        placeholder="98765 43210"
                        required
                        value={signupPhone}
                      />
                    </div>
                  </div>
                  {signupError && <p className="outlet-signup-error" role="alert">{signupError}</p>}
                  <button className="login-submit-button" disabled={signupLoading} type="submit">
                    {signupCheckingPhone
                      ? "Checking number..."
                      : signupLoading
                        ? "Sending OTP..."
                        : "Send OTP"}
                  </button>
                  <p className="login-form-note">
                    Already have a CRM account? Go back and sign in instead.
                  </p>
                </form>
              )}

              {signupStep === "otp" && (
                <form className="outlet-signup-form outlet-signup-form--compact" onSubmit={verifySignupOtp}>
                  <div className="outlet-signup-title">
                    <span className="outlet-signup-icon"><Check size={22} /></span>
                    <div>
                      <span className="login-eyebrow">Mobile verification</span>
                      <h2>Enter your OTP</h2>
                    </div>
                  </div>
                  <p className="outlet-signup-description">
                    Enter the 6-digit code sent to <strong>+91 {signupPhone}</strong>.
                  </p>
                  <div className="login-field">
                    <label htmlFor="outlet-signup-otp">One-time password</label>
                    <input
                      autoComplete="one-time-code"
                      autoFocus
                      className="outlet-otp-input"
                      id="outlet-signup-otp"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(event) => setSignupOtp(event.target.value.replace(/\D/g, ""))}
                      placeholder="• • • • • •"
                      required
                      value={signupOtp}
                    />
                  </div>
                  {signupError && <p className="outlet-signup-error" role="alert">{signupError}</p>}
                  <button className="login-submit-button" disabled={signupLoading} type="submit">
                    {signupLoading ? "Verifying..." : "Verify & continue"}
                  </button>
                  <div className="outlet-otp-actions">
                    <button type="button" onClick={() => { setSignupStep("phone"); setSignupError(""); }}>
                      Change number
                    </button>
                    <button disabled={resendSeconds > 0 || signupLoading} type="button" onClick={() => void sendSignupOtp()}>
                      {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend OTP"}
                    </button>
                  </div>
                </form>
              )}

              {signupStep === "profile" && (
                <form className="outlet-signup-form" onSubmit={createBusinessProfile}>
                  <div className="outlet-signup-title">
                    <span className="outlet-signup-icon"><Building2 size={22} /></span>
                    <div>
                      <span className="login-eyebrow">Step 2 of 3</span>
                      <h2>Tell us about your business</h2>
                    </div>
                  </div>
                  <p className="outlet-signup-description">
                    These are the same profile fields your outlet uses inside the CRM.
                  </p>
                  <div className="outlet-profile-grid">
                    <div className="login-field">
                      <label htmlFor="owner-name">Owner full name</label>
                      <input id="owner-name" autoComplete="name" required value={businessProfile.ownerName} onChange={(event) => updateBusinessProfile("ownerName", event.target.value)} />
                    </div>
                    <div className="login-field">
                      <label htmlFor="owner-email">Business email</label>
                      <input id="owner-email" autoComplete="email" required type="email" value={businessProfile.email} onChange={(event) => updateBusinessProfile("email", event.target.value)} />
                    </div>
                    <div className="login-field outlet-profile-grid__wide">
                      <label htmlFor="business-name">Business / outlet name</label>
                      <input id="business-name" autoComplete="organization" required value={businessProfile.businessName} onChange={(event) => updateBusinessProfile("businessName", event.target.value)} />
                    </div>
                    <div className="login-field">
                      <label htmlFor="branch-name">Branch</label>
                      <input id="branch-name" required value={businessProfile.branch} onChange={(event) => updateBusinessProfile("branch", event.target.value)} />
                    </div>
                    <div className="login-field">
                      <label htmlFor="business-city">City</label>
                      <input id="business-city" autoComplete="address-level2" required value={businessProfile.city} onChange={(event) => updateBusinessProfile("city", event.target.value)} />
                    </div>
                    <div className="login-field">
                      <label htmlFor="business-state">State</label>
                      <input id="business-state" autoComplete="address-level1" required value={businessProfile.state} onChange={(event) => updateBusinessProfile("state", event.target.value)} />
                    </div>
                    <div className="login-field outlet-profile-grid__wide">
                      <label htmlFor="business-address">Business address</label>
                      <input id="business-address" autoComplete="street-address" required value={businessProfile.address} onChange={(event) => updateBusinessProfile("address", event.target.value)} />
                    </div>
                  </div>
                  {signupError && <p className="outlet-signup-error" role="alert">{signupError}</p>}
                  <button className="login-submit-button" disabled={signupLoading} type="submit">
                    {signupLoading ? "Creating your workspace..." : "Create business profile"}
                  </button>
                </form>
              )}

              {signupStep === "success" && (
                <div className="outlet-signup-success">
                  <span className="outlet-success-check"><Check size={30} /></span>
                  <span className="login-eyebrow">{returningAccount ? "Account found" : "Your workspace is ready"}</span>
                  <h2>{returningAccount ? "Welcome back" : `Welcome to ${createdBusinessName}`}</h2>
                  <p>
                    {returningAccount
                      ? "Your mobile number is verified and your CRM workspace is ready."
                      : "Your 14-day starter workspace includes the essential sales tools below."}
                  </p>
                  <div className="outlet-feature-grid">
                    <div><LayoutDashboard size={20} /><strong>Dashboard</strong><span>See your sales activity at a glance.</span></div>
                    <div><UsersRound size={20} /><strong>Leads</strong><span>Capture and manage every opportunity.</span></div>
                    <div><ListChecks size={20} /><strong>Follow-ups</strong><span>Plan activities and next actions.</span></div>
                    <div><BarChart3 size={20} /><strong>Lead funnel</strong><span>Track progress from new to won.</span></div>
                  </div>
                  <button className="login-submit-button" type="button" onClick={() => void openWorkspace()}>
                    Open my CRM workspace
                  </button>
                </div>
              )}
            </div>
          </section>
          <div id="outlet-signup-recaptcha" />
        </div>
      </main>
    );
  }

  return (
    <main className="login-page">
      <span aria-hidden="true" className="login-orb login-orb--one" />
      <span aria-hidden="true" className="login-orb login-orb--two" />

      <section className="login-mobile-download" aria-label="Download Sensible CRM Lite">
        <img
          className="login-mobile-logo"
          src="./images/logo1.jpeg"
          alt="Sensible Connect"
        />

        {showMobileLogin ? (
          <div className="login-mobile-email-login">
            <button
              className="login-mobile-back-button"
              onClick={() => setShowMobileLogin(false)}
              type="button"
            >
              <span aria-hidden="true">←</span>
              Back to app download
            </button>

            <div className="login-mobile-email-heading">
              <span className="login-eyebrow">Secure workspace access</span>
              <h1>Sign in to your CRM</h1>
              <p>Enter your registered email or phone number and password.</p>
            </div>

            <form className="login-form login-mobile-form" onSubmit={handleLogin}>
              <div className="login-field">
                <label htmlFor="mobile-login-username">Email or phone</label>
                <input
                  autoComplete="username"
                  id="mobile-login-username"
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="name@company.com"
                  required
                  type="text"
                  value={username}
                />
              </div>

              <div className="login-field">
                <label htmlFor="mobile-login-password">Password</label>
                <input
                  autoComplete="current-password"
                  id="mobile-login-password"
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  required
                  type="password"
                  value={password}
                />
              </div>

              <button
                className="login-submit-button"
                disabled={isSigningIn}
                type="submit"
              >
                {isSigningIn ? "Signing in..." : "Sign in to CRM"}
              </button>

              <p className="login-form-note">
                Use the account provided by your CRM administrator.
              </p>
            </form>
          </div>
        ) : (
          <>
            <div className="login-mobile-visual">
              <span aria-hidden="true" className="login-mobile-shape login-mobile-shape--left" />
              <span aria-hidden="true" className="login-mobile-shape login-mobile-shape--right" />
              <img
                src="./images/login_banner1_bg.png"
                alt="Sensible CRM mobile workspace"
              />
            </div>

            <div className="login-mobile-copy">
              <h1>Your CRM, wherever work happens</h1>
              <p>
                Manage leads, follow-ups, and your sales pipeline from anywhere
                with the Sensible CRM Lite mobile app.
              </p>
            </div>

            <div className="login-mobile-download-heading">
              <span />
              <strong>Download the app</strong>
              <span />
            </div>

            <div className="login-mobile-store-list">
              <a
                aria-label="Get Sensible CRM Lite on Google Play"
                className="login-mobile-store-badge"
                href="https://play.google.com/store/apps/details?id=com.sensiblebiz.crmlite&pcampaignid=web_share"
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="login-mobile-store-icon" aria-hidden="true">
                  <svg viewBox="0 0 32 36" fill="none">
                    <path d="M2 2.5 19.4 18 2 33.5V2.5Z" fill="#00D6FF" />
                    <path d="m19.4 18 5.4-4.8L29.5 16c1.3.8 1.3 2.2 0 3l-4.7 2.8-5.4-3.8Z" fill="#FFD400" />
                    <path d="m2 2.5 22.8 10.7-5.4 4.8L2 2.5Z" fill="#00F076" />
                    <path d="m2 33.5 22.8-11.7-5.4-3.8L2 33.5Z" fill="#FF3A5E" />
                  </svg>
                </span>
                <span className="login-mobile-store-copy">
                  <small>GET IT ON</small>
                  <strong>Google Play</strong>
                </span>
              </a>

              <button
                aria-label="Apple App Store version coming soon"
                className="login-mobile-store-badge login-mobile-store-badge--apple"
                onClick={() => setShowIosComingSoon(true)}
                type="button"
              >
                <span className="login-mobile-apple-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M17.05 12.54c-.02-2.2 1.8-3.27 1.88-3.32a4.04 4.04 0 0 0-3.17-1.72c-1.33-.14-2.62.8-3.3.8-.7 0-1.74-.78-2.88-.76a4.22 4.22 0 0 0-3.56 2.17c-1.54 2.66-.39 6.57 1.08 8.72.74 1.05 1.6 2.23 2.74 2.19 1.11-.05 1.52-.7 2.86-.7 1.32 0 1.71.7 2.87.67 1.2-.02 1.95-1.05 2.66-2.12a8.7 8.7 0 0 0 1.22-2.48 3.81 3.81 0 0 1-2.4-3.45ZM14.9 6.1A3.9 3.9 0 0 0 15.8 3.3a3.98 3.98 0 0 0-2.58 1.34 3.72 3.72 0 0 0-.93 2.7A3.28 3.28 0 0 0 14.9 6.1Z" />
                  </svg>
                </span>
                <span className="login-mobile-store-copy">
                  <small>DOWNLOAD ON THE</small>
                  <strong>App Store</strong>
                </span>
              </button>
            </div>

            {showIosComingSoon && (
              <p className="login-mobile-coming-soon" role="status">
                The iPhone app is coming soon.
              </p>
            )}

            <div className="login-mobile-web-login">
              <span>Already have a CRM account?</span>
              <button onClick={() => setShowMobileLogin(true)} type="button">
                Login with email and password
              </button>
              <span className="login-mobile-signup-divider">New to Sensible CRM?</span>
              <button className="login-mobile-create-outlet" onClick={openOutletSignup} type="button">
                Create a new outlet
              </button>
            </div>
          </>
        )}
      </section>

      <div className="login-container login-desktop-experience">
        <header className="login-brand">
          <img src="./images/logo1.jpeg" alt="Sensible Connect" />
          <span className="login-brand-divider" />
          <span className="login-brand-product">CRM Workspace</span>
        </header>

        <section className="login-card" aria-label="Sensible CRM sign in">
          <div className="login-grid">
            <div className="login-panel">
              <div className="login-panel-intro">
                <span className="login-eyebrow">Secure workspace access</span>
                <h1>
                  {isPasswordLogin ? "Welcome back" : "Sign in with QR"}
                </h1>
                <p>
                  {isPasswordLogin
                    ? "Enter your registered account details to continue."
                    : "Scan the code from your Sensible CRM mobile app."}
                </p>
              </div>

              <div
                className="login-method-switch"
                role="tablist"
                aria-label="Login method"
              >
                <button
                  aria-selected={!isPasswordLogin}
                  className={!isPasswordLogin ? "active" : ""}
                  onClick={() => setIsPasswordLogin(false)}
                  role="tab"
                  type="button"
                >
                  QR code
                </button>
                <button
                  aria-selected={isPasswordLogin}
                  className={isPasswordLogin ? "active" : ""}
                  onClick={() => setIsPasswordLogin(true)}
                  role="tab"
                  type="button"
                >
                  Email &amp; password
                </button>
              </div>

              <div
                className={`login-auth-content ${
                  isPasswordLogin
                    ? "login-auth-content--password"
                    : "login-auth-content--qr"
                }`}
              >
                {isPasswordLogin ? (
                  <form className="login-form" onSubmit={handleLogin}>
                    <div className="login-field">
                      <label htmlFor="login-username">Email or phone</label>
                      <input
                        autoComplete="username"
                        id="login-username"
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="name@company.com"
                        required
                        type="text"
                        value={username}
                      />
                    </div>

                    <div className="login-field">
                      <label htmlFor="login-password">Password</label>
                      <input
                        autoComplete="current-password"
                        id="login-password"
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="Enter your password"
                        required
                        type="password"
                        value={password}
                      />
                    </div>

                    <button
                      className="login-submit-button"
                      disabled={isSigningIn}
                      type="submit"
                    >
                      {isSigningIn ? "Signing in..." : "Sign in to CRM"}
                    </button>

                    {(username || password) && (
                      <button
                        className="login-clear-button"
                        onClick={handleClear}
                        type="button"
                      >
                        Clear entered details
                      </button>
                    )}

                    <p className="login-form-note">
                      Use the account provided by your CRM administrator.
                    </p>
                  </form>
                ) : (
                  <div className="login-qr-layout">
                    <div className="login-qr-wrap">
                      <div
                        className={`login-qr-code${
                          isQrGenerationLocked ? " login-qr-code--locked" : ""
                        }`}
                      >
                        {isQrLoading ? (
                          <Spin size="large" />
                        ) : qrUrl ? (
                          <>
                            <QRCode value={qrUrl} size={225} color="#000000" />
                            {isQrGenerationLocked && (
                              <div
                                className="login-qr-expired-overlay"
                                role="status"
                              >
                                <strong>QR expired</strong>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="login-qr-unavailable">
                            <strong>
                              {qrError
                                ? "Unable to create QR code"
                                : "QR login is unavailable"}
                            </strong>
                            <span>
                              {qrError || "You can still sign in with your password."}
                            </span>
                            <button
                              onClick={() => void refreshQrCode(true)}
                              type="button"
                            >
                              Try again
                            </button>
                          </div>
                        )}
                      </div>
                      {qrUrl && !isQrLoading && (
                        isQrGenerationLocked ? (
                          <p
                            className="login-qr-timer login-qr-timer--locked"
                            aria-live="polite"
                          >
                            QR limit reached. Refresh the page to generate a new
                            code.
                          </p>
                        ) : (
                          <>
                            <p className="login-qr-timer" aria-live="polite">
                              Refreshing in <strong>{remainingSeconds}s</strong>
                            </p>
                            {qrUrl.startsWith("dev-session-") && (
                              <p style={{ fontSize: 11, color: "#d97706", marginTop: 4, fontWeight: 600 }}>
                                Offline Dev Mode &bull; Run &apos;npm run dev:local&apos; for mobile sync
                              </p>
                            )}
                          </>
                        )
                      )}
                    </div>

                    <div className="login-steps">
                      <h2>Connect your device</h2>
                      <ol>
                        <li>
                          <span>1</span>
                          <p>Open Sensible CRM on your phone.</p>
                        </li>
                        <li>
                          <span>2</span>
                          <p>Open Settings from the top menu.</p>
                        </li>
                        <li>
                          <span>3</span>
                          <p>Select Linked devices.</p>
                        </li>
                        <li>
                          <span>4</span>
                          <p>Scan this QR code to confirm.</p>
                        </li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>

              <div className="login-create-outlet-cta">
                <span>Setting up Sensible CRM for the first time?</span>
                <button onClick={openOutletSignup} type="button">
                  <Building2 size={15} />
                  Create a new outlet
                </button>
              </div>

            </div>

            <aside className="login-hero">
              <div className="login-hero-copy">
                <span className="login-hero-badge">Sensible CRM</span>
                <h2>Turn every lead into a clear next step.</h2>
                <p>
                  Organize opportunities, automate follow-ups, and keep your
                  entire sales team aligned in one workspace.
                </p>
              </div>
              <img
                src="./images/login_banner.png"
                alt="CRM team working together"
              />
            </aside>
          </div>
        </section>

        <footer className="login-footer">
          Copyright {new Date().getFullYear()} Sensible Connect. All rights reserved.
        </footer>
      </div>
    </main>
  );
};

export default LoginPage;
