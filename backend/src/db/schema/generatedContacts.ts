import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { crmSchema } from "./crm.js";
import { users } from "./iam.js";
import { outlets, tenantMemberships, tenants } from "./tenancy.js";

export const generatedContactImports = crmSchema.table("generated_contact_imports", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`), tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }), outletId: uuid("outlet_id").notNull(),
  externalImportId: uuid("external_import_id").notNull(), fileName: varchar("file_name", { length: 500 }).notNull(), worksheetName: varchar("worksheet_name", { length: 200 }).notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" }).notNull(), uploadType: varchar("upload_type", { length: 16 }).notNull(), uploadName: varchar("upload_name", { length: 500 }).notNull(),
  eventDetails: jsonb("event_details"), uploadedByUserId: uuid("uploaded_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
}, (t) => [foreignKey({ name: "generated_contact_imports_outlet_tenant_fk", columns: [t.tenantId,t.outletId], foreignColumns: [outlets.tenantId,outlets.id] }).onDelete("cascade"), unique("generated_contact_imports_scope_uq").on(t.tenantId,t.outletId,t.externalImportId), index("generated_contact_imports_outlet_uploaded_idx").on(t.tenantId,t.outletId,t.uploadedAt)]);

export const generatedContacts = crmSchema.table("generated_contacts", {
  id: uuid("id").primaryKey().default(sql`public.uuid_generate_v7()`), tenantId: uuid("tenant_id").notNull().references(() => tenants.id,{onDelete:"cascade"}), outletId: uuid("outlet_id").notNull(), importId: uuid("import_id").notNull().references(() => generatedContactImports.id,{onDelete:"cascade"}),
  excelRowNumber: integer("excel_row_number").notNull(), values: jsonb("values").notNull().default(sql`'{}'::jsonb`), assignedUserId: uuid("assigned_user_id").notNull(), assignedUserName: varchar("assigned_user_name",{length:300}).notNull(), assignedEmployeeCode: varchar("assigned_employee_code",{length:100}).notNull().default(""), status: varchar("status",{length:40}).notNull().default("OPEN"),
  createdAt: timestamp("created_at",{withTimezone:true,mode:"date"}).notNull().defaultNow(), updatedAt: timestamp("updated_at",{withTimezone:true,mode:"date"}).notNull().defaultNow(),
}, (t) => [foreignKey({name:"generated_contacts_outlet_tenant_fk",columns:[t.tenantId,t.outletId],foreignColumns:[outlets.tenantId,outlets.id]}).onDelete("cascade"), foreignKey({name:"generated_contacts_membership_fk",columns:[t.tenantId,t.assignedUserId],foreignColumns:[tenantMemberships.tenantId,tenantMemberships.userId]}).onDelete("restrict"), unique("generated_contacts_import_row_uq").on(t.importId,t.excelRowNumber), check("generated_contacts_row_ck",sql`${t.excelRowNumber} > 0`)]);
