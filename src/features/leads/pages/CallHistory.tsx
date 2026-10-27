import { Button, Card, Empty, Spin, Tag } from "antd";
import {
  PhoneOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { LeadCallItem } from "../api/leadApi";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

interface CallHistoryProps {
  callLogs: LeadCallItem[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export default function CallHistory({
  callLogs,
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
}: CallHistoryProps) {
  const getDirectionTag = (direction: string) => {
    switch (direction.toLowerCase()) {
      case "incoming":
        return (
          <Tag color="green" icon={<ArrowDownOutlined />}>
            Incoming
          </Tag>
        );
      case "outgoing":
        return (
          <Tag color="blue" icon={<ArrowUpOutlined />}>
            Outgoing
          </Tag>
        );
      case "missed":
        return (
          <Tag color="red" icon={<CloseCircleOutlined />}>
            Missed
          </Tag>
        );
      default:
        return <Tag>{direction}</Tag>;
    }
  };

  const formatDuration = (sec: number) => {
    if (!sec) return "0 sec";
    if (sec < 60) return `${sec} sec`;
    return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <PhoneOutlined />
          Call History
        </span>
      }
      size="small"
      style={{ borderRadius: 10 }}
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spin />
        </div>
      ) : callLogs.length === 0 ? (
        <Empty description="No call history found" />
      ) : (
        <>
          <div
            className="grid gap-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            }}
          >
            {[...callLogs]
              .sort((a, b) => b.timestamp - a.timestamp)
              .map((log) => (
              <div
                key={log?.id}
                className="p-3 bg-white shadow-sm border"
                style={{ borderRadius: 10 }}
              >
                {/* Header */}
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <UserOutlined className="text-gray-500" />
                    <span className="font-semibold text-base">
                      {formatEmployeeName(log?.receiverName, "Unknown")}
                    </span>
                  </div>
                  {getDirectionTag(log?.direction)}
                </div>

                {/* Body */}
                <div className="text-sm text-gray-600 space-y-1">
                  <div>
                    <ClockCircleOutlined className="mr-2" />
                    {dayjs(log?.timestamp).format("DD MMM YYYY, hh:mm A")}
                  </div>

                  <div>
                    <strong>Number:</strong> {log?.number}
                  </div>

                  <div>
                    <strong>Receiver:</strong> {log?.receiverMobileNo}
                  </div>

                  <div>
                    <strong>Duration:</strong>{" "}
                    {formatDuration(log?.durationSeconds)}
                  </div>
                </div>
              </div>
              ))}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <Button loading={loadingMore} onClick={onLoadMore}>
                Load more calls
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
