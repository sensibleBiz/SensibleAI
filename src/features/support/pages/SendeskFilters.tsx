type Props = {
  search: string;
  setSearch: (value: string) => void;
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  priorityFilter: string;
  setPriorityFilter: (value: string) => void;
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
};

export default function SendeskFilters({
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
}: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="grid gap-3 sm:gap-4 md:grid-cols-[1fr_160px_160px_160px_160px]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticket no, customer, mobile, outlet, issue..."
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-black outline-none transition focus:border-[#ff3228] focus:ring-4 focus:ring-[#ff3228]/10"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-black outline-none transition focus:border-[#ff3228] focus:ring-4 focus:ring-[#ff3228]/10"
        >
          <option value="All">All Status</option>
          <option value="NEW">New</option>
          <option value="PENDING">Pending</option>
          <option value="RESOLVED">Resolved</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-black outline-none transition focus:border-[#ff3228] focus:ring-4 focus:ring-[#ff3228]/10"
        >
          <option value="All">All Priority</option>
          <option value="Urgent">Urgent</option>
          <option value="High">High</option>
          <option value="Medium">Medium</option>
          <option value="Low">Low</option>
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-black outline-none transition focus:border-[#ff3228] focus:ring-4 focus:ring-[#ff3228]/10"
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-black outline-none transition focus:border-[#ff3228] focus:ring-4 focus:ring-[#ff3228]/10"
        />
      </div>
    </div>
  );
}
