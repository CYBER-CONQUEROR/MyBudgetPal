import { Router } from "express";
import * as controller from "./controller.js";

const router = Router();

router.get("/", controller.list);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

export default router;
