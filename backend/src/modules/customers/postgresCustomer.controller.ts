import type { Request } from "express";
import { AppError } from "../../errors/appError.js";
import { postgresAuthorizationRepository } from "../authorization/postgresAuthorization.repository.js";
import type { CustomerMatchQuery, PostgresCustomerCreateInput, PostgresCustomerListQuery, PostgresCustomerUpdateInput } from "./customer.types.js";
import { postgresCustomerService } from "./postgresCustomer.service.js";

const context = (request: Request) => {
  if (!request.database || !request.postgresAuth) throw new AppError(401, "Authentication is required", "AUTHENTICATION_REQUIRED");
  return { database: request.database, auth: request.postgresAuth };
};

const authorize = async (request: Request, outletId: string, permission: string) => {
  const { database, auth } = context(request);
  const allowed = await postgresAuthorizationRepository.hasOutletPermission(database, auth.userId, auth.tenantId, outletId, permission);
  if (!allowed) throw new AppError(403, "You do not have the required PostgreSQL customer permission", "POSTGRES_PERMISSION_DENIED");
  return { database, auth };
};

export const createPostgresCustomer = async (request: Request, response: Parameters<import("express").RequestHandler>[1]) => {
  const input = request.validated?.body as PostgresCustomerCreateInput;
  const { database, auth } = await authorize(request, input.outletId, "customers.create");
  const result = await postgresCustomerService.create(database, auth.tenantId, auth.userId, input);
  response.status(result.created ? 201 : 200).json({ success: true, data: result });
};

export const listPostgresCustomers = async (request: Request, response: Parameters<import("express").RequestHandler>[1]) => {
  const query = request.validated?.query as PostgresCustomerListQuery;
  const { database, auth } = await authorize(request, query.outletId, "customers.read");
  response.json({ success: true, data: await postgresCustomerService.list(database, auth.tenantId, query) });
};

export const searchPostgresCustomers = async (request: Request, response: Parameters<import("express").RequestHandler>[1]) => {
  const query = request.validated?.query as PostgresCustomerListQuery;
  const { database, auth } = await authorize(request, query.outletId, "customers.read");
  response.json({ success: true, data: await postgresCustomerService.search(database, auth.tenantId, query) });
};

export const matchPostgresCustomers = async (request: Request, response: Parameters<import("express").RequestHandler>[1]) => {
  const query = request.validated?.query as CustomerMatchQuery;
  const { database, auth } = await authorize(request, query.outletId, "customers.read");
  response.json({ success: true, data: await postgresCustomerService.match(database, auth.tenantId, query) });
};

export const getPostgresCustomer = async (request: Request, response: Parameters<import("express").RequestHandler>[1]) => {
  const query = request.validated?.query as { outletId: string };
  const params = request.validated?.params as { customerId: string };
  const { database, auth } = await authorize(request, query.outletId, "customers.read");
  response.json({ success: true, data: await postgresCustomerService.getById(database, auth.tenantId, query.outletId, params.customerId) });
};

export const updatePostgresCustomer = async (request: Request, response: Parameters<import("express").RequestHandler>[1]) => {
  const input = request.validated?.body as PostgresCustomerUpdateInput;
  const params = request.validated?.params as { customerId: string };
  const requiredPermission = input.status === "INACTIVE" ? "customers.archive" : "customers.update";
  const { database, auth } = await authorize(request, input.outletId, requiredPermission);
  response.json({ success: true, data: await postgresCustomerService.update(database, auth.tenantId, auth.userId, params.customerId, input) });
};

export const listPostgresCustomerEnquiries = async (request: Request, response: Parameters<import("express").RequestHandler>[1]) => {
  const query = request.validated?.query as { outletId: string };
  const params = request.validated?.params as { customerId: string };
  const { database, auth } = await authorize(request, query.outletId, "customers.read");
  response.json({ success: true, data: await postgresCustomerService.getEnquiries(database, auth.tenantId, query.outletId, params.customerId) });
};
