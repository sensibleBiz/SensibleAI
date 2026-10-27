import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, DatePicker, Empty, Input, InputNumber, Modal, Pagination, Progress, Select, Spin, Table, Tag, Upload } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import {
  CalendarDays,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Phone,
  Plus,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import type { RootState } from "@/app/store";
import { useMessageApi } from "@/shared/hooks";
import {
  parseGeneratedContactWorkbook,
  type GeneratedContactPreview,
  type GeneratedContactRow,
} from "@/features/ai-contacts/utils/generatedContactExcel";
import {
  listGeneratedContactImports,
  getGeneratedContactImportDetails,
  reassignGeneratedContact,
  storeGeneratedContacts,
  type GeneratedContactAssignee,
  type GeneratedContactImportDetail,
  type GeneratedContactImportSummary,
} from "@/features/ai-contacts/api/generatedContactService";
import { getEvents } from "@/features/events";
import type { EventItem } from "@/features/events";
import { usePermission } from "@/features/access-control";
import { PERMISSION_MASTER, ROUTES_PATHS } from "@/shared/lib/constants";

interface EmployeeAllocation {
  key: string;
  employeeId?: string;
  count: number | null;
}

const newAllocation = (): EmployeeAllocation => ({
  key: `${Date.now()}-${Math.random()}`,
  count: null,
});

const CONTACT_STATUS_CARDS = [
  { key: "PENDING", label: "Pending" },
  { key: "CALLED", label: "Called" },
  { key: "RINGING", label: "Ringing" },
  { key: "TRANSFERRED", label: "Transferred" },
  { key: "INTERESTED", label: "Interested" },
  { key: "NOT_INTERESTED", label: "Not Interested" },
] as const;

const normalizedContactStatus = (status: string) => {
  const normalized = status.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!normalized || normalized === "OPEN" || normalized === "NEW") return "PENDING";
  if (normalized === "NOTINTERESTED") return "NOT_INTERESTED";
  return normalized;
};

const fieldLabel = (field: string) => field
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const fieldValue = (value: string | number | boolean | null) => {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

export default function GeneratedContactUploadPage() {
  const navigate = useNavigate();
  const { importId: routeImportId } = useParams<{ importId?: string }>();
  const outletInfo = useSelector((state: RootState) => state.appState.outletInfo);
  const user = useSelector((state: RootState) => state.auth.user);
  const teamTree = useSelector((state: RootState) => state.appState.teamTreeData || []);
  const messageApi = useMessageApi();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission(PERMISSION_MASTER.CRM_CONTACT_UPLOAD_CREATE);
  const canUpdate = hasPermission(PERMISSION_MASTER.CRM_CONTACT_UPLOAD_UPDATE);
  const [preview, setPreview] = useState<GeneratedContactPreview | null>(null);
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [allocations, setAllocations] = useState<EmployeeAllocation[]>([]);
  const [previousUploads, setPreviousUploads] = useState<
    GeneratedContactImportSummary[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [uploadMonth, setUploadMonth] = useState(dayjs().format("YYYY-MM"));
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string>();
  const [uploadType, setUploadType] = useState<"EVENT" | "OTHER">();
  const [otherUploadName, setOtherUploadName] = useState("");
  const [selectedUpload, setSelectedUpload] = useState<GeneratedContactImportSummary>();
  const [importDetail, setImportDetail] = useState<GeneratedContactImportDetail>();
  const [detailLoading, setDetailLoading] = useState(false);
  const [reassigningContactId, setReassigningContactId] = useState<string>();
  const [detailPage, setDetailPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(10);

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

  const loadPreviousUploads = useCallback(async () => {
    if (!outletInfo?.id) {
      setPreviousUploads([]);
      return;
    }
    setHistoryLoading(true);
    try {
      setPreviousUploads(await listGeneratedContactImports(outletInfo.id, uploadMonth));
    } catch {
      setPreviousUploads([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [outletInfo?.id, uploadMonth]);

  useEffect(() => {
    void loadPreviousUploads();
  }, [loadPreviousUploads]);

  useEffect(() => {
    setUploadType(undefined);
    setOtherUploadName("");
    setSelectedEventId(undefined);
    setEvents([]);
    if (!outletInfo?.id) return;

    let active = true;
    setEventsLoading(true);
    void getEvents({ outletId: outletInfo.id })
      .then((items) => {
        if (active) setEvents(items);
      })
      .catch(() => {
        if (active) setEvents([]);
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [outletInfo?.id]);

  const reset = () => {
    if (uploading) return;
    setPreview(null);
    setError("");
    setProgress(0);
    setSavedCount(null);
    setAllocations([]);
  };

  const openUploadDetails = useCallback(async (upload: GeneratedContactImportSummary) => {
    if (!outletInfo?.id) return;
    setSelectedUpload(upload);
    setImportDetail(undefined);
    setDetailPage(1);
    setDetailLoading(true);
    try {
      setImportDetail(
        await getGeneratedContactImportDetails(outletInfo.id, upload.importId),
      );
    } catch (caught) {
      messageApi.error(
        caught instanceof Error ? caught.message : "Unable to load uploaded contacts.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, [messageApi, outletInfo?.id]);

  const reassignContact = async (contactId: string, assignedUserId: string) => {
    if (!outletInfo?.id) return;
    setReassigningContactId(contactId);
    try {
      const assignment = await reassignGeneratedContact(
        outletInfo.id,
        contactId,
        assignedUserId,
      );
      setImportDetail((current) => current ? {
        ...current,
        contacts: current.contacts.map((contact) =>
          contact.id === contactId ? { ...contact, ...assignment } : contact,
        ),
      } : current);
      void loadPreviousUploads();
      messageApi.success(`Contact reassigned to ${assignment.assignedUserName}.`);
    } catch (caught) {
      messageApi.error(
        caught instanceof Error ? caught.message : "Unable to reassign this contact.",
      );
    } finally {
      setReassigningContactId(undefined);
    }
  };

  const showUploadDashboard = (upload: GeneratedContactImportSummary) => {
    navigate(`${ROUTES_PATHS.GENERATED_CONTACT_UPLOAD}/${encodeURIComponent(upload.importId)}?month=${encodeURIComponent(uploadMonth)}`);
  };

  useEffect(() => {
    if (!routeImportId || historyLoading || selectedUpload?.importId === routeImportId) return;
    const upload = previousUploads.find((item) => item.importId === routeImportId);
    if (upload) void openUploadDetails(upload);
  }, [historyLoading, openUploadDetails, previousUploads, routeImportId, selectedUpload?.importId]);

  const readWorkbook = async (file: File) => {
    setParsing(true);
    setError("");
    setSavedCount(null);
    setProgress(0);
    try {
      setPreview(await parseGeneratedContactWorkbook(file));
      setAllocations([newAllocation()]);
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : "Unable to read the workbook.");
    } finally {
      setParsing(false);
    }
  };

  const uploadContacts = async () => {
    if (!preview || !outletInfo?.id) return;
    if (!uploadType) {
      messageApi.error("Select Event or Other before uploading.");
      return;
    }
    const selectedEvent = uploadType === "EVENT"
      ? events.find((event) => event.id === selectedEventId)
      : undefined;
    if (uploadType === "EVENT" && !selectedEvent) {
      messageApi.error("Select the event these contacts belong to before uploading.");
      return;
    }
    const uploadName = uploadType === "EVENT"
      ? selectedEvent?.name ?? ""
      : otherUploadName.trim();
    if (!uploadName) {
      messageApi.error("Enter a name for this contact upload.");
      return;
    }
    const assignedTotal = allocations.reduce(
      (total, allocation) => total + (allocation.count || 0),
      0,
    );
    if (
      assignedTotal !== preview.rows.length ||
      allocations.some((allocation) => !allocation.employeeId || !allocation.count)
    ) {
      messageApi.error("Assign every contact before uploading.");
      return;
    }

    setUploading(true);
    setError("");
    setProgress(0);
    try {
      const eventDetails = selectedEvent ? { ...selectedEvent } : undefined;
      if (eventDetails) delete eventDetails.members;
      const assignmentByRowNumber = new Map<number, GeneratedContactAssignee>();
      let contactIndex = 0;
      allocations.forEach((allocation) => {
        const employee = assignableEmployees.find(
          (member) => member.userProfileId === allocation.employeeId,
        );
        if (!employee) return;
        const assignee: GeneratedContactAssignee = {
          id: employee.userProfileId,
          name: employee.userName,
          employeeCode: employee.empCode || employee.code,
        };
        for (let count = 0; count < (allocation.count || 0); count += 1) {
          const contact = preview.rows[contactIndex];
          if (contact) assignmentByRowNumber.set(contact.rowNumber, assignee);
          contactIndex += 1;
        }
      });

      const result = await storeGeneratedContacts(
        outletInfo.id,
        preview.rows,
        {
          fileName: preview.fileName,
          worksheetName: preview.worksheetName,
          outletName: outletInfo.name || "",
          uploadedBy: user?.id || user?.uid,
          uploadType,
          uploadName,
          ...(eventDetails
            ? { event: eventDetails }
            : {}),
          assignmentByRowNumber,
        },
        (saved, total) => setProgress(Math.round((saved / total) * 100)),
      );
      setSavedCount(result.saved);
      void loadPreviousUploads();
      messageApi.success(`${result.saved} generated contact${result.saved === 1 ? "" : "s"} uploaded under ${uploadName}.`);
    } catch (caught) {
      const errorCode =
        typeof caught === "object" && caught && "code" in caught
          ? String(caught.code)
          : "";
      const message = errorCode.includes("permission-denied")
        ? "The CONTACTS database permission is not active yet. Deploy the updated Firestore rules and try again."
        : caught instanceof Error
          ? caught.message
          : "Contacts could not be uploaded.";
      setError(message);
      messageApi.error(message);
    } finally {
      setUploading(false);
    }
  };

  const previewColumns: ColumnsType<GeneratedContactRow> = [
    { title: "Excel Row", dataIndex: "rowNumber", width: 100, fixed: "left" },
    ...(preview?.fieldNames.map((field, index) => ({
      title: preview.headers[index],
      key: field,
      ellipsis: true,
      width: 180,
      render: (_: unknown, row: GeneratedContactRow) => String(row.values[field] ?? ""),
    })) ?? []),
  ];
  const uploadedContacts = importDetail?.contacts ?? [];
  const statusCounts = Object.fromEntries(
    CONTACT_STATUS_CARDS.map(({ key }) => [
      key,
      uploadedContacts.filter(
        (contact) => normalizedContactStatus(contact.status) === key,
      ).length,
    ]),
  ) as Record<(typeof CONTACT_STATUS_CARDS)[number]["key"], number>;
  const pagedUploadedContacts = uploadedContacts.slice(
    (detailPage - 1) * detailPageSize,
    detailPage * detailPageSize,
  );
  const assignedTotal = allocations.reduce(
    (total, allocation) => total + (allocation.count || 0),
    0,
  );
  const remainingContacts = (preview?.rows.length || 0) - assignedTotal;
  const allocationIsComplete =
    Boolean(preview?.rows.length) &&
    remainingContacts === 0 &&
    allocations.length > 0 &&
    allocations.every((allocation) => allocation.employeeId && allocation.count);
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  const uploadContextIsComplete = uploadType === "EVENT"
    ? Boolean(selectedEvent)
    : uploadType === "OTHER"
      ? Boolean(otherUploadName.trim())
      : false;

  const updateAllocation = (
    key: string,
    update: Partial<Omit<EmployeeAllocation, "key">>,
  ) => {
    setAllocations((current) =>
      current.map((allocation) =>
        allocation.key === key ? { ...allocation, ...update } : allocation,
      ),
    );
  };

  return (
    <div className="w-full min-w-0 space-y-5 p-1 sm:p-3">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-700">
          <Database size={16} /> AI Intelligence
        </div>
        <h1 className="m-0 text-2xl font-bold text-slate-900 sm:text-3xl">Upload Generated Contacts</h1>
        <p className="mt-2 text-slate-600">
          Upload, review, and distribute generated contacts to your sales team. Every Excel column is preserved.
        </p>
      </div>

      {!outletInfo?.id && (
        <Alert type="warning" showIcon message="No outlet selected" description="Select an outlet before uploading generated contacts." />
      )}
      {!canCreate && (
        <Alert type="info" showIcon message="View-only access" description="You can review previous uploads, but you do not have permission to upload new contacts." />
      )}
      {error && <Alert type="error" showIcon closable message="Upload failed" description={error} onClose={() => setError("")} />}
      {savedCount !== null && (
        <Alert type="success" showIcon icon={<CheckCircle2 size={18} />} message="Upload complete" description={`${savedCount} contact${savedCount === 1 ? "" : "s"} stored in the CONTACTS collection.`} />
      )}

      <Card
        size="small"
        title="Recent Excel uploads"
        loading={historyLoading}
        extra={(
          <DatePicker
            picker="month"
            allowClear={false}
            value={dayjs(`${uploadMonth}-01`)}
            onChange={(value) => setUploadMonth((value ?? dayjs()).format("YYYY-MM"))}
          />
        )}
      >
        {previousUploads.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {previousUploads.map((upload) => (
              <div
                key={upload.importId}
                className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 transition hover:border-emerald-300 hover:bg-emerald-50/40"
              >
                <FileSpreadsheet className="shrink-0 text-emerald-600" size={22} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-800" title={upload.fileName}>
                    {upload.fileName}
                  </div>
                  <div className="text-xs text-slate-500">
                    {upload.contactCount.toLocaleString()} contacts · {upload.assignedEmployeeCount} employee{upload.assignedEmployeeCount === 1 ? "" : "s"}
                  </div>
                  <div className="text-xs text-slate-500">
                    {upload.uploadedDateTime
                      ? new Date(upload.uploadedDateTime).toLocaleString()
                      : "Date unavailable"}
                  </div>
                  <div className="truncate text-xs font-medium text-emerald-700" title={upload.uploadName || upload.eventName}>
                    {upload.uploadType ? `${upload.uploadType === "EVENT" ? "Event" : "Other"}: ` : ""}
                    {upload.uploadName || upload.eventName || "Legacy upload"}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <div className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5 text-center">
                      <div className="text-sm font-bold leading-none text-blue-600">{upload.totalCallCount ?? upload.contactCount}</div>
                      <div className="mt-1 text-[10px] font-medium text-slate-600">Total Calls</div>
                    </div>
                    <div className="rounded-md border border-amber-100 bg-amber-50 px-2 py-1.5 text-center">
                      <div className="text-sm font-bold leading-none text-amber-600">{upload.pendingCallCount ?? upload.contactCount}</div>
                      <div className="mt-1 text-[10px] font-medium text-slate-600">Pending Calls</div>
                    </div>
                    <div className="rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-center">
                      <div className="text-sm font-bold leading-none text-emerald-600">{upload.calledCount ?? 0}</div>
                      <div className="mt-1 text-[10px] font-medium text-slate-600">Called</div>
                    </div>
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    className="mt-2"
                    onClick={() => showUploadDashboard(upload)}
                  >
                    View Dashboard
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-2 text-sm text-slate-500">No previous Excel uploads.</div>
        )}
      </Card>

      <Card size="small" title="Contact upload type">
        <div className="grid gap-3 lg:grid-cols-[220px_minmax(280px,520px)_1fr] lg:items-center">
          <Select
            className="w-full"
            size="large"
            disabled={!canCreate || !outletInfo?.id || uploading || savedCount !== null}
            value={uploadType}
            placeholder="Select type"
            onChange={(value: "EVENT" | "OTHER") => {
              setUploadType(value);
              setSelectedEventId(undefined);
              setOtherUploadName("");
            }}
            options={[
              { value: "EVENT", label: "Event" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          {uploadType === "EVENT" ? (
            <Select
              showSearch
              optionFilterProp="label"
              className="w-full"
              size="large"
              loading={eventsLoading}
              value={selectedEventId}
              disabled={!canCreate || !outletInfo?.id || uploading || savedCount !== null}
              placeholder={eventsLoading ? "Loading events..." : "Select an event (required)"}
              onChange={setSelectedEventId}
              options={events.map((event) => ({
                value: event.id,
                label: `${event.name} — ${new Date(event.eventDateTime).toLocaleString()} (${event.status})`,
              }))}
              notFoundContent={eventsLoading ? "Loading events..." : "No events found for this outlet"}
            />
          ) : uploadType === "OTHER" ? (
            <Input
              size="large"
              maxLength={500}
              value={otherUploadName}
              disabled={!canCreate || uploading || savedCount !== null}
              placeholder="Enter name (required)"
              onChange={(event) => setOtherUploadName(event.target.value)}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-500">
              Select Event or Other
            </div>
          )}
          <div className="flex min-w-0 items-start gap-2 text-sm text-slate-600">
            <CalendarDays className="mt-0.5 shrink-0 text-emerald-600" size={18} />
            <span>
              {uploadType === "EVENT"
                ? selectedEvent
                  ? `Contacts will be linked to ${selectedEvent.name}.`
                  : "Choose the event these contacts belong to."
                : uploadType === "OTHER"
                  ? otherUploadName.trim()
                    ? `Contacts will be grouped under ${otherUploadName.trim()}.`
                    : "Enter a name for this contact group."
                  : "First choose whether these contacts belong to an Event or Other group."}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        {!preview ? (
          <Upload.Dragger
            accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            multiple={false}
            maxCount={1}
            fileList={[]}
            disabled={!canCreate || parsing || uploading || !outletInfo?.id || !uploadContextIsComplete}
            beforeUpload={(file) => {
              void readWorkbook(file as File);
              return false;
            }}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon"><FileSpreadsheet className="mx-auto text-emerald-600" size={44} /></p>
            <p className="ant-upload-text">{parsing ? "Reading workbook…" : "Click or drag the generated-contact Excel file here"}</p>
            <p className="ant-upload-hint">The first populated worksheet is imported. Supported: .xlsx and .xlsm, up to 10 MB.</p>
          </Upload.Dragger>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4">
              <div>
                <div className="font-semibold text-slate-900">{preview.fileName}</div>
                <div className="text-sm text-slate-500">Worksheet: {preview.worksheetName}</div>
                <div className="mt-1 text-sm font-medium text-emerald-700">
                  {preview.rows.length.toLocaleString()} contacts ready
                </div>
              </div>
              <Button disabled={uploading} onClick={reset}>Choose Another File</Button>
            </div>

            <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-slate-800">
                    <Users size={18} className="text-emerald-600" />
                    Distribute contacts to employees
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Contacts are assigned in the same order as the Excel rows.
                  </div>
                </div>
                <Button
                  icon={<Plus size={16} />}
                  disabled={!canCreate || uploading || savedCount !== null || assignableEmployees.length === 0}
                  onClick={() => setAllocations((current) => [...current, newAllocation()])}
                >
                  Add Employee
                </Button>
              </div>

              {allocations.map((allocation, index) => {
                const employeeIdsUsedElsewhere = new Set(
                  allocations
                    .filter((item) => item.key !== allocation.key)
                    .map((item) => item.employeeId)
                    .filter(Boolean),
                );
                return (
                  <div key={allocation.key} className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_40px]">
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder={assignableEmployees.length ? `Employee ${index + 1}` : "No active employees"}
                      value={allocation.employeeId}
                      disabled={!canCreate || uploading || savedCount !== null || assignableEmployees.length === 0}
                      onChange={(employeeId) => updateAllocation(allocation.key, { employeeId })}
                      options={assignableEmployees.map((employee) => ({
                        label: employeeOptionLabel(employee),
                        value: employee.userProfileId,
                        disabled: employeeIdsUsedElsewhere.has(employee.userProfileId),
                      }))}
                    />
                    <InputNumber
                      min={1}
                      max={preview.rows.length}
                      precision={0}
                      className="!w-full"
                      placeholder="Contact count"
                      value={allocation.count}
                      disabled={!canCreate || uploading || savedCount !== null}
                      onChange={(count) => updateAllocation(allocation.key, { count })}
                    />
                    <Button
                      danger
                      aria-label="Remove employee allocation"
                      icon={<Trash2 size={16} />}
                      disabled={!canCreate || uploading || savedCount !== null || allocations.length === 1}
                      onClick={() =>
                        setAllocations((current) =>
                          current.filter((item) => item.key !== allocation.key),
                        )
                      }
                    />
                  </div>
                );
              })}

              <Alert
                type={allocationIsComplete ? "success" : remainingContacts < 0 ? "error" : "info"}
                showIcon
                message={
                  allocationIsComplete
                    ? `All ${assignedTotal.toLocaleString()} contacts are assigned`
                    : remainingContacts < 0
                      ? `${Math.abs(remainingContacts).toLocaleString()} too many contacts assigned`
                      : `${remainingContacts.toLocaleString()} contacts still need assignment`
                }
              />
            </div>

            {uploading && <Progress percent={progress} status="active" />}

            <div>
              <div className="mb-2 font-semibold text-slate-900">Contact Preview</div>
              <Table<GeneratedContactRow>
                rowKey="rowNumber"
                size="small"
                columns={previewColumns}
                dataSource={preview.rows}
                scroll={{ x: Math.max(760, previewColumns.length * 180) }}
                pagination={{
                  defaultPageSize: 50,
                  pageSizeOptions: [25, 50, 100, 250],
                  showSizeChanger: true,
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} contacts`,
                }}
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="primary"
                size="large"
                icon={<UploadCloud size={18} />}
                loading={uploading}
                disabled={!canCreate || savedCount !== null || !outletInfo?.id || !uploadContextIsComplete || !allocationIsComplete}
                onClick={() => void uploadContacts()}
              >
                Upload {preview.rows.length} Contact{preview.rows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(selectedUpload)}
        width={1040}
        footer={null}
        destroyOnHidden
        title={selectedUpload ? `Uploaded contacts — ${selectedUpload.fileName}` : "Uploaded contacts"}
        onCancel={() => {
          setSelectedUpload(undefined);
          setImportDetail(undefined);
          navigate(ROUTES_PATHS.GENERATED_CONTACT_UPLOAD);
        }}
      >
        {selectedUpload && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-500 px-4 pb-5 pt-4 text-white sm:px-6 sm:pb-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold sm:text-xl">Contacts Management</div>
                  <div className="mt-1 text-xs text-emerald-50 sm:text-sm">
                    {selectedUpload.fileName} · {selectedUpload.uploadName || selectedUpload.eventName || "Legacy upload"}
                  </div>
                </div>
                <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                  {selectedUpload.uploadType === "EVENT"
                    ? "Event"
                    : selectedUpload.uploadType === "OTHER"
                      ? "Other"
                      : "Legacy"}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-3">
                {CONTACT_STATUS_CARDS.map((status) => (
                  <div
                    key={status.key}
                    className="min-w-0 rounded-xl bg-white px-2 py-3 text-center shadow-md sm:px-3"
                  >
                    <div className="text-lg font-extrabold text-emerald-700">
                      {statusCounts[status.key]}
                    </div>
                    <div className="mt-0.5 break-words text-[10px] font-semibold leading-tight text-slate-700 sm:text-xs">
                      {status.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Spin spinning={detailLoading}>
              <div className="max-h-[58vh] overflow-y-auto px-4 sm:px-6">
                {!detailLoading && pagedUploadedContacts.length === 0 ? (
                  <Empty className="py-12" description="No contacts found in this upload" />
                ) : (
                  pagedUploadedContacts.map((contact) => {
                    const statusKey = normalizedContactStatus(contact.status);
                    const statusLabel = CONTACT_STATUS_CARDS.find(
                      (status) => status.key === statusKey,
                    )?.label ?? fieldLabel(statusKey);

                    return (
                      <article key={contact.id} className="border-b border-slate-200 py-4 last:border-b-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="break-words text-sm font-bold text-slate-900 sm:text-base">
                              {contact.name || "Unnamed contact"}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Tag color={statusKey === "CALLED" || statusKey === "INTERESTED" ? "green" : statusKey === "NOT_INTERESTED" ? "red" : "default"}>
                                {statusLabel}
                              </Tag>
                              <span className="text-xs text-slate-500">Status: {contact.status || "OPEN"}</span>
                              <span className="text-xs text-slate-400">Excel row {contact.excelRowNumber}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="hidden text-xs text-slate-500 sm:inline">
                              {selectedUpload.uploadedDateTime
                                ? new Date(selectedUpload.uploadedDateTime).toLocaleDateString()
                                : ""}
                            </span>
                            {contact.mobile && (
                              <a
                                href={`tel:${contact.mobile}`}
                                aria-label={`Call ${contact.name || contact.mobile}`}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100"
                              >
                                <Phone size={17} />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                          {Object.entries(contact.values).map(([field, value]) => (
                            <div key={field} className="min-w-0 text-xs sm:text-sm">
                              <span className="font-semibold text-slate-700">{fieldLabel(field)}: </span>
                              <span className="break-words text-slate-600">{fieldValue(value)}</span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
                            <Users size={16} className="shrink-0 text-emerald-600" />
                            <span className="shrink-0 font-medium">Assigned employee</span>
                          </div>
                          {canUpdate ? (
                            <Select
                              showSearch
                              optionFilterProp="label"
                              className="w-full sm:w-72"
                              value={contact.assignedUserId || undefined}
                              loading={reassigningContactId === contact.id}
                              disabled={Boolean(reassigningContactId)}
                              placeholder="Assign employee"
                              onChange={(assignedUserId) => void reassignContact(contact.id, assignedUserId)}
                              options={assignableEmployees.map((employee) => ({
                                value: employee.userProfileId,
                                label: employeeOptionLabel(employee),
                              }))}
                            />
                          ) : (
                            <span className="text-sm font-medium text-slate-800">
                              {contact.assignedUserName || "Unassigned"}
                            </span>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </Spin>

            {uploadedContacts.length > 0 && (
              <div className="flex justify-end border-t border-slate-200 px-4 py-3 sm:px-6">
                <Pagination
                  current={detailPage}
                  pageSize={detailPageSize}
                  total={uploadedContacts.length}
                  showSizeChanger
                  pageSizeOptions={[10, 25, 50, 100]}
                  showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} contacts`}
                  onChange={(page, pageSize) => {
                    setDetailPage(pageSize === detailPageSize ? page : 1);
                    setDetailPageSize(pageSize);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
