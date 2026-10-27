import React, { useState } from "react";
import { Modal, Form, Input, Button, message } from "antd";
import { APP_MESSAGES } from "@/shared/lib/constants";
import { PermissionDTO } from "../types/types";
import { accessControlApi } from "../api/accessControlApi";


interface AddPermissionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void; // optional callback after successful add
  outletId: string;
}

const AddPermissionModal: React.FC<AddPermissionModalProps> = ({
  open,
  onClose,
  onSuccess,
  outletId,
}) => {
  const [form] = Form.useForm<PermissionDTO>();
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!values.key && values.label) {
        values.key = values.label.toUpperCase().replace(/\s+/g, "_");
       }
      setLoading(true);
      await accessControlApi.createPermission(outletId, values);
      messageApi.success(APP_MESSAGES.SUCCESS_CREATE);
      form.resetFields();
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error(error);
      if (error instanceof Error) messageApi.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Modal
        title="Add New Permission"
        open={open}
        onCancel={onClose}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          name="addPermissionForm"
          initialValues={{ key: "", label: "", description: "", category: "" }}
        >
          <Form.Item
            label="Permission Key"
            name="key"
            rules={[
              { required: true, message: "Please enter a unique permission key" },
            ]}
          >
            <Input allowClear placeholder="e.g. VIEW_DASHBOARD"  autoCapitalize=""/>
          </Form.Item>

          <Form.Item
            label="Label"
            name="label"
            rules={[{ required: true, message: "Please enter a label" }]}
          >
            <Input placeholder="e.g. View Dashboard" />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
            rules={[{ required: true, message: "Please enter a description" }]}
          >
            <Input.TextArea placeholder="Access to dashboard and analytics" rows={1} />
          </Form.Item>

          <Form.Item
            label="Category"
            name="category"
            rules={[{ required: true, message: "Please enter a category" }]}
          >
            <Input placeholder="e.g. Dashboard" />
          </Form.Item>

          <Form.Item className="flex justify-center items-center">
            <Button
              type="primary"
              block
              loading={loading}
              onClick={handleSubmit}
            >
              Add Permission
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default AddPermissionModal;
