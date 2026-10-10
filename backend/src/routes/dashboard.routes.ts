import { Router } from "express";
import * as controller from "../controllers/dashboard.controller";
import { authenticate } from "../middleware/auth";

export const dashboardRouter = Router();

// Every logged-in role can open the dashboard. The service hides profit from cashiers.
dashboardRouter.use(authenticate);
dashboardRouter.get("/", controller.getDashboard);
