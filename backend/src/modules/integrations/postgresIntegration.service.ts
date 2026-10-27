import type { TransactionDatabase } from "../../db/context.js";
import { AppError } from "../../errors/appError.js";
import { postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import type { IntegrationInput } from "./integration.types.js";
import { postgresIntegrationRepository } from "./postgresIntegration.repository.js";

const allowed = async (db: TransactionDatabase, userId: string, tenantId: string, outletId: string, permission: string) => {
  if (!await postgresAuthorizationRepository.hasOutletPermission(db,userId,tenantId,outletId,permission)) {
    throw new AppError(403,"Integration permission denied","PERMISSION_DENIED");
  }
};
export const postgresIntegrationService = {
  async list(db: TransactionDatabase, tenantId: string, userId: string, outletId: string) {
    await allowed(db,userId,tenantId,outletId,"CRM_INTEGRATION_VIEW");
    return postgresIntegrationRepository.list(db,tenantId,outletId);
  },
  async create(db: TransactionDatabase, tenantId: string, userId: string, input: IntegrationInput) {
    await allowed(db,userId,tenantId,input.outletId,"CRM_INTEGRATION_CREATE");
    return postgresIntegrationRepository.create(db,tenantId,input);
  },
  async update(db: TransactionDatabase, tenantId: string, userId: string, id: string, input: Partial<IntegrationInput> & {outletId:string}) {
    await allowed(db,userId,tenantId,input.outletId,"CRM_INTEGRATION_EDIT");
    const item = await postgresIntegrationRepository.update(db,tenantId,id,input);
    if (!item) throw new AppError(404,"Integration not found","INTEGRATION_NOT_FOUND");
    return item;
  },
  async delete(db: TransactionDatabase, tenantId: string, userId: string, outletId: string, id: string) {
    await allowed(db,userId,tenantId,outletId,"CRM_INTEGRATION_DELETE");
    if (!await postgresIntegrationRepository.delete(db,tenantId,outletId,id)) throw new AppError(404,"Integration not found","INTEGRATION_NOT_FOUND");
    return {id,deleted:true as const};
  },
  async pages(db: TransactionDatabase, tenantId: string, userId: string, outletId: string) {
    await allowed(db,userId,tenantId,outletId,"CRM_INTEGRATION_VIEW");
    return postgresIntegrationRepository.listFacebookPages(db,tenantId,outletId);
  },
  async deletePage(db: TransactionDatabase, tenantId: string, userId: string, outletId: string, id: string) {
    await allowed(db,userId,tenantId,outletId,"CRM_INTEGRATION_DELETE");
    if (!await postgresIntegrationRepository.deleteFacebookPage(db,tenantId,outletId,id)) throw new AppError(404,"Facebook page not found","FACEBOOK_PAGE_NOT_FOUND");
    return {id,deleted:true as const};
  },
};
