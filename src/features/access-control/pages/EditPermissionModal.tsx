import { Modal, Form, Input, Button, message } from "antd";
import { useEffect, useState } from "react";
import { PermissionDTO } from "../types/types";
import { accessControlApi } from "../api/accessControlApi";

interface Props {
  permission: PermissionDTO;
  onClose: () => void;
  onSuccess?: () => void;
  outletId: string;
}

const EditPermissionModal: React.FC<Props> = ({
  permission,
  onClose,
  onSuccess,
  outletId,
}) => {
  const [form] = Form.useForm<PermissionDTO>();
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  useEffect(() => {
    form.setFieldsValue(permission);
  }, [permission, form]);

  const handleUpdate = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      await accessControlApi.updatePermission(
        outletId,
        permission.id!,
        values,
      );
      messageApi.success("Permission updated successfully");
      onSuccess?.();
      onClose();
    } catch (e) {
      console.error(e);
      if (e instanceof Error) messageApi.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}
      <Modal
        title="Edit Permission"
        open
        onCancel={onClose}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Permission Key" name="key">
            <Input disabled />
          </Form.Item>

          <Form.Item
            label="Label"
            name="label"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={1} />
          </Form.Item>

          <Form.Item
            label="Category"
            name="category"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>

          <Button
            type="primary"
            block
            loading={loading}
            onClick={handleUpdate}
          >
            Update Permission
          </Button>
        </Form>
      </Modal>
    </>
  );
};

export default EditPermissionModal;
