import type { QueryResultRow } from "pg";
import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import type { GeneratedContactCellValue, GeneratedContactImportInput, GeneratedContactReassignInput } from "../../types/generatedContact.types.js";
import { PostgresAuthorizationRepository, postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";

interface ImportRow extends QueryResultRow { id:string; external_import_id:string; file_name:string; worksheet_name:string; uploaded_at:Date; upload_type:"EVENT"|"OTHER"; upload_name:string; event_details:Record<string,unknown>|null; contact_count:string; called_count:string; assigned_count:string }
interface ContactRow extends QueryResultRow { id:string; excel_row_number:number; values:Record<string,GeneratedContactCellValue>; assigned_user_id:string; assigned_user_name:string; assigned_employee_code:string; status:string }

const monthBounds = (month?: string) => {
  const value = month ?? new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Kolkata", year:"numeric", month:"2-digit" }).format(new Date()).slice(0,7);
  const [year, part] = value.split("-").map(Number);
  return [new Date(Date.UTC(year!,part!-1,1)-19_800_000), new Date(Date.UTC(year!,part!,1)-19_800_000)] as const;
};
const textValue = (values:Record<string,GeneratedContactCellValue>, names:string[]) => {
  const entries = Object.entries(values).map(([key,value]) => [key.trim().toLowerCase().replace(/[_-]+/g," "),value] as const);
  for (const name of names) { const found=entries.find(([key])=>key===name); if(found && found[1]!=null) return String(found[1]); }
  return "";
};

export class PostgresGeneratedContactService {
  constructor(private readonly authorization:PostgresAuthorizationRepository=postgresAuthorizationRepository) {}
  private async allowed(db:TransactionDatabase,tenantId:string,userId:string,outletId:string,permission:string) {
    if(!await this.authorization.hasOutletPermission(db,userId,tenantId,outletId,permission)) throw new AppError(403,`Permission denied for ${permission}`,"PERMISSION_DENIED");
  }
  async list(db:TransactionDatabase,tenantId:string,userId:string,outletId:string,month?:string) {
    await this.allowed(db,tenantId,userId,outletId,"generated_contacts.read"); const [start,end]=monthBounds(month);
    const result=await db.client.query<ImportRow>(`SELECT imp.id,imp.external_import_id,imp.file_name,imp.worksheet_name,imp.uploaded_at,imp.upload_type,imp.upload_name,imp.event_details,
      count(contact.id)::text contact_count,count(contact.id) FILTER (WHERE upper(contact.status)='CALLED')::text called_count,count(DISTINCT contact.assigned_user_id)::text assigned_count
      FROM crm.generated_contact_imports imp LEFT JOIN crm.generated_contacts contact ON contact.import_id=imp.id
      WHERE imp.tenant_id=$1 AND imp.outlet_id=$2 AND imp.uploaded_at >= $3 AND imp.uploaded_at < $4 GROUP BY imp.id ORDER BY imp.uploaded_at DESC`,[tenantId,outletId,start,end]);
    return result.rows.map(row=>{const count=Number(row.contact_count);const called=Number(row.called_count);return {importId:row.external_import_id,fileName:row.file_name,worksheetName:row.worksheet_name,uploadedDateTime:row.uploaded_at.getTime(),contactCount:count,totalCallCount:count,pendingCallCount:count-called,calledCount:called,assignedEmployeeCount:Number(row.assigned_count),uploadType:row.upload_type,uploadName:row.upload_name,eventName:String(row.event_details?.name??"")||undefined};});
  }
  async details(db:TransactionDatabase,tenantId:string,userId:string,outletId:string,externalImportId:string) {
    await this.allowed(db,tenantId,userId,outletId,"generated_contacts.read");
    const imp=await db.client.query<{id:string;event_details:Record<string,unknown>|null}>(`SELECT id,event_details FROM crm.generated_contact_imports WHERE tenant_id=$1 AND outlet_id=$2 AND external_import_id=$3`,[tenantId,outletId,externalImportId]);
    if(!imp.rows[0]) throw new AppError(404,"Contact import not found","CONTACT_IMPORT_NOT_FOUND");
    const result=await db.client.query<ContactRow>(`SELECT id,excel_row_number,values,assigned_user_id,assigned_user_name,assigned_employee_code,status FROM crm.generated_contacts WHERE tenant_id=$1 AND outlet_id=$2 AND import_id=$3 ORDER BY excel_row_number`,[tenantId,outletId,imp.rows[0].id]); const event=imp.rows[0].event_details;
    return {importId:externalImportId,contacts:result.rows.map(row=>({id:row.id,excelRowNumber:row.excel_row_number,name:textValue(row.values,["name","full name","business name","company name"]),mobile:textValue(row.values,["mobile","phone","phone number","contact number"]),email:textValue(row.values,["email","email address","email id"]),city:textValue(row.values,["city","location"]),values:row.values,assignedUserId:row.assigned_user_id,assignedUserName:row.assigned_user_name,assignedEmployeeCode:row.assigned_employee_code,status:row.status,callStatus:row.status.toUpperCase()==="CALLED"?"Called" as const:"Not Called" as const,eventName:event?String(event.name??""):undefined,eventCity:event?String(event.city??""):undefined,eventDescription:event?String(event.description??""):undefined,eventDateTime:event&&event.eventDateTime?Date.parse(String(event.eventDateTime)):undefined,eventImageUrl:event?String(event.imageUrl??""):undefined,eventRegistrationLink:event?String(event.registrationLink??""):undefined}))};
  }
  private async assignees(db:TransactionDatabase,tenantId:string,outletId:string,ids:string[]) {
    const result=await db.client.query<{user_id:string;display_name:string;emp_code:string}>(`SELECT membership.user_id,usr.display_name,coalesce(max(team.emp_code),'') emp_code FROM tenancy.tenant_memberships membership JOIN iam.users usr ON usr.id=membership.user_id LEFT JOIN crm.team_memberships team ON team.tenant_id=membership.tenant_id AND team.user_id=membership.user_id AND team.outlet_id=$2 AND team.active WHERE membership.tenant_id=$1 AND membership.user_id=ANY($3::uuid[]) AND membership.active AND EXISTS (SELECT 1 FROM tenancy.outlet_assignments assignment WHERE assignment.tenant_id=$1 AND assignment.outlet_id=$2 AND assignment.user_id=membership.user_id AND assignment.active) GROUP BY membership.user_id,usr.display_name`,[tenantId,outletId,ids]); return new Map(result.rows.map(row=>[row.user_id,row]));
  }
  async create(db:TransactionDatabase,tenantId:string,userId:string,input:GeneratedContactImportInput) {
    await this.allowed(db,tenantId,userId,input.outletId,"generated_contacts.create"); const ids=[...new Set(input.contacts.map(item=>item.assignedUserId))]; const assignees=await this.assignees(db,tenantId,input.outletId,ids); if(assignees.size!==ids.length) throw new AppError(400,"Every contact must be assigned to an active employee","INVALID_CONTACT_ASSIGNEE");
    const imported=await db.client.query<{id:string}>(`WITH inserted AS (INSERT INTO crm.generated_contact_imports (tenant_id,outlet_id,external_import_id,file_name,worksheet_name,uploaded_at,upload_type,upload_name,event_details,uploaded_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id,outlet_id,external_import_id) DO NOTHING RETURNING id) SELECT id FROM inserted UNION ALL SELECT id FROM crm.generated_contact_imports WHERE tenant_id=$1 AND outlet_id=$2 AND external_import_id=$3 LIMIT 1`,[tenantId,input.outletId,input.importId,input.fileName,input.worksheetName,new Date(input.uploadedAt),input.uploadType,input.uploadName,input.event?JSON.stringify(input.event):null,userId]); let saved=0;
    for(const contact of input.contacts){const person=assignees.get(contact.assignedUserId)!;const inserted=await db.client.query(`INSERT INTO crm.generated_contacts (tenant_id,outlet_id,import_id,excel_row_number,values,assigned_user_id,assigned_user_name,assigned_employee_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (import_id,excel_row_number) DO NOTHING`,[tenantId,input.outletId,imported.rows[0]!.id,contact.rowNumber,JSON.stringify(contact.values),contact.assignedUserId,person.display_name,person.emp_code]);saved+=inserted.rowCount??0;} return {saved,importId:input.importId};
  }
  async reassign(db:TransactionDatabase,tenantId:string,userId:string,input:GeneratedContactReassignInput) {await this.allowed(db,tenantId,userId,input.outletId,"generated_contacts.update");const people=await this.assignees(db,tenantId,input.outletId,[input.assignedUserId]);const person=people.get(input.assignedUserId);if(!person)throw new AppError(400,"Select an active employee","INVALID_CONTACT_ASSIGNEE");const current=await db.client.query<{assigned_user_id:string}>(`SELECT assigned_user_id FROM crm.generated_contacts WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3`,[tenantId,input.outletId,input.contactId]);if(!current.rows[0])throw new AppError(404,"Contact not found","GENERATED_CONTACT_NOT_FOUND");await db.client.query(`UPDATE crm.generated_contacts SET assigned_user_id=$4,assigned_user_name=$5,assigned_employee_code=$6 WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3`,[tenantId,input.outletId,input.contactId,input.assignedUserId,person.display_name,person.emp_code]);await db.client.query(`INSERT INTO crm.generated_contact_assignment_history (tenant_id,outlet_id,contact_id,assigned_from_user_id,assigned_to_user_id,reassigned_by_user_id,reason) VALUES ($1,$2,$3,$4,$5,$6,$7)`,[tenantId,input.outletId,input.contactId,current.rows[0].assigned_user_id,input.assignedUserId,userId,input.reason??""]);return{id:input.contactId,assignedUserId:input.assignedUserId,assignedUserName:person.display_name,assignedEmployeeCode:person.emp_code};}
  async delete(db:TransactionDatabase,tenantId:string,userId:string,outletId:string,contactId:string){await this.allowed(db,tenantId,userId,outletId,"generated_contacts.delete");const result=await db.client.query<{import_id:string}>(`DELETE FROM crm.generated_contacts WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3 RETURNING import_id`,[tenantId,outletId,contactId]);if(!result.rows[0])throw new AppError(404,"Uploaded contact not found","GENERATED_CONTACT_NOT_FOUND");return{id:contactId,importId:result.rows[0].import_id,deleted:true as const};}
}
export const postgresGeneratedContactService=new PostgresGeneratedContactService();
