import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Modal, Segmented } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { usePermission } from "@/features/access-control";
import PageHeader from "@/shared/components/ui/PageHeader";
import { useMessageApi } from "@/shared/hooks";
import { PERMISSION_MASTER } from "@/shared/lib/constants";
import { getErrorMessage } from "@/shared/utils/errorUtils";
import { taskApi, type TaskItem, type TaskStatus } from "../api/taskApi";
import TaskActionModal from "../components/TaskActionModal";
import TaskDashboardCards, { type TaskDashboard } from "../components/TaskDashboardCards";
import TaskFilters, { type TaskFiltersValue } from "../components/TaskFilters";
import TaskFormModal, { type TaskFormResult } from "../components/TaskFormModal";
import TaskTable, { type TaskUiAction } from "../components/TaskTable";
import "../styles/tasks.css";

export default function TaskManagementPage() {
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const assignees = useSelector((state: RootState) => state.appState.teamTreeData || []);
  const navigate = useNavigate();
  const messageApi = useMessageApi();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission(PERMISSION_MASTER.CRM_TASK_CREATE);
  const canUpdate = hasPermission(PERMISSION_MASTER.CRM_TASK_UPDATE);
  const canAssign = hasPermission(PERMISSION_MASTER.CRM_TASK_ASSIGN);
  const canDelete = hasPermission(PERMISSION_MASTER.CRM_TASK_DELETE);
  const [scope, setScope] = useState<"my" | "team">("my");
  const [filters, setFilters] = useState<TaskFiltersValue>({});
  const [items, setItems] = useState<TaskItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskItem | null>(null);
  const [actionTask, setActionTask] = useState<TaskItem | null>(null);
  const [action, setAction] = useState<TaskUiAction | null>(null);

  const load = useCallback(async (cursor?: string, signal?: AbortSignal) => {
    if (!outletId) return;
    cursor ? setLoadingMore(true) : setLoading(true);
    try {
      const result = await taskApi.list({
        outletId, status: filters.status, priority: filters.priority,
        assignedTo: scope === "my" ? "me" : filters.assignedTo,
        q: filters.search, dueFrom: filters.dueDate,
        dueTo: filters.overdue ? dayjs().subtract(1, "day").format("YYYY-MM-DD") : filters.dueDate,
        cursor, limit: 100,
      }, signal);
      const visible = filters.overdue ? result.items.filter((task) => task.isOpen) : result.items;
      setItems((current) => cursor ? [...current, ...visible] : visible);
      setNextCursor(result.nextCursor);
    } catch (error) {
      if (!signal?.aborted) messageApi.error(getErrorMessage(error, "Unable to load tasks"));
    } finally {
      if (!signal?.aborted) { setLoading(false); setLoadingMore(false); }
    }
  }, [filters, messageApi, outletId, scope]);

  useEffect(() => {
    const controller = new AbortController();
    void load(undefined, controller.signal);
    return () => controller.abort();
  }, [load]);

  const dashboard = useMemo<TaskDashboard>(() => ({
    total: items.length,
    pending: items.filter((task) => ["OPEN", "ASSIGNED"].includes(task.status)).length,
    inProgress: items.filter((task) => task.status === "IN_PROGRESS").length,
    completed: items.filter((task) => task.status === "COMPLETED").length,
    overdue: items.filter((task) => task.isOpen && task.dueAt < Date.now()).length,
    blocked: items.filter((task) => task.status === "BLOCKED").length,
  }), [items]);

  const saveForm = async (values: TaskFormResult) => {
    if (!outletId) return;
    const { assignedToUserId, ...taskValues } = values;
    try {
      if (editTask) await taskApi.update(editTask.id, {
        outletId, version: editTask.version, ...taskValues,
        ...(canAssign ? { assignedToUserId: assignedToUserId ?? null } : {}),
      });
      else await taskApi.create({
        outletId, ...taskValues,
        ...(canAssign ? { assignedToUserId } : {}),
      });
      messageApi.success(editTask ? "Task updated" : "Task created");
      setFormOpen(false); setEditTask(null); await load();
    } catch (error) { messageApi.error(getErrorMessage(error, "Unable to save task")); }
  };

  const setStatus = (task: TaskItem, status: TaskStatus, progressPercent?: number, reason?: string) => {
    if (!outletId) return Promise.resolve();
    return taskApi.updateStatus(task.id, { outletId, version: task.version, status, progressPercent, reason }).then(() => undefined);
  };

  const runAction = async (values: Record<string, unknown>) => {
    if (!outletId || !actionTask || !action) return;
    try {
      if (action === "REASSIGN") await taskApi.update(actionTask.id, {
        outletId, version: actionTask.version, assignedToUserId: String(values.assignedToUserId),
      });
      else {
        const status: TaskStatus = action === "PROGRESS" ? "IN_PROGRESS" : action === "BLOCK" ? "BLOCKED" : action === "COMPLETE" ? "COMPLETED" : "CANCELLED";
        await setStatus(actionTask, status, action === "PROGRESS" ? Number(values.progressPercent) : undefined, typeof values.reason === "string" ? values.reason : undefined);
      }
      messageApi.success("Task updated"); setAction(null); setActionTask(null); await load();
    } catch (error) { messageApi.error(getErrorMessage(error, "Unable to update task")); }
  };

  const chooseAction = (task: TaskItem, next: TaskUiAction) => {
    if (next === "EDIT") { setEditTask(task); setFormOpen(true); return; }
    if (next === "DELETE") {
      Modal.confirm({ title: "Archive this task?", content: "Its audit history will be retained.", okText: "Archive",
        okButtonProps: { danger: true }, onOk: async () => {
          if (!outletId) return;
          try { await taskApi.archive(outletId, task.id, task.version); messageApi.success("Task archived"); await load(); }
          catch (error) { messageApi.error(getErrorMessage(error, "Unable to archive task")); }
        } });
      return;
    }
    if (next === "START" || next === "REOPEN") {
      void setStatus(task, next === "START" ? "IN_PROGRESS" : "ASSIGNED")
        .then(() => { messageApi.success("Task updated"); return load(); })
        .catch((error) => messageApi.error(getErrorMessage(error, "Unable to update task")));
      return;
    }
    setActionTask(task); setAction(next);
  };

  if (!outletId) return <div className="task-page"><Alert type="info" showIcon message="Select an outlet to manage tasks." /></div>;
  return <div className="task-page">
    <PageHeader title="Task Management" description="Assign, track, complete, and review outlet work" extra={<>
      <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>Refresh</Button>
      {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditTask(null); setFormOpen(true); }}>Create task</Button>}
    </>} />
    <div className="task-toolbar"><Segmented value={scope} options={[{ label: "My tasks", value: "my" }, { label: "Team tasks", value: "team" }]} onChange={(value) => setScope(value as "my" | "team")} /></div>
    <TaskDashboardCards data={dashboard} />
    <TaskFilters value={filters} assignees={assignees} onChange={setFilters} />
    <Card className="task-list-card">
      <TaskTable items={items} loading={loading} canUpdate={canUpdate} canAssign={canAssign} canDelete={canDelete}
        onOpen={(task) => navigate(`/tasks/${task.id}`)} onAction={chooseAction} />
      {nextCursor && <div className="task-load-more"><Button loading={loadingMore} onClick={() => void load(nextCursor)}>Load more</Button></div>}
    </Card>
    <TaskFormModal open={formOpen} task={editTask} assignees={assignees} canAssign={canAssign} onCancel={() => { setFormOpen(false); setEditTask(null); }} onSubmit={saveForm} />
    <TaskActionModal open={Boolean(action)} action={action} assignees={assignees} onCancel={() => { setAction(null); setActionTask(null); }} onSubmit={runAction} />
  </div>;
}
