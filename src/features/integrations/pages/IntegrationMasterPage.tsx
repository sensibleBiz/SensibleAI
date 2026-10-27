import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";
import { EditOutlined, DeleteOutlined, PlusOutlined, FacebookOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";

import { APP_MESSAGES, PERMISSION_MASTER, ROUTES_PATHS } from "@/shared/lib/constants";
import { IntegrationConfig } from "../types/types";
import AddEditIntegrationModal from "./AddEditIntegrationModal";
import { maskIntegrationSecret } from "./integrationPageUtils";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { Can } from "@/features/access-control";
import { useMessageApi } from "@/shared/hooks";
import { integrationApi } from "../api/integrationApi";

const { Title, Text } = Typography;

export default function IntegrationMasterPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<IntegrationConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<IntegrationConfig | null>(null);
  const [prefillData, setPrefillData] =
    useState<Partial<IntegrationConfig> | null>(null);
  const [facebookLoginLoading, setFacebookLoginLoading] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );
  const messageApi = useMessageApi();
  const isFacebookConnected = data.some(
    (integration) => integration.type?.trim().toUpperCase() === 'FB'
  );

  /* 🔥 Fetch integrations */
  useEffect(() => {
    if (!outletId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    void integrationApi.list(outletId)
      .then(setData)
      .catch((error) => messageApi.error(error instanceof Error ? error.message : APP_MESSAGES.ERROR_GENERIC))
      .finally(() => setLoading(false));
  }, [outletId, messageApi]);

  /* 🔁 Toggle Active */
  const toggleActive = async (record: IntegrationConfig) => {
    if (!outletId) return;
    try {
      const updated = await integrationApi.update(record.id, { ...record, outletId, isActive: !record.isActive });
      setData((items) => items.map((item) => item.id === record.id ? updated : item));
      messageApi.success("Status updated");
    } catch (error) { messageApi.error(error instanceof Error ? error.message : APP_MESSAGES.ERROR_GENERIC); }
  };

  /* 🗑 Delete */
  const handleDelete = async (record: IntegrationConfig) => {
    if (!outletId) return;
    try {
      await integrationApi.delete(outletId, record.id);
      setData((items) => items.filter((item) => item.id !== record.id));
      messageApi.success(APP_MESSAGES.SUCCESS_DELETE);
    } catch (error) { messageApi.error(error instanceof Error ? error.message : APP_MESSAGES.ERROR_GENERIC); }
  };

  const openAddModal = (prefill?: Partial<IntegrationConfig> | null) => {
    setEditItem(null);
    setPrefillData(prefill || null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditItem(null);
    setPrefillData(null);
  };

  const handleFacebookLogin = () => {
    setFacebookLoginLoading(false);
    messageApi.info("Add Facebook credentials with the PostgreSQL integration form.");
  };

  const toggleKeyVisibility = (recordId: string) => {
    setVisibleKeys((previous) => {
      const next = new Set(previous);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const columns = [
    {
      title: "Created on",
      dataIndex: "createdDate",
      render: (v: number) => dayjs(v).format("MMM D, YYYY"),
    },
    {
      title: "Key",
      dataIndex: "integrationKey",
      render: (value: string, record: IntegrationConfig) => {
        const isVisible = visibleKeys.has(record.id);

        return (
          <Space size={4}>
            <Text code style={{ wordBreak: "break-all" }}>
              {isVisible ? value || "-" : maskIntegrationSecret(value)}
            </Text>
            <Button
              type="text"
              size="small"
              icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              aria-label={isVisible ? "Hide key" : "Show key"}
              onClick={() => toggleKeyVisibility(record.id)}
            />
          </Space>
        );
      },
    },
    {
      title: "Access Token",
      dataIndex: "accessToken",
      width: 220,
      render: (value: string) => (
        <Text code>{maskIntegrationSecret(value)}</Text>
      ),
    },
    {
      title: "Description",
      dataIndex: "description",
    },
    {
      title: "Platform",
      dataIndex: "type",
      render: (v: string) => (
        <Tag color={v === "FB" ? "blue" : "default"}>{v}</Tag>
      ),
    },
    {
      title: "Auto Assign",
      align: "center" as const,
      render: (_: unknown, record: IntegrationConfig) => {
        if (record.type?.trim().toUpperCase() !== "FB") return "-";

        const enabled =
          record.autoassignenabled ?? Boolean(record.autoAssignUserId);
        return (
          <Tag color={enabled ? "green" : "default"}>
            {enabled ? "On" : "Off (Manual)"}
          </Tag>
        );
      },
    },
    {
      title: "Active",
      dataIndex: "isActive",
      align: "center" as const,
      render: (_: boolean, record: IntegrationConfig) => (
        <Can permission={PERMISSION_MASTER.CRM_INTEGRATION_EDIT}>
          <Popconfirm
            title="Change status?"
            description={`Are you sure you want to ${
              record.isActive ? "disable" : "enable"
            } this integration?`}
            onConfirm={() => toggleActive(record)}
          >
            <Switch checked={record.isActive} />
          </Popconfirm>
        </Can>
      ),
    },
    {
      title: "Edit",
      align: "center" as const,
      render: (_: unknown, record: IntegrationConfig) => (
        <Can permission={PERMISSION_MASTER.CRM_INTEGRATION_EDIT}>
          <Button
            icon={<EditOutlined />}
            type="text"
            onClick={() => {
              setEditItem(record);
              setPrefillData(null);
              setModalOpen(true);
            }}
          />
        </Can>
      ),
    },
    {
      title: "Delete",
      align: "center" as const,
      render: (_: unknown, record: IntegrationConfig) => (
        <Can permission={PERMISSION_MASTER.CRM_INTEGRATION_DELETE}>
          <Popconfirm
            title="Delete integration?"
            description="This action cannot be undone"
            onConfirm={() => handleDelete(record)}
          >
            <Button danger icon={<DeleteOutlined />} type="text" />
          </Popconfirm>
        </Can>
      ),
    },
  ];

  return (
    <>
      <Card
        title={
          <Space>
            <Title
              level={4}
              role="button"
              tabIndex={0}
              onClick={handleFacebookLogin}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleFacebookLogin();
                }
              }}
              style={{ margin: 0, cursor: "pointer" }}
            >
              Ad Integration Master
            </Title>
          </Space>
        }
        extra={
          <Space>
            {isFacebookConnected ? (
              <Button
                onClick={() => navigate(ROUTES_PATHS.DELETE_FACEBOOK_DATA)}
              >
                Manage
              </Button>
            ) : (
              <Can permission={PERMISSION_MASTER.CRM_INTEGRATION_CREATE}>
                <Button
                  icon={<FacebookOutlined />}
                  loading={facebookLoginLoading}
                  onClick={handleFacebookLogin}
                >
                  Facebook Login
                </Button>
              </Can>
            )}
            <Can permission={PERMISSION_MASTER.CRM_INTEGRATION_CREATE}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openAddModal()}
              >
                Add
              </Button>
            </Can>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15 }}
        />
      </Card>

      {/* ➕➖ Add / Edit Modal */}
      {modalOpen && (
        <AddEditIntegrationModal
          open={modalOpen}
          initialData={editItem}
          prefillData={prefillData}
          onClose={closeModal}
          onSaved={(saved) => setData((items) => [saved, ...items.filter((item) => item.id !== saved.id)])}
        />
      )}
    </>
  );
}
