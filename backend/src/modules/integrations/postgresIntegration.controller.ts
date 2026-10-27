import type { Response } from "express";
import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import type { IntegrationInput } from "./integration.types.js";
import { postgresIntegrationService as service } from "./postgresIntegration.service.js";

const outlet = (request: RequestWithDatabaseContext) => String((request.validated?.query as {outletId:string}).outletId);
export const listIntegrations = async (request: RequestWithDatabaseContext,response:Response) => { response.json({success:true,data:await service.list(request.database,request.tenantId,request.userId,outlet(request))}); };
export const createIntegration = async (request: RequestWithDatabaseContext,response:Response) => { response.status(201).json({success:true,data:await service.create(request.database,request.tenantId,request.userId,request.validated?.body as IntegrationInput)}); };
export const updateIntegration = async (request: RequestWithDatabaseContext,response:Response) => { response.json({success:true,data:await service.update(request.database,request.tenantId,request.userId,String(request.params.integrationId),request.validated?.body as IntegrationInput)}); };
export const deleteIntegration = async (request: RequestWithDatabaseContext,response:Response) => { response.json({success:true,data:await service.delete(request.database,request.tenantId,request.userId,outlet(request),String(request.params.integrationId))}); };
export const listFacebookPages = async (request: RequestWithDatabaseContext,response:Response) => { response.json({success:true,data:await service.pages(request.database,request.tenantId,request.userId,outlet(request))}); };
export const deleteFacebookPage = async (request: RequestWithDatabaseContext,response:Response) => { response.json({success:true,data:await service.deletePage(request.database,request.tenantId,request.userId,outlet(request),String(request.params.pageId))}); };
