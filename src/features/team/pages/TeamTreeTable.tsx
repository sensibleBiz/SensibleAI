import { Button, Card, Empty, Input, Popconfirm, Space, Tag } from "antd";
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useCallback, useMemo, useState } from "react";
import { Can } from "@/features/access-control";
import { TeamTreeDTO } from "../types/types";
import { UserProfile } from "@/features/auth";
import { PERMISSION_MASTER } from "@/shared/lib/constants";
import { formatEmployeeName } from "@/shared/utils/helperFunctions";

interface TeamTreeTableProps {
  teamData: TeamTreeDTO[];
  onEdit: (record: TeamTreeDTO) => void;
  onDelete: (record: TeamTreeDTO) => void;
  onAdd: () => void;
  users: UserProfile[];
}

const pageSizeOptions = [10, 20, 50, 100];

export default function TeamTreeTable({
  teamData,
  onEdit,
  onDelete,
  onAdd,
  users,
}: TeamTreeTableProps) {
  const [searchText, setSearchText] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  const getUserName = useCallback(
    (userid?: string) => {
      const user = users?.find((u) => u.id === userid);
      return formatEmployeeName(user?.name);
    },
    [users]
  );

  const getUserMobile = useCallback(
    (userId?: string) =>
      users?.find((user) => user.id === userId)?.phone_number || "-",
    [users]
  );

  const filteredData = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    if (!text) return teamData;

    return teamData.filter((item) => {
      const zones = item.zoneList || [];
      return (
        item.empCode?.toLowerCase().includes(text) ||
        item.userName?.toLowerCase().includes(text) ||
        getUserMobile(item.userProfileId).toLowerCase().includes(text) ||
        item.roleInZone?.toLowerCase().includes(text) ||
        getUserName(item.teamHeadProfileId).toLowerCase().includes(text) ||
        getUserName(item.zoneHeadProfileId).toLowerCase().includes(text) ||
        zones.some((zone) => zone?.toLowerCase()?.includes(text))
      );
    });
  }, [getUserMobile, getUserName, searchText, teamData]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedData = filteredData.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setCurrentPage(1);
  };

  return (
    <Card
      title={<b>Team Tree Master</b>}
      extra={
        <Can permission={PERMISSION_MASTER.CRM_TEAMTREE_CREATE}>
          <Button type="primary" icon={<PlusOutlined />} onClick={onAdd}>
            Add
          </Button>
        </Can>
      }
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Input
          placeholder="Search by name, mobile, role, zone..."
          prefix={<SearchOutlined />}
          allowClear
          className="max-w-sm"
          value={searchText}
          onChange={(event) => handleSearchChange(event.target.value)}
        />
        <div className="text-sm text-slate-500">
          Showing {pagedData.length} of {filteredData.length} records
        </div>
      </div>

      {filteredData.length === 0 ? (
        <Empty description="No team tree records found" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full border-collapse border border-slate-200 text-left text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <th className="border-b border-slate-200 px-4 py-3">Emp Code</th>
                  <th className="border-b border-slate-200 px-4 py-3">Zones</th>
                  <th className="border-b border-slate-200 px-4 py-3">Role</th>
                  <th className="border-b border-slate-200 px-4 py-3">User Name</th>
                  <th className="border-b border-slate-200 px-4 py-3">Mobile No.</th>
                  <th className="border-b border-slate-200 px-4 py-3">Active</th>
                  <th className="border-b border-slate-200 px-4 py-3">On Pay Role</th>
                  <th className="border-b border-slate-200 px-4 py-3">Team Head</th>
                  <th className="border-b border-slate-200 px-4 py-3">Zone Head</th>
                  <th className="border-b border-slate-200 px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedData.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {record.empCode || "NA"}
                    </td>
                    <td className="px-4 py-3">
                      {(record.zoneList || []).length > 0
                        ? record.zoneList.map((zone) => (
                            <Tag key={zone} color="blue">
                              {zone}
                            </Tag>
                          ))
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <Tag color="purple">{record.roleInZone || "-"}</Tag>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatEmployeeName(record.userName)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {getUserMobile(record.userProfileId)}
                    </td>
                    <td className="px-4 py-3">
                      {record.isActive ? (
                        <Tag color="green">Active</Tag>
                      ) : (
                        <Tag color="red">Inactive</Tag>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {record.isOnPayRoll ? "Yes" : "No"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {getUserName(record.teamHeadProfileId)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {getUserName(record.zoneHeadProfileId)}
                    </td>
                    <td className="px-4 py-3">
                      <Space>
                        <Can permission={PERMISSION_MASTER.CRM_TEAMTREE_EDIT}>
                          <Button
                            type="text"
                            icon={<EditOutlined />}
                            onClick={() => onEdit(record)}
                          />
                        </Can>
                        <Can permission={PERMISSION_MASTER.CRM_TEAMTREE_DELETE}>
                          <Popconfirm
                            title="Delete User"
                            onConfirm={() => onDelete(record)}
                          >
                            <Button
                              danger
                              type="text"
                              icon={<DeleteOutlined />}
                            />
                          </Popconfirm>
                        </Can>
                      </Space>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Space>
              <span className="text-sm text-slate-500">Rows per page</span>
              <select
                className="rounded border border-slate-300 px-2 py-1 text-sm"
                value={pageSize}
                onChange={(event) => handlePageSizeChange(Number(event.target.value))}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Space>
            <Space>
              <Button
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                Page {safePage} of {totalPages}
              </span>
              <Button
                disabled={safePage >= totalPages}
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
              >
                Next
              </Button>
            </Space>
          </div>
        </>
      )}
    </Card>
  );
}
