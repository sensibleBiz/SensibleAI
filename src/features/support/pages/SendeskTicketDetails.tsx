import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  SendeskAgent,
  SendeskTicket,
  TicketStatus,
  getPriorityColor,
  getStatusColor,
} from "./sendeskAdminData";
import { updateSendeskTicket } from "./sendeskApi";
import { useMessageApi } from "@/shared/hooks";
import type { RootState } from "@/app/store";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

type Props = {
  ticket: SendeskTicket | null;
  onClose: () => void;
  onUpdateTicket: (ticket: SendeskTicket) => void;
};

const statuses: TicketStatus[] = [
  "New",
  "Pending",
  "Resolved",
];

export default function SendeskTicketDetails({
  ticket,
  onClose,
  onUpdateTicket,
}: Props) {
  const [comment, setComment] = useState("");
  const [updatingField, setUpdatingField] = useState<keyof SendeskTicket | null>(
    null
  );
  const [addingComment, setAddingComment] = useState(false);
  const teamTreeData = useSelector(
    (state: RootState) => state?.appState?.teamTreeData || []
  );
  const loggedInUser = useSelector((state: RootState) => state?.auth?.user);
  const messageApi = useMessageApi();
  const assignedBy = loggedInUser?.id || loggedInUser?.uid || "";
  const assignedByName = loggedInUser?.name || loggedInUser?.email || "";
  const agents = useMemo<SendeskAgent[]>(() => {
    return teamTreeData
      .filter(
        (member) =>
          member?.userProfileId &&
          member?.userName &&
          member?.isActive !== false
      )
      .map((member) => ({
        userProfileId: member.userProfileId,
        userName: member.userName,
        department: member.department || "-",
      }))
      .sort((a, b) => a.userName.localeCompare(b.userName));
  }, [teamTreeData]);

  const assignableAgents = useMemo(() => {
    if (
      !ticket?.assignedTo ||
      agents.some(
        (agent) =>
          agent.userProfileId === ticket.assignedTo ||
          agent.userName === ticket.assignedTo
      )
    ) {
      return agents;
    }

    return [
      {
        userProfileId: ticket.assignedTo,
        userName: ticket.assignedTo,
        department: "-",
      },
      ...agents,
    ];
  }, [agents, ticket?.assignedTo]);
  const selectedAssignedToValue = useMemo(() => {
    if (!ticket?.assignedTo) return "";

    return (
      assignableAgents.find(
        (agent) =>
          agent.userProfileId === ticket.assignedTo ||
          agent.userName === ticket.assignedTo
      )?.userProfileId || ticket.assignedTo
    );
  }, [assignableAgents, ticket?.assignedTo]);

  if (!ticket) return null;

  const updateField = async (
    key: "status" | "assignedTo",
    value: TicketStatus | string | null
  ) => {
    setUpdatingField(key);

    try {
      const updateData =
        key === "status"
          ? { status: value as TicketStatus }
          : {
              assignedTo: value ? String(value) : null,
              assignedBy,
              assignedByName,
            };
      const selectedAgent =
        key === "assignedTo"
          ? assignableAgents.find((agent) => agent.userProfileId === value)
          : undefined;

      await updateSendeskTicket(ticket.ticketNo, updateData);

      onUpdateTicket({
        ...ticket,
        [key]: value,
        lastUpdateMessage:
          key === "status"
            ? `Ticket status updated to ${value}.`
            : `Ticket assigned to ${
                selectedAgent?.userName || value || "Not Assigned"
              }.`,
      });

      messageApi.success("Ticket updated successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update ticket";
      messageApi.error(errorMessage);
    } finally {
      setUpdatingField(null);
    }
  };

  const addComment = async () => {
    const commentText = comment.trim();
    if (!commentText) return;

    const newComment = {
      id: String(Date.now()),
      by: "Admin",
      message: commentText,
      createdAt: new Date().toLocaleString("en-IN"),
    };

    setAddingComment(true);

    try {
      await updateSendeskTicket(ticket.ticketNo, {
        comment: commentText,
        updateMessage: commentText,
        lastUpdateMessage: commentText,
      });

      onUpdateTicket({
        ...ticket,
        comments: [newComment, ...ticket.comments],
        lastUpdateMessage: commentText,
      });

      setComment("");
      messageApi.success("Comment updated successfully");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update comment";
      messageApi.error(errorMessage);
    } finally {
      setAddingComment(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 px-3 pb-3 pt-20 sm:items-start sm:pb-6 sm:pt-24">
      <div className="flex max-h-[calc(100vh-7.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-[#0a3750] px-4 py-4 sm:px-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Ticket Details
            </p>
            <h2 className="text-xl font-bold text-white sm:text-2xl">
              {ticket.ticketNo}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Closename
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusColor(
                      ticket.status
                    )}`}
                  >
                    {ticket.status}
                  </span>

                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityColor(
                      ticket.priority
                    )}`}
                  >
                    {ticket.priority}
                  </span>

                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    {ticket.source}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-[#0a3750] sm:text-xl">
                  {ticket.issueTitle}
                </h3>

                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                  {ticket.issueDescription}
                </p>

                {ticket.attachments && ticket.attachments.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <h4 className="text-sm font-bold text-[#0a3750]">
                      Customer Uploads
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {ticket.attachments.map((attachment) => (
                        <a
                          key={attachment.url}
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-sm transition hover:border-[#0a3750]"
                        >
                          {attachment.isImage ? (
                            <ImagePreview
                              src={attachment.url}
                              alt={attachment.name}
                            />
                          ) : (
                            <div className="flex h-24 items-center justify-center px-3 text-center font-semibold text-[#0a3750]">
                              View Attachment
                            </div>
                          )}
                          <div className="break-all border-t border-slate-200 px-3 py-2 font-semibold text-[#0a3750]">
                            {attachment.name}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : ticket.attachmentName ? (
                  <div className="mt-4 break-all rounded-xl bg-slate-50 p-3 text-sm">
                    Attachment:{" "}
                    <span className="font-semibold text-[#0a3750]">
                      {ticket.attachmentName}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <h3 className="font-bold text-[#0a3750]">Add Update / Comment</h3>

                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  placeholder="Write update for this ticket..."
                  className="mt-3 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-black outline-none transition focus:border-[#ff3228] focus:ring-4 focus:ring-[#ff3228]/10"
                />

                <button
                  type="button"
                  onClick={addComment}
                  disabled={addingComment}
                  className="mt-3 w-full rounded-xl bg-[#ff3228] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e02a21] sm:w-auto"
                >
                  {addingComment ? "Adding..." : "Add Comment"}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <h3 className="font-bold text-[#0a3750]">Activity / Comments</h3>

                <div className="mt-4 space-y-3">
                  {ticket.comments.length === 0 ? (
                    <p className="text-sm text-slate-500">No comments yet.</p>
                  ) : (
                    ticket.comments.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl bg-slate-50 p-4 text-sm"
                      >
                        <div className="mb-1 flex flex-wrap justify-between gap-2">
                          <span className="font-semibold text-[#0a3750]">
                            {item.by}
                          </span>
                          <span className="text-xs text-slate-500">
                            {item.createdAt}
                          </span>
                        </div>
                        <p className="text-slate-600">{item.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <h3 className="font-bold text-[#0a3750]">Customer Details</h3>

                <Info
                  label="Name"
                  value={formatEmployeeName(ticket.customerName, "N/A")}
                />
                <Info label="Mobile" value={ticket.customerMobile} />
                <Info label="Email" value={ticket.customerEmail || "-"} />
                <Info label="Device ID" value={ticket.deviceId || "-"} />
                <Info label="Outlet" value={ticket.outletNameId || "-"} />
                <Info label="Outlet ID" value={ticket.outletId || "-"} />
                <Info label="Created" value={ticket.createdAt} />
              </div>

              <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                <h3 className="font-bold text-[#0a3750]">Manage Ticket</h3>

                <label className="mt-4 block text-sm font-semibold text-[#0a3750]">
                  Status
                </label>
                <select
                  value={ticket.status}
                  onChange={(e) =>
                    updateField("status", e.target.value as TicketStatus)
                  }
                  disabled={updatingField === "status"}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-black outline-none transition focus:border-[#ff3228] focus:ring-4 focus:ring-[#ff3228]/10"
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>

                <label className="mt-4 block text-sm font-semibold text-[#0a3750]">
                  Assign To
                </label>
                <select
                  value={selectedAssignedToValue}
                  onChange={(e) =>
                    updateField("assignedTo", e.target.value || null)
                  }
                  disabled={updatingField === "assignedTo"}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-black outline-none transition focus:border-[#ff3228] focus:ring-4 focus:ring-[#ff3228]/10"
                >
                  <option value="">Not Assigned</option>
                  {assignableAgents.map((agent) => (
                    <option
                      key={`${agent.userProfileId}-${agent.userName}-${agent.department}`}
                      value={agent.userProfileId}
                    >
                      {formatEmployeeName(agent.userName)}
                      {agent.department && agent.department !== "-"
                        ? ` - ${agent.department}`
                        : ""}
                    </option>
                  ))}
                </select>

                <div className="mt-4 break-words rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                  Last Update: {ticket.lastUpdateMessage}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-48 items-center justify-center bg-white px-3 text-center text-sm font-semibold text-slate-500">
        Image preview unavailable
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-48 w-full bg-white object-contain"
    />
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-3 border-b border-slate-100 pb-2 text-sm last:border-b-0">
      <p className="text-slate-500">{label}</p>
      <p className="break-words font-semibold text-slate-800">{value}</p>
    </div>
  );
}
