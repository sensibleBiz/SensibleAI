import { Button, Empty, Form, Input, Spin, message } from "antd";
import {
  ArrowLeft,
  ArrowRight,
  Megaphone,
  ShieldCheck,
  Smartphone,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  createEventPamphletContact,
  EventPamphletLeadPayload,
  EventPamphletLinkDetails,
  getEventPamphletLinkDetails,
} from "@/features/events/api/eventPamphletLeadService";

type MobileFormValues = {
  mobile: string;
};

type DetailsFormValues = {
  name: string;
  businessType: string;
};

const toLocalMobileNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91")
    ? digits.slice(2)
    : digits.slice(0, 10);
};

const toInternationalMobileNumber = (value: string) =>
  `+91${toLocalMobileNumber(value)}`;

export default function EventPamphletLeadPage() {
  const { token = "" } = useParams<{ token: string }>();
  const [linkDetails, setLinkDetails] = useState<EventPamphletLinkDetails | null>(
    null
  );
  const [linkLoading, setLinkLoading] = useState(true);
  const [mobileForm] = Form.useForm<MobileFormValues>();
  const [detailsForm] = Form.useForm<DetailsFormValues>();
  const [mobile, setMobile] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);

  const sourceName = linkDetails?.displayName ?? "";
  const outletId = linkDetails?.outletId ?? "";

  useEffect(() => {
    let cancelled = false;

    const resolveLink = async () => {
      setLinkLoading(true);
      try {
        const details = await getEventPamphletLinkDetails(token);
        if (!cancelled) setLinkDetails(details);
      } catch {
        if (!cancelled) setLinkDetails(null);
      } finally {
        if (!cancelled) setLinkLoading(false);
      }
    };

    void resolveLink();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleMobileContinue = async () => {
    const values = await mobileForm.validateFields();
    const normalizedMobile = toInternationalMobileNumber(values.mobile);

    setMobile(normalizedMobile);
    setStep(2);
  };

  const handleSubmit = async (values: DetailsFormValues) => {
    const payload: EventPamphletLeadPayload = {
      outletId,
      name: values.name.trim(),
      mobile,
      businessType: values.businessType.trim(),
      sourceType: "event",
      sourceName,
      companyName: sourceName,
    };

    try {
      setSubmitting(true);
      await createEventPamphletContact(payload);
      message.success("Details submitted successfully");
      window.location.assign("https://sensible.biz/home");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to submit details"
      );
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f4f8fb] px-4 py-6 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-cyan-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-20 h-72 w-72 rounded-full bg-blue-200/50 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md items-center sm:min-h-[calc(100vh-5rem)]">
        <section className="w-full overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_24px_70px_rgba(10,55,80,0.14)]">
          <div className="bg-gradient-to-br from-[#0a3750] via-[#0d526c] to-[#11758a] px-5 pb-7 pt-6 text-white sm:px-8 sm:pb-8 sm:pt-7">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
                <img
                  src="/images/logo1.jpeg"
                  alt="Sensible CRM"
                  className="h-8 w-8 object-contain"
                />
              </div>
              <div className="flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-medium text-cyan-50 ring-1 ring-white/20">
                <Megaphone size={14} />
                Event enquiry
              </div>
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
              Event pamphlet
            </p>
            <h1 className="m-0 text-2xl font-bold leading-tight sm:text-3xl">
              {linkLoading
                ? "Validating secure link..."
                : sourceName || "Event enquiry"}
            </h1>
            <p className="mb-0 mt-2 text-sm leading-6 text-cyan-50/80">
              Share your details and our team will connect with you shortly.
            </p>
          </div>

          <div className="px-5 py-6 sm:px-8 sm:py-8">
            {linkLoading ? (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3">
                <Spin />
                <p className="m-0 text-sm text-slate-500">
                  Checking secure pamphlet link...
                </p>
              </div>
            ) : !sourceName ? (
              <Empty description="This event pamphlet link is invalid or has been tampered with." />
            ) : (
              <>
                <div className="mb-7 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                        step >= 1
                          ? "bg-[#0a3750] text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      1
                    </span>
                    <span className="hidden text-xs font-semibold text-slate-600 min-[380px]:block">
                      Mobile
                    </span>
                  </div>
                  <div
                    className={`h-0.5 w-14 rounded-full sm:w-20 ${
                      step === 2 ? "bg-[#0a3750]" : "bg-slate-200"
                    }`}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden text-xs font-semibold text-slate-600 min-[380px]:block">
                      Your details
                    </span>
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                        step === 2
                          ? "bg-[#0a3750] text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      2
                    </span>
                  </div>
                </div>

                {step === 1 ? (
                  <Form
                    form={mobileForm}
                    layout="vertical"
                    requiredMark={false}
                    onFinish={() => void handleMobileContinue()}
                  >
                    <div className="mb-6">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-[#0a6075]">
                        <Smartphone size={24} />
                      </div>
                      <h2 className="m-0 text-xl font-bold text-slate-900">
                        Enter your mobile number
                      </h2>
                      <p className="mb-0 mt-1 text-sm leading-6 text-slate-500">
                        We’ll use this number only to contact you about this event.
                      </p>
                    </div>

                    <Form.Item
                      label="Mobile number"
                      name="mobile"
                      normalize={toLocalMobileNumber}
                      rules={[
                        { required: true, message: "Mobile number is required" },
                        {
                          pattern: /^[6-9]\d{9}$/,
                          message: "Enter a valid 10-digit mobile number",
                        },
                      ]}
                    >
                      <Input
                        prefix={
                          <span className="mr-1 font-semibold text-slate-600">
                            +91
                          </span>
                        }
                        inputMode="numeric"
                        autoComplete="tel"
                        maxLength={10}
                        placeholder="98765 43210"
                        size="large"
                        className="!h-12 !rounded-xl"
                      />
                    </Form.Item>

                    <Button
                      block
                      type="primary"
                      htmlType="submit"
                      size="large"
                      className="!mt-2 !h-12 !rounded-xl !bg-[#0a3750] !font-semibold"
                    >
                      Continue <ArrowRight size={17} />
                    </Button>
                  </Form>
                ) : (
                  <Form
                    form={detailsForm}
                    layout="vertical"
                    requiredMark={false}
                    onFinish={(values) => void handleSubmit(values)}
                  >
                    <div className="mb-6">
                      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-[#0a6075]">
                        <UserRound size={24} />
                      </div>
                      <h2 className="m-0 text-xl font-bold text-slate-900">
                        Tell us about yourself
                      </h2>
                      <p className="mb-0 mt-1 text-sm leading-6 text-slate-500">
                        Mobile:{" "}
                        <span className="font-semibold text-slate-700">
                          {mobile}
                        </span>
                      </p>
                    </div>

                    <Form.Item
                      label="Your name"
                      name="name"
                      rules={[
                        { required: true, message: "Name is required" },
                        { min: 2, message: "Enter at least 2 characters" },
                      ]}
                    >
                      <Input
                        autoComplete="name"
                        placeholder="Enter your full name"
                        size="large"
                        className="!h-12 !rounded-xl"
                      />
                    </Form.Item>

                    <Form.Item
                      label="Business type"
                      name="businessType"
                      rules={[
                        { required: true, message: "Business type is required" },
                        {
                          whitespace: true,
                          message: "Business type is required",
                        },
                      ]}
                    >
                      <Input
                        placeholder="Enter your business type"
                        size="large"
                        maxLength={100}
                        className="!h-12 !rounded-xl"
                      />
                    </Form.Item>

                    <div className="mt-2 grid grid-cols-[auto_1fr] gap-3">
                      <Button
                        size="large"
                        aria-label="Back to mobile number"
                        icon={<ArrowLeft size={18} />}
                        onClick={() => setStep(1)}
                        className="!h-12 !rounded-xl"
                      />
                      <Button
                        block
                        type="primary"
                        htmlType="submit"
                        size="large"
                        loading={submitting}
                        className="!h-12 !rounded-xl !bg-[#0a3750] !font-semibold"
                      >
                        Submit
                      </Button>
                    </div>
                  </Form>
                )}

                <div className="mt-6 flex items-start gap-2 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-400">
                  <ShieldCheck
                    size={16}
                    className="mt-0.5 shrink-0 text-emerald-500"
                  />
                  Your information is securely collected for this event enquiry.
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
