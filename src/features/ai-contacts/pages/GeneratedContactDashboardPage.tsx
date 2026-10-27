import { useEffect, useState } from "react";
import { Alert, Button, Select, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ArrowLeft, Database, FileSpreadsheet, Phone } from "lucide-react";
import { useSelector } from "react-redux";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa";
import { useMessageApi } from "@/shared/hooks";
import { usePermission } from "@/features/access-control";
import {
  getGeneratedContactImportDetails,
  listGeneratedContactImports,
  reassignGeneratedContact,
  type GeneratedContactDetail,
  type GeneratedContactImportDetail,
  type GeneratedContactImportSummary,
} from "@/features/ai-contacts/api/generatedContactService";
import type { RootState } from "@/app/store";
import { PERMISSION_MASTER, ROUTES_PATHS } from "@/shared/lib/constants";

const STATUS_CARDS = [
  { key: "PENDING", label: "Pending" },
  { key: "CALLED", label: "Called" },
  { key: "RINGING", label: "Ringing" },
  { key: "TRANSFERRED", label: "Transferred" },
  { key: "INTERESTED", label: "Interested" },
  { key: "NOT_INTERESTED", label: "Not Interested" },
] as const;

const normalizeStatus = (status: string) => {
  const normalized = status.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!normalized || normalized === "OPEN" || normalized === "NEW") return "PENDING";
  return normalized === "NOTINTERESTED" ? "NOT_INTERESTED" : normalized;
};

const labelFor = (field: string) => field
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const displayValue = (value: string | number | boolean | null) => {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const FIELD_ORDER = ["name", "mobile", "email", "category", "city", "address", "source"];

const whatsappNumber = (mobile: string) => {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

const formattedEventDate = (eventDateTime: string | number) => {
  const date = new Date(eventDateTime);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
};

const openWhatsAppEventShare = async (
  mobile: string,
  eventName: string,
  eventCity: string,
  eventDescription: string,
  eventDateTime: string | number,
  eventImageUrl: string,
  registrationLink: string,
) => {
  const eventDate = formattedEventDate(eventDateTime);
  const locationLine = eventCity
    ? `Join us for an exclusive event in ${eventCity}.`
    : "Join us for an exclusive event.";
  const details = eventDescription ||
    "Discover how an AI-powered CRM can help you recruit and manage dealers, streamline lead management, improve follow-ups, and accelerate sales growth.";
  const lines = [
    `🚀 ${eventName}`,
    "Dear Manufacturer,",
    locationLine,
    details,
    eventDate ? `Event date: ${eventDate}` : "",
    "Limited seats available—reserve your spot today!",
    "Sensible Connect Solutions Pvt Ltd",
    `Register here: ${registrationLink}`,
  ].filter(Boolean);
  const url = `https://web.whatsapp.com/send?phone=${encodeURIComponent(
    whatsappNumber(mobile),
  )}&text=${encodeURIComponent(lines.join("\n\n"))}`;
  window.open(url, "_blank", "noopener,noreferrer");

  if (!eventImageUrl || !navigator.clipboard?.write || !globalThis.ClipboardItem) {
    return false;
  }

  try {
    const response = await fetch(eventImageUrl);
    if (!response.ok) return false;
    const poster = await response.blob();
    const mimeType = poster.type || "image/png";
    await navigator.clipboard.write([
      new ClipboardItem({ [mimeType]: poster }),
    ]);
    return true;
  } catch {
    return false;
  }
};

interface GeneratedContactDashboardPageProps {
  embedded?: boolean;
  embeddedImportId?: string;
}

export default function GeneratedContactDashboardPage({
  embedded = false,
  embeddedImportId,
}: GeneratedContactDashboardPageProps) {
  const { importId: routeImportId = "" } = useParams<{ importId: string }>();
  const [searchParams] = useSearchParams();
  const importId = embeddedImportId || routeImportId;
  const importMonth = searchParams.get("month") || undefined;
  const navigate = useNavigate();
  const messageApi = useMessageApi();
  const { hasPermission } = usePermission();
  const canUpdate = hasPermission(PERMISSION_MASTER.CRM_CONTACT_UPLOAD_UPDATE);
  const outletInfo = useSelector((state: RootState) => state.appState.outletInfo);
  const teamTree = useSelector((state: RootState) => state.appState.teamTreeData || []);
  const [summary, setSummary] = useState<GeneratedContactImportSummary>();
  const [detail, setDetail] = useState<GeneratedContactImportDetail>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reassigningId, setReassigningId] = useState<string>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_CARDS)[number]["key"]>();

  const assignableEmployees = teamTree
    .filter((member) => member.isActive)
    .sort((left, right) => left.userName.localeCompare(right.userName));

  const employeeOptionLabel = (employee: (typeof assignableEmployees)[number]) => {
    const code = employee.empCode ? ` (${employee.empCode})` : "";
    const department = employee.department?.trim()
      ? ` · ${employee.department.trim()}`
      : "";
    return `${employee.userName}${code}${department}`;
  };

  useEffect(() => {
    if (!outletInfo?.id || !importId) return;
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      listGeneratedContactImports(outletInfo.id, importMonth),
      getGeneratedContactImportDetails(outletInfo.id, importId),
    ])
      .then(([imports, importedContacts]) => {
        if (!active) return;
        setSummary(imports.find((item) => item.importId === importId));
        setDetail(importedContacts);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to load this contact dashboard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [importId, importMonth, outletInfo?.id]);

  const reassign = async (contactId: string, assignedUserId: string) => {
    if (!outletInfo?.id) return;
    setReassigningId(contactId);
    try {
      const assignment = await reassignGeneratedContact(outletInfo.id, contactId, assignedUserId);
      setDetail((current) => current ? {
        ...current,
        contacts: current.contacts.map((contact) =>
          contact.id === contactId ? { ...contact, ...assignment } : contact,
        ),
      } : current);
      messageApi.success(`Contact reassigned to ${assignment.assignedUserName}.`);
    } catch (caught) {
      messageApi.error(caught instanceof Error ? caught.message : "Unable to reassign this contact.");
    } finally {
      setReassigningId(undefined);
    }
  };

  const contacts = detail?.contacts ?? [];
  const statusCounts = Object.fromEntries(
    STATUS_CARDS.map(({ key }) => [
      key,
      contacts.filter((contact) => normalizeStatus(contact.status) === key).length,
    ]),
  ) as Record<(typeof STATUS_CARDS)[number]["key"], number>;
  const filteredContacts = statusFilter
    ? contacts.filter((contact) => normalizeStatus(contact.status) === statusFilter)
    : contacts;
  const excelFields = Array.from(
    new Set(contacts.flatMap((contact) => Object.keys(contact.values))),
  ).sort((left, right) => {
    const leftIndex = FIELD_ORDER.indexOf(left.toLowerCase());
    const rightIndex = FIELD_ORDER.indexOf(right.toLowerCase());
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });

  const shareOnWhatsApp = (contact: GeneratedContactDetail) => {
    void openWhatsAppEventShare(
      contact.mobile,
      contact.eventName || summary?.eventName || summary?.uploadName || "our event",
      contact.eventCity || "",
      contact.eventDescription || "",
                                contact.eventDateTime || "",
      contact.eventImageUrl || "",
      contact.eventRegistrationLink || "",
    ).then((posterCopied) => {
      if (posterCopied) {
        messageApi.success("Poster copied. In WhatsApp Web, press Ctrl+V to attach it, then send.");
      } else {
        messageApi.warning("WhatsApp Web opened, but the browser could not copy the poster. Attach it manually.");
      }
    });
  };

  const columns: ColumnsType<GeneratedContactDetail> = [
    {
      title: "Row",
      dataIndex: "excelRowNumber",
      key: "excelRowNumber",
      width: 58,
      align: "center",
      sorter: (left, right) => left.excelRowNumber - right.excelRowNumber,
    },
    ...excelFields.map((field) => ({
      title: labelFor(field),
      key: `excel-${field}`,
      render: (_value: unknown, contact: GeneratedContactDetail) => {
        const value = displayValue(contact.values[field] ?? null);
        return (
          <div
            title={value}
            className="whitespace-normal break-all leading-5 text-slate-700"
          >
            {value}
          </div>
        );
      },
    })),
    {
      title: "Status",
      key: "status",
      width: 105,
      render: (_value, contact) => {
        const statusKey = normalizeStatus(contact.status);
        const statusLabel = STATUS_CARDS.find((item) => item.key === statusKey)?.label ?? labelFor(statusKey);
        return (
          <div>
            <Tag color={statusKey === "CALLED" || statusKey === "INTERESTED" ? "green" : statusKey === "NOT_INTERESTED" ? "red" : "default"}>
              {statusLabel}
            </Tag>
            <div className="mt-1 text-xs text-slate-500">{contact.status || "OPEN"}</div>
          </div>
        );
      },
    },
    {
      title: "Assigned Employee",
      key: "assignedEmployee",
      width: 205,
      render: (_value, contact) => canUpdate ? (
        <Select
          showSearch
          optionFilterProp="label"
          className="w-full"
          value={contact.assignedUserId || undefined}
          loading={reassigningId === contact.id}
          disabled={Boolean(reassigningId)}
          placeholder="Assign employee"
          onChange={(assignedUserId) => void reassign(contact.id, assignedUserId)}
          options={assignableEmployees.map((employee) => ({
            value: employee.userProfileId,
            label: employeeOptionLabel(employee),
          }))}
        />
      ) : (
        <div>
          <div className="font-medium text-slate-800">{contact.assignedUserName || "Unassigned"}</div>
          {contact.assignedEmployeeCode && <div className="text-xs text-slate-500">{contact.assignedEmployeeCode}</div>}
        </div>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      width: 84,
      align: "center",
      render: (_value, contact) => (
        <div className="flex items-center justify-center gap-1">
          {contact.mobile && contact.eventRegistrationLink && (
            <Button
              type="text"
              shape="circle"
              title="Share event on WhatsApp Web"
              aria-label={`Share event with ${contact.name || contact.mobile} on WhatsApp`}
              className="!bg-green-50 !text-[#25D366] hover:!bg-green-100"
              icon={<FaWhatsapp size={19} />}
              onClick={() => shareOnWhatsApp(contact)}
            />
          )}
          {contact.mobile && (
            <Button
              type="text"
              shape="circle"
              href={`tel:${contact.mobile}`}
              title="Call contact"
              aria-label={`Call ${contact.name || contact.mobile}`}
              className="!bg-blue-50 !text-blue-600 hover:!bg-blue-100"
              icon={<Phone size={17} />}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className={embedded ? "w-full min-w-0" : "w-full min-w-0 space-y-4 p-1 sm:p-3"}>
      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-blue-600">
              <Database size={16} /> AI Intelligence
            </div>
            <h1 className="m-0 text-2xl font-bold text-slate-900">Uploaded Contact Dashboard</h1>
          </div>
          <Button icon={<ArrowLeft size={16} />} onClick={() => navigate(ROUTES_PATHS.GENERATED_CONTACT_UPLOAD)}>
            Back to uploads
          </Button>
        </div>
      )}

      {error && <Alert type="error" showIcon message="Dashboard unavailable" description={error} />}

      <div className="min-h-48 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50 px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                  <FileSpreadsheet size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-600">Contacts Management</div>
                  <div className="mt-0.5 truncate text-lg font-bold text-slate-900 sm:text-xl" title={summary?.uploadName || summary?.eventName}>
                    {summary?.uploadName || summary?.eventName || "Uploaded contacts"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{summary?.fileName || "Uploaded Excel"}</span>
                    <span aria-hidden="true">•</span>
                    <span>{contacts.length.toLocaleString()} contacts</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
                {summary?.uploadedDateTime ? (
                  <span className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-slate-600 shadow-sm">
                    Uploaded {new Date(summary.uploadedDateTime).toLocaleString("en-IN")}
                  </span>
                ) : null}
                <span className="rounded-md bg-blue-100 px-3 py-1.5 font-semibold text-blue-700">
                  {summary?.uploadType === "EVENT" ? "Event" : summary?.uploadType === "OTHER" ? "Other" : "Upload"}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50/80 px-4 py-4 sm:px-6">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 sm:gap-3">
              {STATUS_CARDS.map((status) => (
                <button
                  key={status.key}
                  type="button"
                  aria-pressed={statusFilter === status.key}
                  className={`rounded-lg border px-3 py-3 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                    statusFilter === status.key
                      ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                  }`}
                  onClick={() => {
                    setStatusFilter((current) => current === status.key ? undefined : status.key);
                    setPage(1);
                  }}
                >
                  <div className="text-xl font-bold leading-none text-blue-600">{statusCounts[status.key]}</div>
                  <div className="mt-1.5 break-words text-xs font-medium leading-tight text-slate-600">
                    {status.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

        <div className="p-3 sm:p-5">
          <Table<GeneratedContactDetail>
            rowKey="id"
            bordered
            size="small"
            className="[&_.ant-table-cell]:align-top [&_.ant-table-cell]:!px-2 [&_.ant-table-cell]:!py-2 [&_.ant-table-thead_.ant-table-cell]:!text-xs [&_.ant-table-tbody_.ant-table-cell]:!text-xs"
            loading={loading}
            columns={columns}
            dataSource={filteredContacts}
            tableLayout="fixed"
            scroll={{ y: 560 }}
            pagination={{
              current: page,
              pageSize,
              total: filteredContacts.length,
              showSizeChanger: true,
              pageSizeOptions: [10, 25, 50, 100],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} contacts`,
              onChange: (nextPage, nextSize) => {
                setPage(nextSize === pageSize ? nextPage : 1);
                setPageSize(nextSize);
              },
            }}
            locale={{
              emptyText: loading
                ? "Loading contacts..."
                : statusFilter
                  ? `No ${STATUS_CARDS.find((item) => item.key === statusFilter)?.label ?? "matching"} contacts`
                  : "No contacts found in this upload",
            }}
          />
        </div>
      </div>
    </div>
  );
}
