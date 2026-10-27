import { apiRequest } from "@/shared/api/apiClient";
import { postgresSession } from "@/features/auth";
import type { EventItem } from "@/features/events";
import type { GeneratedContactRow } from "@/features/ai-contacts/utils/generatedContactExcel";

const API_BATCH_SIZE = 100;
const generatedContactAuth = () =>
  postgresSession.getAccessToken() ? { authMode: "postgres" as const } : {};

export interface GeneratedContactImportMeta {
  fileName: string;
  worksheetName: string;
  outletName: string;
  uploadedBy?: string;
  uploadType: "EVENT" | "OTHER";
  uploadName: string;
  event?: GeneratedContactEventDetails;
  assignmentByRowNumber?: ReadonlyMap<number, GeneratedContactAssignee>;
}

export type GeneratedContactEventDetails = Omit<EventItem, "members">;

export interface GeneratedContactAssignee {
  id: string;
  name: string;
  employeeCode?: string;
}

interface ImportResponse {
  saved: number;
  importId: string;
}

export interface GeneratedContactImportSummary {
  importId: string;
  fileName: string;
  worksheetName: string;
  uploadedDateTime: number;
  contactCount: number;
  totalCallCount: number;
  pendingCallCount: number;
  calledCount: number;
  assignedEmployeeCount: number;
  uploadType?: "EVENT" | "OTHER";
  uploadName?: string;
  eventName?: string;
}

export interface GeneratedContactDetail {
  id: string;
  excelRowNumber: number;
  name: string;
  mobile: string;
  email: string;
  city: string;
  values: Record<string, string | number | boolean | null>;
  assignedUserId: string;
  assignedUserName: string;
  assignedEmployeeCode: string;
  status: string;
  callStatus: "Called" | "Not Called";
  eventName?: string;
  eventCity?: string;
  eventDescription?: string;
  eventDateTime?: number;
  eventImageUrl?: string;
  eventRegistrationLink?: string;
}

export interface GeneratedContactImportDetail {
  importId: string;
  contacts: GeneratedContactDetail[];
}

export function listGeneratedContactImports(outletId: string, month?: string) {
  const params = new URLSearchParams({ outletId });
  if (month) params.set("month", month);
  return apiRequest<GeneratedContactImportSummary[]>(
    `/api/v1/generated-contacts/imports?${params.toString()}`,
    generatedContactAuth(),
  );
}

export function getGeneratedContactImportDetails(
  outletId: string,
  importId: string,
) {
  return apiRequest<GeneratedContactImportDetail>(
    `/api/v1/generated-contacts/imports/${encodeURIComponent(importId)}/contacts?outletId=${encodeURIComponent(outletId)}`,
    generatedContactAuth(),
  );
}

export function reassignGeneratedContact(
  outletId: string,
  contactId: string,
  assignedUserId: string,
  reason = "Reassigned from upload details",
) {
  return apiRequest<Pick<GeneratedContactDetail,
    "id" | "assignedUserId" | "assignedUserName" | "assignedEmployeeCode">>(
    `/api/v1/generated-contacts/contacts/${encodeURIComponent(contactId)}/assignee`,
    {
      method: "PATCH",
      body: { outletId, assignedUserId, reason },
      ...generatedContactAuth(),
    },
  );
}

export function deleteGeneratedContact(outletId: string, contactId: string) {
  return apiRequest<{ id: string; importId: string; deleted: true }>(
    `/api/v1/generated-contacts/contacts/${encodeURIComponent(contactId)}?outletId=${encodeURIComponent(outletId)}`,
    { method: "DELETE", ...generatedContactAuth() },
  );
}

export async function storeGeneratedContacts(
  outletId: string,
  rows: GeneratedContactRow[],
  metadata: GeneratedContactImportMeta,
  onProgress?: (saved: number, total: number) => void,
) {
  if (!outletId) throw new Error("Select an outlet before uploading contacts.");
  if (!rows.length) throw new Error("There are no contact rows to upload.");
  if (!metadata.uploadType || !metadata.uploadName.trim()) {
    throw new Error("Select an upload type and enter or select its name.");
  }
  if (metadata.uploadType === "EVENT" && !metadata.event?.name) {
    throw new Error("Select the event these contacts belong to before uploading.");
  }

  const assignments = metadata.assignmentByRowNumber;
  if (
    !assignments ||
    assignments.size !== rows.length ||
    rows.some((row) => !assignments.has(row.rowNumber))
  ) {
    throw new Error(
      "Every contact must be assigned to exactly one employee before uploading.",
    );
  }

  const importId = crypto.randomUUID();
  const uploadedAt = Date.now();
  let saved = 0;

  for (let offset = 0; offset < rows.length; offset += API_BATCH_SIZE) {
    const currentRows = rows.slice(offset, offset + API_BATCH_SIZE);
    const contacts = currentRows.map((row) => {
      const assignee = assignments.get(row.rowNumber)!;
      return {
        rowNumber: row.rowNumber,
        values: row.values,
        assignedUserId: assignee.id,
        assignedUserName: assignee.name,
        ...(assignee.employeeCode
          ? { assignedEmployeeCode: assignee.employeeCode }
          : {}),
      };
    });

    const result = await apiRequest<ImportResponse>(
      "/api/v1/generated-contacts/import",
      {
        method: "POST",
        ...generatedContactAuth(),
        body: {
          outletId,
          importId,
          fileName: metadata.fileName,
          worksheetName: metadata.worksheetName,
          uploadedAt,
          uploadType: metadata.uploadType,
          uploadName: metadata.uploadName.trim(),
          ...(metadata.event ? { event: metadata.event } : {}),
          contacts,
        },
      },
    );
    saved += result.saved;
    onProgress?.(saved, rows.length);
  }

  return { saved, importId };
}
