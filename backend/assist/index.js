// assist/index.js
import { Router } from "express";
import chatRoutes from "./routes/chatRoutes.js";
import speechRoutes from "./routes/speechRoutes.js";
import realtimeRoutes from "./routes/realtimeRoutes.js";

const router = Router();

router.use("/chat", chatRoutes);
router.use("/speech", speechRoutes);
router.use("/realtime", realtimeRoutes);

router.get("/openai", async (req, res) => {
  res.json({
    hasKey: !!process.env.OPENAI_API_KEY,
    node: process.version,
    now: new Date().toISOString(),
  });
});

export default router;

