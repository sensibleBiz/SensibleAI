import { useCallback, useEffect, useState } from "react";
import { Button, Card, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { PermissionDTO } from "../types/types";
import { APP_MESSAGES, PERMISSION_MASTER } from "@/shared/lib/constants";
import AddPermissionModal from "./addPermissionModal";
import EditPermissionModal from "./EditPermissionModal";
import {  DeleteOutlined } from "@ant-design/icons";
const { Title } = Typography;
import { Input } from "antd";
import { Can } from "../components/Can";
import type { ColumnsType } from "antd/es/table";
import { useMessageApi } from "@/shared/hooks";
import { useSelector } from "react-redux";
import type { RootState } from "@/app/store";
import { accessControlApi } from "../api/accessControlApi";
export default function PermissionsMasterPage() {
  const [permissions, setPermissions] = useState<PermissionDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [editPermission, setEditPermission] = useState<PermissionDTO | null>(
    null
  );
    const messageApi = useMessageApi();
  const outletId = useSelector(
    (state: RootState) => state.appState.outletInfo?.id,
  );

  const loadPermissions = useCallback(async (signal?: AbortSignal) => {
    if (!outletId) {
      setPermissions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setPermissions(await accessControlApi.listPermissions(outletId, signal));
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Permission fetch error:", error);
      messageApi.error(error instanceof Error ? error.message : "Failed to load permissions");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [messageApi, outletId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPermissions(controller.signal);
    return () => controller.abort();
  }, [loadPermissions]);

    const handleDelete = async (record: PermissionDTO) => {
      if (!outletId || !record.id) return;
      try {
        await accessControlApi.deletePermission(outletId, record.id);
        setPermissions((current) => current.filter((item) => item.id !== record.id));
        messageApi.success(APP_MESSAGES.SUCCESS_DELETE);
      } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "Failed to delete permission");
      }
    };

const columns: ColumnsType<PermissionDTO> = [
  {
    title: "Key",
    dataIndex: "key",
    render: (v) => <Tag color="blue">{v}</Tag>,
  },
  {
    title: "Label",
    dataIndex: "label",
  },
  {
    title: "Description",
    dataIndex: "description",
  },
  {
    title: "Category",
    dataIndex: "category",
    sorter: (a, b) =>
      (a.category || "").localeCompare(b.category || ""),
    sortDirections: ["ascend", "descend"],
  },
  {
    title: "Action",
    width: 120,
    render: (_, record) => (
      <Space size="small">
        <Can permission={PERMISSION_MASTER.CRM_PERMISSION_MASTER_EDIT}>
          <Button type="link" onClick={() => setEditPermission(record)}>
            Edit
          </Button>
        </Can>
        <Can permission={PERMISSION_MASTER.CRM_PERMISSION_MASTER_DELETE}>
          <Popconfirm
            title="Delete permission?"
            description="This action cannot be undone"
            onConfirm={() => handleDelete(record)}
          >
            <Button danger icon={<DeleteOutlined />} type="text" />
          </Popconfirm>
        </Can>
      </Space>
    ),
  },
];


  const filteredPermissions = permissions.filter((p) => {
    const q = searchText.toLowerCase();
    return (
      p.key?.toLowerCase().includes(q) || p.label?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      <Card>
        <Space className="w-full justify-between mb-4">
          <Title level={4}>🔐 Permissions Master</Title>

          <Space>
            <Input.Search
              placeholder="Search by key or label"
              allowClear
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 260 }}
            />
            <Can permission={PERMISSION_MASTER.CRM_PERMISSION_MASTER_CREATE}>
                <Button type="primary" onClick={() => setAddOpen(true)}>
              + Add Permission
            </Button>
            </Can>
          </Space>
        </Space>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredPermissions}
          loading={loading}
          bordered
          size="middle"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* ➕ Add */}
      {outletId && (
        <AddPermissionModal
          open={addOpen}
          outletId={outletId}
          onClose={() => setAddOpen(false)}
          onSuccess={() => void loadPermissions()}
        />
      )}

      {/* ✏️ Edit */}
      {editPermission && (
        <EditPermissionModal
          permission={editPermission}
          outletId={outletId!}
          onClose={() => setEditPermission(null)}
          onSuccess={() => void loadPermissions()}
        />
      )}
    </>
  );
}
