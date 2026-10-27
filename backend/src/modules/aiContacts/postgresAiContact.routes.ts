import { Router } from "express";
import { requirePostgresAuth, withRequestDatabaseContext } from "../../middleware/postgresAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { createPostgresAiContactJob, deletePostgresAiContactJob, listPostgresAiContactJobs, updatePostgresAiContactJob } from "./postgresAiContact.controller.js";
import { aiContactJobParamsSchema, aiContactOutletQuerySchema, createAiContactJobSchema, updateAiContactJobSchema } from "./postgresAiContact.validator.js";

export const postgresAiContactRouter = Router();
postgresAiContactRouter.use(requirePostgresAuth);
postgresAiContactRouter.get("/jobs", validateRequest({ query: aiContactOutletQuerySchema }), withRequestDatabaseContext(listPostgresAiContactJobs));
postgresAiContactRouter.post("/jobs", validateRequest({ body: createAiContactJobSchema }), withRequestDatabaseContext(createPostgresAiContactJob));
postgresAiContactRouter.patch("/jobs/:jobId", validateRequest({ params: aiContactJobParamsSchema, query: aiContactOutletQuerySchema, body: updateAiContactJobSchema }), withRequestDatabaseContext(updatePostgresAiContactJob));
postgresAiContactRouter.delete("/jobs/:jobId", validateRequest({ params: aiContactJobParamsSchema, query: aiContactOutletQuerySchema }), withRequestDatabaseContext(deletePostgresAiContactJob));
