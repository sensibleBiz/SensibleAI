import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Form,
  Input,
  Select,
  Button,
  Row,
  Col,
  Space,
  Spin,
  Tag,
} from "antd";
import {
  LEAD_PRIORITY,
  STATE_WISE_CITIES,
  STATES_OBJECT,
} from "@/shared/lib/constants";
import { useMessageApi, useCrmTerminology } from "@/shared/hooks";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { leadApi, type CreateLeadInput } from "../api/leadApi";
import { getLeadSourceSelectOptions, toTitleCase } from "@/shared/utils/helperFunctions";
import type { CustomerRecord } from "@/features/customers";
import type { LeadsManagement } from "../types/types";
import { CustomerSearchSelect } from "@/features/customers";
import { customerApi } from "@/features/customers";
import { useNavigate } from "react-router-dom";

const { TextArea } = Input;

interface ChildProps {
  setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

type AddLeadFormValues = CreateLeadInput;

interface CustomerMatchInputValues {
  businessName?: string;
  email?: string;
  mobile?: string;
}

interface CustomerMatchReason {
  key: "mobile" | "email" | "businessName";
  label: string;
  value: string;
}

const normalizeMatchName = (value?: string) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const normalizeMatchMobile = (value?: string) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const getCustomerMatchReasons = (
  customer: CustomerRecord,
  input: CustomerMatchInputValues,
): CustomerMatchReason[] => {
  const reasons = new Map<CustomerMatchReason["key"], CustomerMatchReason>();
  const inputMobile = normalizeMatchMobile(input.mobile);
  const customerMobile = normalizeMatchMobile(customer.mobile);
  if (inputMobile && inputMobile === customerMobile) {
    reasons.set("mobile", {
      key: "mobile",
      label: "Same mobile",
      value: customer.mobile,
    });
  }

  const inputEmail = String(input.email ?? "").trim().toLowerCase();
  const customerEmail = customer.email.trim().toLowerCase();
  if (inputEmail && inputEmail === customerEmail) {
    reasons.set("email", {
      key: "email",
      label: "Same email",
      value: customer.email,
    });
  }

  const inputBusinessName = normalizeMatchName(input.businessName);
  const businessName = normalizeMatchName(customer.businessName);
  if (businessName && inputBusinessName === businessName) {
    reasons.set("businessName", {
      key: "businessName",
      label: "Same business name",
      value: customer.businessName,
    });
  }

  return [...reasons.values()];
};

const AddLeadForm: React.FC<ChildProps> = ({ setModalOpen }) => {
  const navigate = useNavigate();
  const { newLeadAction } = useCrmTerminology();
  const [loading, setLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerRecord | null>(null);
  const [customerDetailsLoading, setCustomerDetailsLoading] = useState(false);
  const customerSelectionRequestRef = useRef(0);
  const customerDetailsAbortRef = useRef<AbortController | null>(null);
  const [form] = Form.useForm();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id
  );
  const selectedState = Form.useWatch("state", form);
  const watchedMobile = Form.useWatch("mobile", form);
  const watchedEmail = Form.useWatch("email", form);
  const watchedBusinessName = Form.useWatch("businessName", form);
  const [matchedCustomers, setMatchedCustomers] = useState<CustomerRecord[]>([]);
  const [existingEnquiries, setExistingEnquiries] = useState<LeadsManagement[]>(
    [],
  );
  const [matchChecking, setMatchChecking] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchFingerprint, setMatchFingerprint] = useState("");
  const [ignoredMatchFingerprint, setIgnoredMatchFingerprint] = useState("");
  const [filledFromEnquiry, setFilledFromEnquiry] = useState(false);
  const autoAppliedFingerprintRef = useRef("");

  const messageApi = useMessageApi();

  useEffect(() => {
    customerDetailsAbortRef.current?.abort();
    customerSelectionRequestRef.current += 1;
    form.resetFields();
    setSelectedCustomer(null);
    setCustomerDetailsLoading(false);
    setMatchedCustomers([]);
    setExistingEnquiries([]);
    setMatchChecking(false);
    setMatchError("");
    setMatchFingerprint("");
    setIgnoredMatchFingerprint("");
    setFilledFromEnquiry(false);
    autoAppliedFingerprintRef.current = "";
  }, [form, outletId]);

  useEffect(
    () => () => {
      customerDetailsAbortRef.current?.abort();
      customerSelectionRequestRef.current += 1;
    },
    [],
  );

  const handleSubmit = async (values: AddLeadFormValues) => {
    if (customerDetailsLoading) {
      messageApi.warning("Please wait while customer details are loading.");
      return;
    }
    if (selectedCustomer?.outletId && selectedCustomer.outletId !== outletId) {
      messageApi.error(
        "The selected customer belongs to another outlet. Select the customer again.",
      );
      setSelectedCustomer(null);
      return;
    }
    if (!selectedCustomer && matchChecking) {
      messageApi.warning(
        "Please wait while the existing-customer check finishes.",
      );
      return;
    }
    if (!selectedCustomer && matchError) {
      messageApi.error(
        "The existing-customer check failed. Edit a customer field to retry before creating the enquiry.",
      );
      return;
    }
    if (
      !selectedCustomer &&
      matchedCustomers.length > 0 &&
      ignoredMatchFingerprint !== matchFingerprint
    ) {
      messageApi.warning(
        "An existing customer matches these details. Select that customer or explicitly continue as a new lead.",
      );
      return;
    }

    setLoading(true);
    try {
      const storedValues = form.getFieldsValue(true) as AddLeadFormValues;
      await leadApi.createLead(outletId, {
        ...storedValues,
        ...values,
        ...(selectedCustomer
          ? {
              customerId: selectedCustomer.id,
              enquiryType: "CUSTOMER_ENQUIRY" as const,
            }
          : {}),
      });
      messageApi.success(
        selectedCustomer
          ? "Customer enquiry created successfully!"
          : "Lead created successfully!",
      );
      form.resetFields();
      setModalOpen(false);
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setLoading(false);
    }
  };

  const getLeadPriorityOptions = () =>
    Object.values(LEAD_PRIORITY).map((value) => ({
      label: toTitleCase(value),
      value,
    }));

  const getLeadSourceOptions = () => getLeadSourceSelectOptions();

  const fillCustomerDetails = useCallback((customer: CustomerRecord) => {
    form.setFieldsValue({
      area: customer.area || "",
      businessName: customer.businessName || "",
      businessType: customer.businessType || "",
      city: customer.city || undefined,
      customerName: customer.customerName || "",
      email: customer.email || "",
      mobile: normalizeMatchMobile(customer.mobile) || "",
      priority: customer.priority || undefined,
      requirement: "",
      source: customer.source || undefined,
      state: customer.state || undefined,
    });
  }, [form]);

  const fillLeadDetails = useCallback((lead: LeadsManagement) => {
    form.setFieldsValue({
      area: lead.area || "",
      businessName: lead.businessName || "",
      businessType: lead.businessType || "",
      city: lead.city || undefined,
      customerName: lead.username || lead.businessName || "",
      email: lead.email || "",
      mobile: normalizeMatchMobile(lead.mobile || lead.phone) || "",
      priority: lead.priority || undefined,
      requirement: "",
      source: lead.source || undefined,
      state: lead.state || undefined,
    });
    setFilledFromEnquiry(true);
  }, [form]);

  const handleCustomerSelect = useCallback(async (customer: CustomerRecord | null) => {
    customerDetailsAbortRef.current?.abort();
    const requestId = customerSelectionRequestRef.current + 1;
    customerSelectionRequestRef.current = requestId;
    if (customer?.outletId && customer.outletId !== outletId) {
      setSelectedCustomer(null);
      setCustomerDetailsLoading(false);
      messageApi.error("Customer details do not belong to this outlet.");
      return;
    }
    setSelectedCustomer(customer);
    if (!customer) {
      setCustomerDetailsLoading(false);
      setFilledFromEnquiry(false);
      return;
    }

    // Requirement always belongs to the new enquiry; never reuse the old one.
    form.setFieldValue("requirement", "");
    setCustomerDetailsLoading(true);
    const abortController = new AbortController();
    customerDetailsAbortRef.current = abortController;
    try {
      const details = await customerApi.get(
        outletId,
        customer.id,
        abortController.signal,
      );
      if (customerSelectionRequestRef.current !== requestId) return;
      if (details.outletId && details.outletId !== outletId) {
        throw new Error("Customer details do not belong to this outlet.");
      }
      setSelectedCustomer(details);
      fillCustomerDetails(details);
      setFilledFromEnquiry(false);
    } catch (error) {
      if (customerSelectionRequestRef.current !== requestId) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      fillCustomerDetails(customer);
      setFilledFromEnquiry(false);
      messageApi.warning(
        "Loaded matching customer details. Enter the new requirement to continue.",
      );
    } finally {
      if (customerSelectionRequestRef.current === requestId) {
        customerDetailsAbortRef.current = null;
        setCustomerDetailsLoading(false);
      }
    }
  }, [fillCustomerDetails, form, messageApi, outletId]);

  const handleViewCustomerHistory = (customerId: string) => {
    setModalOpen(false);
    navigate(`/customers/${encodeURIComponent(customerId)}`);
  };

  useEffect(() => {
    if (!outletId || selectedCustomer) {
      setMatchedCustomers([]);
      setExistingEnquiries([]);
      setMatchChecking(false);
      setMatchError("");
      return;
    }

    const mobileDigits = String(watchedMobile ?? "").replace(/\D/g, "");
    const mobile =
      mobileDigits.length >= 10 ? mobileDigits.slice(-10) : "";
    const email = String(watchedEmail ?? "").trim();
    const input = {
      ...(mobile.length === 10 ? { mobile } : {}),
      ...(email.includes("@") && email.length >= 5 ? { email } : {}),
    };
    const fingerprint = JSON.stringify(input);

    if (Object.keys(input).length === 0) {
      setMatchedCustomers([]);
      setExistingEnquiries([]);
      setMatchChecking(false);
      setMatchError("");
      setMatchFingerprint("");
      setFilledFromEnquiry(false);
      autoAppliedFingerprintRef.current = "";
      return;
    }

    const abortController = new AbortController();
    setMatchChecking(true);
    setMatchError("");
    setMatchFingerprint(fingerprint);
    setIgnoredMatchFingerprint("");
    const timer = window.setTimeout(() => {
      void customerApi
        .match(outletId, input, abortController.signal)
        .then((result) => {
          const customers = (result.items ?? []).filter(
            (customer) =>
              !customer.outletId || customer.outletId === outletId,
          );
          const enquiries = result.existingEnquiries ?? [];
          setMatchedCustomers(customers);
          setExistingEnquiries(enquiries);

          if (autoAppliedFingerprintRef.current === fingerprint) return;

          const identityCustomer = customers.find(
            (customer) =>
              getCustomerMatchReasons(customer, {
                email: input.email,
                mobile: input.mobile,
              }).some(
                (reason) => reason.key === "mobile" || reason.key === "email",
              ),
          );
          if (identityCustomer) {
            autoAppliedFingerprintRef.current = fingerprint;
            void handleCustomerSelect(identityCustomer);
            return;
          }
          if (enquiries[0]) {
            autoAppliedFingerprintRef.current = fingerprint;
            fillLeadDetails(enquiries[0]);
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setMatchedCustomers([]);
          setExistingEnquiries([]);
          setMatchError("Existing-customer check could not be completed.");
        })
        .finally(() => {
          if (!abortController.signal.aborted) setMatchChecking(false);
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      abortController.abort();
    };
  }, [
    fillLeadDetails,
    handleCustomerSelect,
    outletId,
    selectedCustomer,
    watchedEmail,
    watchedMobile,
  ]);

  const identityLocked = Boolean(selectedCustomer) || filledFromEnquiry;

  return (
    <div className="p-6 flex justify-center">
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="w-full max-w-4xl p-8 rounded-lg"
      >
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item label="Search existing customer">
              <CustomerSearchSelect
                key={outletId}
                outletId={outletId}
                selectedCustomer={selectedCustomer}
                onSelect={handleCustomerSelect}
                onEnquirySelect={fillLeadDetails}
              />
            </Form.Item>
            {selectedCustomer && (
              <Alert
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
                message={`Customer: ${toTitleCase(selectedCustomer.businessName)}`}
                description={
                  <Space wrap>
                    <span>
                      Customer Enquiry · {selectedCustomer.totalEnquiries} enquiries ·{" "}
                      {selectedCustomer.totalWon} won
                    </span>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0 }}
                      onClick={() =>
                        handleViewCustomerHistory(selectedCustomer.id)
                      }
                    >
                      View Customer History
                    </Button>
                  </Space>
                }
              />
            )}
            {filledFromEnquiry && !selectedCustomer && (
              <Alert
                type="success"
                showIcon
                style={{ marginBottom: 16 }}
                message="Existing enquiry details loaded"
                description="Name, mobile, email, and business details were filled from a previous enquiry. Enter only the new requirement."
              />
            )}
            {!selectedCustomer && matchChecking && (
              <div style={{ marginBottom: 16 }}>
                <Spin size="small" /> Checking for an existing customer or enquiry...
              </div>
            )}
            {!selectedCustomer && matchError && (
              <Alert
                type="error"
                showIcon
                style={{ marginBottom: 16 }}
                message={matchError}
              />
            )}
            {!selectedCustomer && matchedCustomers.length > 0 && (
              <Alert
                type={
                  ignoredMatchFingerprint === matchFingerprint
                    ? "info"
                    : "warning"
                }
                showIcon
                style={{ marginBottom: 16 }}
                message="Existing customer found"
                description={
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {matchedCustomers.map((customer) => {
                      const reasons = getCustomerMatchReasons(customer, {
                        businessName: String(watchedBusinessName ?? ""),
                        email: String(watchedEmail ?? ""),
                        mobile: String(watchedMobile ?? ""),
                      });
                      return (
                        <div
                          key={customer.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 12,
                          }}
                        >
                          <Space
                            direction="vertical"
                            size={4}
                            style={{ flex: 1, minWidth: 280 }}
                          >
                            <span>
                              {[
                                customer.customerName || customer.businessName,
                                customer.businessName,
                                customer.mobile || customer.email,
                                customer.totalEnquiries + " enquiries",
                                customer.totalWon + " won",
                              ]
                                .filter(Boolean)
                                .join(" | ")}
                            </span>
                            <Space size={[4, 4]} wrap>
                              {reasons.length > 0 ? (
                                reasons.map((reason) => (
                                  <Tag color="gold" key={reason.key}>
                                    {reason.label}: {reason.value}
                                  </Tag>
                                ))
                              ) : (
                                <Tag color="gold">Matching customer details</Tag>
                              )}
                            </Space>
                          </Space>
                          <Space wrap>
                            <Button
                              size="small"
                              onClick={() =>
                                handleViewCustomerHistory(customer.id)
                              }
                            >
                              View History
                            </Button>
                            <Button
                              type="primary"
                              size="small"
                              onClick={() => handleCustomerSelect(customer)}
                            >
                              Use Existing Customer
                            </Button>
                          </Space>
                        </div>
                      );
                    })}
                    <Button
                      type="link"
                      style={{ padding: 0, width: "fit-content" }}
                      onClick={() =>
                        setIgnoredMatchFingerprint(matchFingerprint)
                      }
                    >
                      This is a different customer — create as new lead
                    </Button>
                  </Space>
                }
              />
            )}
            {existingEnquiries.length > 0 && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={
                  existingEnquiries.length > 1
                    ? `Repeated enquiries found (${existingEnquiries.length})`
                    : "Existing enquiry found"
                }
                description={
                  <Space direction="vertical" style={{ width: "100%" }}>
                    {existingEnquiries.slice(0, 5).map((enquiry) => (
                      <div
                        key={enquiry.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        <span>
                          {[
                            toTitleCase(
                              enquiry.username || enquiry.businessName,
                              "Lead",
                            ),
                            enquiry.mobile,
                            enquiry.email,
                            enquiry.stage
                              ? toTitleCase(enquiry.stage)
                              : "",
                            enquiry.createdDate
                              ? new Date(enquiry.createdDate).toLocaleDateString()
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" | ")}
                        </span>
                        <Button
                          size="small"
                          onClick={() => fillLeadDetails(enquiry)}
                        >
                          Use These Details
                        </Button>
                      </div>
                    ))}
                    {filledFromEnquiry && !selectedCustomer && (
                      <Button
                        type="link"
                        style={{ padding: 0, width: "fit-content" }}
                        onClick={() => {
                          setFilledFromEnquiry(false);
                          autoAppliedFingerprintRef.current = matchFingerprint;
                        }}
                      >
                        Keep filled details and create another enquiry
                      </Button>
                    )}
                  </Space>
                }
              />
            )}
          </Col>
          <Col span={6}>
            <Form.Item
              label="Customer Name"
              name="customerName"
              rules={[
                { required: true, message: "Please enter customer name" },
              ]}
            >
              <Input placeholder="Customer Name" disabled={identityLocked} />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item
              label="Mobile"
              name="mobile"
              rules={[
                { required: true, message: "Please enter mobile number" },
                {
                  pattern: /^[0-9]{10}$/,
                  message: "Enter valid 10-digit number",
                },
              ]}
            >
              <Input placeholder="Mobile Number" disabled={identityLocked} />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Email ID" name="email">
              <Input placeholder="Email Address" type="email" disabled={identityLocked} />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="State" name="state">
              <Select
                showSearch
                placeholder="Select State"
                allowClear
                disabled={identityLocked}
                optionFilterProp="label"
                options={STATES_OBJECT?.map((s) => ({
                  label: s.label,
                  value: s.name, // important: matches STATE_WISE_CITIES key
                }))}
              ></Select>
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="City" name="city">
              <Select
                showSearch
                allowClear
                disabled={identityLocked || !selectedState}
                placeholder={
                  selectedState ? "Select City" : "Select a state first"
                }
                optionFilterProp="label"
                options={
                  selectedState
                    ? STATE_WISE_CITIES[selectedState]?.map((c) => ({
                        label: c.label,
                        value: c.value,
                      })) || []
                    : []
                }
              />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Area" name="area">
              <Input placeholder="Enter Area" disabled={identityLocked} />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Business Type" name="businessType">
              <Input placeholder="Enter Business Type" disabled={identityLocked} />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Business Name" name="businessName">
              <Input placeholder="Business Name" disabled={identityLocked} />
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Source" name="source">
              <Select
                showSearch
                placeholder="Select Source"
                allowClear
                options={getLeadSourceOptions()}
              ></Select>
            </Form.Item>
          </Col>

          <Col span={6}>
            <Form.Item label="Priority" name="priority">
              <Select
                showSearch
                placeholder="Select Priority"
                allowClear
                options={getLeadPriorityOptions()}
              ></Select>
            </Form.Item>
          </Col>

          <Col span={12}>
            <Form.Item
              label="Requirement"
              name="requirement"
              rules={[
                { required: true, message: "Please enter customer requirement" },
              ]}
            >
              <TextArea rows={1} placeholder="Enter customer requirement" />
            </Form.Item>
          </Col>
        </Row>

        <div className="flex justify-center mt-6">
          <Button
            type="primary"
            htmlType="submit"
            loading={loading || customerDetailsLoading}
            size="large"
            style={{
              fontWeight: 600,
              minWidth: "200px",
            }}
          >
            {newLeadAction}
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default AddLeadForm;



