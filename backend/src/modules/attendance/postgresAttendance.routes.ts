import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import {
  deletePostgresAttendance,
  getPostgresDailyAttendance,
  getPostgresMonthlyAttendance,
  ingestPostgresAttendanceEvent,
} from "./postgresAttendance.controller.js";
import {
  postgresAttendanceDailyQuerySchema,
  postgresAttendanceDeleteQuerySchema,
  postgresAttendanceEventSchema,
  postgresAttendanceIdParamsSchema,
  postgresAttendanceMonthlyQuerySchema,
} from "./postgresAttendance.validator.js";

export const postgresAttendanceRouter = Router();
postgresAttendanceRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresAttendanceRouter.use(requirePostgresAuth);

postgresAttendanceRouter.get("/daily", validateRequest({ query: postgresAttendanceDailyQuerySchema }), withRequestDatabaseContext(getPostgresDailyAttendance));
postgresAttendanceRouter.get("/monthly", validateRequest({ query: postgresAttendanceMonthlyQuerySchema }), withRequestDatabaseContext(getPostgresMonthlyAttendance));
postgresAttendanceRouter.post("/events", validateRequest({ body: postgresAttendanceEventSchema }), withRequestDatabaseContext(ingestPostgresAttendanceEvent));
postgresAttendanceRouter.delete(
  "/:attendanceId",
  validateRequest({ params: postgresAttendanceIdParamsSchema, query: postgresAttendanceDeleteQuerySchema }),
  withRequestDatabaseContext(deletePostgresAttendance),
);
