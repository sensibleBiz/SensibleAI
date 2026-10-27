import { Button, Empty, Spin, Tag } from "antd";
import dayjs from "dayjs";
import { Pencil } from "lucide-react";
import { EventParticipant, PaymentStatus } from "../types/eventTypes";

const paymentColor: Record<PaymentStatus, string> = {
  Paid: "success",
  Pending: "warning",
  Failed: "error",
  "Free Registration": "blue",
};

const isFreeRegistration = (participant: EventParticipant) =>
  participant.paymentStatus === "Free Registration" ||
  participant.registrationType === "free" ||
  participant.businessType === "Free Registration";

const canUseAttendance = (participant: EventParticipant) =>
  participant.paymentStatus === "Paid" ||
  participant.paymentStatus === "Free Registration";

const getParticipantName = (participant: EventParticipant) =>
  [participant.fullName, participant.customerName, participant.name]
    .map((value) => String(value ?? "").trim())
    .find(Boolean) || "N/A";

const formatDate = (value?: string | null) => {
  if (!value) return "N/A";

  const parsedDate = dayjs(value);
  return parsedDate.isValid()
    ? parsedDate.format("DD MMM YYYY, hh:mm A")
    : "N/A";
};

interface ParticipantTableProps {
  participants: EventParticipant[];
  loading?: boolean;
  attendanceUpdatingId?: string;
  canMarkAttendance?: boolean;
  attendanceUnavailableText?: string;
  onAttendanceChange?: (
    participant: EventParticipant,
    isAttended: boolean
  ) => void;
  onEditParticipant?: (participant: EventParticipant) => void;
}

export default function ParticipantTable({
  attendanceUpdatingId = "",
  attendanceUnavailableText = "Available on event date",
  canMarkAttendance = true,
  participants,
  loading = false,
  onAttendanceChange,
  onEditParticipant,
}: ParticipantTableProps) {
  if (loading) {
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (participants.length === 0) {
    return <Empty description="No participants found" />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Mobile</th>
            <th className="px-4 py-3">Business Type</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Payment Status</th>
            <th className="px-4 py-3">Attendance</th>
            <th className="px-4 py-3">Registration Date</th>
            {onEditParticipant ? (
              <th className="px-4 py-3">Actions</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => {
            const isFree = isFreeRegistration(participant);
            const displayedPaymentStatus: PaymentStatus = isFree
              ? "Free Registration"
              : participant.paymentStatus;

            return (
              <tr
                key={participant.id}
                className="border-b border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-3 font-medium text-slate-900">
                  {getParticipantName(participant)}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {participant.mobile || "N/A"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {participant.businessType || "N/A"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {isFree
                    ? "Free"
                    : `Rs. ${Number(participant.amount || 0).toLocaleString(
                        "en-IN"
                      )}`}
                </td>
                <td className="px-4 py-3">
                  <Tag color={paymentColor[displayedPaymentStatus]}>
                    {displayedPaymentStatus}
                  </Tag>
                </td>
                <td className="px-4 py-3">
                  {canUseAttendance(participant) ? (
                    <Button
                      size="small"
                      disabled={!canMarkAttendance}
                      type={participant.isAttended ? "default" : "primary"}
                      loading={attendanceUpdatingId === participant.id}
                      onClick={() =>
                        onAttendanceChange?.(
                          participant,
                          participant.isAttended !== true
                        )
                      }
                    >
                      {!canMarkAttendance
                        ? attendanceUnavailableText
                        : participant.isAttended
                        ? "Attended"
                        : "Mark Attended"}
                    </Button>
                  ) : (
                    <Tag color="default">Not Available</Tag>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatDate(participant.registrationDate)}
                </td>
                {onEditParticipant ? (
                  <td className="px-4 py-3">
                    <Button
                      icon={<Pencil size={14} />}
                      onClick={() => onEditParticipant(participant)}
                      size="small"
                    >
                      Edit
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
