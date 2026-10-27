export interface EventRegistrationIdentity {
  fullName?: string;
  businessType?: string;
  email?: string;
  companyName?: string;
  city?: string;
}

const clean = (value: unknown) => String(value ?? "").trim();

export const mergeEventRegistrationIdentity = (
  submitted: EventRegistrationIdentity,
  existing?: EventRegistrationIdentity
) => ({
  fullName: clean(submitted.fullName) || clean(existing?.fullName),
  businessType:
    clean(submitted.businessType) || clean(existing?.businessType),
  email: clean(submitted.email) || clean(existing?.email),
  companyName: clean(submitted.companyName) || clean(existing?.companyName),
  city: clean(submitted.city) || clean(existing?.city),
});

export const hasCompleteEventRegistrationIdentity = (
  registration: EventRegistrationIdentity
) =>
  Boolean(clean(registration.fullName) && clean(registration.businessType));
