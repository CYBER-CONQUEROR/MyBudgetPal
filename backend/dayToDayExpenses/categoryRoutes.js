// routes/category.routes.js
import express from "express";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "./categoryController.js";

const router = express.Router();

// /api/categories
router.get("/", listCategories);
router.post("/", createCategory);
router.put("/:id", updateCategory);
router.delete("/:id", deleteCategory);

export default router;
