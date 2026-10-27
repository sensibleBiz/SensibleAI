
import { Router } from "express";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import {
  createPostgresCustomer,
  getPostgresCustomer,
  listPostgresCustomerEnquiries,
  listPostgresCustomers,
  matchPostgresCustomers,
  searchPostgresCustomers,
  updatePostgresCustomer,
} from "./postgresCustomer.controller.js";
import {
  postgresCustomerCreateSchema,
  postgresCustomerDetailQuerySchema,
  postgresCustomerEnquiryQuerySchema,
  postgresCustomerIdParamsSchema,
  postgresCustomerListQuerySchema,
  postgresCustomerMatchQuerySchema,
  postgresCustomerSearchQuerySchema,
  postgresCustomerUpdateSchema,
} from "./postgresCustomer.validator.js";

export const postgresCustomerRouter = Router();
postgresCustomerRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresCustomerRouter.use(requirePostgresAuth);

postgresCustomerRouter.post("/", validateRequest({ body: postgresCustomerCreateSchema }), withRequestDatabaseContext(createPostgresCustomer));
postgresCustomerRouter.get("/", validateRequest({ query: postgresCustomerListQuerySchema }), withRequestDatabaseContext(listPostgresCustomers));
postgresCustomerRouter.get("/search", validateRequest({ query: postgresCustomerSearchQuerySchema }), withRequestDatabaseContext(searchPostgresCustomers));
postgresCustomerRouter.get("/match", validateRequest({ query: postgresCustomerMatchQuerySchema }), withRequestDatabaseContext(matchPostgresCustomers));
postgresCustomerRouter.get("/:customerId/enquiries", validateRequest({ params: postgresCustomerIdParamsSchema, query: postgresCustomerEnquiryQuerySchema }), withRequestDatabaseContext(listPostgresCustomerEnquiries));
postgresCustomerRouter.get("/:customerId", validateRequest({ params: postgresCustomerIdParamsSchema, query: postgresCustomerDetailQuerySchema }), withRequestDatabaseContext(getPostgresCustomer));
postgresCustomerRouter.patch("/:customerId", validateRequest({ params: postgresCustomerIdParamsSchema, body: postgresCustomerUpdateSchema }), withRequestDatabaseContext(updatePostgresCustomer));
