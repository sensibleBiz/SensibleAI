import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { POSTGRES_SESSION_HEADER } from "../auth/auth.cookie.js";
import { addPostgresTeamMembership, createPostgresTeamUser, getPostgresTeamMember, listPostgresTeam, updatePostgresTeamMember } from "./postgresTeam.controller.js";
import { postgresTeamCreateSchema, postgresTeamDetailQuerySchema, postgresTeamListSchema, postgresTeamMembershipCreateSchema, postgresTeamUpdateSchema, postgresTeamUserParamsSchema } from "./postgresTeam.validator.js";

export const postgresTeamRouter = Router();
postgresTeamRouter.use((request, _response, next) => {
  if (request.header(POSTGRES_SESSION_HEADER) !== "1") return next("router");
  next();
});
postgresTeamRouter.use(requirePostgresAuth);
postgresTeamRouter.get("/users", validateRequest({ query: postgresTeamListSchema }), withRequestDatabaseContext(listPostgresTeam));
postgresTeamRouter.post("/users", validateRequest({ body: postgresTeamCreateSchema }), withRequestDatabaseContext(createPostgresTeamUser));
postgresTeamRouter.post("/users/:userId/memberships", validateRequest({ params: postgresTeamUserParamsSchema, body: postgresTeamMembershipCreateSchema }), withRequestDatabaseContext(addPostgresTeamMembership));
postgresTeamRouter.get("/users/:userId", validateRequest({ params: postgresTeamUserParamsSchema, query: postgresTeamDetailQuerySchema }), withRequestDatabaseContext(getPostgresTeamMember));
postgresTeamRouter.patch("/users/:userId", validateRequest({ params: postgresTeamUserParamsSchema, body: postgresTeamUpdateSchema }), withRequestDatabaseContext(updatePostgresTeamMember));
