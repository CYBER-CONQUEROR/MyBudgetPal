// assist/routes/realtimeRoutes.js
import { Router } from "express";
import { createRealtimeToken } from "../controllers/realtimeController.js";

const router = Router();
router.post("/token", createRealtimeToken);

export default router;
