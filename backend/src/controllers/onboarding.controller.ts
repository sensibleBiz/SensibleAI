import type { RequestHandler } from "express";
import { AppError } from "../errors/appError.js";
import { onboardingService } from "../services/onboarding.service.js";
import type {
  BusinessOnboardingInput,
  OnboardingPhoneCheckInput,
} from "../types/onboarding.types.js";
import { publicSession } from "../modules/auth/auth.controller.js";

export const checkOnboardingPhoneNumber: RequestHandler = async (
  request,
  response,
) => {
  const { phoneNumber } = request.validated?.body as OnboardingPhoneCheckInput;
  const result = await onboardingService.checkPhoneNumber(phoneNumber);
  response.json({ success: true, data: result });
};

export const getOnboardingStatus: RequestHandler = async (request, response) => {
  if (!request.auth) {
    throw new AppError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  }

  const result = await onboardingService.getStatus(
    request.auth.uid,
    request.auth.token,
  );
  if (result.account && "mode" in result.account && result.account.mode === "postgres") {
    response.json({ success: true, data: { ...result, account: publicSession(response, result.account) } });
    return;
  }
  response.json({ success: true, data: result });
};

export const createBusinessOnboarding: RequestHandler = async (
  request,
  response,
) => {
  if (!request.auth) {
    throw new AppError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  }

  const result = await onboardingService.createBusiness(
    request.auth.uid,
    request.auth.token,
    request.validated?.body as BusinessOnboardingInput,
  );
  const data = "mode" in result && result.mode === "postgres" ? publicSession(response, result) : result;
  response.status(201).json({ success: true, data });
};
