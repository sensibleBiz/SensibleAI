import { useState } from "react";
import { Button, Card, DatePicker, Drawer, Space, Tag, Typography } from "antd";
import { EyeOutlined, CalendarOutlined } from "@ant-design/icons";
import { MapPin } from "lucide-react";
import dayjs, { Dayjs } from "dayjs";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { TeamTreeDTO } from "@/features/team";
import TrackingMap from "./TrackingMap";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

const { Title, Text } = Typography;

// Brand palette — kept consistent with the other CRM report pages
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";

const UserTracking = () => {
  const teamTreeData = useSelector(
    (state: RootState) =>
      state?.appState?.teamTreeData?.filter(
        (mem) => mem?.department === "SALES" && mem?.isOnPayRoll && mem?.isActive
      ) || []
  ) as TeamTreeDTO[];

  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [selectedUser, setSelectedUser] = useState<TeamTreeDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div
        className="mb-5 overflow-hidden rounded-xl shadow-sm"
        style={{ background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, #124a6b 100%)` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <MapPin size={18} style={{ color: BRAND_RED }} />
            </div>
            <div>
              <Title level={2} className="!mb-1 !text-white">
                User Tracking
              </Title>
              <Text className="text-slate-200 !text-white">
                View field executives' movement history for a selected day
              </Text>
            </div>
          </div>

          <Space>
            <DatePicker
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              allowClear={false}
              disabledDate={(d) => d && d > dayjs()}
              format="DD-MM-YYYY"
              suffixIcon={<CalendarOutlined />}
            />
          </Space>
        </div>
      </div>

      {/* Table */}
      <Card className="!rounded-xl border-0 shadow-sm">
        {teamTreeData.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
            No users found
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[620px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase" style={{ backgroundColor: BRAND_NAVY, color: "#fff" }}>
                  <th className="px-4 py-3">Employee Name</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {teamTreeData.map((record) => (
                  <tr
                    key={record.userProfileId}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatEmployeeName(record.userName)}
                    </td>
                    <td className="px-4 py-3">
                      {record.isActive ? (
                        <Tag color="green">Active</Tag>
                      ) : (
                        <Tag
                          style={{
                            color: BRAND_RED,
                            borderColor: BRAND_RED,
                            backgroundColor: `${BRAND_RED}14`,
                          }}
                        >
                          Inactive
                        </Tag>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        icon={<EyeOutlined />}
                        type="link"
                        style={{ color: BRAND_NAVY }}
                        onClick={() => {
                          setSelectedUser(record);
                          setDrawerOpen(true);
                        }}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Drawer
        title={
          <span style={{ color: BRAND_NAVY }}>
            {formatEmployeeName(selectedUser?.userName)} - Tracking
          </span>
        }
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="85%"
        destroyOnHidden
      >
        {selectedUser && (
          <TrackingMap
            userID={selectedUser.userProfileId}
            date={selectedDate.format("YYYY-MM-DD")}
          />
        )}
      </Drawer>
    </div>
  );
};

export default UserTracking;