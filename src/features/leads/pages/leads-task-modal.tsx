import {
  Modal,
  Tabs,
  Tag,
  Divider,
  Form,
  Button,
  Select,
  Input,
  Spin,
  Checkbox,
} from "antd";
import {
  CalendarOutlined,
  UserOutlined,
  FileTextOutlined,
  SaveOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { LeadsManagement } from "../types/types";
import { ProductItem } from "@/features/products";
import { useMessageApi, useCrmTerminology } from "@/shared/hooks";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import dayjs from "dayjs";
import {
  LEAD_PRIORITY,
  LEAD_STAGE,
  LEAD_TAGS_CONST,
  PERMISSION_MASTER,
} from "@/shared/lib/constants";
import {
  formatEmployeeName,
  getLeadSourceSelectOptions,
  toTitleCase,
} from "@/shared/utils/helperFunctions";
import LeadActivityForm from "./lead-activity-form";
import type { LeadActivityFormPayload } from "./lead-activity-form";
import AssignedHistoryList from "./AssignedHistoryList";
import CallHistory from "./CallHistory";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";
import { useNavigate } from "react-router-dom";
import { usePermission } from "@/features/access-control";
import QuotationPage from "./QuotationPage";
import { leadApi, type LeadActivityItem, type LeadCallItem, type LeadWorkflowInput, type UpdateLeadInput } from "../api/leadApi";
import { useLeadWhatsAppShare } from "./useLeadWhatsAppShare";
import { productApi, type PostgresProductDTO } from "@/features/products";
import {
  LeadActivityStream,
  CallLaterModal,
  LeadDetailsTab,
  type CallLaterFormValues,
} from "../components/task-modal";
import { businessConfigurationApi } from "@/features/onboarding";
import type { BusinessCustomField, BusinessPipelineStage } from "@/features/onboarding";

const mapPostgresProductToItem = (product: PostgresProductDTO): ProductItem => ({
  id: product.id,
  name: product.name,
  mrpPrice: product.mrpPrice,
  price: product.price,
  isAddOn: product.isAddOn,
  isDeleted: !product.active,
});
const { Option } = Select;
interface LeadsTaskModalProps {
  lead: LeadsManagement;
  onClose: () => void;
}

export default function LeadsTaskModal({ lead, onClose }: LeadsTaskModalProps) {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const { isExport, leadLabel } = useCrmTerminology();
  const [formData, setFormData] = useState<LeadsManagement>({ ...lead });
  const [activities, setActivities] = useState<LeadActivityItem[]>([]);
  const [activitiesCursor, setActivitiesCursor] = useState<string | null>(null);
  const [activityPageLoading, setActivityPageLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [ringingLoading, setRingingLoading] = useState(false);
  const ringingRequestInFlight = useRef(false);
  const [callLogs, setCallLogs] = useState<LeadCallItem[]>([]);
  const [callsCursor, setCallsCursor] = useState<string | null>(null);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callPageLoading, setCallPageLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [callLaterOpen, setCallLaterOpen] = useState(false);
  const [callLaterSaving, setCallLaterSaving] = useState(false);
  const [callLaterProducts, setCallLaterProducts] = useState<ProductItem[]>([]);
  const [configuredCustomFields, setConfiguredCustomFields] = useState<BusinessCustomField[]>([]);
  const [configuredStages, setConfiguredStages] = useState<BusinessPipelineStage[]>([]);
  const [configuredVertical, setConfiguredVertical] = useState<string | null>(null);
  const isExportVertical = configuredVertical
    ? configuredVertical.toLowerCase().includes("export")
    : isExport;
  const messageApi = useMessageApi();
  const [form] = Form.useForm();
  const [callLaterForm] = Form.useForm<CallLaterFormValues>();
  const [persistedAssignedTo, setPersistedAssignedTo] = useState(
    lead.assignedTo || ""
  );
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id
  );
  const {
    shareCount: whatsappShareCount,
    shareLead,
    sharing: whatsappSharing,
  } = useLeadWhatsAppShare(formData);
  const { width, height } = useWindowSize();

  useEffect(() => {
    setConfiguredStages([]);
    setConfiguredCustomFields([]);
    setConfiguredVertical(null);
    if (!outletId) {
      setConfiguredCustomFields([]);
      setConfiguredVertical(null);
      return;
    }
    const abortController = new AbortController();
    void businessConfigurationApi.get(outletId, abortController.signal)
      .then((configuration) => {
        if (abortController.signal.aborted) return;
        setConfiguredCustomFields(configuration.customFields ?? []);
        setConfiguredStages(configuration.pipelineStages ?? []);
        setConfiguredVertical(configuration.vertical);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Unable to load configured lead fields:", error);
        messageApi.error("Unable to load configured lead fields.");
      });
    return () => abortController.abort();
  }, [messageApi, outletId]);

  useEffect(() => {
    if (!outletId) return;

    const abortController = new AbortController();
      void productApi
        .listProducts({ outletId }, abortController.signal)
        .then((response) => {
          setCallLaterProducts(
            response.items
              .filter((item) => item.active)
              .map(mapPostgresProductToItem),
          );
        })
        .catch((error) => {
          if (!abortController.signal.aborted) {
            console.error("Failed to load products for Call Later:", error);
          }
        });
    return () => abortController.abort();
  }, [outletId]);

  useEffect(() => {
    if (!outletId || !lead.id) return;

    const abortController = new AbortController();
    setDetailLoading(true);

    void leadApi
      .getLead(outletId, lead.id, abortController.signal)
      .then((detail) => {
        setFormData(detail);
        setPersistedAssignedTo(detail.assignedTo || "");
        form.setFieldsValue({
          area: detail.area,
          businessName: detail.businessName,
          businessType: detail.businessType,
          city: detail.city,
          customerName: detail.username,
          email: detail.email,
          mobile: detail.mobile,
          priority: detail.priority,
          requirement: detail.requirement,
          source: detail.source,
          state: detail.state,
          customFields: detail.customFields,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError(
          error instanceof Error ? error.message : "Unable to load lead details"
        );
        messageApi.error("Unable to load lead details.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) setDetailLoading(false);
      });

    return () => abortController.abort();
  }, [form, lead.id, messageApi, outletId]);

  useEffect(() => {
    if (!outletId || !lead?.id) return;

    const abortController = new AbortController();
    setLoading(true);

    void leadApi
      .getActivities(outletId, lead.id, { limit: 30 }, abortController.signal)
      .then((result) => {
        setActivities(result.items);
        setActivitiesCursor(result.nextCursor);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        const errorMessage =
          error instanceof Error ? error.message : "Unable to load activities";
        setError(errorMessage);
        messageApi.error("Unable to load activities.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });

    return () => abortController.abort();
  }, [lead?.id, messageApi, outletId]);

  const loadMoreActivities = async () => {
    if (!activitiesCursor || activityPageLoading) return;
    setActivityPageLoading(true);
    try {
      const result = await leadApi.getActivities(outletId, lead.id, {
        limit: 30,
        cursor: activitiesCursor,
      });
      setActivities((current) => [...current, ...result.items]);
      setActivitiesCursor(result.nextCursor);
    } catch {
      messageApi.error("Unable to load more activities.");
    } finally {
      setActivityPageLoading(false);
    }
  };

  useEffect(() => {
    if (!outletId || !lead.id) return;

    const abortController = new AbortController();
    setCallsLoading(true);
    setCallLogs([]);
    setCallsCursor(null);

    void leadApi
      .getCalls(outletId, lead.id, { limit: 30 }, abortController.signal)
      .then((result) => {
        setCallLogs(result.items);
        setCallsCursor(result.nextCursor);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        setError(
          error instanceof Error ? error.message : "Unable to load call history"
        );
        messageApi.error("Unable to load call history.");
      })
      .finally(() => {
        if (!abortController.signal.aborted) setCallsLoading(false);
      });

    return () => abortController.abort();
  }, [lead.id, messageApi, outletId]);

  const loadMoreCalls = async () => {
    if (!callsCursor || callPageLoading) return;
    setCallPageLoading(true);
    try {
      const result = await leadApi.getCalls(outletId, lead.id, {
        limit: 30,
        cursor: callsCursor,
      });
      setCallLogs((current) => [...current, ...result.items]);
      setCallsCursor(result.nextCursor);
    } catch {
      messageApi.error("Unable to load more call history.");
    } finally {
      setCallPageLoading(false);
    }
  };

  const teamTreeData = useSelector(
    (state: RootState) => state.appState?.teamTreeData
  );
  const assignedList = useMemo(
    () =>
      teamTreeData
        ?.filter((member) => member?.department === "SALES")
        .sort((a, b) => a.userName.localeCompare(b.userName)),
    [teamTreeData]
  );

  const getUserNameById = (id: string) => {
    return (
      formatEmployeeName(
        assignedList?.find((u) => u.userProfileId === id)?.userName,
        "Unknown User"
      )
    );
  };

  // console.log(activities);
  const getLeadPriorityOptions = () =>
    Object.values(LEAD_PRIORITY).map((value) => ({
      label: toTitleCase(value),
      value,
    }));

  const getLeadSourceOptions = () => getLeadSourceSelectOptions();

  const handleSubmit = async (
    values: Partial<LeadsManagement> & { customerName?: string }
  ) => {
    setSubmitLoading(true);
    try {
      const currentValues = form.getFieldsValue();
      const customFields = {
        ...(formData.customFields ?? {}),
        ...(currentValues.customFields as Record<string, unknown> | undefined),
        ...(values.customFields as Record<string, unknown> | undefined),
      };
      const updates: UpdateLeadInput = {
        area: values.area?.trim() || undefined,
        businessName: values.businessName?.trim() || undefined,
        businessType: values.businessType?.trim() || undefined,
        city: values.city?.trim() || undefined,
        email: values.email?.trim() || undefined,
        mobile: values.mobile?.trim() || undefined,
        priority: values.priority?.trim() || undefined,
        requirement: values.requirement?.trim() || undefined,
        source: values.source?.trim() || undefined,
        state: values.state?.trim() || undefined,
        username: values.customerName?.trim() || undefined,
        customFields,
      };
      const result = await leadApi.updateLead(outletId, lead.id, updates);
      const mergedValues = {
        ...currentValues,
        ...values,
        area: values.area?.trim() || currentValues.area || "",
        businessName: values.businessName?.trim() || currentValues.businessName || "",
        businessType: values.businessType?.trim() || currentValues.businessType || "",
        city: values.city?.trim() || currentValues.city || "",
        customerName: values.customerName?.trim() || currentValues.customerName || "",
        email: values.email?.trim() || currentValues.email || "",
        mobile: values.mobile?.trim() || currentValues.mobile || "",
        priority: values.priority?.trim() || currentValues.priority || "",
        requirement: values.requirement?.trim() || currentValues.requirement || "",
        source: values.source?.trim() || currentValues.source || "",
        state: values.state?.trim() || currentValues.state || "",
        customFields,
      };
      setFormData((current) => ({
        ...current,
        ...mergedValues,
        phone: mergedValues.mobile ?? current.phone,
        updatedDate: result.updatedDate,
      }));
      form.setFieldsValue(mergedValues);
      messageApi.success("Lead Updated successfully!");
    } catch {
      messageApi.error("Something went wrong.");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCreateActivity = async (activityData: LeadActivityFormPayload) => {
    if (activityData.scheduledDate === null) {
      messageApi.error("Please select a scheduled date.");
      return;
    }

    try {
      const created = await leadApi.createActivity(outletId, lead.id, {
        assignedTo: activityData.assignedTo,
        description: activityData.description,
        mode: activityData.mode || "",
        priority: activityData.priority,
        productDealerPrice: activityData.productDealerPrice,
        productId: activityData.productId,
        productMrpPrice: activityData.productMrpPrice,
        productName: activityData.productName,
        productType: activityData.productType,
        scheduledDate: activityData.scheduledDate,
        type: activityData.type,
      });
      setActivities((current) => [created, ...current]);
      messageApi.success("Activity added successfully!");
    } catch {
      messageApi.error("Failed to save activity!");
    }
  };

  const openCallLater = () => {
    callLaterForm.setFieldsValue({
      assignedTo: formData.assignedTo || undefined,
      description: formData.comments || "",
      priority: formData.priority || LEAD_PRIORITY.MEDIUM,
      scheduledDate: dayjs().add(1, "day").hour(10).minute(0).second(0),
    });
    setCallLaterOpen(true);
  };

  const handleScheduleCallLater = async () => {
    if (!outletId || !lead.id) return;

    try {
      const values = await callLaterForm.validateFields();
      if (
        values.assignedTo !== (formData.assignedTo || "") &&
        !hasPermission(PERMISSION_MASTER.CRM_LEADS_ASSIGN)
      ) {
        messageApi.error("You do not have permission to change the assignee.");
        return;
      }

      setCallLaterSaving(true);
      const product = callLaterProducts.find(
        (item) => item.id === values.productId,
      );
      const created = await leadApi.createActivity(outletId, lead.id, {
        assignedTo: values.assignedTo,
        description: values.description.trim(),
        mode: "Offline",
        priority: values.priority,
        productDealerPrice: product?.price || 0,
        productId: product?.id || null,
        productMrpPrice: product?.mrpPrice || 0,
        productName: product?.name || null,
        productType: product?.isAddOn ? "Add On" : "Regular",
        scheduledDate: values.scheduledDate.valueOf(),
        type: "Follow Up",
        callLater: true,
      });

      const workflow = {
        stage: LEAD_STAGE.FOLLOWUP,
        comments: values.description.trim(),
        leadTag: formData.leadTag || [],
      };

      let workflowUpdated = true;
      try {
        setPersistedAssignedTo(values.assignedTo);
        setFormData((current) => ({ ...current, assignedTo: values.assignedTo, comments: workflow.comments, stage: LEAD_STAGE.FOLLOWUP }));
      } catch (workflowError) {
        workflowUpdated = false;
        console.error(workflowError);
      }

      setActivities((current) => [created, ...current]);
      if (workflowUpdated) {
        messageApi.success("Customer added to Call Later follow-ups.");
      } else {
        messageApi.warning(
          "Callback reminder was created, but the lead stage could not be updated.",
        );
      }
      setCallLaterOpen(false);
      callLaterForm.resetFields();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "errorFields" in error
      ) {
        return;
      }
      console.error(error);
      messageApi.error("Failed to schedule the callback.");
    } finally {
      setCallLaterSaving(false);
    }
  };

  const tabItems = [
    {
      key: "details",
      label: `${leadLabel} Details`,
      children: (
        <LeadDetailsTab
          form={form}
          lead={formData}
          onSubmit={handleSubmit}
          submitLoading={submitLoading}
          sourceOptions={getLeadSourceOptions()}
          priorityOptions={getLeadPriorityOptions()}
          isExport={isExportVertical}
          customFields={configuredCustomFields}
        />
      ),
    },
    {
      key: "followup",
      label: "Follow Up/Activity",
      children: (
        <LeadActivityForm lead={lead} onSubmit={handleCreateActivity} />
      ),
    },
    {
      key: "calldetails",
      label: "Call Details",
      children: (
        <CallHistory
          callLogs={callLogs}
          hasMore={Boolean(callsCursor)}
          loading={callsLoading}
          loadingMore={callPageLoading}
          onLoadMore={loadMoreCalls}
        />
      ),
    },
  ];

  const handleChange = <K extends keyof LeadsManagement>(
    key: K,
    value: LeadsManagement[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    try {
      setSaveLoading(true);

      const selectedStage = formData?.stage;
      const selectedAssignee = formData?.assignedTo;
      const comments = formData?.comments;

      // ============================
      // 🔴 VALIDATIONS
      // ============================

      // 👉 1. Lost / Disqualified => comments required
      if (
        selectedStage === LEAD_STAGE.LOST ||
        selectedStage === LEAD_STAGE.DISQUALIFIED
      ) {
        if (!comments?.trim()) {
          messageApi.error(
            "Comments are required for Lost or Disqualified stage."
          );
          setSaveLoading(false);
          return;
        }
      }

      // 👉 2. Assigned / Followup => assignedTo required
      if (
        selectedStage === LEAD_STAGE.ASSIGNED ||
        selectedStage === LEAD_STAGE.FOLLOWUP
      ) {
        if (!selectedAssignee) {
          messageApi.error("Please assign this lead to someone.");
          setSaveLoading(false);
          return;
        }
      }

      // 👉 3. If assignedTo is selected => auto-set stage to ASSIGNED
      let finalStage = selectedStage;
      if (selectedAssignee && selectedStage == LEAD_STAGE.NEW) {
        finalStage = LEAD_STAGE.ASSIGNED;
      }

      // ============================
      // 🟢 ASSIGNED HISTORY LOGIC
      // ============================

      const normalizedAssignee = selectedAssignee || "";
      const assignmentChanged = persistedAssignedTo !== normalizedAssignee;

      // ============================
      // 🟢 PREPARE UPDATE OBJECT
      // ============================
      const workflow: LeadWorkflowInput = {
        ...(finalStage ? { stage: finalStage } : {}),
        leadTag: formData?.leadTag || [],
        comments: comments || "",
      };

      if (!outletId || !lead?.id) {
        messageApi.error("Missing outlet ID or lead ID.");
        setSaveLoading(false);
        return;
      }

      const result = assignmentChanged
        ? await leadApi.assignLead(outletId, lead.id, {
            ...workflow,
            assignedTo: normalizedAssignee,
          })
        : await leadApi.changeStage(outletId, lead.id, workflow);

      setPersistedAssignedTo(normalizedAssignee);
      setFormData((current) => ({
        ...current,
        assignedTo: result.assignedTo ?? normalizedAssignee,
        assignedBy: result.assignedBy ?? current.assignedBy,
        assignedHistory: result.assignedHistory ?? current.assignedHistory,
        comments: workflow.comments,
        leadTag: workflow.leadTag,
        stage: result.stage ?? finalStage ?? current.stage,
        customerId: result.customerId ?? current.customerId,
        customerType: result.customerType ?? current.customerType,
        enquiryType: result.enquiryType ?? current.enquiryType,
        updatedDate: result.updatedDate,
      }));
      if (finalStage === LEAD_STAGE.WON) {
        setShowConfetti(true);

        // Auto stop after 4 seconds
        setTimeout(() => setShowConfetti(false), 8000);
      }


      messageApi.success("Lead updated successfully!");
    } catch {
      messageApi.error("Something went wrong while updating lead.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRingingToggle = async (checked: boolean) => {
    if (!outletId || !lead.id || ringingRequestInFlight.current) return;

    const newStatus = checked ? "RINGING" : "";
    const previousStatus = formData.status;
    ringingRequestInFlight.current = true;
    setRingingLoading(true);

    // Update local state (so UI updates immediately)
    setFormData((prev) => ({
      ...prev,
      status: newStatus,
    }));

    try {
      const result = await leadApi.setRinging(outletId, lead.id, checked);
      setFormData((current) => ({
        ...current,
        status: result.status,
        updatedDate: result.updatedDate,
      }));
      if (newStatus == "RINGING") {
        messageApi.success("Lead marked as Ringing");
      }
    } catch (requestError) {
      setFormData((current) => ({ ...current, status: previousStatus }));
      messageApi.error(
        requestError instanceof Error
          ? requestError.message
          : "Failed to update ringing status",
      );
    } finally {
      ringingRequestInFlight.current = false;
      setRingingLoading(false);
    }
  };

  const handleWhatsAppShare = () => {
    void shareLead().catch((shareError: unknown) => {
      messageApi.error(
        shareError instanceof Error
          ? shareError.message
          : "Unable to share this lead on WhatsApp.",
      );
    });
  };

  // if (loading) {
  //   return (
  //     <div className="w-full h-full flex justify-center items-center">
  //       <Spin size="large" />
  //     </div>
  //   );
  // }

  return (
    <>
      <Modal
        open
        onCancel={onClose}
        footer={null}
        width="95%"
        style={{ top: 10 }}
        styles={{
          body: {
            padding: 0,
            height: "90vh",
            overflow: "hidden",
            display: "flex",
            flexDirection: "row",
          },
        }}
      >
        {loading || detailLoading || callsLoading ? (
          <div className="flex flex-col justify-center items-center w-full h-[90vh] bg-white dark:bg-[#1f1f1f]">
            <Spin size="large" tip="Loading lead details..." />
          </div>
        ) : (
          <>
            {showConfetti && (
              <Confetti
                numberOfPieces={400}
                width={width}
                height={height}
                gravity={0.5}
              />
            )}
            {/* LEFT PANEL */}
            <div className="flex-1 overflow-y-auto px-8 py-6 bg-white dark:bg-[#1f1f1f]">
              {/* HEADER */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-semibold text-gray-900 dark:text-slate-100 mb-1">
                    {toTitleCase(formData?.username, "Unknown User")}
                  </h2>
                  {/* <p className="text-sm text-gray-500">
                    Ref: {formData?.leadRefId}
                  </p> */}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    icon={<FaWhatsapp color="#25D366" size={16} />}
                    loading={whatsappSharing}
                    disabled={whatsappSharing}
                    onClick={handleWhatsAppShare}
                  >
                    WhatsApp ({whatsappShareCount})
                  </Button>
                  {formData.customerId && (
                    <Button
                      onClick={() =>
                        navigate(`/customers/${encodeURIComponent(formData.customerId as string)}`)
                      }
                    >
                      View Customer
                    </Button>
                  )}
                  {hasPermission(PERMISSION_MASTER.CRM_ACTIVITY_CREATE) &&
                    hasPermission(PERMISSION_MASTER.CRM_LEADS_EDIT) && (
                      <Button
                        icon={<ClockCircleOutlined />}
                        onClick={openCallLater}
                      >
                        Interested – Call Later
                      </Button>
                    )}
                  <Button
                    disabled={saveLoading}
                    loading={saveLoading}
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                  >
                    Save
                  </Button>
                </div>
              </div>

              {/* MAIN INFO GRID */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <CalendarOutlined /> Dates
                  </p>
                  <p className="text-sm font-medium">
                    {dayjs(formData?.createdDate).format("DD-MM-YYYY h:mm:A") ||
                      "not Set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <UserOutlined /> Assignee
                  </p>
                  <Select
                    showSearch
                    allowClear
                    disabled={
                      !hasPermission(PERMISSION_MASTER.CRM_LEADS_ASSIGN)
                    }
                    placeholder="Assigned To"
                    style={{ width: 200 }}
                    value={formData?.assignedTo || undefined}
                    optionFilterProp="label"
                    onChange={(value) => handleChange("assignedTo", value)}
                    options={assignedList?.map((n) => ({
                      label: formatEmployeeName(n?.userName),
                      value: n?.userProfileId,
                    }))}
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <UserOutlined /> Stage
                  </p>
                  <Select
                    showSearch
                    allowClear
                    placeholder="Stage"
                    style={{ width: 200 }}
                    value={formData?.stage || undefined}
                    optionFilterProp="label"
                    onChange={(value) => handleChange("stage", value)}
                    options={configuredStages
                      .map((stage) => ({
                        label: stage.displayName,
                        value: stage.stageKey,
                      }))}
                  />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                    <FileTextOutlined /> Tags
                  </p>

                  <Select
                    mode="tags"
                    style={{ width: "100%" }}
                    placeholder="Search or add tags..."
                    value={formData?.leadTag || []}
                    onChange={(values) => {
                      setFormData((prev) => ({ ...prev, leadTag: values }));
                    }}
                    tokenSeparators={[","]}
                    showArrow={false}
                    optionLabelProp="label"
                    dropdownStyle={{ padding: "8px" }}
                    tagRender={(props) => {
                      const { label, closable, onClose } = props;
                      const colors = [
                        "#9B59B6",
                        "#4A90E2",
                        "#2ECC71",
                        "#E67E22",
                        "#E74C3C",
                      ];
                      const color =
                        colors[label?.toString()?.length % colors?.length] ||
                        "#4A90E2";
                      return (
                        <Tag
                          color={color}
                          closable={closable}
                          onClose={onClose}
                          style={{
                            marginRight: 4,
                            fontWeight: 500,
                            borderRadius: "6px",
                          }}
                        >
                          {label}
                        </Tag>
                      );
                    }}
                  >
                    {/* Optional predefined tags */}
                    {LEAD_TAGS_CONST?.map((tag) => (
                      <Option key={tag} value={tag} label={tag}>
                        <Tag color="blue" style={{ marginRight: 6 }}>
                          {tag}
                        </Tag>
                        {tag}
                      </Option>
                    ))}
                  </Select>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-2">Add Comments</p>
                  <Input.TextArea
                    placeholder="Write about this lead..."
                    value={formData?.comments}
                    onChange={(e) => handleChange("comments", e.target.value)}
                    autoSize={{ minRows: 2 }}
                  />
                </div>
                {lead?.stage == LEAD_STAGE.NEW && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                      <FileTextOutlined /> Lead Status
                    </p>

                    <Checkbox
                      checked={formData?.status === "RINGING"}
                      disabled={ringingLoading}
                      // disabled={!hasPermission(PERMISSION_MASTER.CRM_LEADS_EDIT)}
                      onChange={async (e) =>
                        handleRingingToggle(e.target.checked)
                      }
                    >
                      Mark as Ringing
                    </Checkbox>
                  </div>
                )}
                {/* ✅ Open Quotation modal button */}
                {/* ✅ Show Send Quote button for all stages EXCEPT NEW */}
                {lead?.stage !== LEAD_STAGE.NEW && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1">
                      <FileTextOutlined /> Send Quote
                    </p>

                    <Button
                      type="default"
                      // block
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent parent card click
                        if (!outletId) {
                          messageApi.error("Outlet not selected");
                          return;
                        }
                        setQuoteOpen(true); // 🔥 OPEN MODAL
                      }}
                    >
                      Send Quote
                    </Button>
                  </div>
                )}

                {/* 📄 QUOTATION MODAL */}
                <Modal
                  title={`Send Quotation to ${toTitleCase(lead?.username, "Lead")}`}
                  open={quoteOpen}
                  onCancel={() => setQuoteOpen(false)}
                  footer={null}
                  width={"50%"}
                  destroyOnHidden={true} // ✅ Clears data when modal closed
                >
                  <QuotationPage lead={lead} />
                </Modal>
              </div>

              <Divider />
              <AssignedHistoryList
                history={formData?.assignedHistory || []}
                getUserNameById={getUserNameById}
              />
              {/* DESCRIPTION */}

              <Divider />

              {/* TABS */}
              <Tabs items={tabItems} defaultActiveKey="details" />
            </div>

            {/* RIGHT PANEL - ACTIVITY */}
            <LeadActivityStream
              activities={activities}
              activitiesCursor={activitiesCursor}
              activityPageLoading={activityPageLoading}
              onLoadMore={() => void loadMoreActivities()}
            />
          </>
        )}
      </Modal>

      <CallLaterModal
        open={callLaterOpen}
        confirmLoading={callLaterSaving}
        form={callLaterForm}
        assignedList={assignedList}
        products={callLaterProducts}
        onOk={() => void handleScheduleCallLater()}
        onCancel={() => {
          if (callLaterSaving) return;
          setCallLaterOpen(false);
          callLaterForm.resetFields();
        }}
      />
    </>
  );
}
