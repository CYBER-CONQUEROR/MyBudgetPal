// routes/commitments.js
import { Router } from "express";
import * as c from "./bankController.js";

const router = Router();

router.get("/", c.listCommitments);
router.get("/:id", c.getCommitment);
router.post("/", c.createCommitment);
router.put("/:id", c.updateCommitment);
router.delete("/:id", c.deleteCommitment);

export default router;
