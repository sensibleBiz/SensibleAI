import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  Home,
  Info,
  MapPin,
  Pencil,
  ShieldCheck,
  Sparkles,
  Store,
  X,
  XCircle,
} from "lucide-react";
import type { AppDispatch, RootState } from "@/app/store";
import { outletApi } from "../api/outletApi";
import { setOutletInfo } from "@/app/store";
import { useMessageApi } from "@/shared/hooks";
import { ROUTES_PATHS } from "@/shared/lib/constants";
import AnnualPlansSection from "../components/AnnualPlansSection";

type OutletInfo = RootState["appState"]["outletInfo"];
type DetailSection = "overview" | "billing" | "plans" | "location" | "system";
type DateValue =
  | number
  | string
  | {
      seconds?: number;
      _seconds?: number;
      toMillis?: () => number;
    }
  | null
  | undefined;

type OutletDetail = {
  label: string;
  sensitive?: boolean;
  value: string;
  section: DetailSection;
};
type ReferenceLabels = {
  businessMaster?: string;
  createdBy?: string;
};
type EditableOutletField = "name" | "address" | "city" | "state";

const sectionItems: {
  key: DetailSection;
  label: string;
  icon: ReactNode;
}[] = [
  { key: "overview", label: "Home", icon: <Home size={18} /> },
  { key: "billing", label: "Billing", icon: <CreditCard size={18} /> },
  { key: "plans", label: "Plans", icon: <Sparkles size={18} /> },
  { key: "location", label: "Location", icon: <MapPin size={18} /> },
  { key: "system", label: "System", icon: <Database size={18} /> },
];
const editableOutletFieldsByLabel: Record<
  string,
  {
    field: EditableOutletField;
    required?: boolean;
  }
> = {
  "Business Name": { field: "name", required: true },
  Address: { field: "address" },
  City: { field: "city" },
  State: { field: "state" },
};

export default function OutletDetailsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedSection = (
    location.state as { section?: string } | null
  )?.section;
  const dispatch = useDispatch<AppDispatch>();
  const messageApi = useMessageApi();
  const outletInfo = useSelector(
    (state: RootState) => state.appState.outletInfo
  );
  const postgresAccess = useSelector((state: RootState) => state.auth.postgresAccess);
  const [activeSection, setActiveSection] = useState<DetailSection>(() =>
    sectionItems.some((item) => item.key === requestedSection)
      ? (requestedSection as DetailSection)
      : "overview"
  );
  const [showBusinessId, setShowBusinessId] = useState(false);
  const [editingField, setEditingField] = useState<EditableOutletField | null>(
    null
  );
  const [fieldDraft, setFieldDraft] = useState("");
  const [savingField, setSavingField] = useState<EditableOutletField | null>(
    null
  );

  useEffect(() => {
    if (sectionItems.some((item) => item.key === requestedSection)) {
      setActiveSection(requestedSection as DetailSection);
    }
  }, [location.key, requestedSection]);
  const [referenceLabels, setReferenceLabels] = useState<ReferenceLabels>({});
  const canEditOutletFields = Boolean(postgresAccess?.tenant.isTenantAdmin);
  const canManagePlans = Boolean(postgresAccess?.tenant.isTenantAdmin);
  const details = useMemo(
    () => buildOutletDetails(outletInfo, referenceLabels),
    [outletInfo, referenceLabels]
  );
  const sectionDetails = useMemo(
    () => details.filter((item) => item.section === activeSection),
    [activeSection, details]
  );

  useEffect(() => {
    setReferenceLabels(outletInfo ? {
      businessMaster: "businessName" in outletInfo ? String(outletInfo.businessName) : outletInfo.name,
      createdBy: postgresAccess?.user.displayName,
    } : {});
  }, [outletInfo, postgresAccess?.user.displayName]);

  useEffect(() => {
    setEditingField(null);
    setFieldDraft("");
  }, [outletInfo?.id]);

  useEffect(() => {
    if (!editingField) {
      setFieldDraft("");
    }
  }, [editingField]);

  const handleStartOutletFieldEdit = (field: EditableOutletField) => {
    if (savingField) return;

    setFieldDraft(getOutletEditableValue(outletInfo, field));
    setEditingField(field);
  };

  const handleCancelOutletFieldEdit = () => {
    setFieldDraft("");
    setEditingField(null);
  };

  const handleSaveOutletField = async (
    field: EditableOutletField,
    required = false
  ) => {
    if (!outletInfo?.id) {
      messageApi.error("Outlet not selected");
      return;
    }

    if (!canEditOutletFields) {
      messageApi.error("Only Super Admin can edit this field");
      return;
    }

    const nextValue = fieldDraft.trim();
    if (required && !nextValue) {
      messageApi.error("This field is required");
      return;
    }

    if (nextValue === getOutletEditableValue(outletInfo, field)) {
      handleCancelOutletFieldEdit();
      return;
    }

    setSavingField(field);
    try {
      const updated = await outletApi.update(outletInfo.id, { [field]: nextValue });
      dispatch(setOutletInfo(updated));
      handleCancelOutletFieldEdit();
      messageApi.success(`${getOutletFieldLabel(field)} updated`);
    } catch (error) {
      console.error("Outlet field update failed:", error);
      messageApi.error(`Failed to update ${getOutletFieldLabel(field)}`);
    } finally {
      setSavingField(null);
    }
  };

  if (!outletInfo) {
    return (
      <div className="min-h-screen bg-white px-4 py-6 text-[#202124] dark:bg-[#1f2021] dark:text-white">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[#0b57d0] transition hover:bg-[#e8f0fe] dark:text-[#a8c7fa] dark:hover:bg-white/10"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="mx-auto mt-8 max-w-2xl rounded-lg border border-[#dadce0] bg-white p-6 text-center shadow-sm dark:border-white/10 dark:bg-[#303134]">
          <Store className="mx-auto text-[#8ab4f8]" size={44} />
          <h1 className="mt-4 text-2xl font-semibold">Outlet details</h1>
          <p className="mt-2 text-sm text-[#5f6368] dark:text-white/70">
            No outlet is currently selected.
          </p>
          <button
            type="button"
            onClick={() => navigate(ROUTES_PATHS.OUTLETS)}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-[#8ab4f8] px-4 py-2 text-sm font-semibold text-[#162033] transition hover:bg-[#a8c7fa]"
          >
            <ArrowLeft size={16} />
            Select outlet
          </button>
        </div>
      </div>
    );
  }

  const initials = getOutletInitials(outletInfo.name);
  const isActive = outletInfo.active;
  const businessId = outletInfo.id || "";

  return (
    <div className="min-h-screen bg-white text-[#202124] dark:bg-[#1f2021] dark:text-white">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[250px_1fr]">
        <aside className="border-b border-[#dadce0] px-4 py-5 dark:border-white/10 lg:border-b-0 lg:border-r">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mb-5 inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold text-[#0b57d0] transition hover:bg-[#e8f0fe] dark:text-[#a8c7fa] dark:hover:bg-white/10"
          >
            <ArrowLeft size={16} />
            Back
          </button>

          <div className="mb-8 flex items-center gap-2 text-lg font-semibold">
            <Store size={22} className="text-[#8ab4f8]" />
            Sensible Account
          </div>

          <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sectionItems.map((item) => {
              const active = item.key === activeSection;

              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  className={`flex min-w-fit items-center gap-3 rounded-full px-4 py-3 text-left text-sm font-semibold transition lg:w-full ${
                    active
                      ? "bg-[#0b57d0] text-white"
                      : "text-[#202124] hover:bg-[#f1f3f4] dark:text-white/82 dark:hover:bg-white/10"
                  }`}
                >
                  <span
                    className={`grid h-8 w-8 place-items-center rounded-full ${
                      active ? "bg-[#d3e3fd] text-[#0b57d0]" : "bg-[#6fcf97] text-[#102116]"
                    }`}
                  >
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="px-4 py-8 sm:px-8">
          <div
            className={`mx-auto flex w-full flex-col items-center ${
              activeSection === "plans" ? "max-w-7xl" : "max-w-4xl"
            }`}
          >
            {activeSection !== "plans" && (
              <>
                <div className="grid h-28 w-28 place-items-center rounded-full bg-[#fbbc04] text-4xl font-bold text-[#202124]">
                  {initials}
                </div>

                <h1 className="mt-5 text-center text-3xl font-semibold">
                  {outletInfo.name}
                </h1>
                <div className="mt-1 inline-flex items-center gap-2 text-center text-sm text-[#5f6368] dark:text-white/72">
                  <span>
                    {businessId
                      ? formatSensitiveValue(businessId, showBusinessId)
                      : "Business ID not available"}
                  </span>
                  {businessId && (
                    <VisibilityToggle
                      visible={showBusinessId}
                      onToggle={() => setShowBusinessId((visible) => !visible)}
                    />
                  )}
                </div>

                <div className="mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
                  <QuickChip icon={<Info size={15} />} label={outletInfo.branch || "Branch"} />
                  <QuickChip icon={<MapPin size={15} />} label={joinParts([outletInfo.city, outletInfo.state])} />
                  <QuickChip
                    icon={
                      isActive ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <XCircle size={15} />
                      )
                    }
                    label={isActive ? "Active" : "Inactive"}
                  />
                  <QuickChip icon={<CreditCard size={15} />} label={outletInfo.billingType || "Billing"} />
                </div>
              </>
            )}

            {activeSection === "plans" ? (
              <AnnualPlansSection canManagePlans={canManagePlans} />
            ) : (
              <>
            <section className="mt-8 w-full max-w-2xl overflow-hidden rounded-lg border border-[#dadce0] bg-white shadow-sm dark:border-transparent dark:bg-[#303134]">
              <div className="flex items-start gap-4 border-b border-[#dadce0] bg-[#f8fafd] p-5 dark:border-[#1f2021] dark:bg-[#303134]">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#a8c7fa] text-[#0b1f3a]">
                  {getSectionIcon(activeSection)}
                </div>
                <div>
                  <h2 className="text-base font-semibold">
                    {getSectionTitle(activeSection)}
                  </h2>
                  <p className="mt-1 text-sm text-[#5f6368] dark:text-white/70">
                    {getSectionSubtitle(activeSection, outletInfo)}
                  </p>
                </div>
              </div>

              <div className="divide-y divide-[#dadce0] dark:divide-[#1f2021]">
                {sectionDetails.length > 0 ? (
                  sectionDetails.map((item) => {
                    const editableField = editableOutletFieldsByLabel[item.label];

                    return (
                      <DetailRow
                        key={`${item.section}-${item.label}`}
                        label={item.label}
                        value={
                          editableField && canEditOutletFields ? (
                            <EditableOutletFieldEditor
                              draftValue={fieldDraft}
                              editing={editingField === editableField.field}
                              label={item.label}
                              saving={savingField === editableField.field}
                              value={item.value}
                              onCancel={handleCancelOutletFieldEdit}
                              onChange={setFieldDraft}
                              onEdit={() =>
                                handleStartOutletFieldEdit(editableField.field)
                              }
                              onSave={() =>
                                handleSaveOutletField(
                                  editableField.field,
                                  editableField.required
                                )
                              }
                            />
                          ) : item.sensitive ? (
                            formatSensitiveValue(item.value, showBusinessId)
                          ) : (
                            item.value
                          )
                        }
                        action={
                          item.sensitive && item.value !== "-" ? (
                            <VisibilityToggle
                              visible={showBusinessId}
                              onToggle={() =>
                                setShowBusinessId((visible) => !visible)
                              }
                            />
                          ) : undefined
                        }
                      />
                    );
                  })
                ) : (
                  <div className="p-5 text-sm text-[#5f6368] dark:text-white/70">
                    No matching details found.
                  </div>
                )}
              </div>
            </section>

            <section className="mt-4 w-full max-w-2xl rounded-lg border border-[#dadce0] bg-white p-5 shadow-sm dark:border-transparent dark:bg-[#303134]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold">Renewal status</h2>
                  <p className="mt-1 text-sm text-[#5f6368] dark:text-white/70">
                    {getRenewalSummary(outletInfo.renewalDate)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeSection === "billing" && (
                    <button
                      type="button"
                      onClick={() => setActiveSection("plans")}
                      className="inline-flex items-center justify-center rounded-md bg-[#0b57d0] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0842a0] dark:bg-[#a8c7fa] dark:text-[#0b1f3a] dark:hover:bg-[#d3e3fd]"
                    >
                      Check plans
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => navigate(ROUTES_PATHS.OUTLETS)}
                    className="inline-flex items-center justify-center rounded-md border border-[#dadce0] px-4 py-2 text-sm font-semibold text-[#0b57d0] transition hover:bg-[#e8f0fe] dark:border-white/24 dark:text-[#a8c7fa] dark:hover:bg-white/10"
                  >
                    Change business
                  </button>
                </div>
              </div>
            </section>
              </>
            )}

          </div>
        </main>
      </div>
    </div>
  );
}

function QuickChip({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-md border border-[#dadce0] px-3 py-2 text-sm font-semibold text-[#202124] dark:border-white/24 dark:text-white">
      <span className="text-[#0b57d0] dark:text-[#a8c7fa]">{icon}</span>
      <span className="truncate">{label || "-"}</span>
    </span>
  );
}

function VisibilityToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#0b57d0] transition hover:bg-[#e8f0fe] dark:text-[#a8c7fa] dark:hover:bg-white/10"
      aria-label={visible ? "Hide Business ID" : "Show Business ID"}
      title={visible ? "Hide Business ID" : "Show Business ID"}
    >
      {visible ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  );
}

function EditableOutletFieldEditor({
  draftValue,
  editing,
  label,
  onCancel,
  onChange,
  onEdit,
  onSave,
  saving,
  value,
}: {
  draftValue: string;
  editing: boolean;
  label: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onEdit: () => void;
  onSave: () => void;
  saving: boolean;
  value: string;
}) {
  if (!editing) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 break-words">{value || "-"}</span>
        <IconButton
          label={`Edit ${label}`}
          onClick={onEdit}
          icon={<Pencil size={16} />}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
      <input
        type="text"
        value={draftValue}
        disabled={saving}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSave();
          if (event.key === "Escape") onCancel();
        }}
        className="min-h-10 min-w-0 flex-1 rounded-md border border-[#dadce0] bg-white px-3 py-2 text-sm text-[#202124] outline-none transition focus:border-[#0b57d0] focus:ring-2 focus:ring-[#d3e3fd] disabled:cursor-not-allowed disabled:bg-[#f1f3f4] dark:border-white/24 dark:bg-[#1f2021] dark:text-white dark:focus:border-[#a8c7fa] dark:focus:ring-white/10"
        autoFocus
      />
      <div className="flex items-center gap-1">
        <IconButton
          disabled={saving}
          label={`Save ${label}`}
          onClick={onSave}
          icon={<Check size={16} />}
        />
        <IconButton
          disabled={saving}
          label={`Cancel ${label} edit`}
          onClick={onCancel}
          icon={<X size={16} />}
        />
      </div>
    </div>
  );
}

function IconButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#0b57d0] transition hover:bg-[#e8f0fe] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#a8c7fa] dark:hover:bg-white/10"
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

function DetailRow({
  action,
  label,
  value,
}: {
  action?: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-1 p-5 sm:grid-cols-[180px_1fr] sm:gap-5">
      <dt className="text-sm font-semibold text-[#5f6368] dark:text-white/72">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center gap-2 text-sm text-[#202124] dark:text-white">
        {typeof value === "string" ? (
          <span className="min-w-0 break-words">{value || "-"}</span>
        ) : (
          value
        )}
        {action}
      </dd>
    </div>
  );
}

function buildOutletDetails(
  outletInfo: OutletInfo,
  referenceLabels: ReferenceLabels = {}
): OutletDetail[] {
  if (!outletInfo) return [];

  return [
    { label: "Business Name", value: outletInfo.name || "-", section: "overview" },
    {
      label: "Business ID",
      sensitive: true,
      value: outletInfo.id || "-",
      section: "overview",
    },
    { label: "Branch", value: outletInfo.branch || "-", section: "overview" },
    {
      label: "Status",
      value: outletInfo.active ? "Active" : "Inactive",
      section: "overview",
    },
    {
      label: "Billing Type",
      value: outletInfo.billingType || "-",
      section: "billing",
    },
    {
      label: "Created Date",
      value: formatDateValue(outletInfo.createdDate),
      section: "billing",
    },
    {
      label: "Last Renewal Date",
      value: formatDateValue(getLastRenewalDate(outletInfo)),
      section: "billing",
    },
    {
      label: "Renewal Date",
      value: formatDateValue(outletInfo.renewalDate),
      section: "billing",
    },
    {
      label: "Renewal Days",
      value: getRenewalDays(outletInfo.renewalDate),
      section: "billing",
    },
    { label: "Address", value: outletInfo.address || "-", section: "location" },
    { label: "City", value: outletInfo.city || "-", section: "location" },
    { label: "State", value: outletInfo.state || "-", section: "location" },
    {
      label: "Coordinates",
      value: formatLocation(outletInfo.latLang),
      section: "location",
    },
    {
      label: "Created Date",
      value: formatDateValue(outletInfo.createdDate),
      section: "system",
    },
    {
      label: "Business Master",
      value:
        referenceLabels.businessMaster ||
        formatReference(outletInfo.businessMaster),
      section: "system",
    },
    {
      label: "Created By",
      value:
        referenceLabels.createdBy || formatReferenceId(outletInfo.createdBy),
      section: "system",
    },
  ];
}

function getOutletEditableValue(
  outletInfo: OutletInfo,
  field: EditableOutletField
) {
  if (!outletInfo) return "";

  return String(outletInfo[field] || "");
}

function getOutletFieldLabel(field: EditableOutletField) {
  switch (field) {
    case "name":
      return "Business name";
    case "address":
      return "Address";
    case "city":
      return "City";
    case "state":
      return "State";
    default:
      return "Field";
  }
}

function getSectionIcon(section: DetailSection) {
  switch (section) {
    case "billing":
      return <CreditCard size={20} />;
    case "plans":
      return <Sparkles size={20} />;
    case "location":
      return <MapPin size={20} />;
    case "system":
      return <ShieldCheck size={20} />;
    default:
      return <Building2 size={20} />;
  }
}

function getSectionTitle(section: DetailSection) {
  switch (section) {
    case "billing":
      return "Payments and renewal";
    case "plans":
      return "CRM subscription plans";
    case "location":
      return "Location details";
    case "system":
      return "System records";
    default:
      return "Business overview";
  }
}

function getSectionSubtitle(section: DetailSection, outletInfo: NonNullable<OutletInfo>) {
  switch (section) {
    case "billing":
      return `${outletInfo.billingType || "Billing"} account details`;
    case "plans":
      return "Compare Silver, Gold, and Platinum annual plans";
    case "location":
      return joinParts([outletInfo.city, outletInfo.state]) || "Office address";
    case "system":
      return "Created and linked record information";
    default:
      return outletInfo.branch || "Primary outlet information";
  }
}

function getOutletInitials(name?: string) {
  const words = String(name || "Outlet")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return (words[0]?.slice(0, 2) || "OU").toUpperCase();
}

function joinParts(parts: Array<string | undefined>) {
  return parts.filter((part) => part?.trim()).join(", ");
}

function formatSensitiveValue(value: string, visible: boolean) {
  if (visible || value === "-") return value;

  const visibleSuffixLength = Math.min(4, value.length);
  const maskedLength = Math.max(value.length - visibleSuffixLength, 4);
  const visibleSuffix = value.slice(-visibleSuffixLength);

  return `${"*".repeat(Math.min(maskedLength, 12))}${visibleSuffix}`;
}

function formatDateValue(value?: DateValue) {
  if (!value) return "-";

  const timestamp = parseDateMs(value);
  if (!timestamp) {
    return typeof value === "string" && value.trim() ? value : "-";
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLastRenewalDate(outletInfo: NonNullable<OutletInfo>): DateValue {
  const outletRecord = outletInfo as unknown as Record<string, unknown>;
  const renewalFieldNames = [
    "lastRenewalDate",
    "lastRenewedDate",
    "lastRenewalAt",
    "lastRenewedAt",
    "lastRenewalOn",
    "lastRenewedOn",
    "previousRenewalDate",
    "previousRenewedDate",
    "renewedDate",
    "renewalStartDate",
    "subscriptionStartDate",
  ];

  for (const fieldName of renewalFieldNames) {
    const value = outletRecord[fieldName];
    if (hasDateValue(value)) return value as DateValue;
  }

  return undefined;
}

function hasDateValue(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return Boolean(value.trim());
  return true;
}

function getRenewalDays(value?: DateValue) {
  const timestamp = parseDateMs(value);
  if (!timestamp) return "-";

  const days = Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1000));
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} remaining`;
  if (days === 0) return "Due today";

  const overdueDays = Math.abs(days);
  return `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`;
}

function getRenewalSummary(value?: DateValue) {
  const renewalDate = formatDateValue(value);
  const renewalDays = getRenewalDays(value);

  if (renewalDate === "-") return "Renewal information is not available.";
  return `${renewalDate} - ${renewalDays}`;
}

function parseDateMs(value?: DateValue) {
  if (!value) return undefined;

  if (typeof value === "object") {
    if (typeof value.toMillis === "function") {
      const timestamp = value.toMillis();
      return Number.isFinite(timestamp) ? timestamp : undefined;
    }

    const seconds = value.seconds ?? value._seconds;
    return Number.isFinite(seconds) ? Number(seconds) * 1000 : undefined;
  }

  const numericValue =
    typeof value === "string" && value.trim() && !Number.isNaN(Number(value))
      ? Number(value)
      : value;
  const timestamp =
    typeof numericValue === "number" && numericValue < 946684800000
      ? numericValue * 1000
      : numericValue;
  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

function formatLocation(value: unknown) {
  const location = value as {
    latitude?: unknown;
    longitude?: unknown;
    _lat?: unknown;
    _long?: unknown;
  };
  const latitude = Number(location?.latitude ?? location?._lat);
  const longitude = Number(location?.longitude ?? location?._long);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "-";

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function formatReference(value: unknown) {
  if (!value) return "-";
  if (typeof value === "string") return value;

  if (typeof value === "object") {
    const reference = getReferencePath(value) || getReferenceId(value);
    return reference || "-";
  }

  return String(value);
}

function formatReferenceId(value: unknown) {
  return getReferenceId(value) || "-";
}


function getReferenceId(value: unknown) {
  if (!value) return undefined;

  if (typeof value === "string") {
    return value.includes("/") ? value.split("/").pop() : value;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const referencePath = getReferencePath(record);
    if (referencePath) return referencePath.split("/").pop();

    return typeof record.id === "string" ? record.id : undefined;
  }

  return undefined;
}

function getReferencePath(value: unknown) {
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  const directPath =
    getStringValue(record.path) || getStringValue(record.referencePath);
  if (directPath) return directPath;

  const parentPath = getStringValue(record.parentPath);
  const id = getStringValue(record.id);
  if (parentPath && id) return `${parentPath}/${id}`;

  return getSerializedFirestorePath(record);
}

function getSerializedFirestorePath(record: Record<string, unknown>) {
  const key = getRecordValue(record._key);
  const path = getRecordValue(key?.path);
  const rawSegments = path?.segments;

  if (!Array.isArray(rawSegments)) return undefined;

  const segments = rawSegments
    .map((segment) => String(segment))
    .filter(Boolean);
  const documentsIndex = segments.indexOf("documents");
  const documentSegments =
    documentsIndex >= 0 ? segments.slice(documentsIndex + 1) : segments;

  return documentSegments.length >= 2 ? documentSegments.join("/") : undefined;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getRecordValue(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

