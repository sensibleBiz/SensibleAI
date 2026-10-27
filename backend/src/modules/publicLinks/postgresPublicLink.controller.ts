import type { RequestHandler, Response } from "express";
import type { RequestWithDatabaseContext } from "../../middleware/postgresAuth.js";
import { withEventGatewayDatabase } from "../events/eventGatewayDb.js";

export const listPublicLinks = async (request: RequestWithDatabaseContext, response: Response) => {
  const outletId = String((request.validated?.query as { outletId: string }).outletId);
  const result = await request.database.client.query(`SELECT id,outlet_id,owner_user_id,display_name,target_id,created_at FROM crm.public_urls WHERE tenant_id=$1 AND outlet_id=$2 AND active ORDER BY created_at DESC`, [request.tenantId,outletId]);
  response.json({success:true,data:result.rows.map((row) => ({id:row.id,outletId:row.outlet_id,userId:row.owner_user_id,displayName:row.display_name,url:row.target_id,createdAt:row.created_at.toISOString()}))});
};
export const createPublicLink = async (request: RequestWithDatabaseContext, response: Response) => {
  const body = request.validated?.body as {outletId:string;displayName:string;url:string;phone?:string};
  const result = await request.database.client.query(`INSERT INTO crm.public_urls (tenant_id,outlet_id,owner_user_id,display_name,target_type,target_id) VALUES ($1,$2,$3,$4,'EVENT_PAMPHLET',$5) RETURNING id,created_at`,[request.tenantId,body.outletId,request.userId,body.displayName,body.url]);
  response.status(201).json({success:true,data:{id:result.rows[0]!.id,outletId:body.outletId,userId:request.userId,displayName:body.displayName,url:body.url,phone:body.phone,createdAt:result.rows[0]!.created_at.toISOString()}});
};
export const deletePublicLink = async (request: RequestWithDatabaseContext, response: Response) => {
  const linkId=String(request.params.linkId); const outletId=String((request.validated?.query as {outletId:string}).outletId);
  const result=await request.database.client.query(`UPDATE crm.public_urls SET active=false,updated_at=now() WHERE tenant_id=$1 AND outlet_id=$2 AND id=$3`,[request.tenantId,outletId,linkId]);
  response.json({success:true,data:{deleted:(result.rowCount??0)>0}});
};
export const createQuickContact: RequestHandler = async (request,response) => {
  const body=request.validated?.body as {outletId:string;name:string;mobile:string;businessType:string;sourceType:string;sourceName:string;companyName?:string};
  const data=await withEventGatewayDatabase(body.outletId,async(database,context)=>{const result=await database.client.query(`INSERT INTO crm.quick_contacts (tenant_id,outlet_id,name,mobile,company_name,business_type,source_name,source_type) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at`,[context.tenantId,body.outletId,body.name,body.mobile,body.companyName??null,body.businessType,body.sourceName,body.sourceType]);return {id:result.rows[0]!.id,createdAt:result.rows[0]!.created_at.toISOString()};});
  response.status(201).json({success:true,data});
};
