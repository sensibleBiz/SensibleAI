import { MoreOutlined } from "@ant-design/icons";
import { Button, Card, Dropdown, Empty, Grid, Progress, Space, Table, Tag, Typography } from "antd";
import type { TaskItem } from "../api/taskApi";

export type TaskUiAction = "EDIT" | "START" | "PROGRESS" | "BLOCK" | "COMPLETE" | "REOPEN" | "CANCEL" | "REASSIGN" | "DELETE";

const priorityColors = { LOW: "default", MEDIUM: "blue", HIGH: "orange", URGENT: "red" } as const;
const statusColors: Record<string, string> = { OPEN: "blue", ASSIGNED: "gold", IN_PROGRESS: "processing", BLOCKED: "error", COMPLETED: "success", CANCELLED: "default" };

interface Props {
  items: TaskItem[];
  loading: boolean;
  canUpdate: boolean;
  canAssign: boolean;
  canDelete: boolean;
  onOpen: (task: TaskItem) => void;
  onAction: (task: TaskItem, action: TaskUiAction) => void;
}

export default function TaskTable({ items, loading, canUpdate, canAssign, canDelete, onOpen, onAction }: Props) {
  const compact = !Grid.useBreakpoint().lg;
  const actions = (task: TaskItem) => {
    const values: Array<{ key: TaskUiAction; label: string; danger?: boolean }> = [];
    if (canUpdate) {
      values.push({ key: "EDIT", label: "Edit" });
      if (["OPEN", "ASSIGNED", "BLOCKED"].includes(task.status)) values.push({ key: "START", label: "Start" });
      if (["IN_PROGRESS", "BLOCKED"].includes(task.status)) values.push({ key: "PROGRESS", label: "Update progress" });
      if (["ASSIGNED", "IN_PROGRESS"].includes(task.status)) values.push({ key: "BLOCK", label: "Mark blocked" });
      if (["ASSIGNED", "IN_PROGRESS"].includes(task.status)) values.push({ key: "COMPLETE", label: "Complete" });
      if (["COMPLETED", "CANCELLED"].includes(task.status)) values.push({ key: "REOPEN", label: "Reopen" });
      if (!["COMPLETED", "CANCELLED"].includes(task.status)) values.push({ key: "CANCEL", label: "Cancel", danger: true });
    }
    if (canAssign) values.push({ key: "REASSIGN", label: "Reassign" });
    if (canDelete) values.push({ key: "DELETE", label: "Archive", danger: true });
    return values;
  };
  const actionButton = (task: TaskItem) => {
    const menu = actions(task);
    if (!menu.length) return null;
    const [primary, ...secondary] = menu;
    return (
      <Space className="task-mobile-card__actions" size={4} wrap>
        <Button size="small" onClick={() => onAction(task, primary.key)}>{primary.label}</Button>
        {secondary.length > 0 && (
          <Dropdown menu={{ items: secondary, onClick: ({ key }) => onAction(task, key as TaskUiAction) }} trigger={["click"]}>
            <Button size="small" aria-label={`More actions for ${task.title}`} icon={<MoreOutlined />} />
          </Dropdown>
        )}
      </Space>
    );
  };
  if (compact) return (
    <div className="task-mobile-list">
      {!loading && !items.length && <Empty description="No tasks match these filters" />}
      {items.map((task) => (
        <Card key={task.id} size="small" className="task-mobile-card">
          <div className="task-mobile-card__header">
            <Button type="link" className="task-mobile-card__title" onClick={() => onOpen(task)}>{task.title}</Button>
            {actionButton(task)}
          </div>
          <Space wrap>
            <Tag color={priorityColors[task.priority]}>{task.priority}</Tag>
            <Tag color={statusColors[task.status]}>{task.status.replaceAll("_", " ")}</Tag>
            {task.dueAt < Date.now() && task.isOpen && <Tag color="red">OVERDUE</Tag>}
          </Space>
          <Typography.Paragraph type="secondary" className="task-mobile-card__meta">
            {task.taskNumber} · {task.assignedToName || "Unassigned"} · Due {new Date(task.dueAt).toLocaleString()}
          </Typography.Paragraph>
          <Progress percent={task.progressPercent} size="small" />
        </Card>
      ))}
    </div>
  );
  return (
    <Table rowKey="id" loading={loading} dataSource={items} pagination={false} size="middle" scroll={{ x: 980 }} columns={[
      { title: "Task", key: "task", width: 280, render: (_, task) => <><Button type="link" onClick={() => onOpen(task)} className="task-table-title">{task.title}</Button><div><Typography.Text type="secondary">{task.taskNumber} · {task.taskType}</Typography.Text></div></> },
      { title: "Assignee", dataIndex: "assignedToName", width: 170, render: (name, task) => <>{name || "Unassigned"}<div><Typography.Text type="secondary">{task.assignedToDepartment}</Typography.Text></div></> },
      { title: "Priority", dataIndex: "priority", width: 110, render: (value) => <Tag color={priorityColors[value as keyof typeof priorityColors]}>{value}</Tag> },
      { title: "Status", dataIndex: "status", width: 140, render: (value, task) => <Space direction="vertical" size={2}><Tag color={statusColors[value]}>{String(value).replaceAll("_", " ")}</Tag>{task.dueAt < Date.now() && task.isOpen && <Tag color="red">OVERDUE</Tag>}</Space> },
      { title: "Due", dataIndex: "dueAt", width: 190, render: (value) => new Date(Number(value)).toLocaleString() },
      { title: "Progress", dataIndex: "progressPercent", width: 140, render: (value) => <Progress percent={value} size="small" /> },
      { title: "", key: "actions", width: 130, fixed: "right", render: (_, task) => actionButton(task) },
    ]} />
  );
}
