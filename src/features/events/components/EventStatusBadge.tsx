import { Tag } from "antd";
import { EventStatus } from "../types/eventTypes";

const statusColor: Record<EventStatus, string> = {
  Active: "success",
  Inactive: "default",
  Expired: "error",
};

export default function EventStatusBadge({ status }: { status: EventStatus }) {
  return <Tag color={statusColor[status]}>{status}</Tag>;
}
