import { Button, Card, Input, Space, Tag, theme } from "antd";
import { EditOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import {
  ROUTES_PATHS,
} from "@/shared/lib/constants";
import { OutletPermissions } from "@/features/auth";
import { RootState } from "@/app/store";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";
import { DEFAULT_PERMISSION_DEPARTMENTS, formatDepartmentAccessLabel, formatRoleLabel, getUserOutletDepartmentAccess, getUserOutletRole, isSubSuperAdminRole, isSuperAdminRole, normalizeDepartmentAccess } from "../utils/permissionUtils";
import { accessControlApi, type PermissionUser } from "../api/accessControlApi";
import { useMessageApi } from "@/shared/hooks";

export default function PermissionManagement() {
  const { token } = theme.useToken();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<PermissionUser[]>([]);
  const [searchText, setSearchText] = useState("");
  const outletId = useSelector(
    (state: RootState) => state?.appState?.outletInfo?.id
  );
  const authMode = useSelector((state: RootState) => state.auth.authMode);
  const messageApi = useMessageApi();
  const allDepartments = useMemo(() => {
    const departments = new Set(DEFAULT_PERMISSION_DEPARTMENTS);

    users.forEach((user) => {
      const department = normalizeDepartmentAccess(user.department);
      if (department) {
        departments.add(department);
      }
    });

    return Array.from(departments).sort();
  }, [users]);

  useEffect(() => {
    const controller = new AbortController();
    if (!outletId) {
      setUsers([]);
      setLoading(false);
      return () => controller.abort();
    }
    setLoading(true);
    const fetchAssignedUsers = async () => {
      try {
        setUsers(await accessControlApi.listUsers(
          outletId,
          controller.signal,
          authMode ?? undefined,
        ));
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Unexpected error:", error);
        messageApi.error(error instanceof Error ? error.message : "Failed to load users");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchAssignedUsers();
    return () => controller.abort();
  }, [authMode, messageApi, outletId]);

  const getRoleColor = (role?: string) => {
    const colors: Record<string, string> = {
      SUPERADMIN: "red",
      SUBSUPERADMIN: "volcano",
      ADMIN: "orange",
      USER: "blue",
      MANAGER: "purple",
      SUPPORT: "geekblue",
    };
    const roleKey = String(role ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
    return colors[roleKey] || "default";
  };

  const getPermissionCount = (permissions?: OutletPermissions[]) =>
    permissions
      ?.filter((out) => out?.outletId === outletId)
      .reduce((total, p) => total + (p.outletPermissions?.length || 0), 0) || 0;

  const userDepartmentById = useMemo(
    () =>
      new Map(
        users.map((user) => [
          user.id,
          normalizeDepartmentAccess(user.department),
        ]),
      ),
    [users],
  );
  const getUserDepartment = (userId?: string) =>
    userId ? userDepartmentById.get(userId) ?? "" : "";

  const getDepartmentAccess = (record: PermissionUser) => {
    const role = getUserOutletRole(record, outletId);
    const hasOutletPermissionConfiguration = record.permissions?.some(
      (permission) =>
        permission.outletId === outletId &&
        Array.isArray(permission.outletPermissions)
    );

    if (
      isSuperAdminRole(role) ||
      (isSubSuperAdminRole(role) && !hasOutletPermissionConfiguration)
    ) {
      return allDepartments;
    }

    return getUserOutletDepartmentAccess(record, outletId)
      .map(normalizeDepartmentAccess)
      .filter(Boolean);
  };

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(searchText.toLowerCase().trim())
  );

  return (
    <Card
      title={
        <Space>
          <TeamOutlined />
          <span>User Permission Management</span>
        </Space>
      }
      extra={
        <Input.Search
          placeholder="Search by user name"
          allowClear
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 240 }}
        />
      }
      style={{ boxShadow: token.boxShadow }}
    >
      {loading ? (
        <div className="py-8 text-center text-slate-500">Loading users...</div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
          No users found
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[1050px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-3">User Name</th>
                <th className="px-4 py-3">Mobile No</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department Access</th>
                <th className="px-4 py-3">Permissions Count</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((record) => {
                const recordRole = getUserOutletRole(record, outletId);
                const hasOutletPermissionConfiguration =
                  record.permissions?.some(
                    (permission) =>
                      permission.outletId === outletId &&
                      Array.isArray(permission.outletPermissions)
                  );
                const hasDefaultFullAccess =
                  isSubSuperAdminRole(recordRole) &&
                  !hasOutletPermissionConfiguration;

                return (
                <tr
                  key={record.id}
                  className="border-b border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Space>
                      <UserOutlined style={{ color: token.colorPrimary }} />
                      <span style={{ fontWeight: 500 }}>
                        {formatEmployeeName(record.name)}
                      </span>
                    </Space>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {record.phone_number}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {record.email || "NA"}
                  </td>
                  <td className="px-4 py-3">
                    {getUserDepartment(record.id) ? (
                      <Tag color="geekblue">
                        {formatDepartmentAccessLabel(getUserDepartment(record.id))}
                      </Tag>
                    ) : (
                      <span className="text-slate-400">NA</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Tag color={getRoleColor(recordRole)}>
                      {formatRoleLabel(recordRole) || "NA"}
                    </Tag>
                  </td>
                  <td className="px-4 py-3">
                    <Space size={[4, 4]} wrap>
                      {getDepartmentAccess(record).length > 0 ? (
                        getDepartmentAccess(record).map((department) => (
                          <Tag key={department} color="blue">
                            {formatDepartmentAccessLabel(department)}
                          </Tag>
                        ))
                      ) : (
                        <span className="text-slate-400">NA</span>
                      )}
                    </Space>
                  </td>
                  <td className="px-4 py-3">
                    <Tag color={isSuperAdminRole(recordRole) ? "red" : "cyan"}>
                      {isSuperAdminRole(recordRole) || hasDefaultFullAccess
                        ? "All permissions"
                        : `${getPermissionCount(record.permissions)} permissions`}
                    </Tag>
                  </td>
                  <td className="px-4 py-3">
                    {isSuperAdminRole(recordRole) ? (
                      <Button size="small" disabled icon={<EditOutlined />}>
                        Owner
                      </Button>
                    ) : (
                      <Link to={`${ROUTES_PATHS.PERMISSION_MANAGEMENT}/edit/${record.id}`}>
                        <Button type="primary" ghost size="small" icon={<EditOutlined />}>
                          Edit
                        </Button>
                      </Link>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
