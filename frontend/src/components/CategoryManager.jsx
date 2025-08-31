// src/components/CategoryManager.jsx
import React, { useState } from "react";
import "../css/dTdexpense.css";

export default function CategoryManager({
  open,
  onClose,
  categories,
  expenses,
  addCategory,
  renameCategory,
  deleteCategory,
}) {
  // ✅ Hooks must be the first thing inside the component
  const [newCat, setNewCat] = useState("");
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [reassignMap, setReassignMap] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const inUseCount = (name) => expenses.filter((e) => e.category === name).length;

  const startEdit = (name) => {
    setEditing(name);
    setEditValue(name);
  };
  const cancelEdit = () => {
    setEditing(null);
    setEditValue("");
  };

  const commitEdit = async () => {
    const oldName = editing;
    const next = (editValue || "").trim();
    if (!oldName || !next) return;
    const { ok, error } = await renameCategory(oldName, next);
    if (!ok) alert(error || "Failed to rename");
    setEditing(null);
    setEditValue("");
  };

  const handleAdd = async () => {
    const cleaned = (newCat || "").trim();
    if (!cleaned) return;
    setSubmitting(true);
    try {
      const { ok, error } = await addCategory(cleaned); // ✅ await
      if (!ok) return alert(error || "Failed to create category");
      setNewCat("");
    } catch (e) {
      alert(e?.message || "Failed to create category");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (name) => {
    const used = inUseCount(name);
    const confirmed = window.confirm(
      used
        ? `“${name}” is used by ${used} expense(s).\nDelete and reassign to your selected category?`
        : `Delete “${name}”?`
    );
    if (!confirmed) return;
    let target = reassignMap[name] || "Other";
    if (target === name) target = "Other";
    const { ok, error } = await deleteCategory(name, target);
    if (!ok) alert(error || "Failed to delete");
  };

  // ✅ No early return before hooks. We toggle visibility via CSS.
  return (
    <div
      className="popup-overlay"
      style={{ display: open ? "flex" : "none" }}
      onClick={onClose}
    >
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h3>🗂️ Manage Expense Categories</h3>
          <button className="popup-close" onClick={onClose}>×</button>
        </div>

        {/* Add new category */}
        <div className="popup-form" style={{ marginBottom: 12 }}>
          <div className="form-group" style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="New category name"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
            />
            <button
              type="button"
              className="button button-add"
              onClick={handleAdd}
              disabled={submitting}
            >
              {submitting ? "Adding..." : "➕ Add"}
            </button>
          </div>
        </div>

        {/* List categories */}
        <div className="card" style={{ maxHeight: 360, overflow: "auto" }}>
          <div className="filters-grid" style={{ gridTemplateColumns: "1fr auto auto", gap: 8 }}>
            {categories.map((name) => (
              <React.Fragment key={name}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {editing === name ? (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    <strong>{name}</strong>
                  )}
                  <span className="badge" style={{ opacity: 0.7 }}>
                    {inUseCount(name)} in use
                  </span>
                </div>

                <div>
                  {inUseCount(name) > 0 && (
                    <select
                      value={reassignMap[name] || "Other"}
                      onChange={(e) =>
                        setReassignMap((prev) => ({ ...prev, [name]: e.target.value }))
                      }
                    >
                      {categories
                        .filter((c) => c !== name)
                        .map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                    </select>
                  )}
                </div>

                <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  {editing === name ? (
                    <>
                      <button className="button button-add" onClick={commitEdit}>
                        ✅ Save
                      </button>
                      <button className="button button-cancel" onClick={cancelEdit}>
                        ✖ Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="button" onClick={() => startEdit(name)}>
                        ✏️ Edit
                      </button>
                      <button
                        className="button button-cancel"
                        disabled={categories.length <= 1}
                        onClick={() => handleDelete(name)}
                      >
                        🗑️ Delete
                      </button>
                    </>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="popup-buttons" style={{ marginTop: 12 }}>
          <button className="button button-cancel" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
