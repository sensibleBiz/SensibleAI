import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import {
  createPostgresLeaveType,
  getPostgresLeaveTypes,
  listPostgresLeaves,
  transitionPostgresLeaveStatus,
  createPostgresHoliday,
  createPostgresLeaveRequest,
  deletePostgresHoliday,
  getPostgresLeaveBalanceHistory,
  listPostgresHolidays,
  listPostgresLeaveBalances,
  updatePostgresHoliday,
  updatePostgresLeaveBalance,
} from "./postgresLeave.controller.js";
import {
  postgresLeaveIdParamsSchema,
  postgresLeaveListQuerySchema,
  postgresLeaveStatusBodySchema,
  postgresLeaveTypeCreateBodySchema,
  postgresLeaveTypeListQuerySchema,
  postgresHolidayCreateBodySchema,
  postgresHolidayIdParamsSchema,
  postgresHolidayListQuerySchema,
  postgresHolidayUpdateBodySchema,
  postgresLeaveBalanceHistoryQuerySchema,
  postgresLeaveBalanceQuerySchema,
  postgresLeaveBalanceUpdateBodySchema,
  postgresLeaveBalanceUserParamsSchema,
  postgresLeaveRequestCreateBodySchema,
} from "./postgresLeave.validator.js";

export const postgresLeaveRouter = Router();
postgresLeaveRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresLeaveRouter.use(requirePostgresAuth);

postgresLeaveRouter.get("/types", validateRequest({ query: postgresLeaveTypeListQuerySchema }), withRequestDatabaseContext(getPostgresLeaveTypes));
postgresLeaveRouter.post("/types", validateRequest({ body: postgresLeaveTypeCreateBodySchema }), withRequestDatabaseContext(createPostgresLeaveType));
postgresLeaveRouter.get("/balances", validateRequest({ query: postgresLeaveBalanceQuerySchema }), withRequestDatabaseContext(listPostgresLeaveBalances));
postgresLeaveRouter.get("/balances/:userId/history", validateRequest({ params: postgresLeaveBalanceUserParamsSchema, query: postgresLeaveBalanceHistoryQuerySchema }), withRequestDatabaseContext(getPostgresLeaveBalanceHistory));
postgresLeaveRouter.patch("/balances/:userId", validateRequest({ params: postgresLeaveBalanceUserParamsSchema, body: postgresLeaveBalanceUpdateBodySchema }), withRequestDatabaseContext(updatePostgresLeaveBalance));
postgresLeaveRouter.get("/holidays", validateRequest({ query: postgresHolidayListQuerySchema }), withRequestDatabaseContext(listPostgresHolidays));
postgresLeaveRouter.post("/holidays", validateRequest({ body: postgresHolidayCreateBodySchema }), withRequestDatabaseContext(createPostgresHoliday));
postgresLeaveRouter.patch("/holidays/:holidayId", validateRequest({ params: postgresHolidayIdParamsSchema, body: postgresHolidayUpdateBodySchema }), withRequestDatabaseContext(updatePostgresHoliday));
postgresLeaveRouter.delete("/holidays/:holidayId", validateRequest({ params: postgresHolidayIdParamsSchema, query: postgresLeaveTypeListQuerySchema }), withRequestDatabaseContext(deletePostgresHoliday));
postgresLeaveRouter.post("/requests", validateRequest({ body: postgresLeaveRequestCreateBodySchema }), withRequestDatabaseContext(createPostgresLeaveRequest));
postgresLeaveRouter.get("/requests", validateRequest({ query: postgresLeaveListQuerySchema }), withRequestDatabaseContext(listPostgresLeaves));
postgresLeaveRouter.get("/", validateRequest({ query: postgresLeaveListQuerySchema }), withRequestDatabaseContext(listPostgresLeaves));
postgresLeaveRouter.patch(
  "/:leaveId/status",
  validateRequest({ params: postgresLeaveIdParamsSchema, body: postgresLeaveStatusBodySchema }),
  withRequestDatabaseContext(transitionPostgresLeaveStatus),
);
