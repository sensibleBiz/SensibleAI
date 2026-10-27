/**
 * Leave Balance Management Page
 * 
 * Features:
 * - View leave balances for employees
 * - Role-based access control (HR/Admin/Manager/Employee)
 * - PostgreSQL-backed balance updates
 * - Inline edit for total leaves (HR/Admin only)
 * - Color indicators for leave balance status
 */

import React, { useMemo, useState } from "react";
import {
  Card,
  Tag,
  Button,
  Input,
  Modal,
  Form,
  InputNumber,
  Space,
  Typography,
  Empty,
  Tooltip,
  Select,
  Row,
  Col,
  Statistic,
} from "antd";
import {
  EditOutlined,
  SearchOutlined,
  SyncOutlined,
  PlusOutlined,
  SaveOutlined,
  HistoryOutlined,
} from "@ant-design/icons";
import { Users, AlertTriangle, XCircle, BarChart3, Wallet } from "lucide-react";
import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { useLeaveBalance } from "@/features/leave/hooks/useLeaveBalance";
import { useTeamTree } from "@/features/team";
import { LeaveBalance } from "../types/types";
import { PERMISSION_MASTER } from "@/shared/lib/constants";
import { useMessageApi } from "@/shared/hooks";
import { usePermission } from "@/features/access-control";
import { Can } from "@/features/access-control";
import SpinLoader from "@/shared/components/SpinLoader";
import dayjs from "dayjs";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { leaveApi, type LeaveBalanceHistoryDto } from "../api/leaveApi";

const { Title, Text } = Typography;
const { Option } = Select;

// Brand palette — kept consistent with the other CRM report pages
const BRAND_NAVY = "#0a3750";
const BRAND_RED = "#ff3228";
const BRAND_PURPLE = "#7c3aed";
const BRAND_AMBER = "#faad14";

interface LeaveBalanceRow extends LeaveBalance {
  empCode?: string;
}

const CURRENT_YEAR = dayjs().year();
const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/**
 * Leave Balance Management Page Component
 */
const LeaveBalancePage: React.FC = () => {
  // Redux state
  const currentUser = useSelector((s: RootState) => s.auth.user);
  const currentUserId = currentUser?.id || "";

  // Local state
  const [searchText, setSearchText] = useState("");
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [bulkEditModalVisible, setBulkEditModalVisible] = useState(false);
  const [selectedBalance, setSelectedBalance] = useState<LeaveBalanceRow | null>(null);
  const [form] = Form.useForm();
  const [bulkForm] = Form.useForm();
  const [syncing, setSyncing] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkEditData, setBulkEditData] = useState<Record<string, number>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEmployee, setHistoryEmployee] = useState<LeaveBalanceRow | null>(null);
  const [historyItems, setHistoryItems] = useState<LeaveBalanceHistoryDto[]>([]);

  const messageApi = useMessageApi();
  const { getTeamMembers, teamTree } = useTeamTree();
  const { hasPermission } = usePermission();
  const outletId = useSelector((s: RootState) => s.appState.outletInfo?.id);

  // Permission checks
  const canViewAll = hasPermission(PERMISSION_MASTER.CRM_ATTENDANCE_VIEW_ADMIN);
  const canViewOwn = hasPermission(PERMISSION_MASTER.CRM_LEAVE_VIEW);
  const canViewTeam = hasPermission(PERMISSION_MASTER.CRM_LEAVE_APPROVE);

  // Fetch leave balances based on permissions
  const leaveBalanceOptions = useMemo(() => {
    // If user has admin view permission, show all
    if (canViewAll) {
      return { year: selectedYear };
    }
    // If user can only view their own (employee)
    if (canViewOwn && !canViewTeam && !canViewAll) {
      return { userId: currentUserId, year: selectedYear };
    }
    // For managers/approvers, show all and filter on frontend
    return { year: selectedYear };
  }, [canViewAll, canViewOwn, canViewTeam, currentUserId, selectedYear]);

  const {
    leaveBalances,
    loading,
    error,
    syncLeaveBalances,
    updateTotalLeaves,
  } = useLeaveBalance(leaveBalanceOptions);

  // Filter leave balances based on permissions
  const filteredBalances = useMemo(() => {
    let filtered = [...leaveBalances];

    // Filter by search text
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.userName?.toLowerCase().includes(searchLower) ||
          b.empCode?.toLowerCase().includes(searchLower) ||
          b.designation?.toLowerCase().includes(searchLower)
      );
    }

    // Permission-based filtering
    if (canViewAll) {
      // Admin can see all employees - no filtering needed
      return filtered;
    }
    
    if (canViewOwn && !canViewTeam && !canViewAll) {
      // Employee sees only their own balance
      filtered = filtered.filter((b) => b.userId === currentUserId);
    } else if (canViewTeam && !canViewAll) {
      // Manager/Approver sees only their team
      const teamMemberIds = getTeamMembers(currentUserId).map((m) => m.userProfileId);
      filtered = filtered.filter((b) => teamMemberIds.includes(b.userId));
    }

    return filtered;
  }, [leaveBalances, searchText, canViewAll, canViewOwn, canViewTeam, currentUserId, getTeamMembers]);

  // Handle sync leave balances with approved leaves
  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncLeaveBalances();
      messageApi.success("Leave balances synced successfully");
    } catch (err: unknown) {
      messageApi.error(`Failed to sync: ${getErrorMessage(err, "Unknown error")}`);
    } finally {
      setSyncing(false);
    }
  };

  // Handle edit total leaves
  const handleEdit = (record: LeaveBalanceRow) => {
    setSelectedBalance(record);
    form.setFieldsValue({ totalLeaves: record.totalLeaves, reason: "" });
    setEditModalVisible(true);
  };

  // Handle save total leaves
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedBalance) return;

      const result = await updateTotalLeaves(selectedBalance.userId, values.totalLeaves, values.reason);
      
      if (result.success) {
        messageApi.success("Total leaves updated successfully");
        setEditModalVisible(false);
        setSelectedBalance(null);
        form.resetFields();
      } else {
        messageApi.error(result.error || "Failed to update total leaves");
      }
    } catch (err: unknown) {
      console.error("Error saving total leaves:", err);
      messageApi.error("Failed to update total leaves");
    }
  };

  // Handle bulk save
  const handleBulkSave = async () => {
    if (!outletId) {
      messageApi.error("Outlet not selected");
      return;
    }

    try {
      const values = await bulkForm.validateFields();
      const balances = values.balances || {};
      const reason = values.reason as string;

      if (Object.keys(balances).length === 0) {
        messageApi.warning("No changes to save");
        return;
      }

      setBulkSaving(true);

      const updatePromises: Promise<void>[] = [];
      let updateCount = 0;
      let createCount = 0;

      // Process all balances (both updates and creates)
      for (const [employeeKey, totalLeaves] of Object.entries(balances)) {
        const totalLeavesNum = totalLeaves as number;
        
        if (employeeKey.startsWith("new-")) {
          const userId = employeeKey.replace("new-", "");
          if (totalLeavesNum > 0) {
            updatePromises.push(updateTotalLeaves(userId, totalLeavesNum, reason).then((result) => {
              if (!result.success) throw new Error(result.error || "Failed to create leave balance");
              createCount++;
            }));
          }
        } else {
          // Update existing balance
          const balance = leaveBalances.find((b) => b.id === employeeKey);
          
          if (!balance) {
            console.warn(`Balance not found: ${employeeKey}`);
            continue;
          }

          // Only update if value changed
          if (balance.totalLeaves !== totalLeavesNum) {
            updatePromises.push(
              updateTotalLeaves(balance.userId, totalLeavesNum, reason).then((result) => {
                if (!result.success) {
                  throw new Error(`Failed to update ${balance.userName}: ${result.error}`);
                }
                updateCount++;
              })
            );
          }
        }
      }

      if (updatePromises.length === 0) {
        messageApi.warning("No changes to save");
        setBulkSaving(false);
        return;
      }

      await Promise.all(updatePromises);

      const successMsg = [];
      if (updateCount > 0) successMsg.push(`${updateCount} updated`);
      if (createCount > 0) successMsg.push(`${createCount} created`);
      
      messageApi.success(`Leave balances saved successfully (${successMsg.join(", ")})`);
      setBulkEditModalVisible(false);
      setBulkEditData({});
      bulkForm.resetFields();
    } catch (err: unknown) {
      console.error("Error saving bulk leaves:", err);
      messageApi.error(getErrorMessage(err, "Failed to update leave balances"));
    } finally {
      setBulkSaving(false);
    }
  };

  const handleHistory = async (record: LeaveBalanceRow) => {
    if (!outletId) return;
    setHistoryEmployee(record);
    setHistoryItems([]);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const result = await leaveApi.listBalanceHistory(outletId, record.userId, selectedYear);
      setHistoryItems(result.items);
    } catch (historyError) {
      messageApi.error(getErrorMessage(historyError, "Failed to load balance history"));
    } finally {
      setHistoryLoading(false);
    }
  };

  // Get all employees for bulk edit (existing balances + new employees from TEAM_TREE)
  const bulkEditEmployees = useMemo(() => {
    if (!canViewAll) {
      // If not admin, only show filtered balances
      return filteredBalances.map(b => ({ ...b, isNew: false }));
    }

    // Get all active employees from TEAM_TREE
    const allActiveEmployees = teamTree.filter((emp) => emp.isActive && emp?.isOnPayRoll);
    
    // Create a map of existing balances by userId
    const balanceMap = new Map<string, LeaveBalanceRow>();
    leaveBalances.forEach((balance) => {
      balanceMap.set(balance.userId, balance);
    });

    // Merge: existing balances + employees without balances
    const mergedList: (LeaveBalanceRow & { isNew?: boolean })[] = [];

    // Add existing balances
    leaveBalances.forEach((balance) => {
      mergedList.push({ ...balance, isNew: false });
    });

    // Add new employees without balance records
    allActiveEmployees.forEach((employee) => {
      if (!balanceMap.has(employee.userProfileId)) {
        // Create a placeholder balance row for new employee
        const manager = employee.teamHeadProfileId
          ? teamTree.find((t) => t.userProfileId === employee.teamHeadProfileId)
          : null;

        mergedList.push({
          id: `new-${employee.userProfileId}`, // Temporary ID for new employees
          userId: employee.userProfileId,
          userName: employee.userName,
          empCode: employee.empCode || "",
          designation: employee.designation || "",
          managerId: employee.teamHeadProfileId || "",
          managerName: manager?.userName || "",
          totalLeaves: 0,
          usedLeaves: 0,
          remainingLeaves: 0,
          year: selectedYear,
          isNew: true, // Mark as new
        });
      }
    });

    // Sort by employee name
    return mergedList.sort((a, b) => (a.userName || "").localeCompare(b.userName || ""));
  }, [teamTree, leaveBalances, filteredBalances, canViewAll, selectedYear]);

  // Handle bulk edit cell change
  const handleBulkCellChange = (employeeKey: string, value: number | null) => {
    const newValue = value || 0;
    setBulkEditData((prev) => ({ ...prev, [employeeKey]: newValue }));
    bulkForm.setFieldsValue({
      balances: { ...bulkEditData, [employeeKey]: newValue },
    });
  };

  // Get balance color indicator
  const getBalanceColor = (remaining: number): string => {
    if (remaining > 5) return "#52c41a"; // Green
    if (remaining >= 1 && remaining <= 5) return BRAND_AMBER; // Amber
    return BRAND_RED; // Red
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const total = filteredBalances.length;
    const lowBalance = filteredBalances.filter((b) => b.remainingLeaves <= 5 && b.remainingLeaves > 0).length;
    const zeroBalance = filteredBalances.filter((b) => b.remainingLeaves === 0).length;
    const avgBalance =
      total > 0
        ? filteredBalances.reduce((sum, b) => sum + b.remainingLeaves, 0) / total
        : 0;

    return { total, lowBalance, zeroBalance, avgBalance: Math.round(avgBalance * 10) / 10 };
  }, [filteredBalances]);

  const summaryCards = [
    {
      key: "total",
      label: "Total Employees",
      value: stats.total,
      accent: BRAND_NAVY,
      icon: <Users size={20} />,
    },
    {
      key: "low",
      label: "Low Balance (1-5)",
      value: stats.lowBalance,
      accent: BRAND_AMBER,
      icon: <AlertTriangle size={20} />,
    },
    {
      key: "zero",
      label: "Zero Balance",
      value: stats.zeroBalance,
      accent: BRAND_RED,
      icon: <XCircle size={20} />,
    },
    {
      key: "avg",
      label: "Avg. Balance",
      value: stats.avgBalance,
      accent: BRAND_PURPLE,
      icon: <BarChart3 size={20} />,
    },
  ];

  // Generate year options (current year and next year)
  const yearOptions = [CURRENT_YEAR, CURRENT_YEAR + 1];

  if (loading && !leaveBalances.length) {
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
              <Wallet size={18} style={{ color: BRAND_RED }} />
            </div>
            <div>
              <Title level={2} className="!mb-1 !text-white">
                Leave Balance Management
              </Title>
              <Text className="text-slate-200 !text-white">
                Track and manage employee leave balances for {selectedYear}
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
            <Button icon={<SyncOutlined />} onClick={handleSync} loading={syncing}>
              Sync Balances
            </Button>
            <Can permission={PERMISSION_MASTER.CRM_LEAVE_APPROVE}>
              <Button
                icon={<PlusOutlined />}
                style={{ backgroundColor: BRAND_RED, borderColor: BRAND_RED, color: "#fff" }}
                onClick={() => {
                  // Initialize bulk edit data with all employees (existing + new)
                  const initialData: Record<string, number> = {};
                  bulkEditEmployees.forEach((employee) => {
                    const key = employee.isNew ? `new-${employee.userId}` : employee.id;
                    initialData[key] = employee.totalLeaves;
                  });
                  setBulkEditData(initialData);
                  bulkForm.setFieldsValue({ balances: initialData });
                  setBulkEditModalVisible(true);
                }}
              >
                Bulk Edit Leaves
              </Button>
            </Can>
          </Space>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Card
            key={card.key}
            size="small"
            className="!rounded-xl border-0 shadow-sm"
            style={{ borderLeft: `4px solid ${card.accent}` }}
            styles={{ body: { padding: 16 } }}
          >
            <div className="flex items-center justify-between">
              <div>
                <Text type="secondary" className="text-[12.5px] font-medium uppercase tracking-wide">
                  {card.label}
                </Text>
                <div className="mt-1 text-2xl font-semibold" style={{ color: card.accent }}>
                  {card.value}
                </div>
              </div>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${card.accent}14`, color: card.accent }}
              >
                {card.icon}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters and Search */}
      <Card className="mb-5 !rounded-xl border-0 shadow-sm">
        <Space size="middle" style={{ width: "100%" }}>
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search by name, employee ID, or designation"
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ maxWidth: 400 }}
          />
          <Text type="secondary" style={{ marginLeft: "auto" }}>
            Showing {filteredBalances.length} employee(s)
          </Text>
        </Space>
      </Card>

      {/* Main Table */}
      <Card className="!rounded-xl border-0 shadow-sm">
        {error && (
          <div style={{ marginBottom: "16px", color: BRAND_RED }}>
            Error: {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-slate-500">Loading leave balances...</div>
        ) : filteredBalances.length === 0 ? (
          <Empty description="No leave balances found" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase" style={{ backgroundColor: BRAND_NAVY, color: "#fff" }}>
                  <th className="px-4 py-3">Employee ID</th>
                  <th className="px-4 py-3">Employee Name</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3 text-center">Total Leaves</th>
                  <th className="px-4 py-3 text-center">Used Leaves</th>
                  <th className="px-4 py-3 text-center">Remaining Balance</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBalances.map((record) => {
                  const color = getBalanceColor(record.remainingLeaves);
                  return (
                    <tr key={record.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-700">{record.empCode || "-"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatEmployeeName(record.userName)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{record.designation || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatEmployeeName(record.managerName)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Text strong style={{ fontSize: "15px", color: BRAND_NAVY }}>{record.totalLeaves}</Text>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Tag color="orange" style={{ fontSize: "13px" }}>{record.usedLeaves}</Tag>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Tag
                          style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            padding: "4px 12px",
                            color,
                            border: `2px solid ${color}`,
                            backgroundColor: `${color}14`,
                          }}
                        >
                          {record.remainingLeaves}
                        </Tag>
                      </td>
                      <td className="px-4 py-3">
                        <Tooltip title="Balance History">
                          <Button
                            icon={<HistoryOutlined />}
                            size="small"
                            onClick={() => void handleHistory(record)}
                            className="mr-2"
                          />
                        </Tooltip>
                        <Can permission={PERMISSION_MASTER.CRM_LEAVE_APPROVE}>
                          <Tooltip title="Edit Total Leaves">
                            <Button
                              icon={<EditOutlined />}
                              size="small"
                              onClick={() => handleEdit(record)}
                              style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
                            />
                          </Tooltip>
                        </Can>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Edit Modal */}
      <Modal
        title="Edit Total Leaves"
        open={editModalVisible}
        onOk={handleSave}
        onCancel={() => {
          setEditModalVisible(false);
          setSelectedBalance(null);
          form.resetFields();
        }}
        okText="Save"
        cancelText="Cancel"
        okButtonProps={{
          style: { backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY },
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Employee Name">
            <Input value={formatEmployeeName(selectedBalance?.userName)} disabled />
          </Form.Item>
          <Form.Item label="Current Total Leaves">
            <InputNumber
              value={selectedBalance?.totalLeaves}
              disabled
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="totalLeaves"
            label="New Total Leaves"
            rules={[
              { required: true, message: "Please enter total leaves" },
              { type: "number", min: 0, message: "Total leaves must be >= 0" },
            ]}
          >
            <InputNumber
              min={0}
              max={365}
              style={{ width: "100%" }}
              placeholder="Enter total yearly leaves"
            />
          </Form.Item>
          <Form.Item
            name="reason"
            label="Adjustment reason"
            rules={[{ required: true, min: 2, max: 500, message: "Enter a reason for this adjustment" }]}
          >
            <Input.TextArea rows={3} placeholder="Reason or reference for this allocation change" />
          </Form.Item>
          {selectedBalance && (
            <Form.Item label="Preview">
              <Text>
                Remaining balance will be:{" "}
                <Text strong>
                  {(form.getFieldValue("totalLeaves") || selectedBalance.totalLeaves) -
                    selectedBalance.usedLeaves}
                </Text>
              </Text>
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* Bulk Edit Modal */}
      <Modal
        title={
          <div>
            <Text strong style={{ fontSize: "18px", color: BRAND_NAVY }}>
              Bulk Edit Leave Balances
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: "13px" }}>
              Set total yearly leaves for multiple employees at once ({selectedYear})
            </Text>
          </div>
        }
        open={bulkEditModalVisible}
        onCancel={() => {
          setBulkEditModalVisible(false);
          setBulkEditData({});
          bulkForm.resetFields();
        }}
        width={900}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setBulkEditModalVisible(false);
              setBulkEditData({});
              bulkForm.resetFields();
            }}
          >
            Cancel
          </Button>,
          <Button
            key="save"
            icon={<SaveOutlined />}
            loading={bulkSaving}
            onClick={handleBulkSave}
            style={{ backgroundColor: BRAND_NAVY, borderColor: BRAND_NAVY, color: "#fff" }}
          >
            Save All ({bulkEditEmployees.length} employees)
          </Button>,
        ]}
      >
        <Form form={bulkForm} layout="vertical">
          <Form.Item
            name="reason"
            label="Adjustment reason"
            rules={[{ required: true, min: 2, max: 500, message: "Enter a reason for these adjustments" }]}
          >
            <Input.TextArea rows={2} placeholder="Reason or reference applied to all changed employees" />
          </Form.Item>
          <div style={{ maxHeight: "60vh", overflowY: "auto", marginTop: "16px" }}>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[820px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold uppercase" style={{ backgroundColor: BRAND_NAVY, color: "#fff" }}>
                    <th className="px-3 py-2">Employee ID</th>
                    <th className="px-3 py-2">Employee Name</th>
                    <th className="px-3 py-2 text-center">Used Leaves</th>
                    <th className="px-3 py-2 text-center">Current Total</th>
                    <th className="px-3 py-2 text-center">New Total Leaves</th>
                    <th className="px-3 py-2 text-center">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkEditEmployees.map((record) => {
                    const employeeKey = record.isNew ? `new-${record.userId}` : record.id;
                    const newTotal = bulkEditData[employeeKey] ?? record.totalLeaves;
                    const remaining = newTotal - record.usedLeaves;
                    const color = getBalanceColor(remaining);
                    return (
                      <tr key={employeeKey} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-700">{record.empCode || "-"}</td>
                        <td className="px-3 py-2">
                          <Text strong>{formatEmployeeName(record.userName)}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: "12px" }}>
                            {record.designation}
                          </Text>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Tag color="orange">{record.usedLeaves}</Tag>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Text style={{ fontSize: "14px" }}>{record.totalLeaves}</Text>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Form.Item
                            name={["balances", employeeKey]}
                            initialValue={record.totalLeaves}
                            style={{ margin: 0 }}
                            rules={[
                              { type: "number", min: 0, message: "Must be >= 0" },
                              { type: "number", max: 365, message: "Must be <= 365" },
                            ]}
                          >
                            <InputNumber
                              min={0}
                              max={365}
                              style={{ width: "100%" }}
                              placeholder={record.isNew ? "Add leave balance" : "Enter total leaves"}
                              onChange={(value) => handleBulkCellChange(employeeKey, value)}
                            />
                          </Form.Item>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Tag
                            style={{
                              fontSize: "13px",
                              fontWeight: 600,
                              color,
                              border: `2px solid ${color}`,
                              backgroundColor: `${color}14`,
                            }}
                          >
                            {remaining}
                            {record.isNew && (
                              <Tag
                                style={{
                                  marginLeft: "4px",
                                  fontSize: "10px",
                                  color: BRAND_NAVY,
                                  backgroundColor: "rgba(10,55,80,0.08)",
                                  border: "none",
                                }}
                              >
                                NEW
                              </Tag>
                            )}
                          </Tag>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              background: "rgba(10,55,80,0.04)",
              borderRadius: "8px",
            }}
          >
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="Total Employees"
                  value={bulkEditEmployees.length}
                  prefix={<Users size={16} style={{ marginRight: 4, color: BRAND_NAVY }} />}
                  valueStyle={{ color: BRAND_NAVY }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Changed"
                  value={Object.keys(bulkEditData).filter((key) => {
                    const employee = bulkEditEmployees.find((e) => 
                      (e.isNew ? `new-${e.userId}` : e.id) === key
                    );
                    if (!employee) return false;
                    const currentTotal = employee.totalLeaves;
                    const newTotal = bulkEditData[key];
                    return newTotal !== undefined && newTotal !== currentTotal;
                  }).length}
                  valueStyle={{ color: BRAND_PURPLE }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Unchanged"
                  value={
                    bulkEditEmployees.length -
                    Object.keys(bulkEditData).filter((key) => {
                      const employee = bulkEditEmployees.find((e) => 
                        (e.isNew ? `new-${e.userId}` : e.id) === key
                      );
                      if (!employee) return false;
                      const currentTotal = employee.totalLeaves;
                      const newTotal = bulkEditData[key];
                      return newTotal !== undefined && newTotal !== currentTotal;
                    }).length
                  }
                  valueStyle={{ color: "#52c41a" }}
                />
              </Col>
            </Row>
          </div>
        </Form>
      </Modal>

      <Modal
        title={`Balance History — ${formatEmployeeName(historyEmployee?.userName)}`}
        open={historyOpen}
        footer={null}
        width={760}
        onCancel={() => setHistoryOpen(false)}
      >
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Statistic title="Allocated" value={historyEmployee?.totalLeaves ?? 0} />
          <Statistic title="Used" value={historyEmployee?.usedLeaves ?? 0} />
          <Statistic title="Remaining" value={historyEmployee?.remainingLeaves ?? 0} />
        </div>
        {historyLoading ? (
          <div className="py-8 text-center">Loading history...</div>
        ) : historyItems.length === 0 ? (
          <Empty description="No balance history found" />
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50">
                <tr><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Change</th><th className="p-3">Reason</th></tr>
              </thead>
              <tbody>
                {historyItems.map((entry) => (
                  <tr key={entry.id} className="border-t border-slate-100">
                    <td className="p-3">{dayjs(entry.createdAt).format("DD MMM YYYY, hh:mm A")}</td>
                    <td className="p-3">{entry.entryType.replaceAll("_", " ")}</td>
                    <td className="p-3"><Tag color={entry.delta >= 0 ? "green" : "red"}>{entry.delta > 0 ? "+" : ""}{entry.delta}</Tag></td>
                    <td className="p-3">{entry.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LeaveBalancePage;
