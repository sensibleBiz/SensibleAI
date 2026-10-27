import { TEAM_EMP_CODE_FIELD } from "./constants.js";
import { normalizeText } from "./validation.js";

export const findEmployeeInTeamTreeCached = async (params: {
  punchId: unknown;
  teamTreeCollection: FirebaseFirestore.CollectionReference;
  txnId: string;
  outletId: string;
  cache: Map<string, EmployeeMatchResult>;
}) => {
  const cacheKey = `${params.outletId}:${normalizeText(params.punchId)}`;
  if (params.cache.has(cacheKey)) return params.cache.get(cacheKey)!;
  const result = await findEmployeeInTeamTree(params);
  params.cache.set(cacheKey, result);
  return result;
};

export type EmployeeMatchResult =
  | { notFound: true; matchCount: 0 }
  | { ambiguous: true; matchCount: number }
  | { userId: string; userName: string; employeeCode: string; teamMemberId: string };

const addTeamTreeMatches = async (params: {
  matches: Map<string, FirebaseFirestore.QueryDocumentSnapshot>;
  teamTreeCollection: FirebaseFirestore.CollectionReference;
  empCode: string | number;
  txnId: string;
  outletId: string;
}) => {
  const snapshot = await params.teamTreeCollection
    .where(TEAM_EMP_CODE_FIELD, "==", params.empCode)
    .limit(2)
    .get();
  for (const teamDoc of snapshot.docs) {
    const teamData = teamDoc.data() || {};
    if (teamData.isActive === false || teamData.isDeleted === true) continue;
    params.matches.set(teamDoc.id, teamDoc);
  }
};

export const findEmployeeInTeamTree = async (params: {
  punchId: unknown;
  teamTreeCollection: FirebaseFirestore.CollectionReference;
  txnId: string;
  outletId: string;
}): Promise<EmployeeMatchResult> => {
  const punchText = normalizeText(params.punchId);
  const matches = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  await addTeamTreeMatches({
    matches,
    teamTreeCollection: params.teamTreeCollection,
    empCode: punchText,
    txnId: params.txnId,
    outletId: params.outletId,
  });
  if (matches.size === 0) {
    const numericPunch = Number(punchText);
    if (Number.isFinite(numericPunch)) {
      await addTeamTreeMatches({
        matches,
        teamTreeCollection: params.teamTreeCollection,
        empCode: numericPunch,
        txnId: params.txnId,
        outletId: params.outletId,
      });
    }
  }
  if (matches.size === 0) return { notFound: true, matchCount: 0 };
  if (matches.size > 1) return { ambiguous: true, matchCount: matches.size };
  const teamDoc = [...matches.values()][0]!;
  const teamData = teamDoc.data() || {};
  const userId = normalizeText(
    teamData.uid || teamData.userId || teamData.userProfileId || teamDoc.id,
  );
  return {
    userId,
    userName: String(teamData.userName || teamData.name || ""),
    employeeCode: String(teamData.empCode ?? punchText),
    teamMemberId: teamDoc.id,
  };
};
