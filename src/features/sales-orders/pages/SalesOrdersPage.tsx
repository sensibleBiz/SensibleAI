import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Dropdown,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  MoreOutlined,
  PlusOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import {
  CrmFilterBar,
  CrmMetricCard,
  CrmPageHeader,
  CrmStatusBadge,
} from "@/shared/components/ui";
import { useMessageApi } from "@/shared/hooks";
import {
  defaultSalesOrderItems,
  salesOrderProducts,
  salesOrders,
  salesOrderSummary,
  type SalesOrder,
  type SalesOrderLineItem,
  type SalesOrderStatus,
} from "./salesOrdersData";

const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Text } = Typography;

interface SalesOrderFormValues {
  customer?: string;
  contactNumber?: string;
  email?: string;
  billingAddress?: string;
  shippingAddress?: string;
  orderDate?: dayjs.Dayjs;
  expectedDeliveryDate?: dayjs.Dayjs;
  salesPerson?: string;
  paymentTerms?: string;
  notes?: string;
  items?: SalesOrderLineItem[];
}

interface SalesOrderTotals {
  subtotal: number;
  discount: number;
  tax: number;
  grandTotal: number;
}

const statusColors: Record<SalesOrderStatus, string> = {
  Draft: "default",
  Pending: "orange",
  Confirmed: "blue",
  Completed: "green",
  Cancelled: "red",
};

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const formatCurrency = (value: number) => currencyFormatter.format(value);

const getItemTotals = (items: SalesOrderLineItem[] = []): SalesOrderTotals =>
  items.reduce<SalesOrderTotals>(
    (totals, item) => {
      const qty = Number(item.qty || 0);
      const rate = Number(item.rate || 0);
      const discount = Number(item.discount || 0);
      const taxPercent = Number(item.tax || 0);
      const gross = qty * rate;
      const taxable = Math.max(gross - discount, 0);
      const tax = (taxable * taxPercent) / 100;

      return {
        subtotal: totals.subtotal + gross,
        discount: totals.discount + discount,
        tax: totals.tax + tax,
        grandTotal: totals.grandTotal + taxable + tax,
      };
    },
    { subtotal: 0, discount: 0, tax: 0, grandTotal: 0 }
  );

const getLineAmount = (item?: SalesOrderLineItem) => {
  const totals = getItemTotals(item ? [item] : []);
  return totals.grandTotal;
};

export default function SalesOrdersPage() {
  const [form] = Form.useForm<SalesOrderFormValues>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<SalesOrderStatus | undefined>();
  const [customerFilter, setCustomerFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const messageApi = useMessageApi();
  const watchedItems = Form.useWatch("items", form) || [];

  const customerOptions = useMemo(
    () =>
      Array.from(new Set(salesOrders.map((order) => order.customer))).map(
        (customer) => ({ label: customer, value: customer })
      ),
    []
  );

  const filteredOrders = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return salesOrders.filter((order) => {
      const matchesSearch =
        !normalizedSearch ||
        [order.id, order.customer, order.contact, order.salesPerson]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesStatus = !statusFilter || order.status === statusFilter;
      const matchesCustomer = !customerFilter || order.customer === customerFilter;
      const matchesDate =
        !dateRange ||
        (order.orderDate >= dateRange[0] && order.orderDate <= dateRange[1]);

      return matchesSearch && matchesStatus && matchesCustomer && matchesDate;
    });
  }, [customerFilter, dateRange, searchText, statusFilter]);

  const activeFilterCount = [
    searchText.trim(),
    statusFilter,
    customerFilter,
    dateRange,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearchText("");
    setStatusFilter(undefined);
    setCustomerFilter(undefined);
    setDateRange(null);
  };

  const openCreateModal = () => {
    form.setFieldsValue({
      customer: "ABC Enterprises",
      contactNumber: "9876543210",
      email: "purchase@abcenterprises.in",
      billingAddress: "24 MG Road, Indore, Madhya Pradesh",
      shippingAddress: "Warehouse Gate 2, Vijay Nagar, Indore",
      orderDate: dayjs("2026-08-17"),
      expectedDeliveryDate: dayjs("2026-08-24"),
      salesPerson: "Rahul",
      paymentTerms: "Net 15",
      notes: "Demo order for frontend workflow validation.",
      items: defaultSalesOrderItems,
    });
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    form.resetFields();
  };

  const handleStaticSubmit = async (message: string) => {
    await form.validateFields();
    messageApi.success(message);
    closeCreateModal();
  };

  const columns: ColumnsType<SalesOrder> = [
    {
      title: "Order ID",
      dataIndex: "id",
      key: "id",
      fixed: "left",
      width: 120,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: "Order Date",
      dataIndex: "orderDate",
      key: "orderDate",
      width: 130,
      render: (value: string) => dayjs(value).format("DD MMM YYYY"),
    },
    {
      title: "Customer",
      dataIndex: "customer",
      key: "customer",
      width: 190,
      render: (value: string, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.email}
          </Text>
        </Space>
      ),
    },
    {
      title: "Contact",
      dataIndex: "contact",
      key: "contact",
      width: 130,
    },
    {
      title: "Items",
      dataIndex: "items",
      key: "items",
      align: "center",
      width: 90,
    },
    {
      title: "Total Amount",
      dataIndex: "totalAmount",
      key: "totalAmount",
      align: "right",
      width: 150,
      render: (value: number) => <Text strong>{formatCurrency(value)}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: SalesOrderStatus) => (
        <CrmStatusBadge status={status}>{status}</CrmStatusBadge>
      ),
    },
    {
      title: "Sales Person",
      dataIndex: "salesPerson",
      key: "salesPerson",
      width: 140,
    },
    {
      title: "Actions",
      key: "actions",
      fixed: "right",
      width: 180,
      render: (_value, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => messageApi.info(`Viewing ${record.id} is UI-only for now`)}
          >
            View
          </Button>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => messageApi.info(`Editing ${record.id} is UI-only for now`)}
          >
            Edit
          </Button>
          <Dropdown
            trigger={["click"]}
            menu={{
              items: [
                { key: "duplicate", label: "Duplicate" },
                { key: "download", label: "Download PDF" },
                { key: "cancel", label: "Cancel Order", danger: true },
              ],
              onClick: ({ key }) =>
                messageApi.info(`${key} action is static for ${record.id}`),
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  const totals = getItemTotals(watchedItems);

  return (
    <div className="sales-orders-page" style={{ minWidth: 0 }}>
      <CrmPageHeader
        title="Sales Orders"
        subtitle="Manage and track customer sales orders"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Create Sales Order
          </Button>
        }
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <CrmMetricCard
            title="Total Orders"
            value={salesOrderSummary.totalOrders}
            icon={<ShoppingCartOutlined />}
            iconColor="#2563eb"
            iconBg="rgba(37, 99, 235, 0.1)"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CrmMetricCard
            title="Pending"
            value={salesOrderSummary.pending}
            icon={<FileTextOutlined />}
            iconColor="#d97706"
            iconBg="rgba(217, 119, 6, 0.1)"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CrmMetricCard
            title="Confirmed"
            value={salesOrderSummary.confirmed}
            icon={<FileDoneOutlined />}
            iconColor="#16a34a"
            iconBg="rgba(22, 163, 74, 0.1)"
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <CrmMetricCard
            title="Completed"
            value={salesOrderSummary.completed}
            icon={<FileDoneOutlined />}
            iconColor="#7c3aed"
            iconBg="rgba(124, 58, 237, 0.1)"
          />
        </Col>
      </Row>

      <CrmFilterBar
        searchValue={searchText}
        onSearchChange={setSearchText}
        searchPlaceholder="Search Sales Order..."
        searchWidth={240}
        activeFilterCount={activeFilterCount}
        onReset={resetFilters}
      >
        <Select
          allowClear
          placeholder="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={Object.keys(statusColors).map((status) => ({
            label: status,
            value: status,
          }))}
          style={{ width: 170 }}
        />
        <Select
          allowClear
          showSearch
          placeholder="Customer"
          value={customerFilter}
          onChange={setCustomerFilter}
          options={customerOptions}
          optionFilterProp="label"
          style={{ width: 220 }}
        />
        <RangePicker
          value={dateRange ? [dayjs(dateRange[0]), dayjs(dateRange[1])] : null}
          onChange={(_dates, dateStrings) =>
            setDateRange(dateStrings[0] && dateStrings[1] ? dateStrings : null)
          }
        />
      </CrmFilterBar>

      <Card
        title={<Text strong>Sales Order List</Text>}
        extra={<Text type="secondary">{filteredOrders.length} orders</Text>}
      >
        <Table
          bordered
          columns={columns}
          dataSource={filteredOrders}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          rowKey="id"
          scroll={{ x: 1300 }}
        />
      </Card>

      <Modal
        title="Create Sales Order"
        open={createModalOpen}
        onCancel={closeCreateModal}
        footer={null}
        width={1040}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Divider orientation="left">Customer Details</Divider>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Customer"
                name="customer"
                rules={[{ required: true, message: "Please select a customer" }]}
              >
                <Select options={customerOptions} placeholder="Select customer" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="Contact Number"
                name="contactNumber"
                rules={[{ required: true, message: "Please enter contact number" }]}
              >
                <Input placeholder="Enter contact number" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Email" name="email">
                <Input placeholder="Enter email" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="Billing Address" name="billingAddress">
                <TextArea rows={2} placeholder="Enter billing address" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item label="Shipping Address" name="shippingAddress">
                <TextArea rows={2} placeholder="Enter shipping address" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Order Details</Divider>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                label="Order Date"
                name="orderDate"
                rules={[{ required: true, message: "Please select order date" }]}
              >
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Expected Delivery Date" name="expectedDeliveryDate">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Sales Person" name="salesPerson">
                <Select
                  placeholder="Select sales person"
                  options={["Rahul", "Priya", "Amit", "Neha"].map((name) => ({
                    label: name,
                    value: name,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="Payment Terms" name="paymentTerms">
                <Select
                  placeholder="Select terms"
                  options={["Due on Receipt", "Net 7", "Net 15", "Net 30"].map(
                    (term) => ({ label: term, value: term })
                  )}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item label="Notes" name="notes">
                <Input placeholder="Add order notes" />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left">Product Items</Divider>
          <Form.List name="items">
            {(fields, { add, remove }) => (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <Table
                  bordered
                  pagination={false}
                  rowKey="key"
                  scroll={{ x: 920 }}
                  dataSource={fields}
                  columns={[
                    {
                      title: "Product",
                      width: 220,
                      render: (_value, field) => (
                        <Form.Item
                          name={[field.name, "product"]}
                          style={{ marginBottom: 0 }}
                          rules={[{ required: true, message: "Select product" }]}
                        >
                          <Select
                            placeholder="Product"
                            options={salesOrderProducts.map((product) => ({
                              label: product.name,
                              value: product.name,
                            }))}
                            onChange={(productName) => {
                              const product = salesOrderProducts.find(
                                (item) => item.name === productName
                              );
                              if (!product) return;

                              form.setFieldValue(["items", field.name, "sku"], product.sku);
                              form.setFieldValue(["items", field.name, "rate"], product.rate);
                              form.setFieldValue(["items", field.name, "tax"], product.tax);
                            }}
                          />
                        </Form.Item>
                      ),
                    },
                    {
                      title: "SKU",
                      width: 140,
                      render: (_value, field) => (
                        <Form.Item name={[field.name, "sku"]} style={{ marginBottom: 0 }}>
                          <Input placeholder="SKU" />
                        </Form.Item>
                      ),
                    },
                    {
                      title: "Qty",
                      width: 100,
                      align: "right",
                      render: (_value, field) => (
                        <Form.Item name={[field.name, "qty"]} style={{ marginBottom: 0 }}>
                          <InputNumber min={1} style={{ width: "100%" }} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: "Rate",
                      width: 130,
                      align: "right",
                      render: (_value, field) => (
                        <Form.Item name={[field.name, "rate"]} style={{ marginBottom: 0 }}>
                          <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: "Discount",
                      width: 130,
                      align: "right",
                      render: (_value, field) => (
                        <Form.Item
                          name={[field.name, "discount"]}
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: "Tax",
                      width: 110,
                      align: "right",
                      render: (_value, field) => (
                        <Form.Item name={[field.name, "tax"]} style={{ marginBottom: 0 }}>
                          <InputNumber min={0} suffix="%" style={{ width: "100%" }} />
                        </Form.Item>
                      ),
                    },
                    {
                      title: "Amount",
                      width: 140,
                      align: "right",
                      render: (_value, field) => (
                        <Text strong>
                          {formatCurrency(getLineAmount(watchedItems[field.name]))}
                        </Text>
                      ),
                    },
                    {
                      title: "",
                      width: 60,
                      align: "center",
                      render: (_value, field) => (
                        <Button
                          danger
                          type="text"
                          icon={<DeleteOutlined />}
                          disabled={fields.length === 1}
                          onClick={() => remove(field.name)}
                        />
                      ),
                    },
                  ]}
                />
                <Button
                  icon={<PlusOutlined />}
                  onClick={() =>
                    add({
                      product: salesOrderProducts[0].name,
                      sku: salesOrderProducts[0].sku,
                      qty: 1,
                      rate: salesOrderProducts[0].rate,
                      discount: 0,
                      tax: salesOrderProducts[0].tax,
                    })
                  }
                >
                  Add line item
                </Button>
              </Space>
            )}
          </Form.List>

          <Card className="dark:!bg-[#1f1f1f]" style={{ marginTop: 20, background: "#f8fafc" }}>
            <Row justify="end">
              <Col xs={24} md={10} lg={8}>
                <Space direction="vertical" style={{ width: "100%" }} size={10}>
                  <SummaryLine label="Subtotal" value={totals.subtotal} />
                  <SummaryLine label="Discount" value={totals.discount} />
                  <SummaryLine label="Tax" value={totals.tax} />
                  <Divider style={{ margin: "4px 0" }} />
                  <SummaryLine label="Grand Total" value={totals.grandTotal} strong />
                </Space>
              </Col>
            </Row>
          </Card>

          <Space
            style={{
              width: "100%",
              justifyContent: "flex-end",
              marginTop: 20,
            }}
            wrap
          >
            <Button onClick={closeCreateModal}>Cancel</Button>
            <Button onClick={() => handleStaticSubmit("Sales order saved as draft")}>
              Save as Draft
            </Button>
            <Button
              type="primary"
              onClick={() => handleStaticSubmit("Sales order created")}
            >
              Create Order
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <Text strong={strong}>{label}</Text>
      <Text strong={strong}>{formatCurrency(value)}</Text>
    </div>
  );
}
