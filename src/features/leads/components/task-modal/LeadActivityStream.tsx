import React from "react";
import { Button } from "antd";
import dayjs from "dayjs";
import { LeadActivityItem } from "../../api/leadApi";

interface LeadActivityStreamProps {
  activities: LeadActivityItem[];
  activitiesCursor: string | null;
  activityPageLoading: boolean;
  onLoadMore: () => void;
}

export const LeadActivityStream: React.FC<LeadActivityStreamProps> = ({
  activities,
  activitiesCursor,
  activityPageLoading,
  onLoadMore,
}) => {
  return (
    <div className="w-80 border-l border-gray-200 bg-gray-50 dark:border-[#303030] dark:bg-[#1a1a1a] flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-[#303030]">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 m-0">
          Activity History
        </h3>
        <span className="text-xs text-gray-500">
          {activities.length} {activities.length === 1 ? "activity" : "activities"} logged
        </span>
      </div>

      <div className="space-y-4 overflow-y-auto h-[82vh] p-4 pr-2">
        {activities?.map((act) => {
          const isDone = act.status?.toUpperCase() === "DONE";
          const isPending = act.status?.toUpperCase() === "PENDING";

          const borderColor = isDone
            ? "border-green-500"
            : isPending
            ? "border-yellow-500"
            : "border-blue-500";

          const statusColor = isDone
            ? "text-green-600 dark:text-green-400"
            : isPending
            ? "text-yellow-600 dark:text-yellow-400"
            : "text-blue-600 dark:text-blue-400";

          return (
            <div
              key={act.id}
              className={`p-3.5 bg-white dark:bg-[#262626] rounded-lg shadow-sm border-l-4 ${borderColor}`}
            >
              {/* Date */}
              <p className="text-xs text-gray-500 mb-1">
                {dayjs(act?.createdDateInMill).format("DD-MM-YYYY hh:mm A")}
              </p>

              {/* Type & Status Row */}
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {act.type}
                </span>
                <span className={`text-xs font-semibold ${statusColor}`}>
                  {act.status}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-5 m-0 mb-2">
                {act.description || "No description provided."}
              </p>

              {/* Scheduled Date */}
              {act?.scheduledDate ? (
                <p className="text-xs text-gray-500 m-0">
                  <span className="font-semibold text-gray-600 dark:text-gray-400">
                    Scheduled:{" "}
                  </span>
                  {dayjs(act.scheduledDate).format("DD-MM-YYYY hh:mm A")}
                </p>
              ) : null}
            </div>
          );
        })}

        {activities.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            No activity history recorded yet.
          </div>
        )}

        {activitiesCursor && (
          <Button
            block
            loading={activityPageLoading}
            onClick={onLoadMore}
            className="mt-2"
          >
            Load more activities
          </Button>
        )}
      </div>
    </div>
  );
};

export default LeadActivityStream;

