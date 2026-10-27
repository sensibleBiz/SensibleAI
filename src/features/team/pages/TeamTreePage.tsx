import { useCallback, useEffect, useState } from "react";
import TeamTreeModal, { type TeamTreeFormValues } from "./TeamTreeModal";
import TeamTreeTable from "./TeamTreeTable";
import { TeamTreeDTO } from "../types/types";
import { UserProfile } from "@/features/auth";
import { RootState } from "@/app/store";
import { useDispatch, useSelector } from "react-redux";
import { ROLES } from "@/shared/lib/constants";
import { useMessageApi } from "@/shared/hooks";
import { setTeamTreeData } from "@/app/store";
import SpinLoader from "@/shared/components/SpinLoader";
import { normalizeRoleForStorage } from "@/shared/lib/roleUtils";
import { teamTreeApi } from "../api/teamTreeApi";
import { getErrorMessage } from "@/shared/utils/errorUtils";

export default function TeamTreePage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<TeamTreeDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [teamTreeData, setTeamTreeDataState] = useState<TeamTreeDTO[]>([]);
  const outletId = useSelector((state: RootState) => state.appState.outletInfo?.id);
  const dispatch = useDispatch();
  const messageApi = useMessageApi();

  const acceptPostgresTeam = useCallback((items: TeamTreeDTO[]) => {
    setTeamTreeDataState(items);
    dispatch(setTeamTreeData(items.filter((team) => team.isActive)));
    setUsers(items.map((team) => ({
      id: team.userProfileId,
      name: team.userName,
      phone_number: (team as TeamTreeDTO & { phone?: string }).phone || "",
    })) as unknown as UserProfile[]);
  }, [dispatch]);

  const loadPostgresTeam = useCallback(async () => {
    if (!outletId) return;
    setLoading(true);
    try {
      acceptPostgresTeam((await teamTreeApi.list(outletId)).items);
    } catch (error) {
      messageApi.error(getErrorMessage(error, "Failed to load team"));
    } finally {
      setLoading(false);
    }
  }, [acceptPostgresTeam, messageApi, outletId]);

  useEffect(() => {
    if (!outletId) { setLoading(false); return; }
    void loadPostgresTeam();
  }, [loadPostgresTeam, outletId]);

  const handleDelete = async (record: TeamTreeDTO) => {
    if (!record.id || !outletId) return messageApi.error("Invalid record ID");
    try {
      await teamTreeApi.update(record.userProfileId, { outletId, department: record.department || "SALES", isActive: false });
      await loadPostgresTeam();
      messageApi.success("Team member deactivated");
    } catch (error) {
      messageApi.error(getErrorMessage(error, "Failed to update team member"));
    }
  };

  const handleSubmit = async (values: TeamTreeFormValues) => {
    if (!outletId) return messageApi.error("Select an outlet before adding a user");
    setUpdateLoading(true);
    try {
      if (values.id) {
          const nextManagerId =
            values.teamHeadProfileId || values.zoneHeadProfileId || null;
          const currentManagerId =
            editRecord?.teamHeadProfileId || editRecord?.zoneHeadProfileId || null;
          await teamTreeApi.update(values.userProfileId!, {
            outletId,
            department: values.department || "SALES",
            currentDepartment: editRecord?.department,
            roleInZone: values.roleInZone,
            zoneList: values.zoneList || [],
            ...(nextManagerId !== currentManagerId
              ? { managerUserId: nextManagerId }
              : {}),
            empCode: values.empCode,
            isOnPayRoll: values.isOnPayRoll,
            isActive: values.isActive,
          });
          messageApi.success("Team member updated");
      } else {
          if (!values.newUserName || !values.newUserEmail || !values.newUserPassword || !values.department || !values.roleInZone || !values.empCode || values.isOnPayRoll === undefined) {
            return messageApi.error("Complete all required PostgreSQL user details");
          }
          await teamTreeApi.createUser({
            outletId, name: values.newUserName, email: values.newUserEmail,
            ...(values.newUserMobile ? { phoneNumber: `+91${values.newUserMobile}` } : {}),
            password: values.newUserPassword, department: values.department,
            roleInZone: normalizeRoleForStorage(values.roleInZone), zoneList: values.zoneList || [],
            ...(values.teamHeadProfileId ? { managerUserId: values.teamHeadProfileId } : {}),
            empCode: values.empCode, isOnPayRoll: values.isOnPayRoll, isActive: values.isActive ?? true,
          }, "postgres");
          messageApi.success("PostgreSQL user created and added to the team");
      }
      await loadPostgresTeam();
      setModalOpen(false); setEditRecord(null);
    } catch (error) {
      messageApi.error(getErrorMessage(error, "Failed to save team tree"));
    } finally { setUpdateLoading(false); }
  };

  if (loading) return <SpinLoader loading />;
  const managerRoles = [ROLES.MANAGER, ROLES.SUPER_ADMIN, ROLES.SUB_SUPER_ADMIN, ROLES.ADMIN];
  return <>
    <TeamTreeTable teamData={teamTreeData} onAdd={() => { setEditRecord(null); setModalOpen(true); }} onEdit={(record) => { setEditRecord(record); setModalOpen(true); }} onDelete={handleDelete} users={users} />
    <TeamTreeModal open={modalOpen} initialValues={editRecord} teamTreeData={teamTreeData}
      teamHeadList={teamTreeData.filter((team) => managerRoles.includes(team.roleInZone as typeof managerRoles[number]))}
      zoneHeadList={teamTreeData.filter((team) => managerRoles.includes(team.roleInZone as typeof managerRoles[number]))}
      onClose={() => { setEditRecord(null); setModalOpen(false); }} users={users} onSubmit={handleSubmit}
      loading={updateLoading} postgresMode />
  </>;
}
