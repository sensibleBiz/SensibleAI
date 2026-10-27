import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Card,
  Tag,
  Button,
  Space,
  Modal,
  Input,
  Form,
  InputNumber,
  Select,
  Typography,
  Tabs,
  Descriptions,
  Divider,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  EyeOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { RootState } from '@/app/store';
import { useMessageApi } from '@/shared/hooks';
import { WarehouseProductDetails } from "../types/types";
import {
  productApi,
  type PostgresProductDTO,
  type PostgresWarehouseTransferDTO,
} from '@/features/products';
import dayjs from 'dayjs';

const { TextArea } = Input;
const { Option } = Select;
const { Title, Text } = Typography;

// Transfer Request Interface
export interface TransferRequest {
  id: string;
  productId: string;
  productName?: string;
  fromWarehouse: string;
  toWarehouse: string;
  requestedQuantity: number;
  acceptedQuantity?: number;
  rejectedQuantity?: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'PARTIALLY_ACCEPTED';
  requestedBy: string;
  requestedByName?: string;
  actionTakenBy?: string;
  actionTakenByName?: string;
  requestDate: number;
  actionDate?: number;
  remarks?: string;
  rejectionReason?: string;
  createdAt: number;
  updatedAt: number;
}

interface Warehouse {
  id: string;
  name: string;
  location?: string;
}

interface TransferRequestFormValues {
  productId: string;
  fromWarehouse: string;
  toWarehouse: string;
  requestedQuantity: number;
  remarks?: string;
}

interface PartialAcceptFormValues {
  acceptedQuantity: number;
  remarks?: string;
  rejectionReason?: string;
}

const mapPostgresProductToWarehouseProduct = (p: PostgresProductDTO): WarehouseProductDetails => ({
  id: p.id,
  name: p.name,
  sku: p.sku,
  category: p.categoryId ?? "",
  brand: p.brand,
  description: p.description,
  mrpPrice: p.mrpPrice,
  price: p.price,
  isAddOn: p.isAddOn,
  minUnit: {
    length: p.minUnit.length,
    width: p.minUnit.width,
    height: p.minUnit.height,
    weight: p.minUnit.weight,
    volume: p.minUnit.volume,
  },
  uidMap: p.uidMap,
  customFields: p.customFields,
  isDeleted: !p.active,
  createdAt: new Date(p.createdAt).getTime(),
  updatedAt: new Date(p.updatedAt).getTime(),
});

const mapPostgresTransferToRequest = (t: PostgresWarehouseTransferDTO): TransferRequest => ({
  id: t.id,
  productId: t.productId,
  productName: t.productName,
  fromWarehouse: t.fromWarehouseId,
  toWarehouse: t.toWarehouseId,
  requestedQuantity: t.requestedQuantity,
  acceptedQuantity: t.acceptedQuantity ?? undefined,
  rejectedQuantity: t.rejectedQuantity ?? undefined,
  status: t.status,
  requestedBy: t.requestedByUserId,
  requestDate: new Date(t.createdAt).getTime(),
  actionDate: t.actionDate ? new Date(t.actionDate).getTime() : undefined,
  actionTakenBy: t.actionTakenByUserId ?? undefined,
  remarks: t.remarks || undefined,
  rejectionReason: t.rejectionReason || undefined,
  createdAt: new Date(t.createdAt).getTime(),
  updatedAt: new Date(t.updatedAt).getTime(),
});

const TransferRequestPage: React.FC = () => {
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<TransferRequest[]>([]);
  const [products, setProducts] = useState<WarehouseProductDetails[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [activeTab, setActiveTab] = useState('PENDING');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [partialAcceptModalOpen, setPartialAcceptModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<TransferRequest | null>(null);
  const [form] = Form.useForm();
  const [actionForm] = Form.useForm();
  const [partialForm] = Form.useForm();
  const messageApi = useMessageApi();

  const loadPostgresTransfers = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    try {
      const [prodRes, whRes, trRes] = await Promise.all([
        productApi.listProducts({ outletId }),
        productApi.listWarehouses(outletId),
        productApi.listTransferRequests({ outletId }),
      ]);
      const mappedProds = prodRes.items.map(mapPostgresProductToWarehouseProduct);
      setProducts(mappedProds);
      setWarehouses(whRes.map((w) => ({ id: w.id, name: w.name, location: w.address })));
      setRequests(trRes.map(mapPostgresTransferToRequest));
    } catch (err) {
      console.error('Failed to load PostgreSQL transfer requests:', err);
      messageApi.error('Failed to load transfer requests');
    } finally {
      setLoading(false);
    }
  }, [outletId, messageApi]);

  // Fetch products, warehouses, and transfers from PostgreSQL.
  useEffect(() => {
    if (!outletId) return;
    void loadPostgresTransfers();
  }, [outletId, loadPostgresTransfers]);

  // Filter requests by status
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => req.status === activeTab);
  }, [requests, activeTab]);

  // Create new transfer request
  const handleCreateRequest = async (values: TransferRequestFormValues) => {
    if (!outletId) return;

    try {
      await productApi.createTransferRequest({
        outletId,
        productId: values.productId,
        fromWarehouseId: values.fromWarehouse,
        toWarehouseId: values.toWarehouse,
        requestedQuantity: values.requestedQuantity,
        remarks: values.remarks,
      });
      messageApi.success('Transfer request created successfully');
      form.resetFields();
      setCreateModalOpen(false);
      await loadPostgresTransfers();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Failed to create transfer request');
      console.error(error);
    }
  };

  // Accept request
  const handleAccept = async () => {
    if (!selectedRequest || !outletId) return;

    try {
      await productApi.actionTransferRequest(selectedRequest.id, {
        outletId,
        action: 'ACCEPT',
        remarks: actionForm.getFieldValue('remarks') || selectedRequest.remarks,
      });
      messageApi.success('Transfer request accepted');
      setActionModalOpen(false);
      actionForm.resetFields();
      setSelectedRequest(null);
      await loadPostgresTransfers();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Failed to accept request');
      console.error(error);
    }
  };

  // Reject request
  const handleReject = async () => {
    if (!selectedRequest || !outletId) return;

    const rejectionReason = actionForm.getFieldValue('rejectionReason');
    if (!rejectionReason) {
      messageApi.warning('Please provide a rejection reason');
      return;
    }

    try {
      await productApi.actionTransferRequest(selectedRequest.id, {
        outletId,
        action: 'REJECT',
        rejectionReason,
        remarks: actionForm.getFieldValue('remarks') || selectedRequest.remarks,
      });
      messageApi.success('Transfer request rejected');
      setActionModalOpen(false);
      actionForm.resetFields();
      setSelectedRequest(null);
      await loadPostgresTransfers();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Failed to reject request');
      console.error(error);
    }
  };

  // Partially accept request
  const handlePartialAccept = async (values: PartialAcceptFormValues) => {
    if (!selectedRequest || !outletId) return;

    const acceptedQty = values.acceptedQuantity;
    if (acceptedQty <= 0 || acceptedQty > selectedRequest.requestedQuantity) {
      messageApi.error('Invalid quantity');
      return;
    }

    try {
      await productApi.actionTransferRequest(selectedRequest.id, {
        outletId,
        action: 'PARTIAL_ACCEPT',
        acceptedQuantity: acceptedQty,
        remarks: values.remarks || selectedRequest.remarks,
        rejectionReason: values.rejectionReason,
      });
      messageApi.success('Transfer request partially accepted');
      setPartialAcceptModalOpen(false);
      partialForm.resetFields();
      setSelectedRequest(null);
      await loadPostgresTransfers();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : 'Failed to partially accept request');
      console.error(error);
    }
  };

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <Title level={2} style={{ marginBottom: '8px' }}>
              Transfer Requests
            </Title>
            <Text type="secondary">Manage product transfer requests between warehouses</Text>
          </div>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="large"
            onClick={() => setCreateModalOpen(true)}
          >
            Create Request
          </Button>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'PENDING',
              label: (
                <span>
                  <InboxOutlined /> Pending{' '}
                  <Tag color="orange">{requests.filter((r) => r.status === 'PENDING').length}</Tag>
                </span>
              ),
            },
            {
              key: 'ACCEPTED',
              label: (
                <span>
                  <CheckOutlined /> Accepted{' '}
                  <Tag color="green">{requests.filter((r) => r.status === 'ACCEPTED').length}</Tag>
                </span>
              ),
            },
            {
              key: 'REJECTED',
              label: (
                <span>
                  <CloseOutlined /> Rejected{' '}
                  <Tag color="red">{requests.filter((r) => r.status === 'REJECTED').length}</Tag>
                </span>
              ),
            },
            {
              key: 'PARTIALLY_ACCEPTED',
              label: (
                <span>
                  Partially Accepted{' '}
                  <Tag color="blue">{requests.filter((r) => r.status === 'PARTIALLY_ACCEPTED').length}</Tag>
                </span>
              ),
            },
          ]}
        />

        {loading ? (
          <div className="py-8 text-center text-slate-500">Loading transfer requests...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
            No transfer requests found
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[1200px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">From Warehouse</th>
                  <th className="px-4 py-3">To Warehouse</th>
                  <th className="px-4 py-3">Requested Qty</th>
                  <th className="px-4 py-3">Accepted Qty</th>
                  <th className="px-4 py-3">Rejected Qty</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Requested By</th>
                  <th className="px-4 py-3">Request Date</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((record) => {
                  const product = products.find((p) => p.id === record.productId);
                  const statusMap: Record<string, { color: string; text: string }> = {
                    PENDING: { color: 'orange', text: 'Pending' },
                    ACCEPTED: { color: 'green', text: 'Accepted' },
                    REJECTED: { color: 'red', text: 'Rejected' },
                    PARTIALLY_ACCEPTED: { color: 'blue', text: 'Partially Accepted' },
                  };
                  const status = statusMap[record.status] || {
                    color: 'default',
                    text: record.status,
                  };
                  return (
                    <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Space direction="vertical" size={0}>
                          <Text strong>{record.productName}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            SKU: {product?.sku || 'N/A'}
                          </Text>
                        </Space>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {warehouses.find((w) => w.id === record.fromWarehouse)?.name || record.fromWarehouse}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {warehouses.find((w) => w.id === record.toWarehouse)?.name || record.toWarehouse}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{record.requestedQuantity}</td>
                      <td className="px-4 py-3 text-green-600">{record.acceptedQuantity || '-'}</td>
                      <td className="px-4 py-3 text-red-600">{record.rejectedQuantity || '-'}</td>
                      <td className="px-4 py-3"><Tag color={status.color}>{status.text}</Tag></td>
                      <td className="px-4 py-3 text-slate-700">{record.requestedBy}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {dayjs(record.requestDate).format('DD MMM YYYY HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        <Space>
                          <Button
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => {
                              setSelectedRequest(record);
                              setActionModalOpen(true);
                            }}
                          >
                            View
                          </Button>
                          {record.status === 'PENDING' && (
                            <Button
                              type="primary"
                              icon={<CheckOutlined />}
                              size="small"
                              onClick={() => {
                                setSelectedRequest(record);
                                setActionModalOpen(true);
                              }}
                            >
                              Action
                            </Button>
                          )}
                        </Space>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Request Modal */}
      <Modal
        title="Create Transfer Request"
        open={createModalOpen}
        onCancel={() => {
          form.resetFields();
          setCreateModalOpen(false);
        }}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateRequest}>
          <Form.Item
            label="Product"
            name="productId"
            rules={[{ required: true, message: 'Please select a product' }]}
          >
            <Select placeholder="Select product" showSearch filterOption={(input, option) =>
              (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase())
            }>
              {products.map((product) => (
                <Option key={product.id} value={product.id}>
                  {product.name} ({product.sku})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="From Warehouse"
            name="fromWarehouse"
            rules={[{ required: true, message: 'Please select source warehouse' }]}
          >
            <Select placeholder="Select source warehouse">
              {warehouses.map((warehouse) => (
                <Option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="To Warehouse"
            name="toWarehouse"
            rules={[{ required: true, message: 'Please select destination warehouse' }]}
          >
            <Select placeholder="Select destination warehouse">
              {warehouses.map((warehouse) => (
                <Option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Quantity"
            name="requestedQuantity"
            rules={[
              { required: true, message: 'Please enter quantity' },
              { type: 'number', min: 1, message: 'Quantity must be at least 1' },
            ]}
          >
            <InputNumber min={1} style={{ width: '100%' }} placeholder="Enter quantity" />
          </Form.Item>

          <Form.Item label="Remarks" name="remarks">
            <TextArea rows={3} placeholder="Add any remarks (optional)" />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                form.resetFields();
                setCreateModalOpen(false);
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Create Request
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Action Modal (Accept/Reject) */}
      <Modal
        title="Review Transfer Request"
        open={actionModalOpen}
        onCancel={() => {
          actionForm.resetFields();
          setActionModalOpen(false);
          setSelectedRequest(null);
        }}
        footer={null}
        width={700}
      >
        {selectedRequest && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Product">
                <Text strong>{selectedRequest.productName}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Requested Quantity">
                <Text strong>{selectedRequest.requestedQuantity}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="From Warehouse">
                {warehouses.find((w) => w.id === selectedRequest.fromWarehouse)?.name || selectedRequest.fromWarehouse}
              </Descriptions.Item>
              <Descriptions.Item label="To Warehouse">
                {warehouses.find((w) => w.id === selectedRequest.toWarehouse)?.name || selectedRequest.toWarehouse}
              </Descriptions.Item>
              <Descriptions.Item label="Requested By">
                {selectedRequest.requestedBy}
              </Descriptions.Item>
              <Descriptions.Item label="Request Date">
                {dayjs(selectedRequest.requestDate).format('DD MMM YYYY HH:mm')}
              </Descriptions.Item>
              {selectedRequest.remarks && (
                <Descriptions.Item label="Remarks" span={2}>
                  {selectedRequest.remarks}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Divider />

            <Form form={actionForm} layout="vertical">
              <Form.Item label="Remarks" name="remarks">
                <TextArea rows={3} placeholder="Add remarks (optional)" />
              </Form.Item>

              <Form.Item
                label="Rejection Reason"
                name="rejectionReason"
              >
                <TextArea rows={2} placeholder="Required if rejecting (optional)" />
              </Form.Item>

              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button
                  danger
                  onClick={() => {
                    setActionModalOpen(false);
                    setPartialAcceptModalOpen(true);
                  }}
                >
                  Partial Accept
                </Button>
                <Popconfirm
                  title="Are you sure you want to reject this request?"
                  onConfirm={handleReject}
                  okText="Yes"
                  cancelText="No"
                >
                  <Button danger icon={<CloseOutlined />}>
                    Reject
                  </Button>
                </Popconfirm>
                <Button type="primary" icon={<CheckOutlined />} onClick={handleAccept}>
                  Accept
                </Button>
              </Space>
            </Form>
          </>
        )}
      </Modal>

      {/* Partial Accept Modal */}
      <Modal
        title="Partially Accept Request"
        open={partialAcceptModalOpen}
        onCancel={() => {
          partialForm.resetFields();
          setPartialAcceptModalOpen(false);
        }}
        footer={null}
        width={600}
      >
        {selectedRequest && (
          <Form form={partialForm} layout="vertical" onFinish={handlePartialAccept}>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="Product">
                <Text strong>{selectedRequest.productName}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Requested Quantity">
                <Text strong>{selectedRequest.requestedQuantity}</Text>
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <Form.Item
              label="Accepted Quantity"
              name="acceptedQuantity"
              rules={[
                { required: true, message: 'Please enter accepted quantity' },
                {
                  type: 'number',
                  min: 1,
                  message: 'Quantity must be at least 1',
                },
                {
                  validator: (_rule: unknown, value: number) => {
                    if (value > selectedRequest.requestedQuantity) {
                      return Promise.reject(
                        `Cannot accept more than requested (${selectedRequest.requestedQuantity})`
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber
                min={1}
                max={selectedRequest.requestedQuantity}
                style={{ width: '100%' }}
                placeholder={`Max: ${selectedRequest.requestedQuantity}`}
              />
            </Form.Item>

            <Form.Item label="Remarks" name="remarks">
              <TextArea rows={3} placeholder="Add remarks (optional)" />
            </Form.Item>

            <Form.Item label="Rejection Reason (for rejected quantity)" name="rejectionReason">
              <TextArea rows={2} placeholder="Reason for rejecting remaining quantity (optional)" />
            </Form.Item>

            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button
                onClick={() => {
                  partialForm.resetFields();
                  setPartialAcceptModalOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Partially Accept
              </Button>
            </Space>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default TransferRequestPage;
