import assert from "node:assert/strict";
import test from "node:test";
import {
  businessOnboardingSchema,
  onboardingPhoneCheckSchema,
} from "../src/validators/onboarding.validator.js";

const validBusinessProfile = {
  ownerName: "Asha Patil",
  email: "Owner@Example.COM",
  businessName: "Asha Traders",
  branch: "Main Branch",
  address: "12 Market Road",
  city: "Pune",
  state: "Maharashtra",
};

test("business onboarding accepts only the current CRM profile fields", () => {
  const result = businessOnboardingSchema.safeParse(validBusinessProfile);

  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data, {
      ...validBusinessProfile,
      email: "owner@example.com",
    });
  }
});

test("business onboarding rejects missing and unrecognized fields", () => {
  assert.equal(
    businessOnboardingSchema.safeParse({
      ...validBusinessProfile,
      address: "",
    }).success,
    false,
  );
  assert.equal(
    businessOnboardingSchema.safeParse({
      ...validBusinessProfile,
      password: "not-collected-during-phone-onboarding",
    }).success,
    false,
  );
  for (const forbiddenField of ["quickPin", "role", "phoneNumber", "outlets"]) {
    assert.equal(
      businessOnboardingSchema.safeParse({
        ...validBusinessProfile,
        [forbiddenField]: "client-controlled-value",
      }).success,
      false,
    );
  }
});

test("onboarding phone check accepts only a valid Indian mobile number", () => {
  assert.equal(
    onboardingPhoneCheckSchema.safeParse({ phoneNumber: "9876543210" }).success,
    true,
  );
  assert.equal(
    onboardingPhoneCheckSchema.safeParse({ phoneNumber: "1234567890" }).success,
    false,
  );
  assert.equal(
    onboardingPhoneCheckSchema.safeParse({ phoneNumber: "+919876543210" }).success,
    false,
  );
});
