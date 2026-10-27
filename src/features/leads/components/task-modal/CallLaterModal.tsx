import React from "react";
import { Modal, Form, DatePicker, Select, Input } from "antd";
import type { FormInstance } from "antd";
import dayjs from "dayjs";
import { LEAD_PRIORITY } from "@/shared/lib/constants";
import { formatEmployeeName, toTitleCase } from "@/shared/utils/helperFunctions";
import { ProductItem } from "@/features/products";

const { TextArea } = Input;

export interface CallLaterFormValues {
  assignedTo: string;
  description: string;
  priority: string;
  productId?: string;
  scheduledDate: dayjs.Dayjs;
}

interface CallLaterModalProps {
  open: boolean;
  confirmLoading: boolean;
  form: FormInstance<CallLaterFormValues>;
  assignedList?: Array<{ userName?: string; userProfileId?: string }>;
  products: ProductItem[];
  onOk: () => void;
  onCancel: () => void;
}

export const CallLaterModal: React.FC<CallLaterModalProps> = ({
  open,
  confirmLoading,
  form,
  assignedList = [],
  products = [],
  onOk,
  onCancel,
}) => {
  return (
    <Modal
      title="Interested – Call Later"
      open={open}
      okText="Schedule Callback"
      confirmLoading={confirmLoading}
      onOk={onOk}
      onCancel={onCancel}
      destroyOnClose
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item
          label="Next calling date and time"
          name="scheduledDate"
          rules={[{ required: true, message: "Select the callback time" }]}
        >
          <DatePicker
            showTime
            format="DD-MM-YYYY hh:mm A"
            style={{ width: "100%" }}
            disabledDate={(current) =>
              Boolean(current && current < dayjs().startOf("day"))
            }
          />
        </Form.Item>

        <Form.Item
          label="Assigned employee"
          name="assignedTo"
          rules={[{ required: true, message: "Select an employee" }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Select employee"
            options={assignedList?.map((member) => ({
              label: formatEmployeeName(member.userName),
              value: member.userProfileId,
            }))}
          />
        </Form.Item>

        <Form.Item
          label="Priority"
          name="priority"
          rules={[{ required: true, message: "Select priority" }]}
        >
          <Select
            options={Object.values(LEAD_PRIORITY).map((priority) => ({
              label: toTitleCase(priority),
              value: priority,
            }))}
          />
        </Form.Item>

        <Form.Item label="Interested product" name="productId">
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="Select product (optional)"
            options={products.map((product) => ({
              label: product.name,
              value: product.id,
            }))}
          />
        </Form.Item>

        <Form.Item
          label="Customer response / note"
          name="description"
          rules={[
            { required: true, message: "Enter the customer response" },
            { max: 10000 },
          ]}
        >
          <TextArea
            rows={4}
            placeholder="Example: Customer has a requirement and asked us to call after two days."
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CallLaterModal;

