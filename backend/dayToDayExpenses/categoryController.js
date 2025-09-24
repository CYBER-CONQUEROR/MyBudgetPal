// controllers/category.controller.js
import mongoose from "mongoose";
import Category from "./categoryModel.js";
// ⬇️ Adjust this import to your actual Expense model path
import Expense from "./expense.js";

const isObjectId = (v) => mongoose.isValidObjectId(v);

const problem = ({ status = 400, title = "Bad Request", detail }) => ({
  type: "about:blank",
  title,
  status,
  detail,
});

/** GET /api/categories  -> list (this user's, sorted) */
export const listCategories = async (req, res) => {
  try {
    const userId = req.userId; // must be an ObjectId (your middleware already sets this)
    const cats = await Category.find({ userId })
      .sort({ name: 1 })
      .collation({ locale: "en", strength: 2 });
    res.json({ success: true, data: cats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};

/** POST /api/categories  -> create */
export const createCategory = async (req, res) => {
  try {
    const userId = req.userId;
    const name = (req.body?.name || "").trim();
    const color = (req.body?.color ?? "").toString();

    if (!name) {
      return res
        .status(400)
        .json({ success: false, error: "Name is required" });
    }

    // case-insensitive duplicate check for this user
    const exists = await Category.findOne({ userId, name }).collation({
      locale: "en",
      strength: 2,
    });
    if (exists) {
      return res
        .status(409)
        .json({ success: false, error: "Category already exists" });
    }

    const created = await Category.create({ userId, name, color });
    res.status(201).json({ success: true, data: created });
  } catch (e) {
    // unique index collision fallback
    if (e?.code === 11000) {
      return res
        .status(409)
        .json({ success: false, error: "Category already exists" });
    }
    res.status(500).json({ success: false, error: e.message });
  }
};

/** PUT /api/categories/:id  -> rename / recolor */
export const updateCategory = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid category id" });
    }

    const nextNameRaw = req.body?.name;
    const nextColor = req.body?.color;

    const cat = await Category.findOne({ _id: id, userId });
    if (!cat) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    const updates = {};
    let renamedFrom = null;

    if (typeof nextColor === "string") {
      updates.color = nextColor;
    }

    if (typeof nextNameRaw === "string") {
      const nextName = nextNameRaw.trim();
      if (!nextName) {
        return res
          .status(400)
          .json({ success: false, error: "Name cannot be empty" });
      }

      // case-insensitive compare
      if (nextName.toLowerCase() !== cat.name.toLowerCase()) {
        const dup = await Category.findOne({ userId, name: nextName }).collation(
          { locale: "en", strength: 2 }
        );
        if (dup) {
          return res
            .status(409)
            .json({ success: false, error: "Category already exists" });
        }
        renamedFrom = cat.name;
        updates.name = nextName;
      }
    }

    if (Object.keys(updates).length > 0) {
      await Category.updateOne({ _id: id, userId }, { $set: updates });
      // cascade rename to THIS user's expenses if you still store category as string
      if (renamedFrom) {
        await Expense.updateMany(
          { userId, category: renamedFrom },
          { $set: { category: updates.name } }
        );
      }
    }

    const fresh = await Category.findById(id);
    res.json({ success: true, data: fresh });
  } catch (e) {
    if (e?.code === 11000) {
      return res
        .status(409)
        .json({ success: false, error: "Category already exists" });
    }
    res.status(500).json({ success: false, error: e.message });
  }
};

/** DELETE /api/categories/:id?reassign=<nameOrId>
 *  - Reassign this user's expenses from the deleted category to another category.
 *  - If `reassign` not provided or not found, fall back to "Other" (auto-create if missing).
 */
export const deleteCategory = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    if (!isObjectId(id)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid category id" });
    }

    const cat = await Category.findOne({ _id: id, userId });
    if (!cat) {
      return res.status(404).json({ success: false, error: "Not found" });
    }

    // resolve reassignment target
    const reassignParam = (req.query?.reassign || "").trim();

    let target = null;
    if (reassignParam) {
      if (isObjectId(reassignParam)) {
        target = await Category.findOne({ _id: reassignParam, userId });
      } else {
        target = await Category.findOne({ userId, name: reassignParam }).collation(
          { locale: "en", strength: 2 }
        );
      }
    }

    // fallback to "Other" (create if missing)
    if (!target) {
      target =
        (await Category.findOne({ userId, name: "Other" }).collation({
          locale: "en",
          strength: 2,
        })) ||
        (await Category.create({ userId, name: "Other", color: "#9CA3AF" }));
    }

    // Reassign THIS user's expenses (string-based category)
    if (cat.name !== target.name) {
      await Expense.updateMany(
        { userId, category: cat.name },
        { $set: { category: target.name } }
      );
    }

    await cat.deleteOne();
    res.json({ success: true, reassignTo: target });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
};
