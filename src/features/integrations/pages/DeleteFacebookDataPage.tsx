import { DeleteOutlined } from "@ant-design/icons";
import { Button, Card, Space, Table, Tag, Typography } from "antd";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

import type { Outlet } from "@/features/outlets";
import type { RootState } from "@/app/store";
import { integrationApi, type FacebookPageRecord } from "../api/integrationApi";

const { Title, Text } = Typography;
type OutletWithFacebookPages = Outlet;

const getFacebookPageValue = (
  page: FacebookPageRecord,
  keys: Array<keyof FacebookPageRecord>
) => {
  for (const key of keys) {
    const value = page[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  return "-";
};

export default function DeleteFacebookDataPage() {
  const outletInfo = useSelector(
    (state: RootState) => state.appState.outletInfo as OutletWithFacebookPages | null
  );
  const outletId = outletInfo?.id;
  const [facebookPages, setFacebookPages] = useState<FacebookPageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!outletId) {
      setFacebookPages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    void integrationApi.listFacebookPages(outletId)
      .then(setFacebookPages)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load Facebook pages"))
      .finally(() => setLoading(false));
  }, [outletId]);

  const outletForDisplay = outletInfo;

  return (
    <Card>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
            Facebook Pages
          </Title>
          <Text type="secondary">
            Pages connected with {outletForDisplay?.name || "this outlet"}.
          </Text>
          {error && (
            <div>
              <Text type="danger">{error}</Text>
            </div>
          )}
        </div>

        <Table
          columns={[
            {
              title: "Page Name",
              render: (_: unknown, record: FacebookPageRecord) =>
                getFacebookPageValue(record, ["name", "pageName", "page_name"]),
            },
            {
              title: "Page ID",
              render: (_: unknown, record: FacebookPageRecord) =>
                getFacebookPageValue(record, ["pageId", "page_id", "pageID", "id"]),
            },
            {
              title: "Category",
              render: (_: unknown, record: FacebookPageRecord) =>
                getFacebookPageValue(record, ["category"]),
            },
            {
              title: "Status",
              render: (_: unknown, record: FacebookPageRecord) => {
                const status =
                  typeof record.status === "string"
                    ? record.status
                    : record.isActive
                    ? "Active"
                    : "-";

                return <Tag color={status === "Active" ? "green" : "default"}>{status}</Tag>;
              },
            },
          ]}
          dataSource={facebookPages}
          loading={loading}
          locale={{ emptyText: "No Facebook pages found for this outlet" }}
          pagination={false}
          rowKey="key"
        />

        <Button danger type="primary" icon={<DeleteOutlined />}>
        Request to Delete Your Facebook Data
        </Button>
         <Button danger type="primary" icon={<DeleteOutlined />}>
          Disconnect Facebook 
        </Button>
      </Space>
    </Card>
  );
}
