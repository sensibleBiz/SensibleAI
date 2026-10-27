"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import SendeskStats from "./SendeskStats";
import SendeskFilters from "./SendeskFilters";
import SendeskTicketTable from "./SendeskTicketTable";
import SendeskTicketDetails from "./SendeskTicketDetails";
import { SendeskTicket } from "./sendeskAdminData";
import { getSendeskTickets } from "./sendeskApi";
import { useMessageApi } from "@/shared/hooks";
import type { RootState } from "@/app/store";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

const TICKETS_PER_PAGE = 4;

export default function SendeskAdminPage() {
  const [tickets, setTickets] = useState<SendeskTicket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<SendeskTicket | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newTicketCount, setNewTicketCount] = useState(0);
  const knownTicketIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedRef = useRef(false);
  const messageApi = useMessageApi();
  const selectedOutlet = useSelector(
    (state: RootState) => state?.appState?.outletInfo
  );
  const selectedOutletId = selectedOutlet?.id || "";
  const selectedOutletName = selectedOutlet?.name || "";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const notifyAdminForNewTickets = useCallback(
    (newTickets: SendeskTicket[]) => {
      if (newTickets.length === 0) return;

      messageApi.info(
        `${newTickets.length} new Sendesk ticket${
          newTickets.length > 1 ? "s" : ""
        } received`
      );

      setNewTicketCount((prev) => {
        const nextCount = prev + newTickets.length;
        document.title = `(${nextCount}) New Sendesk Ticket${
          nextCount > 1 ? "s" : ""
        }`;
        return nextCount;
      });

      if ("Notification" in window && Notification.permission === "granted") {
        const firstTicket = newTickets[0];
        new Notification("New Sendesk Ticket", {
          body: `${firstTicket.ticketNo} - ${formatEmployeeName(firstTicket.customerName)}: ${firstTicket.issueTitle}`,
        });
      }
    },
    [messageApi]
  );

  const fetchTickets = useCallback(
    async (showLoader = true, notifyNewTickets = false) => {
      if (showLoader) setLoading(true);
      setError("");

      if (!selectedOutletId) {
        setTickets([]);
        setSelectedTicket(null);
        setError("Please select an outlet first.");
        if (showLoader) setLoading(false);
        return;
      }

      try {
        const latestTickets = (
          await getSendeskTickets({
            outletId: selectedOutletId,
            status: null,
          })
        ).filter((ticket) =>
          isTicketForOutlet(ticket, selectedOutletId, selectedOutletName)
        );

        const latestIds = new Set(latestTickets.map((ticket) => ticket.id));
        const newTickets = latestTickets.filter(
          (ticket) => !knownTicketIdsRef.current.has(ticket.id)
        );

        if (notifyNewTickets && hasLoadedRef.current) {
          notifyAdminForNewTickets(newTickets);
        }

        latestIds.forEach((ticketId) => knownTicketIdsRef.current.add(ticketId));
        hasLoadedRef.current = true;
        setTickets(latestTickets);
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load Sendesk tickets";
        setError(errorMessage);
        if (showLoader) messageApi.error(errorMessage);
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [
      messageApi,
      notifyAdminForNewTickets,
      selectedOutletId,
      selectedOutletName,
    ]
  );

  useEffect(() => {
    knownTicketIdsRef.current = new Set();
    hasLoadedRef.current = false;
    setNewTicketCount(0);
    setTickets([]);
    setSelectedTicket(null);
    document.title = "Sendesk Admin";
  }, [selectedOutletId]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchTickets(false, true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [fetchTickets]);

  const filteredTickets = useMemo(() => {
    const hasDateRange = Boolean(startDate && endDate);

    return tickets
      .filter((ticket) => {
        const searchValue = search.toLowerCase();

        const matchesSearch =
          ticket.ticketNo.toLowerCase().includes(searchValue) ||
          ticket.customerName.toLowerCase().includes(searchValue) ||
          ticket.customerMobile.includes(searchValue) ||
          ticket.issueTitle.toLowerCase().includes(searchValue) ||
          ticket.outletNameId?.toLowerCase().includes(searchValue);

        const matchesStatus =
          statusFilter === "All" ||
          ticket.status === getStatusLabel(statusFilter);

        const matchesPriority =
          priorityFilter === "All" || ticket.priority === priorityFilter;

        const matchesDateRange =
          !hasDateRange || isTicketWithinDateRange(ticket, startDate, endDate);

        const matchesResolvedDateRule =
          hasDateRange ||
          ticket.status !== "Resolved" ||
          isResolvedWithinThreeDays(ticket);

        return (
          matchesSearch &&
          matchesStatus &&
          matchesPriority &&
          matchesDateRange &&
          matchesResolvedDateRule
        );
      })
      .sort(sortTicketsByLatest);
  }, [tickets, search, statusFilter, priorityFilter, startDate, endDate]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, priorityFilter, startDate, endDate]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTickets.length / TICKETS_PER_PAGE)
  );

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedTickets = useMemo(() => {
    const startIndex = (currentPage - 1) * TICKETS_PER_PAGE;
    return filteredTickets.slice(startIndex, startIndex + TICKETS_PER_PAGE);
  }, [currentPage, filteredTickets]);

  const handleUpdateTicket = (updatedTicket: SendeskTicket) => {
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === updatedTicket.id ? updatedTicket : ticket
      )
    );

    setSelectedTicket(updatedTicket);
  };

  const handleClearNewTicketCount = () => {
    setNewTicketCount(0);
    document.title = "Sendesk Admin";
  };

  return (
    <section className="min-h-screen bg-white p-3 sm:p-4 md:p-6">
      <div className="w-full space-y-5 sm:space-y-6">
        <div className="overflow-hidden rounded-2xl bg-[#0a3750] px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ff3228]" />
                Admin Panel
              </span>
              <h1 className="mt-3 text-xl font-bold text-white sm:text-2xl md:text-3xl">
                Sendesk Admin
              </h1>
              <p className="mt-1 text-sm text-white/70">
                Manage website support tickets, manual requests, status
                updates, assignment and comments.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              {newTicketCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearNewTicketCount}
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white px-5 py-3 text-sm font-semibold text-[#0a3750] shadow-lg shadow-black/10 transition hover:bg-white/90"
                >
                  {newTicketCount} New Ticket
                  {newTicketCount > 1 ? "s" : ""}
                </button>
              )}

              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-xl bg-[#ff3228] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/10 transition hover:bg-[#e02a21] sm:w-auto"
              >
                + Create Internal Ticket
              </button>
            </div>
          </div>
        </div>

        <SendeskStats tickets={tickets} />

        <SendeskFilters
          search={search}
          setSearch={setSearch}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          priorityFilter={priorityFilter}
          setPriorityFilter={setPriorityFilter}
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
        />

        <SendeskTicketTable
          tickets={paginatedTickets}
          onView={setSelectedTicket}
          loading={loading}
          error={error}
          onRefresh={() => fetchTickets()}
          currentPage={currentPage}
          totalPages={totalPages}
          totalTickets={filteredTickets.length}
          pageSize={TICKETS_PER_PAGE}
          onPageChange={setCurrentPage}
        />

        <SendeskTicketDetails
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdateTicket={handleUpdateTicket}
        />
      </div>
    </section>
  );
}

function isTicketForOutlet(
  ticket: SendeskTicket,
  outletId: string,
  outletName?: string
) {
  const ticketOutletId = normalizeOutletValue(ticket.outletId);
  const selectedOutletId = normalizeOutletValue(outletId);

  if (ticketOutletId && ticketOutletId === selectedOutletId) return true;

  const ticketOutletName = normalizeOutletValue(ticket.outletNameId);
  const selectedOutletName = normalizeOutletValue(outletName);

  return Boolean(
    !ticketOutletId &&
      ticketOutletName &&
      selectedOutletName &&
      ticketOutletName === selectedOutletName
  );
}

function normalizeOutletValue(value?: string | null) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getStatusLabel(status: string) {
  switch (status) {
    case "NEW":
      return "New";
    case "PENDING":
      return "Pending";
    case "RESOLVED":
      return "Resolved";
    default:
      return status;
  }
}

function sortTicketsByLatest(a: SendeskTicket, b: SendeskTicket) {
  return (b.createdAtTimestamp || 0) - (a.createdAtTimestamp || 0);
}

function isResolvedWithinThreeDays(ticket: SendeskTicket) {
  const resolvedAt = ticket.resolvedAtTimestamp || ticket.createdAtTimestamp;
  if (!resolvedAt) return true;

  const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;
  return Date.now() - resolvedAt <= threeDaysInMs;
}

function isTicketWithinDateRange(
  ticket: SendeskTicket,
  startDate: string,
  endDate: string
) {
  const ticketDate = ticket.createdAtTimestamp;
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate, true);

  if (!ticketDate || !start || !end) return false;

  return ticketDate >= start && ticketDate <= end;
}

function parseDateInput(value: string, endOfDay = false) {
  if (!value) return undefined;

  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  if (Number.isNaN(date.getTime())) return undefined;

  return date.getTime();
}
