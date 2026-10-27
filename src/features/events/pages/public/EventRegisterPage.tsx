import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Form,
  Input,
  Modal,
  Spin,
  message,
} from "antd";
import dayjs from "dayjs";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  IndianRupee,
  MapPin,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  checkPaymentStatus,
  EventInvoiceDetails,
  findEventMemberByMobile,
  getEventById,
  normalizeEventMobileNumber,
  payAndRegister,
  saveEventMemberRegistration,
  saveEventMemberRegistrationDraft,
  updateEventMemberAttendance,
} from "@/features/events/api/eventApi";
import { hasCompleteEventRegistrationIdentity } from "@/features/events/api/eventMemberPersistence";
import { EventItem, EventParticipant, EventRegistrationType, EventRegistrationValues } from "../../types/eventTypes";

const NAVY = "#0a3750";
const RED = "#ff3228";
const DEFAULT_EVENT_IMAGE = "/images/logo1.jpeg";
const DEFAULT_OFFER_AMOUNT = 9999;

const getEventRegistrationType = (
  event?: Pick<EventItem, "registrationType" | "fees"> | null
): EventRegistrationType => {
  if (event?.registrationType === "paid" || event?.registrationType === "free") {
    return event.registrationType;
  }

  return Number(event?.fees ?? 0) > 0 ? "paid" : "free";
};

const getRegistrationValuesFromMember = (
  member: EventParticipant,
  mobile: string,
  fallbackBusinessType = ""
): Partial<EventRegistrationValues> => ({
  mobile,
  fullName: member.fullName || member.customerName || member.name,
  businessType: member.businessType || fallbackBusinessType,
  acceptedTerms: member.acceptedTerms === true || member.isAgreed === true,
});

const normalizeRegistrationValues = (
  values: EventRegistrationValues
): EventRegistrationValues => ({
  ...values,
  mobile: normalizeEventMobileNumber(values.mobile),
  fullName: String(values.fullName ?? "").trim(),
  businessType: String(values.businessType ?? "").trim(),
  email: String(values.email ?? "").trim(),
  companyName: String(values.companyName ?? "").trim(),
  city: String(values.city ?? "").trim(),
  acceptedTerms: values.acceptedTerms === true,
});

const isPendingPayment = (member: EventParticipant) =>
  String(member.paymentStatus ?? "").toLowerCase() === "pending";

const isDraftRegistration = (member: EventParticipant) =>
  isPendingPayment(member) && !String(member.transactionId ?? "").trim();

const isPaymentDone = (member: EventParticipant) => {
  const paymentStatus = String(member.paymentStatus ?? "").toLowerCase();
  return (
    paymentStatus === "paid" ||
    paymentStatus === "free registration" ||
    paymentStatus === "success" ||
    paymentStatus === "completed"
  );
};

const getAttendanceAvailability = (eventDateTime?: string) => {
  const eventDate = dayjs(eventDateTime);

  if (!eventDateTime || !eventDate.isValid()) {
    return {
      canMarkAttendance: false,
      unavailableText: "Event date unavailable",
    };
  }

  const today = dayjs();

  if (today.isBefore(eventDate, "day")) {
    return {
      canMarkAttendance: false,
      unavailableText: "Available on event date",
    };
  }

  if (today.isAfter(eventDate, "day")) {
    return {
      canMarkAttendance: false,
      unavailableText: "Event date passed",
    };
  }

  return {
    canMarkAttendance: true,
    unavailableText: "",
  };
};

function SummaryRow({
  label,
  value,
  valueClassName = "text-slate-900",
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-medium ${valueClassName}`}>
        {value}
      </span>
    </div>
  );
}

const normalizeBusinessType = (value?: string | null) =>
  String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const getBusinessTypeEventImageUrl = (
  event: EventItem | null,
  businessType: string
) => {
  if (!event) return DEFAULT_EVENT_IMAGE;

  const eventImages = event.eventImages ?? [];
  const selectedBusinessType = normalizeBusinessType(businessType);

  if (selectedBusinessType) {
    return (
      eventImages.find(
        (image) =>
          normalizeBusinessType(image.businessType) === selectedBusinessType
      )?.url || DEFAULT_EVENT_IMAGE
    );
  }

  return event.imageUrl || eventImages[0]?.url || DEFAULT_EVENT_IMAGE;
};

export default function EventRegisterPage() {
  const navigate = useNavigate();
  const { eventId: routeEventId } = useParams<{ eventId?: string }>();
  const [searchParams] = useSearchParams();
  const eventId = routeEventId || sessionStorage.getItem("eventId") || "";
  const queryBusinessType =
    searchParams.get("businessType") ||
    searchParams.get("businessTypeName") ||
    searchParams.get("bt") ||
    "";
  const requestedBusinessType =
    queryBusinessType || sessionStorage.getItem("eventBusinessType") || "";
  const outletId =
    searchParams.get("outletId") ||
    sessionStorage.getItem("outletId") ||
    undefined;

  const [form] = Form.useForm<EventRegistrationValues>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(false);
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  const [checkingMobile, setCheckingMobile] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [invoiceDetails, setInvoiceDetails] =
    useState<EventInvoiceDetails | null>(null);
  const [registrationNotice, setRegistrationNotice] = useState("");
  const [eventUnavailableMessage, setEventUnavailableMessage] = useState("");
  const [attendanceMember, setAttendanceMember] =
    useState<EventParticipant | null>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef<Promise<void> | null>(null);
  const finalRegistrationInProgressRef = useRef(false);
  const lastAutoSavedKeyRef = useRef("");

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [hasStartedRegistration, setHasStartedRegistration] = useState(false);
  const registrationType = getEventRegistrationType(event);
  const eventImageUrl = useMemo(
    () => getBusinessTypeEventImageUrl(event, requestedBusinessType),
    [event, requestedBusinessType]
  );

  const showWhatsappPaymentPopup = (paymentIntent?: string) => {
    const openPaymentIntent = () => {
      if (!paymentIntent) return;
      window.location.href = paymentIntent;
    };

    return Modal.info({
      title: "Check your WhatsApp",
      content: (
        <div>
          <p className="m-0">
            Payment link generated. Please check your WhatsApp and make
            payment.
          </p>
        </div>
      ),
      okText: "Pay Here",
      onOk: openPaymentIntent,
      okButtonProps: {
        disabled: !paymentIntent,
        style: { background: NAVY, borderColor: NAVY, minWidth: 120 },
      },
    });
  };

  useEffect(() => {
    const loadEvent = async () => {
      if (routeEventId) {
        sessionStorage.setItem("eventId", routeEventId);
        if (outletId) {
          sessionStorage.setItem("outletId", outletId);
        }
        if (queryBusinessType) {
          sessionStorage.setItem("eventBusinessType", queryBusinessType);
        } else {
          sessionStorage.removeItem("eventBusinessType");
        }
        navigate("/event-register", { replace: true });
        return;
      }

      if (!eventId) {
        message.error("Invalid event registration link");
        navigate("/", { replace: true });
        return;
      }

      try {
        setLoading(true);
        const data = await getEventById(eventId, outletId);
        if (data && data.status !== "Active") {
          setEvent(null);
          setEventUnavailableMessage(
            "This event registration link is no longer active."
          );
          return;
        }

        setEventUnavailableMessage("");
        setEvent(data ?? null);
      } catch (error) {
        console.error("Failed to load event", error);
        setEvent(null);
        setEventUnavailableMessage("");
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId, outletId, queryBusinessType, routeEventId, navigate]);

  useEffect(
    () => () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    },
    []
  );

  const stepLabels = [
    "Name",
    registrationType === "free" ? "Registration" : "Payment",
  ];
  const getStepTitle = () => {
    if (step === 1) return "Mobile Number";
    return stepLabels[step - 2];
  };

  const handleStartRegistration = () => {
    clearAutoSaveTimer();
    lastAutoSavedKeyRef.current = "";
    form.resetFields();
    if (requestedBusinessType) {
      form.setFieldsValue({ businessType: requestedBusinessType });
    }
    setRegistrationNotice("");
    setAttendanceMember(null);
    setStep(1);
    setHasStartedRegistration(true);
  };

  const handleBackToStart = () => {
    clearAutoSaveTimer();
    lastAutoSavedKeyRef.current = "";
    form.resetFields();
    setRegistrationNotice("");
    setStep(1);
    setHasStartedRegistration(false);
  };

  const handleContinueToDetails = async () => {
    try {
      await form.validateFields(["mobile"]);
    } catch {
      return;
    }

    const mobile = normalizeEventMobileNumber(form.getFieldValue("mobile"));
    setCheckingMobile(true);

    let eventToCheck = event;

    try {
      const latestEvent = await getEventById(eventId, outletId);
      if (latestEvent) {
        eventToCheck = latestEvent;
        setEvent(latestEvent);
      }
    } catch (error) {
      console.error("Failed to check existing event registration", error);
      message.error("Unable to check this mobile number. Please try again.");
      setCheckingMobile(false);
      return;
    }

    setCheckingMobile(false);
    const existingMember = findEventMemberByMobile(
      eventToCheck?.members,
      mobile
    );

    if (!existingMember) {
      if (requestedBusinessType) {
        form.setFieldsValue({ businessType: requestedBusinessType });
      }
      setRegistrationNotice("");
      setStep(2);
      return;
    }

    form.setFieldsValue(
      getRegistrationValuesFromMember(
        existingMember,
        mobile,
        requestedBusinessType
      )
    );

    if (isDraftRegistration(existingMember)) {
      setRegistrationNotice(
        "Registration is already started for this mobile number. Please continue."
      );
      setStep(2);
      return;
    }

    if (isPaymentDone(existingMember)) {
      setRegistrationNotice("");
      setAttendanceMember(existingMember);
      return;
    }

    if (isPendingPayment(existingMember)) {
      setRegistrationNotice(
        "Payment is pending for this number. Please complete payment."
      );
      setStep(3);
      return;
    }

    setRegistrationNotice("Registration is already done from this number.");
  };

  const handleContinueToPayment = async () => {
    try {
      await form.validateFields([
        "fullName",
        "businessType",
        "acceptedTerms",
      ]);
      setSavingDetails(true);
      const saved = await saveRegistrationDraft();
      if (!saved) {
        message.error("Unable to save your details. Please try again.");
        return;
      }
      setStep(3);
    } finally {
      setSavingDetails(false);
    }
  };

  const clearAutoSaveTimer = () => {
    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  };

  const waitForAutoSave = async () => {
    clearAutoSaveTimer();
    await autoSaveInFlightRef.current;
  };

  const saveRegistrationDraft = async () => {
    if (
      !event ||
      !hasStartedRegistration ||
      finalRegistrationInProgressRef.current
    ) {
      return false;
    }

    const previousSave = autoSaveInFlightRef.current;
    if (previousSave) {
      await previousSave;
    }

    if (finalRegistrationInProgressRef.current) {
      return false;
    }

    const registrationValues =
      form.getFieldsValue(true) as EventRegistrationValues;
    const mobile = normalizeEventMobileNumber(registrationValues.mobile);
    const fullName = String(registrationValues.fullName ?? "").trim();
    const businessType = String(registrationValues.businessType ?? "").trim();

    if (!/^[0-9]{10}$/.test(mobile)) {
      return false;
    }

    // A mobile number alone is not a registration draft. Waiting for both
    // user-entered identity fields prevents empty members from being written.
    if (!hasCompleteEventRegistrationIdentity({ fullName, businessType })) {
      return false;
    }

    const existingMember = findEventMemberByMobile(event.members, mobile);

    if (existingMember && !isDraftRegistration(existingMember)) {
      return true;
    }

    const draftValues: EventRegistrationValues = {
      ...registrationValues,
      mobile,
      fullName,
      businessType,
      acceptedTerms: registrationValues.acceptedTerms === true,
    };
    const resolvedOutletId = outletId || "OUT001";
    const draftKey = JSON.stringify({
      eventId,
      outletId: resolvedOutletId,
      mobile,
      fullName,
      businessType,
      email: draftValues.email ?? "",
      companyName: draftValues.companyName ?? "",
      city: draftValues.city ?? "",
      acceptedTerms: draftValues.acceptedTerms,
    });

    if (draftKey === lastAutoSavedKeyRef.current) {
      return true;
    }

    let saveSucceeded = false;
    const savePromise = saveEventMemberRegistrationDraft({
      event,
      eventId,
      data: draftValues,
      outletId: resolvedOutletId,
      amountOverride: registrationType === "free" ? 0 : undefined,
      paymentStatus: "Pending",
      registrationType,
    })
      .then((updatedEvent) => {
        if (!finalRegistrationInProgressRef.current) {
          setEvent(updatedEvent);
          lastAutoSavedKeyRef.current = draftKey;
          saveSucceeded = true;
        }
      })
      .catch((error) => {
        console.warn("Event registration draft autosave failed", error);
      })
      .finally(() => {
        if (autoSaveInFlightRef.current === savePromise) {
          autoSaveInFlightRef.current = null;
        }
      });

    autoSaveInFlightRef.current = savePromise;
    await savePromise;
    return saveSucceeded;
  };

  const scheduleRegistrationDraftSave = () => {
    clearAutoSaveTimer();

    autoSaveTimeoutRef.current = window.setTimeout(() => {
      void saveRegistrationDraft();
    }, 500);
  };

  const handleSubmit = async () => {
    finalRegistrationInProgressRef.current = true;
    setSubmitting(true);

    try {
      await waitForAutoSave();
      await form.validateFields();

      if (!event) {
        throw new Error("Event not found");
      }

      const registrationValues = normalizeRegistrationValues(
        form.getFieldsValue(true) as EventRegistrationValues
      );

      const customerPhoneNumber = registrationValues.mobile;

      const transactionId = `transaction${Date.now()}`;
      const merchantOrderId = `order${Date.now()}`;
      const amount = registrationType === "free" ? 0 : event.fees || 0;
      const resolvedOutletId = outletId || "OUT001";

      if (!eventId || !resolvedOutletId) {
        throw new Error("Event id and outlet id are required");
      }

      const pendingEvent = await saveEventMemberRegistration({
        event,
        eventId,
        data: registrationValues,
        outletId: resolvedOutletId,
        transactionId,
        merchantOrderId,
        paymentStatus: amount <= 0 ? "Paid" : "Pending",
      });

      if (amount <= 0) {
        setEvent(pendingEvent);
        setIsRegistered(true);
        return;
      }

      try {
        const paymentRequestResult = await payAndRegister({
          outletId: resolvedOutletId,
          eventId,
          transactionId,
          merchantOrderId,
          amount,
          isProd: true,
          transactionType: "EVENT",
          transactionTitle: "Event Registration",
          customerPhoneNumber,
          fullName: registrationValues.fullName,
          mobile: customerPhoneNumber,
          businessType: registrationValues.businessType,
          email: registrationValues.email,
          companyName: registrationValues.companyName,
          city: registrationValues.city,
          acceptedTerms: registrationValues.acceptedTerms,
        });

        if (paymentRequestResult.success) {
          setInvoiceDetails(paymentRequestResult.invoiceDetails ?? null);
          setEvent(pendingEvent);
          const paymentPopup = showWhatsappPaymentPopup(
            paymentRequestResult.intentString
          );

          const paymentCheckDelayMs = 3000;
          let paymentStatusResult: Awaited<
            ReturnType<typeof checkPaymentStatus>
          > = { status: "pending" };

          while (paymentStatusResult.status === "pending") {
            paymentStatusResult = await checkPaymentStatus({
              eventId,
              transactionId,
              amount,
              outletId: resolvedOutletId,
              isProd: true,
              mobile: customerPhoneNumber,
              transactionType: "EVENT",
              transactionTitle: "Event Registration",
              fullName: registrationValues.fullName,
              businessType: registrationValues.businessType,
              email: registrationValues.email,
              companyName: registrationValues.companyName,
              city: registrationValues.city,
              acceptedTerms: registrationValues.acceptedTerms,
            });

            if (paymentStatusResult.status !== "pending") {
              break;
            }

            await new Promise((resolve) =>
              window.setTimeout(resolve, paymentCheckDelayMs)
            );
          }

          if (paymentStatusResult.status === "success") {
            if (paymentStatusResult.invoiceUrl) {
              setInvoiceDetails((current) =>
                current
                  ? {
                      ...current,
                      invoiceUrl: paymentStatusResult.invoiceUrl,
                      fileLink: paymentStatusResult.invoiceUrl,
                    }
                  : {
                      invoiceUrl: paymentStatusResult.invoiceUrl,
                      fileLink: paymentStatusResult.invoiceUrl,
                    }
              );
            }
            const completedEvent = await saveEventMemberRegistration({
              event: pendingEvent,
              eventId,
              data: registrationValues,
              outletId: resolvedOutletId,
              transactionId,
              merchantOrderId,
              paymentStatus: "Paid",
              registrationType,
            });
            paymentPopup.destroy();
            setEvent(completedEvent);
            setIsRegistered(true);
            return;
          }
        }
      } catch (error) {
        console.error("Payment failed", error);
      }

      setIsRegistered(true);
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Registration failed"
      );
    } finally {
      setSubmitting(false);
      finalRegistrationInProgressRef.current = false;
    }
  };

  const handleMarkAttendance = async () => {
    if (!event || !attendanceMember) return;

    const attendanceAvailability = getAttendanceAvailability(
      event.eventDateTime
    );

    if (!attendanceAvailability.canMarkAttendance) {
      message.warning(
        attendanceAvailability.unavailableText ||
          "Attendance can only be marked on the event date"
      );
      return;
    }

    try {
      setAttendanceSubmitting(true);
      const updatedEvent = await updateEventMemberAttendance({
        event,
        participant: attendanceMember,
        outletId,
        isAttended: true,
      });
      const updatedMember = updatedEvent.members?.find(
        (member) =>
          member.id === attendanceMember.id ||
          normalizeEventMobileNumber(member.mobile) ===
            normalizeEventMobileNumber(attendanceMember.mobile)
      );

      setEvent(updatedEvent);
      setAttendanceMember({
        ...attendanceMember,
        ...updatedMember,
        isAttended: true,
      });
      message.success("Attendance marked");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to mark attendance"
      );
    } finally {
      setAttendanceSubmitting(false);
    }
  };

  const handleOfferPayment = async () => {
    if (!event || !attendanceMember) return;

    try {
      setOfferSubmitting(true);

      const amount =
        Number(event.offerAmount) > 0
          ? Number(event.offerAmount)
          : DEFAULT_OFFER_AMOUNT;
      const customerPhoneNumber = normalizeEventMobileNumber(
        attendanceMember.mobile
      );
      const resolvedOutletId = outletId || "OUT001";
      const transactionId = `offer${Date.now()}`;
      const merchantOrderId = `offerOrder${Date.now()}`;

      if (!eventId || !resolvedOutletId || !customerPhoneNumber) {
        throw new Error("Event id, outlet id, and mobile number are required");
      }

      const paymentRequestResult = await payAndRegister({
        outletId: resolvedOutletId,
        eventId,
        transactionId,
        merchantOrderId,
        amount,
        isProd: true,
        transactionType: "OFFER",
        transactionTitle: "Offer",
        customerPhoneNumber,
        fullName: attendanceMember.name,
        mobile: customerPhoneNumber,
        businessType: attendanceMember.businessType,
        acceptedTerms: true,
      });

      if (!paymentRequestResult.success) {
        throw new Error("Failed to generate offer payment link");
      }

      setInvoiceDetails(paymentRequestResult.invoiceDetails ?? null);
      const paymentPopup = showWhatsappPaymentPopup(
        paymentRequestResult.intentString
      );

      const paymentCheckDelayMs = 3000;
      const maxPaymentChecks = 20;
      let paymentStatusResult: Awaited<ReturnType<typeof checkPaymentStatus>> =
        { status: "pending" };

      for (
        let checkCount = 0;
        checkCount < maxPaymentChecks &&
        paymentStatusResult.status === "pending";
        checkCount += 1
      ) {
        paymentStatusResult = await checkPaymentStatus({
          eventId,
          transactionId,
          amount,
          outletId: resolvedOutletId,
          isProd: true,
          mobile: customerPhoneNumber,
          transactionType: "OFFER",
          transactionTitle: "Offer",
          fullName: attendanceMember.name,
          businessType: attendanceMember.businessType,
          email: attendanceMember.email,
          companyName: attendanceMember.companyName,
          city: attendanceMember.city,
          acceptedTerms: true,
        });

        if (paymentStatusResult.status !== "pending") {
          break;
        }

        await new Promise((resolve) =>
          window.setTimeout(resolve, paymentCheckDelayMs)
        );
      }

      if (paymentStatusResult.status === "success") {
        if (paymentStatusResult.invoiceUrl) {
          setInvoiceDetails((current) =>
            current
              ? {
                  ...current,
                  invoiceUrl: paymentStatusResult.invoiceUrl,
                  fileLink: paymentStatusResult.invoiceUrl,
                }
              : {
                  invoiceUrl: paymentStatusResult.invoiceUrl,
                  fileLink: paymentStatusResult.invoiceUrl,
                }
          );
        }

        paymentPopup.destroy();
        message.success("Offer payment completed");
        return;
      }

      if (paymentStatusResult.status === "failed") {
        paymentPopup.destroy();
        message.error("Offer payment failed");
        return;
      }

      message.info("Offer payment link generated. Please complete payment.");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to start offer payment"
      );
    } finally {
      setOfferSubmitting(false);
    }
  };

  const handleFreeRegistration = async () => {
    if (!event) return;

    finalRegistrationInProgressRef.current = true;
    try {
      await waitForAutoSave();
      await form.validateFields();

      const registrationValues = normalizeRegistrationValues(
        form.getFieldsValue(true) as EventRegistrationValues
      );
      const mobile = registrationValues.mobile;
      const existingMember = findEventMemberByMobile(event.members, mobile);

      if (existingMember && isPaymentDone(existingMember)) {
        message.warning("Participant already registered with this mobile number");
        return;
      }

      setSubmitting(true);

      const updatedEvent = await saveEventMemberRegistration({
        event,
        eventId,
        data: {
          ...registrationValues,
          mobile,
          acceptedTerms: true,
        },
        outletId: outletId || "OUT001",
        amountOverride: 0,
        paymentStatus: "Free Registration",
        registrationType: "free",
      });

      setEvent(updatedEvent);
      setIsRegistered(true);
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }

      message.error(
        error instanceof Error ? error.message : "Registration failed"
      );
    } finally {
      setSubmitting(false);
      finalRegistrationInProgressRef.current = false;
    }
  };

  const handleFinalRegistration = () => {
    if (registrationType === "free") {
      handleFreeRegistration();
      return;
    }

    handleSubmit();
  };

  const handleDownloadReceipt = async (receiptUrl: string) => {
    const fileName =
      receiptUrl.split("/").pop()?.split("?")[0] || "event-payment-receipt.pdf";

    try {
      const response = await fetch(receiptUrl);

      if (!response.ok) {
        throw new Error("Receipt download failed");
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = decodeURIComponent(fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Failed to download receipt", error);
      window.open(receiptUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spin size="large" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Empty description={eventUnavailableMessage || "Event not found"} />
      </div>
    );
  }

  if (isRegistered) {
    const receiptUrl = invoiceDetails?.invoiceUrl || invoiceDetails?.fileLink;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6">
        <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-100 sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 sm:h-16 sm:w-16">
            <CheckCircle2 className="text-emerald-600" size={32} />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-slate-950 sm:text-2xl">
            Registration Successful
          </h1>
          <p className="mt-2 text-sm text-slate-600 sm:text-base">
            Your event registration has been submitted successfully.
          </p>

          {invoiceDetails && (
            <div className="mt-6 rounded-lg bg-slate-50 p-4 text-left text-sm text-slate-700">
              <div
                className="mb-3 text-xs font-semibold uppercase tracking-wide"
                style={{ color: NAVY }}
              >
                Invoice Details
              </div>

              <div className="divide-y divide-slate-200/70">
                <SummaryRow
                  label="Invoice No"
                  value={invoiceDetails.invoiceNo || "N/A"}
                />
                <SummaryRow
                  label="Amount"
                  value={`Rs. ${Number(
                    invoiceDetails.amount || 0
                  ).toLocaleString("en-IN")}`}
                />
                <SummaryRow
                  label="Customer"
                  value={invoiceDetails.customerDetails?.customerName || "N/A"}
                />
                <SummaryRow
                  label="Mobile"
                  value={invoiceDetails.customerDetails?.mobile || "N/A"}
                />
                <SummaryRow
                  label="Date"
                  value={
                    invoiceDetails.invoiceDate
                      ? dayjs(invoiceDetails.invoiceDate).format(
                          "DD MMM YYYY, hh:mm A"
                        )
                      : "N/A"
                  }
                />
              </div>

              {receiptUrl && (
                <Button
                  className="mt-4"
                  icon={<Download size={16} />}
                  onClick={() => handleDownloadReceipt(receiptUrl)}
                  type="primary"
                  size="large"
                  block
                  style={{ background: NAVY, borderColor: NAVY }}
                >
                  Download Receipt
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (attendanceMember) {
    const attendanceAvailability = getAttendanceAvailability(
      event.eventDateTime
    );
    const canShowMarkedAttendance =
      attendanceAvailability.canMarkAttendance &&
      attendanceMember.isAttended === true;
    const attendanceButtonDisabled =
      canShowMarkedAttendance || !attendanceAvailability.canMarkAttendance;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 sm:p-6">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-100 sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 sm:h-16 sm:w-16">
            <CheckCircle2 className="text-emerald-600" size={32} />
          </div>
          <h1 className="mt-5 text-center text-xl font-semibold text-slate-950 sm:text-2xl">
            Event Attendance
          </h1>
          <p className="mt-2 text-center text-sm text-slate-600 sm:text-base">
            Your registration and payment are completed.
          </p>

          <div className="mt-6 divide-y divide-slate-200/70 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
            <SummaryRow label="Event" value={event.name} />
            <SummaryRow label="Name" value={attendanceMember.name || "N/A"} />
            <SummaryRow
              label="Mobile"
              value={attendanceMember.mobile || "N/A"}
            />
            <SummaryRow
              label="Payment"
              value="Done"
              valueClassName="text-emerald-700"
            />
            <SummaryRow
              label="Attendance"
              value={
                canShowMarkedAttendance
                  ? "Marked"
                  : attendanceAvailability.canMarkAttendance
                  ? "Not Marked"
                  : attendanceAvailability.unavailableText
              }
              valueClassName={
                canShowMarkedAttendance
                  ? "text-emerald-700"
                  : "text-amber-700"
              }
            />
            <SummaryRow
              label="Date"
              value={dayjs(event.eventDateTime).format(
                "DD MMM YYYY, hh:mm A"
              )}
            />
          </div>

          <Button
            className="mt-5"
            type="primary"
            size="large"
            block
            disabled={attendanceButtonDisabled}
            loading={attendanceSubmitting}
            onClick={handleMarkAttendance}
            style={
              attendanceButtonDisabled
                ? undefined
                : { background: NAVY, borderColor: NAVY }
            }
          >
            {canShowMarkedAttendance
              ? "Attendance Marked"
              : !attendanceAvailability.canMarkAttendance
              ? attendanceAvailability.unavailableText
              : "Mark Attendance"}
          </Button>

          <Button
            className="mt-3"
            type="primary"
            size="large"
            block
            loading={offerSubmitting}
            onClick={handleOfferPayment}
            style={{ background: RED, borderColor: RED }}
          >
            Offer
          </Button>
        </div>
      </div>
    );
  }

  if (!hasStartedRegistration) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-md px-3 py-4 sm:px-4 sm:py-6">
          <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
            <div className="bg-slate-100">
              <img
                src={eventImageUrl}
                alt={event.name}
                className="w-full object-contain"
              />
            </div>

            <div className="p-4 sm:p-5">
              <h1 className="m-0 text-xl font-semibold leading-tight text-slate-950 sm:text-2xl">
                {event.name}
              </h1>

              {/* <div className="mt-4 space-y-2.5 text-sm text-slate-700">
                <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3">
                  <CalendarDays
                    size={18}
                    className="shrink-0"
                    style={{ color: NAVY }}
                  />
                  <span className="leading-tight">
                    {dayjs(event.eventDateTime).format(
                      "DD MMM YYYY, hh:mm A"
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3">
                  <MapPin
                    size={18}
                    className="shrink-0"
                    style={{ color: NAVY }}
                  />
                  {event.location?.startsWith("http") ? (
                    <a
                      href={event.location}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                      style={{ color: NAVY }}
                    >
                      View Location
                    </a>
                  ) : (
                    <span className="leading-tight">{event.location}</span>
                  )}
                </div>

                <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3">
                  <IndianRupee
                    size={18}
                    className="shrink-0"
                    style={{ color: NAVY }}
                  />
                  <span className="font-medium">
                    {registrationType === "paid" && event.fees
                      ? event.fees.toLocaleString("en-IN")
                      : "Free"}
                  </span>
                </div>
              </div> */}

              <Button
                className="mt-5"
                type="primary"
                size="large"
                block
                onClick={handleStartRegistration}
                style={{ background: NAVY, borderColor: NAVY }}
              >
                Register
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-6 md:py-10">
        <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-col gap-6 p-4 sm:p-5 md:p-8">
            <div className="space-y-5">
              <div>
                <h1 className="m-0 text-2xl font-semibold leading-tight text-slate-950 sm:text-3xl">
                  {event.name}
                </h1>

                <div className="mt-4 grid grid-cols-1 gap-2.5 text-sm text-slate-700 sm:grid-cols-3 sm:gap-3">
                  <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3">
                    <CalendarDays
                      size={18}
                      className="shrink-0"
                      style={{ color: NAVY }}
                    />
                    <span className="leading-tight">
                      {dayjs(event.eventDateTime).format(
                        "DD MMM YYYY, hh:mm A"
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3">
                    <MapPin
                      size={18}
                      className="shrink-0"
                      style={{ color: NAVY }}
                    />
                    {event.location?.startsWith("http") ? (
                      <a
                        href={event.location}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium hover:underline"
                        style={{ color: NAVY }}
                      >
                        View Location
                      </a>
                    ) : (
                      <span className="leading-tight">{event.location}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 rounded-lg bg-slate-50 p-3">
                    <IndianRupee
                      size={18}
                      className="shrink-0"
                      style={{ color: NAVY }}
                    />
                    <span className="font-medium">
                      {registrationType === "paid" && event.fees
                        ? event.fees.toLocaleString("en-IN")
                        : "Free"}
                    </span>
                  </div>
                </div>
              </div>

              <section>
                <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                  Description
                </h2>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600 sm:text-base">
                  {event.description}
                </p>
              </section>

              <section>
                <h2 className="text-base font-semibold text-slate-900 sm:text-lg">
                  Terms &amp; Conditions
                </h2>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-600 sm:text-base">
                  {event.terms}
                </p>
              </section>
            </div>

            <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
              <h2 className="mb-1 text-lg font-semibold text-slate-900 sm:text-xl">
                {getStepTitle()}
              </h2>

              {step > 1 && (
                <>
                  <p className="mb-4 text-sm text-slate-500">
                    Step {step - 1} of 2
                  </p>

                  <div className="mb-5 flex items-center gap-2">
                    {stepLabels.map((label, index) => {
                      const stepNumber = index + 2;
                      const isActive = step >= stepNumber;
                      return (
                        <div
                          key={label}
                          className="h-1.5 flex-1 rounded-full transition-colors"
                          style={{ background: isActive ? RED : "#e2e8f0" }}
                        />
                      );
                    })}
                  </div>
                </>
              )}

              <Form
                form={form}
                layout="vertical"
                onValuesChange={scheduleRegistrationDraftSave}
                size="large"
              >
                {registrationNotice && (
                  <Alert
                    className="mb-4"
                    message={registrationNotice}
                    showIcon
                    type={step === 3 ? "info" : "warning"}
                  />
                )}

                {step === 1 && (
                  <>
                    <Form.Item
                      label="Mobile Number"
                      name="mobile"
                      rules={[
                        {
                          required: true,
                          message: "Mobile number is required",
                        },
                        {
                          pattern: /^[0-9]{10}$/,
                          message: "Mobile number must be 10 digits",
                        },
                      ]}
                    >
                      <Input
                        maxLength={10}
                        inputMode="numeric"
                        onChange={() => {
                          setRegistrationNotice("");
                          setAttendanceMember(null);
                        }}
                        placeholder="Enter 10 digit mobile number"
                      />
                    </Form.Item>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <Button onClick={handleBackToStart} block>
                        Back
                      </Button>

                      <Button
                        type="primary"
                        onClick={handleContinueToDetails}
                        loading={checkingMobile}
                        block
                        style={{ background: NAVY, borderColor: NAVY }}
                      >
                        Continue
                      </Button>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <Form.Item
                      label="Full Name"
                      name="fullName"
                      rules={[
                        { required: true, message: "Name is required" },
                      ]}
                    >
                      <Input placeholder="Enter full name" />
                    </Form.Item>

                    <Form.Item
                      label="Business Type"
                      name="businessType"
                      rules={[
                        {
                          required: true,
                          message: "Business type is required",
                        },
                        {
                          whitespace: true,
                          message: "Business type is required",
                        },
                      ]}
                    >
                      <Input placeholder="Enter business type" maxLength={100} />
                    </Form.Item>

                    <Form.Item
                      name="acceptedTerms"
                      valuePropName="checked"
                      rules={[
                        {
                          validator: (_, value) =>
                            value
                              ? Promise.resolve()
                              : Promise.reject(
                                  new Error(
                                    "Please agree to terms and conditions"
                                  )
                                ),
                        },
                      ]}
                    >
                      <Checkbox>I agree to terms and conditions</Checkbox>
                    </Form.Item>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <Button onClick={() => setStep(1)} block>
                        Back
                      </Button>

                      <Button
                        type="primary"
                        onClick={handleContinueToPayment}
                        loading={savingDetails}
                        block
                        style={{ background: NAVY, borderColor: NAVY }}
                      >
                        Continue
                      </Button>
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div
                      className="mb-4 rounded-lg border p-4"
                      style={{
                        borderColor: "#e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div className="text-sm text-slate-500">
                        Payable Amount
                      </div>

                      <div className="mt-1 text-2xl font-semibold text-slate-950 sm:text-3xl">
                        {registrationType === "free"
                          ? "Free"
                          : event.fees
                          ? `Rs. ${event.fees.toLocaleString("en-IN")}`
                          : "Free"}
                      </div>

                      <div className="mt-2 text-sm text-slate-600">
                        {registrationType === "free"
                          ? "No payment will be collected for this registration."
                          : "Payment link will be generated and sent to your WhatsApp number."}
                      </div>

                    </div>

                    <div className="mb-4 divide-y divide-slate-200/70 rounded-lg bg-slate-50 p-4 text-sm">
                      <SummaryRow
                        label="Mobile"
                        value={form.getFieldValue("mobile")}
                      />
                      <SummaryRow
                        label="Name"
                        value={form.getFieldValue("fullName")}
                      />
                      <SummaryRow
                        label="Business Type"
                        value={form.getFieldValue("businessType")}
                      />
                      <SummaryRow
                        label="Registration Type"
                        value={registrationType === "free" ? "Free" : "Paid"}
                        valueClassName={
                          registrationType === "free"
                            ? "text-emerald-700"
                            : "text-slate-900"
                        }
                      />
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <Button onClick={() => setStep(2)} block>
                        Back
                      </Button>

                      <Button
                        type="primary"
                        onClick={handleFinalRegistration}
                        loading={submitting}
                        block
                        style={{
                          background: registrationType === "free" ? NAVY : RED,
                          borderColor: registrationType === "free" ? NAVY : RED,
                        }}
                      >
                        Registration
                      </Button>
                    </div>
                  </>
                )}
              </Form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
