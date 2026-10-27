import {
  SendeskTicket,
  getPriorityColor,
  getStatusColor,
} from "./sendeskAdminData";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

type Props = {
  tickets: SendeskTicket[];
  onView: (ticket: SendeskTicket) => void;
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  currentPage?: number;
  totalPages?: number;
  totalTickets?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
};

export default function SendeskTicketTable({
  tickets,
  onView,
  loading = false,
  error = "",
  onRefresh,
  currentPage = 1,
  totalPages = 1,
  totalTickets = tickets.length,
  pageSize = 4,
  onPageChange,
}: Props) {
  const startTicket = totalTickets === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endTicket = Math.min(currentPage * pageSize, totalTickets);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h3 className="text-base font-bold text-[#0a3750] sm:text-lg">
            Issue Tickets
          </h3>
          <p className="text-sm text-slate-500">
            Website tickets and manual support requests.
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-[#0a3750] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        )}
      </div>

      {error ? (
        <div className="px-4 py-10 text-center text-sm text-red-600">
          {error}
        </div>
      ) : loading ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          Loading tickets...
        </div>
      ) : tickets.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          No tickets found.
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="divide-y divide-slate-100 md:hidden">
            {tickets.map((ticket) => (
              <button
                type="button"
                key={ticket.id}
                onClick={() => onView(ticket)}
                className="flex w-full flex-col gap-2 px-4 py-4 text-left transition hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-bold text-[#0a3750]">
                    {ticket.ticketNo}
                  </span>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusColor(
                      ticket.status
                    )}`}
                  >
                    {ticket.status}
                  </span>
                </div>

                <p className="truncate text-sm font-semibold text-slate-800">
                  {ticket.issueTitle}
                </p>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {formatEmployeeName(ticket.customerName, "-")}
                  </span>
                  <span>•</span>
                  <span>{ticket.customerMobile}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getPriorityColor(
                      ticket.priority
                    )}`}
                  >
                    {ticket.priority}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {ticket.outletNameId || "No outlet"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {ticket.assignedTo || "Not Assigned"}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-600">
                  <th className="px-4 py-3">Ticket No</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3">Outlet</th>
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>

              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className="border-b last:border-b-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-bold text-[#0a3750]">
                      {ticket.ticketNo}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">
                        {formatEmployeeName(ticket.customerName, "-")}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ticket.customerEmail || "-"}
                      </div>
                    </td>

                    <td className="px-4 py-3">{ticket.customerMobile}</td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">
                        {ticket.outletNameId || "-"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ticket.outletId || ""}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="max-w-[220px] truncate font-medium text-slate-800">
                        {ticket.issueTitle}
                      </div>
                      <div className="text-xs text-slate-500">
                        {ticket.issueCategory}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getPriorityColor(
                          ticket.priority
                        )}`}
                      >
                        {ticket.priority}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusColor(
                          ticket.status
                        )}`}
                      >
                        {ticket.status}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {ticket.assignedTo || "Not Assigned"}
                    </td>

                    <td className="px-4 py-3">{ticket.source}</td>

                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onView(ticket)}
                        className="rounded-lg bg-[#0a3750] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#082c40]"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {onPageChange && totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-sm text-slate-500">
                Showing {startTicket}-{endTicket} of {totalTickets}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#0a3750] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1).map(
                  (page) => (
                    <button
                      type="button"
                      key={page}
                      onClick={() => onPageChange(page)}
                      className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                        page === currentPage
                          ? "border-[#0a3750] bg-[#0a3750] text-white"
                          : "border-slate-300 text-[#0a3750] hover:bg-slate-50"
                      }`}
                    >
                      {page}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() =>
                    onPageChange(Math.min(totalPages, currentPage + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#0a3750] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
