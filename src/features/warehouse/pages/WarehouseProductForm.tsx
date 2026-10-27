import { useEffect, useState, type ReactNode } from "react";
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Switch,
  Typography,
} from "antd";
import {
  AppstoreOutlined,
  BarcodeOutlined,
  DollarOutlined,
  InboxOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { useSelector } from "react-redux";
import { WarehouseProductDetails } from "../types/types";
import { RootState } from "@/app/store";
import { productApi } from "@/features/products";

const { Text } = Typography;
const { TextArea } = Input;

interface Category {
  id: string;
  name: string;
  isDeleted?: boolean;
}

type WarehouseProductFormValues = Omit<
  WarehouseProductDetails,
  "id" | "createdAt" | "updatedAt"
>;

interface WarehouseProductFormProps {
  initialValues?: WarehouseProductDetails | null;
  onCancel: () => void;
  onSubmit: (
    values: Omit<WarehouseProductDetails, "id">
  ) => void | Promise<void>;
  enabled?: boolean;
  variant?: "page" | "modal";
}

interface SectionCardProps {
  children: ReactNode;
  description: string;
  icon: ReactNode;
  title: string;
}

const emptyProductValues: Partial<WarehouseProductFormValues> = {
  isAddOn: false,
  minUnit: {
    length: "",
    width: "",
    height: "",
    weight: "",
    volume: "",
  },
  uidMap: {
    GTIN: "",
    ISBN: null,
    BatchId: "",
    QRCode: "",
    IMEI: null,
    SerialNumber: null,
    MACAddress: null,
    VIN: null,
    RFID: null,
  },
};

function getFormValues(
  product?: WarehouseProductDetails | null
): Partial<WarehouseProductFormValues> {
  if (!product) return emptyProductValues;

  return {
    name: product.name ?? "",
    sku: product.sku ?? "",
    description: product.description ?? "",
    category: product.category ?? "",
    brand: product.brand ?? "",
    mrpPrice: product.mrpPrice ?? 0,
    price: product.price ?? 0,
    isAddOn: product.isAddOn ?? false,
    minUnit: {
      length: product.minUnit?.length ?? "",
      width: product.minUnit?.width ?? "",
      height: product.minUnit?.height ?? "",
      weight: product.minUnit?.weight ?? "",
      volume: product.minUnit?.volume ?? "",
    },
    uidMap: {
      GTIN: product.uidMap?.GTIN ?? "",
      ISBN: product.uidMap?.ISBN ?? null,
      BatchId: product.uidMap?.BatchId ?? "",
      QRCode: product.uidMap?.QRCode ?? "",
      IMEI: product.uidMap?.IMEI ?? null,
      SerialNumber: product.uidMap?.SerialNumber ?? null,
      MACAddress: product.uidMap?.MACAddress ?? null,
      VIN: product.uidMap?.VIN ?? null,
      RFID: product.uidMap?.RFID ?? null,
    },
  };
}

function SectionCard({
  children,
  description,
  icon,
  title,
}: SectionCardProps) {
  return (
    <Card
      className="overflow-hidden !rounded-xl !border-slate-200 shadow-sm"
      styles={{ body: { padding: 0 } }}
    >
      <div className="flex items-start gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-lg text-blue-600">
          {icon}
        </div>
        <div>
          <h2 className="m-0 text-base font-semibold text-slate-900">{title}</h2>
          <p className="m-0 mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="px-5 pb-1 pt-5 sm:px-6 sm:pt-6">{children}</div>
    </Card>
  );
}

export default function WarehouseProductForm({
  initialValues,
  onCancel,
  onSubmit,
  enabled = true,
  variant = "page",
}: WarehouseProductFormProps) {
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id
  );
  const [form] = Form.useForm<WarehouseProductFormValues>();
  const isAddOn = Form.useWatch("isAddOn", form) ?? false;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    form.setFieldsValue(getFormValues(initialValues));
  }, [enabled, form, initialValues]);

  useEffect(() => {
    if (!enabled || !outletId) return;

    let isCurrent = true;

    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const data = await productApi.listCategories(outletId);
        if (isCurrent) {
          setCategories(data.map((category) => ({
            id: category.id,
            name: category.name,
            isDeleted: !category.active,
          })));
        }
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        if (isCurrent) setLoadingCategories(false);
      }
    };

    void fetchCategories();

    return () => {
      isCurrent = false;
    };
  }, [enabled, outletId]);

  const handleFinish = async (values: WarehouseProductFormValues) => {
    const now = Date.now();

    setSubmitting(true);
    try {
      await onSubmit({
        ...values,
        createdAt: initialValues?.createdAt ?? now,
        updatedAt: now,
        customFields: values.customFields ?? {},
      });
    } finally {
      setSubmitting(false);
    }
  };

  const isPage = variant === "page";

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={emptyProductValues}
      onFinish={handleFinish}
      preserve={false}
      requiredMark={(label, { required }) => (
        <span className="flex items-center gap-1">
          {label}
          {required && <span className="text-red-500">*</span>}
        </span>
      )}
      className={isPage ? "w-full" : "pt-2"}
    >
      <div className="space-y-5">
        <SectionCard
          title="Basic information"
          description="Add the product identity and how it should be classified."
          icon={<AppstoreOutlined />}
        >
          <div className="grid grid-cols-1 gap-x-5 md:grid-cols-2">
            <Form.Item
              label="Product name"
              name="name"
              rules={[
                { required: true, message: "Please enter the product name" },
                { whitespace: true, message: "Product name cannot be empty" },
              ]}
            >
              <Input
                size="large"
                placeholder="e.g. Sensible Elite Terminal"
              />
            </Form.Item>

            <Form.Item
              label="SKU"
              name="sku"
              rules={[
                { required: true, message: "Please enter the SKU" },
                { whitespace: true, message: "SKU cannot be empty" },
              ]}
            >
              <Input size="large" placeholder="e.g. SEN-ELITE-001" />
            </Form.Item>

            <Form.Item label="Category" name="category">
              <Select
                size="large"
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="Select a category"
                loading={loadingCategories}
                notFoundContent={
                  loadingCategories ? <Spin size="small" /> : "No categories found"
                }
                options={categories.map((category) => ({
                  label: category.name,
                  value: category.id,
                }))}
              />
            </Form.Item>

            <Form.Item
              label="Brand"
              name="brand"
              rules={[
                { required: true, message: "Please enter the brand" },
                { whitespace: true, message: "Brand cannot be empty" },
              ]}
            >
              <Input size="large" placeholder="e.g. Sensible" />
            </Form.Item>

            <Form.Item
              label="Description"
              name="description"
              className="md:col-span-2"
            >
              <TextArea
                rows={4}
                maxLength={500}
                showCount
                placeholder="Describe the product, its purpose, and key features"
                className="resize-none"
              />
            </Form.Item>
          </div>

          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Text strong>Product type</Text>
                <p className="m-0 mt-1 text-sm text-slate-500">
                  {isAddOn
                    ? "This product is sold as an add-on to another product."
                    : "This is a standard product that can be sold independently."}
                </p>
              </div>
              <Form.Item
                name="isAddOn"
                valuePropName="checked"
                className="!mb-0"
              >
                <Switch
                  checkedChildren="Add-on"
                  unCheckedChildren="Regular"
                />
              </Form.Item>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Pricing"
          description="Set the customer-facing MRP and the dealer selling price."
          icon={<DollarOutlined />}
        >
          <div className="grid grid-cols-1 gap-x-5 md:grid-cols-2">
            <Form.Item
              label="Customer price (MRP)"
              name="mrpPrice"
              rules={[
                { required: true, message: "Please enter the customer price" },
                {
                  type: "number",
                  min: 0,
                  message: "Price cannot be negative",
                },
              ]}
            >
              <InputNumber
                min={0}
                precision={2}
                size="large"
                className="w-full"
                placeholder="0.00"
                prefix="₹"
              />
            </Form.Item>

            <Form.Item
              label="Dealer price"
              name="price"
              rules={[
                { required: true, message: "Please enter the dealer price" },
                {
                  type: "number",
                  min: 0,
                  message: "Price cannot be negative",
                },
              ]}
            >
              <InputNumber
                min={0}
                precision={2}
                size="large"
                className="w-full"
                placeholder="0.00"
                prefix="₹"
              />
            </Form.Item>
          </div>
        </SectionCard>

        <SectionCard
          title="Minimum unit dimensions"
          description="Record packaging dimensions used for storage and movement."
          icon={<InboxOutlined />}
        >
          <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
            <Form.Item label="Length" name={["minUnit", "length"]}>
              <Input size="large" placeholder="e.g. 10 cm" />
            </Form.Item>
            <Form.Item label="Width" name={["minUnit", "width"]}>
              <Input size="large" placeholder="e.g. 5 cm" />
            </Form.Item>
            <Form.Item label="Height" name={["minUnit", "height"]}>
              <Input size="large" placeholder="e.g. 3 cm" />
            </Form.Item>
            <Form.Item label="Weight" name={["minUnit", "weight"]}>
              <Input size="large" placeholder="e.g. 500 g" />
            </Form.Item>
            <Form.Item label="Volume" name={["minUnit", "volume"]}>
              <Input size="large" placeholder="e.g. 150 ml" />
            </Form.Item>
          </div>
        </SectionCard>

        <SectionCard
          title="Unique identifiers"
          description="Add inventory and traceability codes for this product."
          icon={<BarcodeOutlined />}
        >
          <div className="grid grid-cols-1 gap-x-5 md:grid-cols-2 xl:grid-cols-3">
            <Form.Item
              label="GTIN"
              name={["uidMap", "GTIN"]}
              rules={[
                { required: true, message: "Please enter the GTIN" },
                { whitespace: true, message: "GTIN cannot be empty" },
              ]}
            >
              <Input size="large" placeholder="Enter GTIN" />
            </Form.Item>
            <Form.Item
              label="Batch ID"
              name={["uidMap", "BatchId"]}
              rules={[
                { required: true, message: "Please enter the batch ID" },
                { whitespace: true, message: "Batch ID cannot be empty" },
              ]}
            >
              <Input size="large" placeholder="Enter batch ID" />
            </Form.Item>
            <Form.Item label="QR code" name={["uidMap", "QRCode"]}>
              <Input size="large" placeholder="Enter QR code" />
            </Form.Item>
            <Form.Item label="ISBN" name={["uidMap", "ISBN"]}>
              <Input size="large" placeholder="Enter ISBN" />
            </Form.Item>
            <Form.Item label="IMEI" name={["uidMap", "IMEI"]}>
              <Input size="large" placeholder="Enter IMEI" />
            </Form.Item>
            <Form.Item
              label="Serial number"
              name={["uidMap", "SerialNumber"]}
            >
              <Input size="large" placeholder="Enter serial number" />
            </Form.Item>
            <Form.Item label="MAC address" name={["uidMap", "MACAddress"]}>
              <Input size="large" placeholder="Enter MAC address" />
            </Form.Item>
            <Form.Item label="VIN" name={["uidMap", "VIN"]}>
              <Input size="large" placeholder="Enter VIN" />
            </Form.Item>
            <Form.Item label="RFID" name={["uidMap", "RFID"]}>
              <Input size="large" placeholder="Enter RFID" />
            </Form.Item>
          </div>
        </SectionCard>
      </div>

      <div
        className={
          isPage
            ? "sticky bottom-0 z-10 -mx-1 mt-6 flex flex-col-reverse gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row sm:justify-end"
            : "mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5"
        }
      >
        <Button
          size="large"
          onClick={onCancel}
          disabled={submitting}
          className={isPage ? "w-full sm:w-auto sm:min-w-28" : ""}
        >
          Cancel
        </Button>
        <Button
          size="large"
          type="primary"
          htmlType="submit"
          icon={<SaveOutlined />}
          loading={submitting}
          className={
            isPage
              ? "w-full !bg-blue-600 sm:w-auto sm:min-w-40"
              : "!bg-blue-600"
          }
        >
          {initialValues ? "Update product" : "Save product"}
        </Button>
      </div>
    </Form>
  );
}
