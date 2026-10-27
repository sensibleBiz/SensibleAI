import { Outlet } from "../../types/types";
import dayjs from "dayjs"
import { Calendar, Building2, Clock } from "lucide-react";


interface OutletCardProps {
  name: string
  branch: string
  dueDate: number
  validity: number
  active: boolean
  address?: string
  city?: string
  outletInfo?: Outlet
  onClick?: (outlet: Outlet) => void;
}

export const OutletCard = ({ outletInfo,validity ,dueDate,onClick }: OutletCardProps) => {
  const { name, active, branch, createdDate } = outletInfo;
  const formattedDate = new Date(dueDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
  return (
    <div
      className="relative group bg-gradient-to-br from-white via-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer"
      onClick={() => onClick?.(outletInfo)}
    >
      {/* Active badge */}
      <div
        className={`absolute top-4 right-4 px-3 py-1 text-xs font-semibold rounded-full ${
          active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
        }`}
      >
        {active ? "Active" : "Inactive"}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <h3 className="text-xl font-bold text-gray-900 group-hover:text-indigo-600 transition-colors duration-200">
          {name}
        </h3>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent mb-5" />

      {/* Details */}
      <div className="space-y-4 text-sm text-gray-700">
        {/* Branch */}
        <div className="flex items-center gap-3">
          <Building2 className="w-4 h-4 text-indigo-500" />
          <span className="font-medium text-gray-600 w-24">Branch:</span>
          <span className="text-gray-900 font-semibold">{branch}</span>
        </div>

        {/* Due Date */}
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-amber-500" />
          <span className="font-medium text-gray-600 w-24">Due Date:</span>
          <span className="text-gray-900">{formattedDate}</span>
        </div>

        {/* Validity */}
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="font-medium text-gray-600 w-24">Validity:</span>
          <span
            className={`font-semibold ${
              validity < 0 ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            {validity} Days
          </span>
        </div>

        {/* Created Date */}
        <div className="flex items-center gap-3">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-gray-600 w-24">Created:</span>
          <span className="text-gray-900">
            {dayjs(createdDate).format("DD MMM YYYY")}
          </span>
        </div>

        {/* Address */}
        {/* {address && (
          <div className="flex items-start gap-3 pt-4 border-t border-gray-200">
            <MapPin className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
            <div className="text-gray-700 leading-snug">
              <p>{address}</p>
              {city && <p className="text-gray-500 text-xs mt-1">{city}</p>}
            </div>
          </div>
        )} */}
      </div>

      {/* Subtle background glow on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-100/0 via-indigo-100/0 to-indigo-100/0 group-hover:from-indigo-50/80 group-hover:to-indigo-100/80 transition-all duration-300 pointer-events-none" />
    </div>
  );
};
