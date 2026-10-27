/**
 * Custom hook for fetching team tree data
 * Uses the team tree loaded into the Redux store.
 */

import { useSelector } from "react-redux";
import { RootState } from "@/app/store";
import { TeamTreeDTO } from "../types/types";

export interface UseTeamTreeOptions {
  includeInactive?: boolean;
  filterByManagerId?: string; // Filter team members by manager
}

/**
 * Hook to get team tree data
 * Returns filtered and enriched team tree data
 */
export const useTeamTree = (options: UseTeamTreeOptions = {}) => {
  const teamTree = useSelector((s: RootState) => s.appState.teamTreeData || []);
  const currentUserId = useSelector((s: RootState) => s.auth.user?.id ?? "");

  // Filter team tree based on options
  const filteredTeamTree = teamTree.filter((employee) => {
    // Filter inactive employees
    if (!options.includeInactive && !employee.isActive) {
      return false;
    }

    // Filter by manager
    if (options.filterByManagerId) {
      return employee.teamHeadProfileId === options.filterByManagerId;
    }

    return true;
  });

  /**
   * Get employees managed by a specific manager
   */
  const getTeamMembers = (managerId: string): TeamTreeDTO[] => {
    return filteredTeamTree.filter(
      (emp) => emp.teamHeadProfileId === managerId && emp.isActive
    );
  };

  /**
   * Get manager for a specific employee
   */
  const getManager = (employeeId: string): TeamTreeDTO | undefined => {
    const employee = filteredTeamTree.find((e) => e.userProfileId === employeeId);
    if (!employee?.teamHeadProfileId) return undefined;
    return filteredTeamTree.find((e) => e.userProfileId === employee.teamHeadProfileId);
  };

  /**
   * Check if current user is manager of given employee
   */
  const isManagerOf = (employeeId: string): boolean => {
    const employee = filteredTeamTree.find((e) => e.userProfileId === employeeId);
    return employee?.teamHeadProfileId === currentUserId;
  };

  return {
    teamTree: filteredTeamTree,
    getTeamMembers,
    getManager,
    isManagerOf,
  };
};

