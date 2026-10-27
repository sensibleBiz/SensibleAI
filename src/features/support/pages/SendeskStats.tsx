import { SendeskTicket } from "./sendeskAdminData";

type Props = {
  tickets: SendeskTicket[];
};

export default function SendeskStats({ tickets }: Props) {
  const total = tickets.length;
  const newTickets = tickets.filter((t) => t.status === "New").length;
  const pending = tickets.filter((t) => t.status === "Pending").length;
  const resolved = tickets.filter((t) => t.status === "Resolved").length;

  const stats = [
    { label: "Total Tickets", value: total, accent: "bg-[#0a3750]" },
    { label: "New Tickets", value: newTickets, accent: "bg-[#ff3228]" },
    { label: "Pending", value: pending, accent: "bg-[#0a3750]/60" },
    { label: "Resolved", value: resolved, accent: "bg-black" },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      {stats.map((item) => (
        <div
          key={item.label}
          className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <span className={`absolute left-0 top-0 h-full w-1 ${item.accent}`} />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:text-sm">
            {item.label}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-[#0a3750] sm:text-3xl">
            {item.value}
          </h3>
        </div>
      ))}
    </div>
  );
}
