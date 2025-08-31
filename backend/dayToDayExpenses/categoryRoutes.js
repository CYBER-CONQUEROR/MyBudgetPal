// routes/categoryRoutes.js
import express from "express";
import Category from "./categoryModel.js";
import Expense from "./expense.js";

const router = express.Router();

// LIST (only user's)
router.get("/", async (req, res) => {
  try {
    const cats = await Category
      .find({ userId: req.userId })
      .sort({ name: 1 })
      .collation({ locale: "en", strength: 2 });
    res.json({ success: true, data: cats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// CREATE (only for this user)
router.post("/", async (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, error: "Name is required" });

    const exists = await Category.findOne({ userId: req.userId, name })
      .collation({ locale: "en", strength: 2 });
    if (exists) return res.status(409).json({ success: false, error: "Category already exists" });

    const created = await Category.create({ userId: req.userId, name, color: req.body?.color || "" });
    res.json({ success: true, data: created });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// UPDATE/RENAME (only user’s doc; also migrate expenses for THIS user only if you store name)
router.put("/:id", async (req, res) => {
  try {
    const nextName = (req.body?.name || "").trim();
    const color = req.body?.color;

    const cat = await Category.findOne({ _id: req.params.id, userId: req.userId });
    if (!cat) return res.status(404).json({ success: false, error: "Not found" });

    if (nextName && nextName.toLowerCase() !== cat.name.toLowerCase()) {
      const dup = await Category.findOne({ userId: req.userId, name: nextName })
        .collation({ locale: "en", strength: 2 });
      if (dup) return res.status(409).json({ success: false, error: "Category already exists" });

      const oldName = cat.name;
      cat.name = nextName;

      // If your Expense still uses a string "category":
      await Expense.updateMany(
        { userId: req.userId, category: oldName },
        { $set: { category: nextName } }
      );
    }
    if (typeof color === "string") cat.color = color;
    await cat.save();

    res.json({ success: true, data: cat });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE (only user’s doc; reassign only THIS user’s expenses)
router.delete("/:id", async (req, res) => {
  try {
    const reassignTo = (req.query.reassign || "Other").trim();
    const cat = await Category.findOne({ _id: req.params.id, userId: req.userId });
    if (!cat) return res.status(404).json({ success: false, error: "Not found" });

    if (reassignTo && reassignTo !== cat.name) {
      // ONLY affect this user's expenses
      await Expense.updateMany(
        { userId: req.userId, category: cat.name },
        { $set: { category: reassignTo } }
      );
    }

    await cat.deleteOne();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;