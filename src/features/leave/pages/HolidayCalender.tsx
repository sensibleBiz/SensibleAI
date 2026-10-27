/**
 * Holiday Calendar Page
 * 
 * Features:
 * - View holidays in calendar and table format
 * - Add, Edit, Delete holidays
 * - Permission-based access control
 * - Year-based filtering
 * - PostgreSQL-backed holiday management
 */

import React, { useEffect, useState, useMemo } from "react";
import {
  Card,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Space,
  Typography,
  Popconfirm,
  Calendar,
  Row,
  Col,
  Empty,
  Tooltip,
  CalendarProps,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  LeftOutlined,
  RightOutlined,
} from "@ant-design/icons";
import { PartyPopper } from "lucide-react";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { PERMISSION_MASTER } from "@/shared/lib/constants";
import { leaveApi } from "../api/leaveApi";
import { HolidayDTO } from "../types/types";
import { useMessageApi } from "@/shared/hooks";
import { usePermission } from "@/features/access-control";
import { Can } from "@/features/access-control";
import SpinLoader from "@/shared/components/SpinLoader";
import dayjs, { Dayjs } from "dayjs";

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

// Brand palette — kept consistent with the other CRM report pages
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";
const BRAND_AMBER = "#faad14";

const CURRENT_YEAR = dayjs().year();
const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/**
 * Holiday Calendar Page Component
 */
const HolidayCalender: React.FC = () => {
  // Redux state
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id);

  // Local state
  const [holidays, setHolidays] = useState<HolidayDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [viewMode, setViewMode] = useState<"calendar" | "table">("table");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<HolidayDTO | null>(null);
  const [searchText, setSearchText] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [calendarValue, setCalendarValue] = useState<Dayjs>(dayjs().year(CURRENT_YEAR));
  const [form] = Form.useForm();

  const messageApi = useMessageApi();
  const { hasPermission } = usePermission();

  // Permission checks
  const canView = hasPermission(PERMISSION_MASTER.CRM_ATTENDANCE_VIEW_ADMIN);

  // Fetch holidays from PostgreSQL
  useEffect(() => {
    const controller = new AbortController();
    if (!outletId) {
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    void leaveApi.listHolidays(outletId, selectedYear, controller.signal)
      .then((result) => {
        setHolidays(result.items);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.error("Error fetching holidays:", error);
        setLoading(false);
      });
    return () => controller.abort();
  }, [outletId, selectedYear]);

  // Keep the calendar's displayed month/year aligned with the year filter
  useEffect(() => {
    setCalendarValue((prev) =>
      prev.year() === selectedYear ? prev : prev.year(selectedYear)
    );
  }, [selectedYear]);

  // When the calendar is navigated to a different year, update the filter to match
  const handleCalendarChange = (date: Dayjs) => {
    setCalendarValue(date);
    if (date.year() !== selectedYear) {
      setSelectedYear(date.year());
    }
  };

  // Filter holidays
  const filteredHolidays = useMemo(() => {
    let filtered = [...holidays];

    // Filter by search text
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (h) =>
          h.title?.toLowerCase().includes(searchLower) ||
          h.name?.toLowerCase().includes(searchLower) ||
          h.description?.toLowerCase().includes(searchLower)
      );
    }

    // Filter by type
    if (filterType !== "all") {
      filtered = filtered.filter((h) => h.type === filterType);
    }

    return filtered;
  }, [holidays, searchText, filterType]);

  // Handle open add modal
  const handleAdd = () => {
    setEditingHoliday(null);
    form.resetFields();
    form.setFieldsValue({
      year: selectedYear.toString(),
      isPaid: true,
      type: 'NATIONAL',
    });
    setModalVisible(true);
  };

  // Handle open edit modal
  const handleEdit = (holiday: HolidayDTO) => {
    setEditingHoliday(holiday);
    const date = dayjs(holiday.date);
    
    form.setFieldsValue({
      title: holiday.title || holiday.name,
      date: date,
      year: holiday.year || selectedYear.toString(),
      type: holiday.type || 'NATIONAL',
      isPaid: holiday.isPaid !== undefined ? holiday.isPaid : true,
      description: holiday.description || "",
    });
    setModalVisible(true);
  };

  // Handle save (add or update)
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (!outletId) {
        messageApi.error("Outlet not selected");
        return;
      }

      const selectedDate = values.date as Dayjs;
      const dateString = selectedDate.format("YYYY-MM-DD");
      const holidayData = {
        title: values.title,
        date: dateString,
        type: values.type || 'NATIONAL',
        isPaid: values.isPaid !== undefined ? values.isPaid : true,
        description: values.description || "",
      };

      if (editingHoliday) {
        const result = await leaveApi.updateHoliday(outletId, editingHoliday.id, holidayData);
        setHolidays((current) => current.map((item) => item.id === editingHoliday.id ? result.item : item));
        messageApi.success("Holiday updated successfully");
      } else {
        const result = await leaveApi.createHoliday(outletId, holidayData);
        setHolidays((current) => [...current, result.item].sort((left, right) => String(left.date).localeCompare(String(right.date))));
        messageApi.success("Holiday added successfully");
      }

      setModalVisible(false);
      setEditingHoliday(null);
      form.resetFields();
    } catch (error: unknown) {
      console.error("Error saving holiday:", error);
      messageApi.error(getErrorMessage(error, "Failed to save holiday"));
    }
  };

  // Handle delete
  const handleDelete = async (holiday: HolidayDTO) => {
    if (!outletId) {
      messageApi.error("Outlet not selected");
      return;
    }

    try {
      await leaveApi.deleteHoliday(outletId, holiday.id);
      setHolidays((current) => current.filter((item) => item.id !== holiday.id));
      messageApi.success("Holiday deleted successfully");
    } catch (error: unknown) {
      console.error("Error deleting holiday:", error);
      messageApi.error("Failed to delete holiday");
    }
  };

  // Get holiday type color (brand-aligned)
  const getTypeColor = (type?: string): string => {
    switch (type) {
      case 'NATIONAL':
        return BRAND_RED;
      case 'REGIONAL':
        return BRAND_NAVY;
      case 'OPTIONAL':
        return BRAND_AMBER;
      default:
        return "default";
    }
  };

  // Calendar cell render — shows the day number, holiday chips, and today/weekend highlighting
  const MAX_VISIBLE_HOLIDAYS = 2;

  const dateCellRender: NonNullable<CalendarProps<Dayjs>["cellRender"]> = (
    value,
    info
  ) => {
    if (info.type !== "date") return info.originNode;

    const dateStr = value.format("YYYY-MM-DD");
    const dayHolidays = holidays.filter((h) => {
      if (typeof h.date === "number") {
        return dayjs(h.date).format("YYYY-MM-DD") === dateStr;
      }
      return h.dateString === dateStr || h.date === dateStr;
    });

    const isToday = value.isSame(dayjs(), "day");
    const isWeekend = value.day() === 0 || value.day() === 6;
    const hasHolidays = dayHolidays.length > 0;
    const visibleHolidays = dayHolidays.slice(0, MAX_VISIBLE_HOLIDAYS);
    const overflowCount = dayHolidays.length - visibleHolidays.length;

    return (
      <div
        className="flex h-full min-h-[92px] w-full flex-col rounded-lg p-1.5 transition-colors"
        style={{
          backgroundColor: isToday
            ? "rgba(255,50,40,0.06)"
            : hasHolidays
            ? "rgba(10,55,80,0.04)"
            : isWeekend
            ? "rgba(148,163,184,0.05)"
            : "transparent",
          border: isToday
            ? `1.5px solid ${BRAND_RED}`
            : "1.5px solid transparent",
        }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold"
            style={{
              color: isToday ? "#fff" : BRAND_NAVY,
              backgroundColor: isToday ? BRAND_RED : "transparent",
            }}
          >
            {value.date()}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {visibleHolidays.map((holiday) => {
            const color = getTypeColor(holiday.type);
            return (
              <Tooltip
                key={holiday.id}
                title={`${holiday.title || holiday.name}${
                  holiday.type ? ` · ${holiday.type}` : ""
                }`}
              >
                <div
                  className="truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight"
                  style={{ backgroundColor: `${color}1f`, color }}
                >
                  {holiday.title || holiday.name}
                </div>
              </Tooltip>
            );
          })}
          {overflowCount > 0 && (
            <Text style={{ fontSize: 10 }} type="secondary">
              +{overflowCount} more
            </Text>
          )}
        </div>
      </div>
    );
  };

  // Generate year options
  const yearOptions = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

  if (!canView) {
    return (
      <div style={{ padding: "24px", textAlign: "center" }}>
        <Empty description="You don't have permission to view holidays" />
      </div>
    );
  }

  if (loading && holidays.length === 0) {
    return <SpinLoader loading={loading} />;
  }

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
              <PartyPopper size={18} style={{ color: BRAND_RED }} />
            </div>
            <div>
              <Title level={2} className="!mb-1 !text-white">
                Holiday Calendar
              </Title>
              <Text className="text-slate-200 !text-white">
                Manage holidays for {selectedYear}
              </Text>
            </div>
          </div>

          <Space size="middle" wrap>
            <Select value={selectedYear} onChange={setSelectedYear} style={{ width: 120 }}>
              {yearOptions.map((year) => (
                <Option key={year} value={year}>
                  {year}
                </Option>
              ))}
            </Select>
            <Select value={viewMode} onChange={setViewMode} style={{ width: 150 }}>
              <Option value="table">Table View</Option>
              <Option value="calendar">Calendar View</Option>
            </Select>
            <Can permission={PERMISSION_MASTER.CRM_ATTENDANCE_VIEW_ADMIN}>
              <Button
                icon={<PlusOutlined />}
                onClick={handleAdd}
                style={{ backgroundColor: BRAND_RED, borderColor: BRAND_RED, color: "#fff" }}
              >
                Add Holiday
              </Button>
            </Can>
          </Space>
        </div>
      </div>

      {/* Filters */}
      {viewMode === "table" && (
        <Card className="mb-5 !rounded-xl border-0 shadow-sm">
          <Space size="middle" style={{ width: "100%" }}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="Search by title or description"
              allowClear
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ maxWidth: 300 }}
            />
            <Select value={filterType} onChange={setFilterType} style={{ width: 150 }}>
              <Option value="all">All Types</Option>
              <Option value="NATIONAL">National</Option>
              <Option value="REGIONAL">Regional</Option>
              <Option value="OPTIONAL">Optional</Option>
            </Select>
            <Text type="secondary" style={{ marginLeft: "auto" }}>
              Showing {filteredHolidays.length} holiday(s)
            </Text>
          </Space>
        </Card>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <Card className="!rounded-xl border-0 shadow-sm">
          {/* Legend */}
          <div className="mb-4 flex flex-wrap items-center gap-4 border-b border-slate-100 pb-4">
            <Text type="secondary" className="text-xs font-medium uppercase tracking-wide">
              Legend
            </Text>
            {[
              { label: "National", color: BRAND_RED },
              { label: "Regional", color: BRAND_NAVY },
              { label: "Optional", color: BRAND_AMBER },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <Text style={{ fontSize: 12 }}>{item.label}</Text>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border-2"
                style={{ borderColor: BRAND_RED, backgroundColor: "transparent" }}
              />
              <Text style={{ fontSize: 12 }}>Today</Text>
            </div>
          </div>

          <div className="brand-calendar">
            <Calendar
              value={calendarValue}
              onChange={handleCalendarChange}
              onPanelChange={handleCalendarChange}
              cellRender={dateCellRender}
              disabledDate={() => false}
              headerRender={({ value, onChange }) => (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <Button
                      shape="circle"
                      size="small"
                      icon={<LeftOutlined />}
                      onClick={() => onChange(value.clone().subtract(1, "month"))}
                    />
                    <div
                      className="min-w-[150px] text-center text-base font-semibold"
                      style={{ color: BRAND_NAVY }}
                    >
                      {value.format("MMMM YYYY")}
                    </div>
                    <Button
                      shape="circle"
                      size="small"
                      icon={<RightOutlined />}
                      onClick={() => onChange(value.clone().add(1, "month"))}
                    />
                  </div>
                  <Space size="small">
                    <Button size="small" onClick={() => onChange(dayjs())}>
                      Today
                    </Button>
                    <Select
                      size="small"
                      value={value.year()}
                      style={{ width: 90 }}
                      onChange={(y) => onChange(value.clone().year(y))}
                    >
                      {yearOptions.map((y) => (
                        <Option key={y} value={y}>
                          {y}
                        </Option>
                      ))}
                    </Select>
                  </Space>
                </div>
              )}
            />
          </div>
        </Card>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <Card className="!rounded-xl border-0 shadow-sm">
          {loading ? (
            <div className="py-8 text-center text-slate-500">Loading holidays...</div>
          ) : filteredHolidays.length === 0 ? (
            <Empty description="No holidays found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[1000px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold uppercase" style={{ backgroundColor: BRAND_NAVY, color: "#fff" }}>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Day</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHolidays.map((holiday) => {
                    const dateValue = dayjs(holiday.date);
                    const typeColor = getTypeColor(holiday.type);
                    return (
                      <tr key={holiday.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-700">{dateValue.format("DD MMM YYYY")}</td>
                        <td className="px-4 py-3 text-slate-700">{dateValue.format("dddd")}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{holiday.title || holiday.name}</td>
                        <td className="px-4 py-3">
                          <Tag
                            style={{
                              color: typeColor,
                              borderColor: typeColor,
                              backgroundColor: `${typeColor}14`,
                            }}
                          >
                            {holiday.type || "NATIONAL"}
                          </Tag>
                        </td>
                        <td className="px-4 py-3">
                          <Tag color={holiday.isPaid ? "green" : "default"}>
                            {holiday.isPaid ? "Yes" : "No"}
                          </Tag>
                        </td>
                        <td className="max-w-[280px] truncate px-4 py-3 text-slate-700">
                          {holiday.description || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Space size="small">
                            <Can permission={PERMISSION_MASTER.CRM_ATTENDANCE_EDIT}>
                              <Button
                                icon={<EditOutlined />}
                                size="small"
                                onClick={() => handleEdit(holiday)}
                                style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
                              />
                            </Can>
                            <Can permission={PERMISSION_MASTER.CRM_ATTENDANCE_DELETE}>
                              <Popconfirm
                                title="Delete holiday"
                                description="Are you sure you want to delete this holiday?"
                                onConfirm={() => handleDelete(holiday)}
                                okText="Yes"
                                cancelText="No"
                              >
                                <Button danger icon={<DeleteOutlined />} size="small" />
                              </Popconfirm>
                            </Can>
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
      )}

      {/* Add/Edit Modal */}
      <Modal
        title={editingHoliday ? "Edit Holiday" : "Add Holiday"}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => {
          setModalVisible(false);
          setEditingHoliday(null);
          form.resetFields();
        }}
        okText="Save"
        cancelText="Cancel"
        width={600}
        okButtonProps={{
          style: { backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY },
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="Holiday Title"
            rules={[{ required: true, message: "Please enter holiday title" }]}
          >
            <Input placeholder="e.g., Diwali, Republic Day" />
          </Form.Item>

          <Form.Item
            name="date"
            label="Date"
            rules={[{ required: true, message: "Please select date" }]}
          >
            <DatePicker
              style={{ width: "100%" }}
              format="DD-MM-YYYY"
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="type"
                label="Type"
                rules={[{ required: true, message: "Please select type" }]}
              >
                <Select>
                  <Option value="NATIONAL">National</Option>
                  <Option value="REGIONAL">Regional</Option>
                  <Option value="OPTIONAL">Optional</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="isPaid"
                label="Paid Holiday"
              >
                <Select>
                  <Option value={true}>Yes</Option>
                  <Option value={false}>No</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="Description">
            <TextArea
              rows={3}
              placeholder="Optional description"
            />
          </Form.Item>
        </Form>
      </Modal>

      <style>{`
        .brand-calendar .ant-picker-calendar-header {
          display: none;
        }
        .brand-calendar table thead th {
          background: rgba(10, 55, 80, 0.05);
          color: ${BRAND_NAVY};
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          padding: 10px 0;
          border-bottom: 1px solid rgba(10, 55, 80, 0.08);
        }
        .brand-calendar .ant-picker-cell {
          padding: 3px;
        }
        .brand-calendar .ant-picker-cell::before {
          display: none;
        }
        .brand-calendar .ant-picker-calendar-date {
          border-top: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .brand-calendar .ant-picker-cell-selected .ant-picker-calendar-date {
          background: transparent !important;
        }
        .brand-calendar .ant-picker-cell-in-view .ant-picker-calendar-date-value {
          color: inherit;
        }
      `}</style>
    </div>
  );
};

export default HolidayCalender;
