import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest.js";
import { login, logout, refresh } from "./auth.controller.js";
import { loginSchema } from "./auth.validator.js";
import { createQrSession } from "./qr-session.controller.js";

export const postgresAuthRouter = Router();
postgresAuthRouter.post("/login", validateRequest({ body: loginSchema }), login);
postgresAuthRouter.post("/refresh", refresh);
postgresAuthRouter.post("/qr-sessions", createQrSession);
postgresAuthRouter.post("/logout", logout);
