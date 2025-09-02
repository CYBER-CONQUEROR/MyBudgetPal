import React, { useState } from "react";

function CategoryManager({ open, onClose, categories, expenses, addCategory, renameCategory, deleteCategory }) {
  const [newCategory, setNewCategory] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [editName, setEditName] = useState("");

  if (!open) return null;

  const handleAdd = (e) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    addCategory(newCategory.trim());
    setNewCategory("");
  };

  const handleRename = (id) => {
    if (!editName.trim()) return;
    renameCategory(id, editName.trim());
    setEditingCategory(null);
    setEditName("");
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div
        className="popup-content category-manager-popup"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="popup-header">
          <h3>Manage Categories</h3>
          <button className="popup-close" onClick={onClose}>×</button>
        </div>

        <div className="popup-form-container category-manager-content">
          {/* --- Add Category --- */}
          <div className="add-category-section">
            <h4>Add Category</h4>
            <form onSubmit={handleAdd} className="add-category-form">
              <input
                type="text"
                className="category-input"
                placeholder="Enter category name"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button type="submit" className="button button-primary">
                Add
              </button>
            </form>
          </div>

          {/* --- Category List --- */}
          <div className="categories-list-section">
            <h4>Existing Categories</h4>
            <div className="categories-list">
              {categories.map((cat) => {
                const count = expenses.filter(
                  (exp) =>
                    exp.category === cat ||
                    exp.categoryName === cat
                ).length;

                return (
                  <div key={cat} className="category-item">
                    {editingCategory === cat ? (
                      <div className="category-edit-form">
                        <input
                          type="text"
                          className="category-input"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="New name"
                        />
                        <div className="category-edit-actions">
                          <button
                            type="button"
                            className="button button-primary"
                            onClick={() => handleRename(cat)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => {
                              setEditingCategory(null);
                              setEditName("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="category-display">
                        <div className="category-info">
                          <span className="category-name">{cat}</span>
                          <span className="category-count">{count} items</span>
                        </div>
                        <div className="category-actions">
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => {
                              setEditingCategory(cat);
                              setEditName(cat);
                            }}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            onClick={() => deleteCategory(cat)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CategoryManager;
