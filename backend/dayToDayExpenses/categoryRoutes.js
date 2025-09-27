// routes/categoryRoutes.js
import { Router } from "express";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./categoryController.js";

const router = Router();

// All routes expect req.userId to be set by upstream auth middleware
router.get("/", listCategories);
router.post("/", createCategory);
router.put("/:id", updateCategory);
router.delete("/:id", deleteCategory);

export default router;
