// assist/routes/speechRoutes.js
import { Router } from "express";
import { stt, tts } from "../controllers/speechController.js";
import { upload } from "../middleware/upload.js";

const router = Router();
router.post("/stt", upload.single("audio"), stt);
router.post("/tts", tts);

export default router;
