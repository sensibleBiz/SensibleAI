import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Card, Descriptions, Empty, Progress, Space, Spin, Tag, Timeline, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import PageHeader from "@/shared/components/ui/PageHeader";
import { useMessageApi } from "@/shared/hooks";
import { getErrorMessage } from "@/shared/utils/errorUtils";
import { taskApi, type TaskHistoryItem, type TaskItem } from "../api/taskApi";
import "../styles/tasks.css";

export default function TaskDetailsPage() {
  const { taskId } = useParams();
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const navigate = useNavigate();
  const messageApi = useMessageApi();
  const [task, setTask] = useState<TaskItem | null>(null);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!outletId || !taskId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    Promise.all([
      taskApi.get(outletId, taskId, controller.signal),
      taskApi.history(outletId, taskId, undefined, 100, controller.signal),
    ]).then(([item, activity]) => {
      setTask(item);
      setHistory(activity.items);
    }).catch((error) => {
      if (controller.signal.aborted) return;
      messageApi.error(getErrorMessage(error, "Unable to load task"));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [messageApi, outletId, taskId]);

  return (
    <div className="task-page">
      <PageHeader title={task?.title || "Task details"} description={task?.taskNumber}
        extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/tasks")}>Back to tasks</Button>} />
      <Spin spinning={loading}>
        {!loading && !task ? <Empty description="Task not found" /> : task && (
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Card title="Task">
              <Space wrap style={{ marginBottom: 18 }}>
                <Tag color="blue">{task.taskType}</Tag>
                <Tag color={task.priority === "URGENT" ? "red" : "orange"}>{task.priority}</Tag>
                <Tag color={task.status === "COMPLETED" ? "green" : task.status === "BLOCKED" ? "red" : "processing"}>{task.status.replaceAll("_", " ")}</Tag>
                {task.dueAt < Date.now() && task.isOpen && <Tag color="red">OVERDUE</Tag>}
              </Space>
              <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }} items={[
                { key: "assignee", label: "Assignee", children: task.assignedToName || "Unassigned" },
                { key: "assigner", label: "Assigned by", children: task.assignedByName || "—" },
                { key: "due", label: "Due", children: `${new Date(task.dueAt).toLocaleString()} · ${task.outletTimeZone}` },
                { key: "date", label: "Task date", children: task.taskDate },
                { key: "created", label: "Created by", children: task.createdByName },
                { key: "version", label: "Version", children: task.version },
              ]} />
              {task.description && <Typography.Paragraph style={{ marginTop: 20 }}>{task.description}</Typography.Paragraph>}
              <Progress percent={task.progressPercent} />
            </Card>
            <Card title="Activity history">
              <Timeline items={history.map((item) => ({
                color: item.toStatus === "COMPLETED" ? "green" : item.toStatus === "BLOCKED" ? "red" : "blue",
                children: <><Typography.Text strong>{item.action.replaceAll("_", " ")}</Typography.Text><div>{item.changedByName} · {new Date(item.changedAt).toLocaleString()}</div>{item.reason && <Typography.Text type="secondary">{item.reason}</Typography.Text>}</>,
              }))} />
              {!history.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity recorded" />}
            </Card>
          </Space>
        )}
      </Spin>
    </div>
  );
}
