import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  message,
} from "antd";
import dayjs from "dayjs";
import { ArrowLeft, Download, Eye, FilePenLine, Send, UserPlus } from "lucide-react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import CopyLinkButton from "@/features/events/components/CopyLinkButton";
import EventStatusBadge from "@/features/events/components/EventStatusBadge";
import ParticipantTable from "@/features/events/components/ParticipantTable";
import { Can } from "@/features/access-control";
import { usePermission } from "@/features/access-control";
import {
  buildRegistrationLink,
  getEventById,
  getEventParticipants,
  saveEventMemberRegistration,
  updateEventMemberAttendance,
} from "@/features/events/api/eventApi";
import fileExport, { TableColumn } from "@/shared/utils/fileExport";
import { RootState } from "@/app/store";
import { EventItem, EventParticipant, EventRegistrationValues, PaymentStatus } from "../../types/eventTypes";
import { PERMISSION_MASTER, ROLES } from "@/shared/lib/constants";

type AdminParticipantForm = {
  fullName: string;
  mobile: string;
};

const getRegistrationLinkOptions = (
  event: EventItem,
  outletId: string | undefined,
  eventImages: NonNullable<EventItem["eventImages"]>
) => {
  const seenBusinessTypes = new Set<string>();
  const businessTypeOptions = eventImages
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

const getPaymentStatus = (status: unknown): PaymentStatus => {
  const normalized = String(status ?? "").toLowerCase();

  if (normalized === "paid" || normalized === "success") return "Paid";
  if (normalized === "free registration" || normalized === "free") {
    return "Free Registration";
  }
  if (normalized === "failed" || normalized === "failure") return "Failed";
  return "Pending";
};

const isFreeEvent = (event?: Pick<EventItem, "registrationType" | "fees"> | null) =>
  event?.registrationType === "free" ||
  (!event?.registrationType && Number(event?.fees ?? 0) <= 0);

const getDisplayedPaymentStatus = (
  participant: EventParticipant
): PaymentStatus =>
  participant.registrationType === "free" ||
  participant.paymentStatus === "Free Registration" ||
  participant.businessType === "Free Registration"
    ? "Free Registration"
    : getPaymentStatus(participant.paymentStatus);

const getRegistrationTypeLabel = (event: EventItem) =>
  isFreeEvent(event) ? "Free" : "Paid";

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";

  const parsedDate = dayjs(value);
  return parsedDate.isValid()
    ? parsedDate.format("DD MMM YYYY, hh:mm A")
    : "N/A";
};

const participantExportColumns: TableColumn<EventParticipant>[] = [
  { title: "Name", dataIndex: "name", width: 24 },
  { title: "Mobile", dataIndex: "mobile", width: 16 },
  { title: "Business Type", dataIndex: "businessType", width: 28 },
  {
    title: "Amount",
    dataIndex: "amount",
    width: 14,
    formatter: (value) => Number(value || 0),
  },
  { title: "Payment Status", dataIndex: "paymentStatus", width: 18 },
  {
    title: "Attendance",
    dataIndex: "isAttended",
    width: 16,
    formatter: (value) => (value === true ? "Attended" : "Not Attended"),
  },
  {
    title: "Registration Date",
    dataIndex: "registrationDate",
    width: 24,
    formatter: (value) =>
      formatDate(
        typeof value === "string" || typeof value === "number" ? String(value) : null
      ),
  },
];

const getAttendanceAvailability = (eventDateTime?: string) => {
  const eventDate = dayjs(eventDateTime);

  if (!eventDateTime || !eventDate.isValid()) {
    return {
      canMarkAttendance: false,
      attendanceUnavailableText: "Event date unavailable",
    };
  }

  const today = dayjs();

  if (today.isBefore(eventDate, "day")) {
    return {
      canMarkAttendance: false,
      attendanceUnavailableText: "Available on event date",
    };
  }

  if (today.isAfter(eventDate, "day")) {
    return {
      canMarkAttendance: false,
      attendanceUnavailableText: "Event date passed",
    };
  }

  return {
    canMarkAttendance: true,
    attendanceUnavailableText: "",
  };
};

const getDateValue = (value: unknown): string => {
  if (typeof value === "string" && value.trim()) {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  if (typeof value === "object" && value !== null) {
    const dateValue = value as {
      _seconds?: number;
      seconds?: number;
      _nanoseconds?: number;
      nanoseconds?: number;
    };
    const seconds = Number(dateValue._seconds ?? dateValue.seconds);
    const nanoseconds = Number(
      dateValue._nanoseconds ?? dateValue.nanoseconds ?? 0
    );

    if (Number.isFinite(seconds)) {
      const date = new Date(
        seconds * 1000 + Math.floor(nanoseconds / 1000000)
      );
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
  }

  return "";
};

const getParticipantAmount = (
  member: EventParticipant,
  event: EventItem
): number => {
  if (
    isFreeEvent(event) ||
    member.registrationType === "free" ||
    member.paymentStatus === "Free Registration" ||
    member.businessType === "Free Registration" ||
    member.businessType === "Admin Registration"
  ) {
    return 0;
  }

  return Number(member.amount ?? event.fees ?? 0);
};

const getEventParticipantsFromMembers = (
  event: EventItem,
  members: EventParticipant[] = event.members ?? []
): EventParticipant[] =>
  members.map((member, index) => ({
    ...member,
    id: member.id || `${event.id}-${member.mobile || index}`,
    eventId: member.eventId || event.id,
    name: member.fullName || member.customerName || member.name || "",
    fullName: member.fullName || member.customerName || member.name || "",
    customerName: member.customerName || member.fullName || member.name || "",
    mobile: member.mobile || "",
    businessType: member.businessType || "",
    amount: getParticipantAmount(member, event),
    registrationType: isFreeEvent(event) ? "free" : member.registrationType,
    paymentStatus: getPaymentStatus(member.paymentStatus),
    registrationDate:
      getDateValue(member.registrationDate) ||
      getDateValue(member.paymentDate),
    isAttended: member.isAttended === true,
  }));

export default function EventDetailsPage() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const adminRoles = [ROLES.SUPER_ADMIN, ROLES.ADMIN];
  const { hasPermission, hasAnyRole } = usePermission();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id
  );
  const [event, setEvent] = useState<EventItem | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [editingParticipant, setEditingParticipant] =
    useState<EventParticipant | null>(null);
  const [loading, setLoading] = useState(true);
  const [attendanceUpdatingId, setAttendanceUpdatingId] = useState("");
  const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
  const [participantSubmitting, setParticipantSubmitting] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "All">("All");
  const [registrationPreview, setRegistrationPreview] = useState<{
    url: string;
    businessType?: string;
  } | null>(null);
  const [participantForm] = Form.useForm<AdminParticipantForm>();

  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true);
      const [eventData, participantData] = await Promise.all([
        getEventById(eventId, outletId),
        getEventParticipants(eventId),
      ]);

      setEvent(eventData ?? null);
      setParticipants(
        eventData
          ? getEventParticipantsFromMembers(
              eventData,
              eventData.members?.length ? eventData.members : participantData
            )
          : participantData
      );
      setLoading(false);
    };

    loadDetails();
  }, [eventId, outletId]);

  const filteredParticipants = useMemo(
    () =>
      paymentStatus === "All"
        ? participants
        : participants.filter(
            (item) => getDisplayedPaymentStatus(item) === paymentStatus
          ),
    [participants, paymentStatus]
  );
  const attendanceAvailability = getAttendanceAvailability(event?.eventDateTime);
  const eventImages = useMemo(() => {
    if (!event) return [];
    if (event.eventImages?.length) return event.eventImages;
    if (!event.imageUrl) return [];

    return [
      {
        id: "primary-event-image",
        name: "Primary Event Image",
        businessType: "Other",
        url: event.imageUrl,
      },
    ];
  }, [event]);
  const registrationLinkOptions = useMemo(
    () => (event ? getRegistrationLinkOptions(event, outletId, eventImages) : []),
    [event, eventImages, outletId]
  );
  const canManageEvent =
    hasPermission(PERMISSION_MASTER.CRM_EVENTS_EDIT) || hasAnyRole(adminRoles);

  const getBusinessTypeRegistrationLink = (businessType?: string) => {
    if (!event) return "";
    return buildRegistrationLink(event.id, outletId, businessType);
  };

  const saveRegistrationContext = (businessType?: string) => {
    if (!event) return;
    sessionStorage.setItem("eventId", event.id);
    if (outletId) {
      sessionStorage.setItem("outletId", outletId);
    }
    if (businessType) {
      sessionStorage.setItem("eventBusinessType", businessType);
    } else {
      sessionStorage.removeItem("eventBusinessType");
    }
  };

  const shareOnWhatsApp = (businessType?: string) => {
    if (!event) return;
    const registrationLink = businessType
      ? getBusinessTypeRegistrationLink(businessType)
      : event.registrationLink;
    const businessTypeLabel = businessType ? ` (${businessType})` : "";

    saveRegistrationContext(businessType);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(
        `Register for ${event.name}${businessTypeLabel}: ${registrationLink}`
      )}`,
      "_blank"
    );
  };

  const previewRegistrationPage = (
    registrationLink: string,
    businessType?: string
  ) => {
    if (!registrationLink) {
      message.warning("Registration link is not available");
      return;
    }

    saveRegistrationContext(businessType);
    setRegistrationPreview({ url: registrationLink, businessType });
  };

  const handleExportExcel = () => {
    if (filteredParticipants.length === 0) {
      message.warning("No participant registrations to export");
      return;
    }

    const eventName = event?.name
      ? event.name.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")
      : "event";

    fileExport.exportToExcel(
      filteredParticipants.map((participant) => ({
        ...participant,
        paymentStatus: getDisplayedPaymentStatus(participant),
      })),
      participantExportColumns,
      `${eventName || "event"}_participants.xlsx`,
      "Participants"
    );
  };

  const handleAddParticipant = async () => {
    if (!event) return;

    try {
      const values = await participantForm.validateFields();
      const mobile = String(values.mobile ?? "").trim();
      const existingParticipant = participants.find(
        (participant) => String(participant.mobile ?? "").trim() === mobile
      );

      if (existingParticipant && !editingParticipant) {
        message.warning("Participant already registered with this mobile number");
        return;
      }

      setParticipantSubmitting(true);

      const registrationData: EventRegistrationValues = {
        fullName: String(values.fullName ?? "").trim(),
        mobile,
        businessType:
          editingParticipant?.businessType || "Admin Registration",
        acceptedTerms: editingParticipant
          ? editingParticipant.acceptedTerms === true ||
            editingParticipant.isAgreed === true
          : true,
      };
      const freeEvent = isFreeEvent(event);

      const updatedEvent = await saveEventMemberRegistration({
        event,
        eventId: event.id,
        data: registrationData,
        outletId,
        amountOverride: editingParticipant?.amount ?? 0,
        paymentStatus: freeEvent
          ? "Free Registration"
          : editingParticipant?.paymentStatus ?? "Paid",
        transactionType: editingParticipant?.transactionType ?? "EVENT",
        transactionTitle:
          editingParticipant?.transactionTitle ?? "Admin Registration",
        registrationType: freeEvent
          ? "free"
          : editingParticipant?.registrationType,
      });

      const updatedParticipants = getEventParticipantsFromMembers(updatedEvent);

      setEvent(updatedEvent);
      setParticipants(updatedParticipants);
      setPaymentStatus("All");
      setIsParticipantModalOpen(false);
      setEditingParticipant(null);
      participantForm.resetFields();
      message.success(
        editingParticipant
          ? "Participant details updated"
          : "Participant registered"
      );
    } catch (error) {
      if (error && typeof error === "object" && "errorFields" in error) {
        return;
      }

      message.error(
        error instanceof Error ? error.message : "Failed to register participant"
      );
    } finally {
      setParticipantSubmitting(false);
    }
  };

  const handleAttendanceChange = async (
    participant: EventParticipant,
    isAttended: boolean
  ) => {
    if (!event) return;
    if (!attendanceAvailability.canMarkAttendance) {
      message.warning(
        attendanceAvailability.attendanceUnavailableText ||
          "Attendance can only be marked on the event date"
      );
      return;
    }

    try {
      setAttendanceUpdatingId(participant.id);

      const updatedEvent = await updateEventMemberAttendance({
        event,
        participant,
        outletId,
        isAttended,
      });
      const updatedParticipants = getEventParticipantsFromMembers(updatedEvent);

      setEvent(updatedEvent);
      setParticipants(updatedParticipants);
      message.success(
        isAttended ? "Attendance marked" : "Attendance removed"
      );
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Failed to update attendance"
      );
    } finally {
      setAttendanceUpdatingId("");
    }
  };

  if (!loading && !event) {
    return (
      <Card>
        <Empty description="Event not found">
          <Button onClick={() => navigate("/events")}>Back to Events</Button>
        </Empty>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card loading={loading}>
        {event && (
          <>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h1 className="m-0 text-2xl font-semibold text-slate-900">{event.name}</h1>
                <p className="m-0 text-sm text-slate-500">Event details and participant registrations.</p>
              </div>
              <Space wrap>
                <CopyLinkButton
                  link={event.registrationLink}
                  eventId={event.id}
                  outletId={outletId}
                  linkOptions={registrationLinkOptions}
                />
                <Button icon={<Send size={16} />} onClick={() => shareOnWhatsApp()}>
                  Share on WhatsApp
                </Button>
                <Can permission={PERMISSION_MASTER.CRM_EVENTS_EDIT} roles={adminRoles}>
                  <Button icon={<FilePenLine size={16} />} onClick={() => navigate(`/events/${event.id}/edit`)}>
                    Edit Event
                  </Button>
                </Can>
                <Button icon={<ArrowLeft size={16} />} onClick={() => navigate("/events")}>
                  Back
                </Button>
              </Space>
            </div>

            <Descriptions bordered column={1}>
              <Descriptions.Item label="Event Name">{event.name}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <EventStatusBadge status={event.status} />
              </Descriptions.Item>
              <Descriptions.Item label="Description">
                {event.description}
              </Descriptions.Item>
              <Descriptions.Item label="Terms & Conditions">
                {event.terms}
              </Descriptions.Item>
              <Descriptions.Item label="Date & Time">
                {dayjs(event.eventDateTime).format("DD MMM YYYY, hh:mm A")}
              </Descriptions.Item>
              <Descriptions.Item label="Expiry Date">
                {dayjs(event.registrationExpiryDate).format("DD MMM YYYY, hh:mm A")}
              </Descriptions.Item>
              <Descriptions.Item label="Location">{event.location}</Descriptions.Item>
              <Descriptions.Item label="City">{event.city || "N/A"}</Descriptions.Item>
              <Descriptions.Item label="Registration Type">
                {getRegistrationTypeLabel(event)}
              </Descriptions.Item>
              <Descriptions.Item label="Fees">
                {getRegistrationTypeLabel(event) === "Paid" && event.fees
                  ? `Rs. ${event.fees.toLocaleString("en-IN")}`
                  : "Free"}
              </Descriptions.Item>
              <Descriptions.Item label="Offer Amount">
                Rs. {Number(event.offerAmount || 9999).toLocaleString("en-IN")}
              </Descriptions.Item>
              <Descriptions.Item label="Address">
                {event.address}
              </Descriptions.Item>
              <Descriptions.Item label="Registration Link">
                <span className="break-all">{event.registrationLink}</span>
              </Descriptions.Item>
            </Descriptions>

            {eventImages.length > 0 && (
              <Card className="mt-4" size="small" title="Event Images">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {eventImages.map((image) => {
                    const businessType = image.businessType || "Other";
                    const registrationLink =
                      getBusinessTypeRegistrationLink(businessType);

                    return (
                      <div
                        key={image.id || image.url}
                        className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                      >
                        <div className="flex h-44 items-center justify-center bg-slate-50">
                          <img
                            src={image.url}
                            alt={image.name || "Event image"}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="space-y-3 p-3 text-sm">
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-900">
                              {image.name || "Event Image"}
                            </div>
                            <div className="text-slate-500">
                              {businessType}
                            </div>
                          </div>
                          <Space wrap size="small">
                            <CopyLinkButton
                              link={registrationLink}
                              eventId={event.id}
                              outletId={outletId}
                              businessType={businessType}
                              label="Copy Link"
                            />
                            <Button
                              icon={<Send size={16} />}
                              onClick={() => shareOnWhatsApp(businessType)}
                            >
                              WhatsApp
                            </Button>
                            <Button
                              icon={<Eye size={16} />}
                              onClick={() =>
                                previewRegistrationPage(registrationLink, businessType)
                              }
                            >
                              Preview
                            </Button>
                          </Space>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </>
        )}
      </Card>

      <Card
        title="Participant Registrations"
        extra={
          <Space wrap>
            <Can permission={PERMISSION_MASTER.CRM_EVENTS_EDIT} roles={adminRoles}>
              <Button
                icon={<UserPlus size={16} />}
                type="primary"
                onClick={() => {
                  setEditingParticipant(null);
                  participantForm.resetFields();
                  setIsParticipantModalOpen(true);
                }}
              >
                Add Participant
              </Button>
            </Can>
            <Select
              value={paymentStatus}
              onChange={setPaymentStatus}
              className="min-w-40"
              options={[
                { label: "All", value: "All" },
                { label: "Paid", value: "Paid" },
                { label: "Free Registration", value: "Free Registration" },
                { label: "Pending", value: "Pending" },
                { label: "Failed", value: "Failed" },
              ]}
            />
            <Button icon={<Download size={16} />} onClick={handleExportExcel}>
              Export Excel
            </Button>
          </Space>
        }
      >
        <ParticipantTable
          attendanceUpdatingId={attendanceUpdatingId}
          attendanceUnavailableText={
            canManageEvent
              ? attendanceAvailability.attendanceUnavailableText
              : "No permission"
          }
          canMarkAttendance={canManageEvent && attendanceAvailability.canMarkAttendance}
          loading={loading}
          onAttendanceChange={handleAttendanceChange}
          onEditParticipant={
            canManageEvent
              ? (participant) => {
                  setEditingParticipant(participant);
                  participantForm.setFieldsValue({
                    fullName:
                      participant.fullName ||
                      participant.customerName ||
                      participant.name ||
                      "",
                    mobile: participant.mobile,
                  });
                  setIsParticipantModalOpen(true);
                }
              : undefined
          }
          participants={filteredParticipants}
        />
      </Card>

      <Modal
        title={`Event Registration Preview${
          registrationPreview?.businessType
            ? ` - ${registrationPreview.businessType}`
            : ""
        }`}
        open={Boolean(registrationPreview)}
        onCancel={() => setRegistrationPreview(null)}
        footer={null}
        width="min(1200px, 96vw)"
        destroyOnHidden
        centered
      >
        {registrationPreview && (
          <iframe
            key={registrationPreview.url}
            src={registrationPreview.url}
            title="Event public registration page preview"
            className="h-[75vh] min-h-[480px] w-full rounded-md border border-slate-200"
          />
        )}
      </Modal>

      <Modal
        title={editingParticipant ? "Edit Participant" : "Add Participant"}
        open={isParticipantModalOpen}
        okText={editingParticipant ? "Save" : "Register"}
        confirmLoading={participantSubmitting}
        onCancel={() => {
          setIsParticipantModalOpen(false);
          setEditingParticipant(null);
          participantForm.resetFields();
        }}
        onOk={handleAddParticipant}
      >
        <Form form={participantForm} layout="vertical" size="large">
          <Form.Item
            label="Name"
            name="fullName"
            rules={[{ required: true, message: "Name is required" }]}
          >
            <Input placeholder="Enter participant name" />
          </Form.Item>

          <Form.Item
            label="Mobile Number"
            name="mobile"
            rules={[
              { required: true, message: "Mobile number is required" },
              {
                pattern: /^[0-9]{10}$/,
                message: "Mobile number must be 10 digits",
              },
            ]}
          >
            <Input
              disabled={Boolean(editingParticipant)}
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter 10 digit mobile number"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
