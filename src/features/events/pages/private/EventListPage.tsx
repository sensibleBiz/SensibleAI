import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Spin,
  Tooltip,
  message,
} from "antd";
import dayjs from "dayjs";
import {
  CalendarDays,
  Copy,
  Eye,
  ExternalLink,
  FilePenLine,
  Link as LinkIcon,
  List,
  Plus,
  Power,
  Send,
  Trash2,
} from "lucide-react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import CopyLinkButton from "@/features/events/components/CopyLinkButton";
import EventCalendarView from "@/features/events/components/EventCalendarView";
import EventStatusBadge from "@/features/events/components/EventStatusBadge";
import { Can } from "@/features/access-control";
import {
  buildRegistrationLink,
  deactivateEvent,
  getEvents,
} from "@/features/events/api/eventApi";
import {
  buildEventPamphletLink,
  createPublicUrlRecord,
  deletePublicUrlRecord,
  getPublicUrlsForOutlet,
  createLocalPublicUrlRecord,
  getLocalPublicUrlsForOutlet,
  PublicUrlRecord,
} from "@/features/events/api/eventPamphletLeadService";
import { RootState } from "@/app/store";
import { EventItem, EventStatus } from "../../types/eventTypes";
import { PERMISSION_MASTER, ROLES } from "@/shared/lib/constants";

const statusOptions = [
  { label: "All", value: "All" },
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
  { label: "Expired", value: "Expired" },
];

const truncatePublicUrl = (url: string, max = 56) => {
  if (url.length <= max) return url;
  return `${url.slice(0, 34)}…${url.slice(-14)}`;
};

const getRegistrationTypeLabel = (event: EventItem) =>
  event.registrationType === "free" ||
  (!event.registrationType && Number(event.fees ?? 0) <= 0)
    ? "Free"
    : "Paid";

const getRegistrationLinkOptions = (
  event: EventItem,
  outletId: string | undefined
) => {
  const seenBusinessTypes = new Set<string>();
  const businessTypeOptions = (event.eventImages ?? [])
    .filter((image) => image.businessType)
    .filter((image) => {
      const key = image.businessType.trim().toLowerCase();
      if (!key || seenBusinessTypes.has(key)) return false;
      seenBusinessTypes.add(key);
      return true;
    })
    .map((image) => ({
      label: image.businessType,
      link: buildRegistrationLink(event.id, outletId, image.businessType),
      eventId: event.id,
      outletId,
      businessType: image.businessType,
    }));

  return [
    {
      label: "Default Event Link",
      link: buildRegistrationLink(event.id, outletId),
      eventId: event.id,
      outletId,
    },
    ...businessTypeOptions,
  ];
};

export default function EventListPage() {
  const navigate = useNavigate();
  const [publicUrlForm] = Form.useForm<{ publicUrlName: string; publicUrlPhone?: string }>();
  const adminRoles = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id
  );
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EventStatus | "All">("All");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [isPublicUrlModalOpen, setIsPublicUrlModalOpen] = useState(false);
  const [generatedPublicUrl, setGeneratedPublicUrl] = useState("");
  const [generatedPublicUrlName, setGeneratedPublicUrlName] = useState("");
  const [publicUrls, setPublicUrls] = useState<PublicUrlRecord[]>([]);
  const [createdPublicUrl, setCreatedPublicUrl] = useState<null | {
    url: string;
    displayName: string;
  }>(null);
  const [creatingPublicUrl, setCreatingPublicUrl] = useState(false);
  const [loadingPublicUrl, setLoadingPublicUrl] = useState(false);
  const [deletingPublicUrlId, setDeletingPublicUrlId] = useState<string>("");
  const [publicUrlError, setPublicUrlError] = useState<string>("");

  useEffect(() => {
    const loadEvents = async () => {
      if (!outletId) {
        setEvents([]);
        setError("");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const data = await getEvents({ outletId });
        setEvents(data);
      } catch (error) {
        console.error("Failed to load events", error);
        setError("Unable to load events right now.");
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, [outletId]);

  useEffect(() => {
    const loadOutletPublicUrls = async () => {
      const userId = currentUser?.id || currentUser?.uid;

      if (!outletId || !userId) {
        setPublicUrls([]);
        setPublicUrlError("");
        setLoadingPublicUrl(false);
        return;
      }

      try {
        setLoadingPublicUrl(true);
        setPublicUrlError("");
        const apiUrls = await getPublicUrlsForOutlet(outletId, userId).catch(
          () => [] as PublicUrlRecord[]
        );
        const localUrls = await getLocalPublicUrlsForOutlet(outletId, userId).catch(
          () => [] as PublicUrlRecord[]
        );

        // Prefer local urls first so recently-created local entries show up immediately.
        setPublicUrls([...(localUrls ?? []), ...(apiUrls ?? [])]);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to load outlet public URLs";
        console.debug("Failed to load outlet public URLs", errorMessage);
        setPublicUrlError(errorMessage);
        setPublicUrls([]);
      } finally {
        setLoadingPublicUrl(false);
      }
    };

    void loadOutletPublicUrls();
  }, [outletId, currentUser]);

  const reloadOutletPublicUrls = async () => {
    const userId = currentUser?.id || currentUser?.uid;

    if (!outletId || !userId) {
      setPublicUrls([]);
      setPublicUrlError("Outlet or user details are unavailable");
      return;
    }

    try {
      setLoadingPublicUrl(true);
      setPublicUrlError("");
      const apiUrls = await getPublicUrlsForOutlet(outletId, userId).catch(
        () => [] as PublicUrlRecord[]
      );
      const localUrls = await getLocalPublicUrlsForOutlet(outletId, userId).catch(
        () => [] as PublicUrlRecord[]
      );

      setPublicUrls([...(localUrls ?? []), ...(apiUrls ?? [])]);
    } catch (error) {
      setPublicUrlError(
        error instanceof Error
          ? error.message
          : "Failed to load outlet public URLs"
      );
      setPublicUrls([]);
    } finally {
      setLoadingPublicUrl(false);
    }
  };

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const matchesSearch = event.name
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesStatus = status === "All" || event.status === status;
        return matchesSearch && matchesStatus;
      }),
    [events, search, status]
  );

  const loadCalendarMonth = useCallback(
    async (month: dayjs.Dayjs) => {
      if (!outletId) return;

      try {
        setCalendarLoading(true);
        const monthEvents = await getEvents({
          outletId,
          fromDate: month.startOf("month").toISOString(),
          toDate: month.endOf("month").toISOString(),
        });

        setEvents((current) => {
          const merged = new Map(current.map((event) => [event.id, event]));
          monthEvents.forEach((event) => merged.set(event.id, event));
          return Array.from(merged.values());
        });
      } catch (monthError) {
        console.error("Failed to load calendar month", monthError);
        message.error("Unable to refresh events for this month.");
      } finally {
        setCalendarLoading(false);
      }
    },
    [outletId]
  );

  const saveRegistrationContext = (eventId: string) => {
    sessionStorage.setItem("eventId", eventId);
    if (outletId) {
      sessionStorage.setItem("outletId", outletId);
    }
  };

  const shareOnWhatsApp = (event: EventItem) => {
    saveRegistrationContext(event.id);
    const text = `Register for ${event.name}: ${event.registrationLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleDeactivate = async (eventId: string) => {
    const updated = await deactivateEvent(eventId);
    setEvents((current) =>
      current.map((event) => (event.id === eventId ? updated : event))
    );
    message.success("Event deactivated");
  };

  const closePublicUrlModal = () => {
    setIsPublicUrlModalOpen(false);
    setGeneratedPublicUrl("");
    setGeneratedPublicUrlName("");
    publicUrlForm.resetFields();
  };

  const handleCreatePublicUrl = async () => {
    const values = await publicUrlForm.validateFields();
    const publicUrlName = values.publicUrlName.trim();
    const phoneValue = values.publicUrlPhone?.trim();
    const userId = currentUser?.id || currentUser?.uid;

    if (!outletId || !userId) {
      message.error("Outlet or user details are unavailable");
      return;
    }

    const publicUrl = await buildEventPamphletLink(publicUrlName, outletId);

    try {
      setCreatingPublicUrl(true);

      // Try server API first; if it fails, fall back to local Firestore storage.
      let created: PublicUrlRecord | null = null;

      try {
        created = await createPublicUrlRecord({
          outletId,
          userId,
          displayName: publicUrlName,
          url: publicUrl,
          phone: phoneValue,
        });
      } catch {
        // Fallback to local storage
        created = await createLocalPublicUrlRecord({
          outletId,
          userId,
          displayName: publicUrlName,
          url: publicUrl,
          phone: phoneValue,
        });
        message.warning("Public URL saved locally (offline fallback)");
      }

      if (created) {
        setGeneratedPublicUrlName(publicUrlName);
        setGeneratedPublicUrl(publicUrl);
        setCreatedPublicUrl({
          url: publicUrl,
          displayName: publicUrlName,
        });
        setPublicUrls((current) => [created!, ...current]);
        setPublicUrlError("");
        message.success("Public URL created and saved");
      }
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to create public URL"
      );
    } finally {
      setCreatingPublicUrl(false);
    }
  };

  const copyPublicUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      message.success("Public URL copied");
    } catch {
      message.error("Unable to copy link");
    }
  };

  const handleDeletePublicUrl = async (urlRecord: PublicUrlRecord) => {
    const userId = currentUser?.id || currentUser?.uid;
    const docId = urlRecord.id;

    if (!outletId || !userId) {
      message.error("Outlet or user details are unavailable");
      return;
    }

    if (!docId) {
      message.error("Public URL id is missing");
      return;
    }

    try {
      setDeletingPublicUrlId(docId);
      await deletePublicUrlRecord({
        docId,
        userId,
        outletId,
      });
      setPublicUrls((current) =>
        current.filter((item) => (item.id ?? item.url) !== (urlRecord.id ?? urlRecord.url))
      );
      setCreatedPublicUrl((current) =>
        current?.url === urlRecord.url ? null : current
      );
      message.success("Public URL deleted");
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to delete public URL"
      );
    } finally {
      setDeletingPublicUrlId("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="m-0 text-2xl font-semibold text-slate-900">
            Event Management
          </h1>
          <p className="m-0 text-sm text-slate-500">
            Manage event pages, links, and registrations.
          </p>
        </div>
        <Can permission={PERMISSION_MASTER.CRM_EVENTS_CREATE} roles={adminRoles}>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button
              icon={<LinkIcon size={16} />}
              onClick={() => setIsPublicUrlModalOpen(true)}
              className="w-full sm:w-auto"
            >
              Create Public URL
            </Button>
            <Button
              type="primary"
              icon={<Plus size={16} />}
              onClick={() => navigate("/events/create")}
              className="w-full sm:w-auto"
            >
              Create Event
            </Button>
          </div>
        </Can>
      </div>

      {createdPublicUrl ? (
        <Card
          className="border border-emerald-200 bg-emerald-50/40 shadow-sm"
          styles={{ body: { padding: 14 } }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                Just created
              </p>
              <h2 className="m-0 mt-0.5 truncate text-base font-semibold text-slate-900">
                {createdPublicUrl.displayName}
              </h2>
              <p
                className="m-0 mt-1 truncate font-mono text-[11px] text-slate-500"
                title={createdPublicUrl.url}
              >
                {truncatePublicUrl(createdPublicUrl.url, 72)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                size="small"
                type="primary"
                icon={<Copy size={14} />}
                onClick={() => void copyPublicUrl(createdPublicUrl.url)}
              >
                Copy
              </Button>
              <Button
                size="small"
                href={createdPublicUrl.url}
                target="_blank"
                rel="noreferrer"
                icon={<ExternalLink size={14} />}
              >
                Open
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {loadingPublicUrl ? (
        <Card className="border border-slate-200 shadow-sm" styles={{ body: { padding: 14 } }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Public URLs
              </p>
              <h2 className="m-0 mt-0.5 text-sm font-semibold text-slate-900">
                Fetching saved public URLs...
              </h2>
            </div>
            <Spin size="small" />
          </div>
        </Card>
      ) : publicUrlError ? (
        <Card className="border border-slate-200 shadow-sm" styles={{ body: { padding: 14 } }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={publicUrlError}>
            <Button size="small" onClick={() => void reloadOutletPublicUrls()}>
              Retry
            </Button>
          </Empty>
        </Card>
      ) : publicUrls.length > 0 ? (
        <Card className="border border-slate-200 shadow-sm" styles={{ body: { padding: 14 } }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Outlet Public URLs
              </p>
              <h2 className="m-0 mt-0.5 text-base font-semibold text-slate-900">
                All public URLs for this outlet
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {publicUrls.length}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {publicUrls.map((urlRecord) => {
              const recordKey = urlRecord.id ?? urlRecord.url;
              const isDeleting = deletingPublicUrlId === urlRecord.id;

              return (
                <div
                  key={recordKey}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 transition hover:border-slate-300 hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-semibold text-slate-900">
                        {urlRecord.displayName}
                      </p>
                      {urlRecord.createdAt ? (
                        <p className="m-0 mt-0.5 text-[11px] text-slate-500">
                          {dayjs(urlRecord.createdAt).format("DD MMM YYYY")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Tooltip title="Copy URL">
                        <Button
                          type="text"
                          size="small"
                          icon={<Copy size={14} />}
                          onClick={() => void copyPublicUrl(urlRecord.url)}
                        />
                      </Tooltip>
                      <Tooltip title="Open">
                        <Button
                          type="text"
                          size="small"
                          href={urlRecord.url}
                          target="_blank"
                          rel="noreferrer"
                          icon={<ExternalLink size={14} />}
                        />
                      </Tooltip>
                      <Tooltip title="Delete">
                        <Popconfirm
                          title="Delete this public URL?"
                          description="This cannot be undone."
                          okText="Delete"
                          okButtonProps={{ danger: true, loading: isDeleting }}
                          cancelText="Cancel"
                          onConfirm={() => void handleDeletePublicUrl(urlRecord)}
                        >
                          <Button
                            type="text"
                            size="small"
                            danger
                            loading={isDeleting}
                            icon={<Trash2 size={14} />}
                          />
                        </Popconfirm>
                      </Tooltip>
                    </div>
                  </div>
                  <div
                    className="mt-2 truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-[11px] text-slate-600"
                    title={urlRecord.url}
                  >
                    {truncatePublicUrl(urlRecord.url)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_auto]">
          <Input
            allowClear
            placeholder="Search by event name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            prefix={<LinkIcon size={15} className="text-slate-400" />}
          />
          <Select
            value={status}
            options={statusOptions}
            onChange={setStatus}
            placeholder="Filter by status"
          />
          <Segmented
            block
            value={viewMode}
            options={[
              {
                label: "List",
                value: "list",
                icon: <List size={15} />,
              },
              {
                label: "Calendar",
                value: "calendar",
                icon: <CalendarDays size={15} />,
              },
            ]}
            onChange={(value) => setViewMode(value as "list" | "calendar")}
          />
        </div>

        {error ? (
          <Empty description={error}>
            <Button onClick={() => window.location.reload()}>Retry</Button>
          </Empty>
        ) : loading ? (
          <div className="flex min-h-56 items-center justify-center">
            <Spin />
          </div>
        ) : viewMode === "calendar" ? (
          <EventCalendarView
            events={filteredEvents}
            loading={calendarLoading}
            onEventClick={(event) => navigate(`/events/${event.id}`)}
            onEditClick={(event) => navigate(`/events/${event.id}/edit`)}
            onDateClick={(date) =>
              navigate(`/events/create?date=${date.format("YYYY-MM-DD")}`)
            }
            onMonthChange={loadCalendarMonth}
          />
        ) : filteredEvents.length === 0 ? (
          <Empty description="No events found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[950px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-3">Event Name</th>
                  <th className="px-4 py-3">City</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Fees</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-center">Total Registrations</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {record.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {record.city || "N/A"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {dayjs(record.eventDateTime).format("DD MMM YYYY, hh:mm A")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{record.location}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {getRegistrationTypeLabel(record)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getRegistrationTypeLabel(record) === "Paid" && record.fees
                        ? `Rs. ${record.fees.toLocaleString("en-IN")}`
                        : "Free"}
                    </td>
                    <td className="px-4 py-3">
                      <EventStatusBadge status={record.status} />
                    </td>
                    <td className="px-4 py-3 text-center text-slate-700">
                      {record.totalRegistrations}
                    </td>
                    <td className="px-4 py-3">
                      <Space size="small" wrap>
                        <Tooltip title="View">
                          <Button
                            type="text"
                            icon={<Eye size={16} />}
                            onClick={() => navigate(`/events/${record.id}`)}
                          />
                        </Tooltip>
                        <Can permission={PERMISSION_MASTER.CRM_EVENTS_EDIT} roles={adminRoles}>
                          <Tooltip title="Edit">
                            <Button
                              type="text"
                              icon={<FilePenLine size={16} />}
                              onClick={() => navigate(`/events/${record.id}/edit`)}
                            />
                          </Tooltip>
                        </Can>
                        <CopyLinkButton
                          link={record.registrationLink}
                          eventId={record.id}
                          outletId={outletId}
                          linkOptions={getRegistrationLinkOptions(record, outletId)}
                          label=""
                          type="text"
                        />
                        <Tooltip title="Share on WhatsApp">
                          <Button
                            type="text"
                            icon={<Send size={16} />}
                            onClick={() => shareOnWhatsApp(record)}
                          />
                        </Tooltip>
                        <Can permission={PERMISSION_MASTER.CRM_EVENTS_DELETE} roles={adminRoles}>
                          <Tooltip title="Deactivate">
                            <Button
                              danger
                              type="text"
                              icon={<Power size={16} />}
                              onClick={() => handleDeactivate(record.id)}
                              disabled={record.status === "Inactive"}
                            />
                          </Tooltip>
                        </Can>
                      </Space>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        title={generatedPublicUrl ? "Public URL Created" : "Create Public URL"}
        open={isPublicUrlModalOpen}
        onCancel={closePublicUrlModal}
        destroyOnHidden
        footer={
          generatedPublicUrl
            ? [
                <Button key="done" type="primary" onClick={closePublicUrlModal}>
                  Done
                </Button>,
              ]
            : [
                <Button key="cancel" onClick={closePublicUrlModal}>
                  Cancel
                </Button>,
                <Button
                  key="create"
                  type="primary"
                  loading={creatingPublicUrl}
                  onClick={() => void handleCreatePublicUrl()}
                >
                  Create URL
                </Button>,
              ]
        }
      >
        {generatedPublicUrl ? (
          <div className="space-y-4 py-2">
            <div>
              <div className="text-sm text-slate-500">Public URL name</div>
              <div className="mt-1 font-semibold text-slate-900">
                {createdPublicUrl?.displayName || generatedPublicUrlName}
              </div>
            </div>
            <Input.TextArea
              value={createdPublicUrl?.url || generatedPublicUrl}
              readOnly
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <CopyLinkButton
                link={createdPublicUrl?.url || generatedPublicUrl}
                label="Copy Public URL"
                successMessage="Public URL copied"
                type="primary"
              />
              <Button
                href={createdPublicUrl?.url || generatedPublicUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Public Form
              </Button>
            </div>
          </div>
        ) : (
          <Form
            form={publicUrlForm}
            layout="vertical"
            requiredMark={false}
            onFinish={() => void handleCreatePublicUrl()}
            className="pt-2"
          >
            <Form.Item
              label="Public URL Name"
              name="publicUrlName"
              rules={[
                { required: true, message: "Public URL name is required" },
                { min: 2, message: "Enter at least 2 characters" },
              ]}
            >
              <Input
                autoFocus
                size="large"
                placeholder="e.g. Delhi Business Expo"
              />
            </Form.Item>
              <Form.Item
                label="Contact number (optional)"
                name="publicUrlPhone"
                normalize={(v) => (typeof v === "string" ? v.replace(/\D/g, "") : v)}
                rules={[
                  {
                    pattern: /^[6-9]\d{9}$/,
                    message: "Enter a valid 10-digit mobile number",
                  },
                ]}
              >
                <Input size="large" placeholder="e.g. 9876543210" />
              </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
