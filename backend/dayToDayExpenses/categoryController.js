// controllers/categoryController.js
import mongoose from "mongoose";
import Category from "./categoryModel.js";
// If you also need to reassign expenses, adjust this import path:
// import Expense from "../dayToDayExpenses/expense.js";

const isObjectId = (v) => mongoose.isValidObjectId(v);

/** GET /api/categories */
export const listCategories = async (req, res) => {
  try {
    const cats = await Category.find({ userId: req.userId }).sort({ nameLower: 1 });
    res.json({ success: true, data: cats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

/** POST /api/categories { name, color? } */
export const createCategory = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const color = (req.body?.color ?? "").toString();
    if (!name) return res.status(400).json({ success: false, error: "Name is required" });

    const created = await Category.create({ userId: req.userId, name, color });
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ success: false, error: "Category already exists" });
    }
    res.status(500).json({ success: false, error: "Failed to create category" });
  }
};

/** PUT /api/categories/:id  { name?, color? } */
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Invalid category id" });

    const cat = await Category.findOne({ _id: id, userId: req.userId });
    if (!cat) return res.status(404).json({ success: false, error: "Not found" });

    const nextName = typeof req.body?.name === "string" ? req.body.name.trim() : null;
    const nextColor = typeof req.body?.color === "string" ? req.body.color : null;

    if (nextName !== null) {
      if (!nextName) return res.status(400).json({ success: false, error: "Name cannot be empty" });
      cat.name = nextName; // will recalc nameLower & tenantKey on save
    }
    if (nextColor !== null) cat.color = nextColor;

    try {
      await cat.save();
    } catch (e) {
      if (e?.code === 11000) {
        return res.status(409).json({ success: false, error: "Category already exists" });
      }
      throw e;
    }

    res.json({ success: true, data: cat });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || "Failed to update category" });
  }
};

/** DELETE /api/categories/:id?reassign=<targetIdOrName>
 * Optionally reassign related docs before delete.
 * If you don't need reassignment, you can remove that part.
 */
export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isObjectId(id)) return res.status(400).json({ success: false, error: "Invalid category id" });

    const cat = await Category.findOne({ _id: id, userId: req.userId });
    if (!cat) return res.status(404).json({ success: false, error: "Not found" });

    // --- Optional reassignment example (uncomment and adjust if you have Expense model) ---
    // const reassign = String(req.query?.reassign || "").trim();
    // let target = null;
    // if (reassign) {
    //   if (isObjectId(reassign)) {
    //     target = await Category.findOne({ _id: reassign, userId: req.userId });
    //   } else {
    //     target = await Category.findOne({ userId: req.userId, nameLower: reassign.toLowerCase() });
    //   }
    // }
    // if (!target) {
    //   target =
    //     (await Category.findOne({ userId: req.userId, nameLower: "other" })) ||
    //     (await Category.create({ userId: req.userId, name: "Other", color: "#9CA3AF" }));
    // }
    // await Expense.updateMany(
    //   { userId: req.userId, categoryId: cat._id },
    //   { $set: { categoryId: target._id } }
    // );

    await cat.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message || "Failed to delete category" });
  }
};
