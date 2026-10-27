import { DatePicker, Form, Input, Modal, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import type { TeamTreeDTO } from "@/features/team";
import type { TaskItem, TaskPriority } from "../api/taskApi";

export interface TaskFormResult {
  title: string;
  description: string;
  taskType: string;
  priority: TaskPriority;
  assignedToUserId?: string;
  taskDate: string;
  dueAt: string;
  outletTimeZone: string;
}

interface FormValues extends Omit<TaskFormResult, "taskDate" | "dueAt"> {
  taskDate: Dayjs;
  dueAt: Dayjs;
}

interface Props {
  open: boolean;
  task?: TaskItem | null;
  assignees: TeamTreeDTO[];
  canAssign: boolean;
  onCancel: () => void;
  onSubmit: (values: TaskFormResult) => Promise<void>;
}

export default function TaskFormModal({ open, task, assignees, canAssign, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm<FormValues>();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(task ? {
      title: task.title,
      description: task.description,
      taskType: task.taskType,
      priority: task.priority,
      assignedToUserId: task.assignedToUserId ?? undefined,
      taskDate: dayjs(task.taskDate),
      dueAt: dayjs(task.dueAt),
      outletTimeZone: task.outletTimeZone,
    } : {
      description: "",
      taskType: "GENERAL",
      priority: "MEDIUM",
      taskDate: dayjs(),
      dueAt: dayjs().add(1, "hour"),
      outletTimeZone: "Asia/Kolkata",
    });
  }, [form, open, task]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await onSubmit({
        ...values,
        title: values.title.trim(),
        description: values.description?.trim() ?? "",
        taskType: values.taskType.trim(),
        taskDate: values.taskDate.format("YYYY-MM-DD"),
        dueAt: values.dueAt.toISOString(),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={task ? "Edit task" : "Create task"} open={open} onCancel={onCancel}
      onOk={() => void submit()} confirmLoading={saving} width="min(680px, calc(100vw - 24px))"
      styles={{ body: { maxHeight: "calc(100dvh - 180px)", overflowY: "auto" } }} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true }, { max: 300 }]}><Input /></Form.Item>
        <Form.Item name="description" label="Description" rules={[{ max: 5000 }]}><Input.TextArea rows={3} /></Form.Item>
        <div className="task-form-grid">
          <Form.Item name="taskType" label="Task type" rules={[{ required: true }, { max: 80 }]}><Input /></Form.Item>
          <Form.Item name="priority" label="Priority" rules={[{ required: true }]}>
            <Select options={["LOW", "MEDIUM", "HIGH", "URGENT"].map((value) => ({ value, label: value }))} />
          </Form.Item>
          {canAssign && <Form.Item name="assignedToUserId" label="Assignee">
            <Select allowClear showSearch optionFilterProp="label" options={assignees.map((member) => ({
              value: member.userProfileId,
              label: `${member.userName} · ${member.department || "No department"}`,
            }))} />
          </Form.Item>}
          <Form.Item name="taskDate" label="Task date" rules={[{ required: true }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="dueAt" label="Due date and time" dependencies={["taskDate"]} rules={[
            { required: true },
            ({ getFieldValue }) => ({ validator(_, value) {
              const taskDate = getFieldValue("taskDate") as Dayjs | undefined;
              return !value || !taskDate || !value.isBefore(taskDate.startOf("day"))
                ? Promise.resolve()
                : Promise.reject(new Error("Due date cannot precede task date"));
            } }),
          ]}><DatePicker showTime format="DD MMM YYYY, hh:mm A" style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="outletTimeZone" label="Time zone" rules={[{ required: true }]}><Input /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

