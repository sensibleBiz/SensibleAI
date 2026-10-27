import { useEffect, useState, useCallback } from "react";
import {
  Form,
  Input,
  Select,
  Radio,
  DatePicker,
  Button,
  Row,
  Col,
  Card,
  Tag,
} from "antd";
import dayjs from "dayjs";
import { useSelector } from "react-redux";
import { LeadsManagement } from "../types/types";
import { ProductItem } from "@/features/products";
import { RootState } from "@/app/store";

import {
  LEAD_ACTIVITY_TYPES,
  LEAD_PRIORITY,
} from "@/shared/lib/constants";

import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { productApi, type PostgresProductDTO } from "@/features/products";

const { TextArea } = Input;
const { Option } = Select;

interface LeadActivityFormProps {
  lead: LeadsManagement;
  onSubmit: (data: LeadActivityFormPayload) => void;
}

interface LeadActivityFormValues {
  assignedTo: string;
  description: string;
  leadName: string;
  mode?: string;
  priority: string;
  productId: string;
  scheduledDate?: dayjs.Dayjs;
  type: string;
}

export interface LeadActivityFormPayload
  extends Omit<LeadActivityFormValues, "scheduledDate"> {
  productDealerPrice: number;
  productId: string | null;
  productMrpPrice: number;
  productName: string | null;
  productType: string;
  scheduledDate: number | null;
  scheduledTime: number | null;
  createdDateInMill: number;
}

const mapPostgresProductToItem = (p: PostgresProductDTO): ProductItem => ({
  id: p.id,
  name: p.name,
  mrpPrice: p.mrpPrice,
  price: p.price,
  isAddOn: p.isAddOn,
  isDeleted: !p.active,
});

export default function LeadActivityForm({
  lead,
  onSubmit,
}: LeadActivityFormProps) {
  const [form] = Form.useForm();

  const [selectedType, setSelectedType] = useState<string>("");
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(
    null
  );

  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo.id
  );

  const assignedList = useSelector((state: RootState) =>
    state.appState?.teamTreeData
      ?.filter((mem) => mem?.department === "SALES" && mem?.isActive === true)
      .sort((a, b) => a.userName.localeCompare(b.userName))
  );

  const ACTIVITY_TYPES = Object.values(LEAD_ACTIVITY_TYPES);
  const PRIORITY_LIST = Object.values(LEAD_PRIORITY);

  const loadPostgresProducts = useCallback(async () => {
    if (!outletId) return;
    try {
      const res = await productApi.listProducts({ outletId });
      setProducts(res.items.map(mapPostgresProductToItem));
    } catch (error) {
      console.error("Failed to load products for activity form:", error);
    }
  }, [outletId]);

  // Fetch products from Product Master
  useEffect(() => {
    if (!outletId) return;

    void loadPostgresProducts();
  }, [outletId, loadPostgresProducts]);

  const handleFinish = (values: LeadActivityFormValues) => {
    const product = products.find((p) => p.id === values.productId);

    const payload = {
      ...values,

      // Product details
      productId: product?.id || null,
      productName: product?.name || null,
      productMrpPrice: product?.mrpPrice || 0,
      productDealerPrice: product?.price || 0,
      productType: product?.isAddOn ? "Add On" : "Regular",

      scheduledDate: values.scheduledDate
        ? values.scheduledDate.valueOf()
        : null,

      scheduledTime: values.scheduledDate
        ? values.scheduledDate.valueOf()
        : null,

      createdDateInMill: dayjs().valueOf(),
    };

    onSubmit(payload);

    form.resetFields();
    setSelectedType("");
    setSelectedProduct(null);
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleFinish}
      initialValues={{
        leadName: lead?.username,
        mode: "Offline",
      }}
    >
      <Row gutter={16}>
        {/* Activity Type */}
        <Col span={3}>
          <Form.Item
            label="Activity Type"
            name="type"
            rules={[{ required: true, message: "Please select activity type" }]}
          >
            <Select
              placeholder="Select type"
              onChange={(val) => setSelectedType(val)}
            >
              {ACTIVITY_TYPES.map((t) => (
                <Option key={t} value={t}>
                  {t}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        {/* If TYPE === DEMO then show Mode */}
        {selectedType === "Demo" && (
          <Col span={3}>
            <Form.Item
              label="Mode"
              name="mode"
              rules={[{ required: true, message: "Please select mode" }]}
            >
              <Radio.Group>
                <Radio value="Online">Online</Radio>
                <Radio value="Offline">Offline</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
        )}

        {/* Scheduled Date & Time */}
        <Col span={4}>
          <Form.Item
            label="Scheduled Date & Time"
            name="scheduledDate"
            rules={[{ required: true, message: "Select schedule date & time" }]}
          >
            <DatePicker
              showTime
              style={{ width: "100%" }}
              format="DD-MM-YYYY hh:mm A"
              disabledDate={(current) => {
                return current && current < dayjs().startOf("day");
              }}
              disabledTime={(current) => {
                if (!current) return {};

                if (current.isSame(dayjs(), "day")) {
                  return {
                    disabledHours: () =>
                      Array.from({ length: dayjs().hour() }, (_, i) => i),

                    disabledMinutes: () =>
                      Array.from({ length: 60 }, (_, i) =>
                        i < dayjs().minute() &&
                        current.hour() === dayjs().hour()
                          ? i
                          : -1
                      ).filter((i) => i !== -1),
                  };
                }

                return {};
              }}
            />
          </Form.Item>
        </Col>

        {/* Lead Name */}
        <Col span={4}>
          <Form.Item label="Lead Name" name="leadName">
            <Input disabled />
          </Form.Item>
        </Col>

        {/* Product Selection */}
        <Col span={5}>
          <Form.Item
            label="Interested Product"
            name="productId"
            rules={[{ required: true, message: "Please select product" }]}
          >
            <Select
              showSearch
              placeholder="Select product"
              optionFilterProp="label"
              options={products.map((p) => ({
                label: `${p.name} - ₹${p.mrpPrice}`,
                value: p.id,
              }))}
              onChange={(productId) => {
                const product =
                  products.find((p) => p.id === productId) || null;
                setSelectedProduct(product);
              }}
            />
          </Form.Item>
        </Col>

        {/* Assign To */}
        <Col span={4}>
          <Form.Item
            label="Assign To"
            name="assignedTo"
            rules={[{ required: true, message: "Please select user" }]}
          >
            <Select
              showSearch
              placeholder="Select a user"
              optionFilterProp="label"
              options={assignedList?.map((n) => ({
                label: formatEmployeeName(n.userName),
                value: n.userProfileId,
              }))}
            />
          </Form.Item>
        </Col>

        {/* Priority */}
        <Col span={3}>
          <Form.Item
            label="Priority"
            name="priority"
            rules={[{ required: true, message: "Please select priority" }]}
          >
            <Select placeholder="Select priority">
              {PRIORITY_LIST.map((p) => (
                <Option key={p} value={p}>
                  {p}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>

        {/* Description */}
        <Col span={5}>
          <Form.Item
            label="Description / Customer Feedback"
            name="description"
            rules={[{ required: true, message: "Please enter description" }]}
          >
            <TextArea rows={1} placeholder="Write something..." />
          </Form.Item>
        </Col>

        {/* Selected Product Card */}
        {selectedProduct && (
          <Col span={24}>
            <Card size="small" style={{ marginBottom: 12 }}>
              <Row gutter={16} align="middle">
                <Col span={6}>
                  <b>{selectedProduct.name}</b>
                </Col>

                <Col span={5}>
                  Customer Price:{" "}
                  <Tag color="blue">₹ {selectedProduct.mrpPrice}</Tag>
                </Col>

                <Col span={5}>
                  Dealer Price:{" "}
                  <Tag color="green">₹ {selectedProduct.price}</Tag>
                </Col>

                <Col span={4}>
                  Type:{" "}
                  <b>{selectedProduct.isAddOn ? "Add On" : "Regular"}</b>
                </Col>
              </Row>
            </Card>
          </Col>
        )}

        {/* Button */}
        <Col span={24} className="flex justify-end gap-3">
          <Button type="primary" htmlType="submit">
            Save Activity
          </Button>
        </Col>
      </Row>
    </Form>
  );
}
