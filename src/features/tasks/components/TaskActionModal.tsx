import { Form, Input, Modal, Select } from "antd";
import { useEffect, useState } from "react";
import type { TeamTreeDTO } from "@/features/team";
import type { TaskUiAction } from "./TaskTable";

interface Props {
  open: boolean;
  action: TaskUiAction | null;
  assignees: TeamTreeDTO[];
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}

const progressOptions = [10, 20, 30, 50, 70, 90].map((value) => ({ value, label: `${value}%` }));

export default function TaskActionModal({ open, action, assignees, onCancel, onSubmit }: Props) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) form.resetFields(); }, [form, open, action]);
  if (!action || ["EDIT", "START", "REOPEN", "DELETE"].includes(action)) return null;
  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try { await onSubmit(values); } finally { setSaving(false); }
  };
  const reasonRequired = action === "BLOCK" || action === "CANCEL";
  return (
    <Modal title={action.replaceAll("_", " ")} open={open} onCancel={onCancel}
      onOk={() => void submit()} confirmLoading={saving} width="min(520px, calc(100vw - 24px))">
      <Form form={form} layout="vertical">
        {action === "PROGRESS" && <Form.Item name="progressPercent" label="Progress stage" rules={[{ required: true }]} extra="Complete the task to move it to 100%."><Select options={progressOptions} /></Form.Item>}
        {action === "COMPLETE" && <Form.Item name="reason" label="Completion note" rules={[{ max: 1000 }]}><Input.TextArea rows={4} /></Form.Item>}
        {reasonRequired && <Form.Item name="reason" label="Reason" rules={[{ required: true }, { max: 1000 }]}><Input.TextArea rows={4} /></Form.Item>}
        {action === "REASSIGN" && <Form.Item name="assignedToUserId" label="New assignee" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={assignees.map((member) => ({
            value: member.userProfileId,
            label: `${member.userName} · ${member.department || "No department"}`,
          }))} />
        </Form.Item>}
      </Form>
    </Modal>
  );
}
