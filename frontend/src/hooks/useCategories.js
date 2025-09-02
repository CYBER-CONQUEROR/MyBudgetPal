import { useCallback, useEffect, useMemo, useState } from "react";

// Mock API for categories (replace with your actual API)
const categoriesAPI = {
  list: async () => {
    try {
      const response = await fetch("http://localhost:4000/api/categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    } catch (error) {
      console.error("Categories API error:", error);
      return { success: false, error: error.message };
    }
  },
  create: async (name) => {
    try {
      const response = await fetch("http://localhost:4000/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error("Failed to create category");
      return response.json();
    } catch (error) {
      console.error("Create category error:", error);
      return { success: false, error: error.message };
    }
  },
  update: async (id, data) => {
    try {
      const response = await fetch(`http://localhost:4000/api/categories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error("Failed to update category");
      return response.json();
    } catch (error) {
      console.error("Update category error:", error);
      return { success: false, error: error.message };
    }
  },
  delete: async (id, reassignTo) => {
    try {
      const response = await fetch(`http://localhost:4000/api/categories/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reassignTo })
      });
      if (!response.ok) throw new Error("Failed to delete category");
      return response.json();
    } catch (error) {
      console.error("Delete category error:", error);
      return { success: false, error: error.message };
    }
  }
};

const FALLBACK = ["Food", "Transportation", "Entertainment", "Shopping", "Bills", "Healthcare", "Education", "Other"];

export default function useCategories({ expenses = [], refresh = async () => {}, expenseAPI } = {}) {
  const [categories, setCategories] = useState(FALLBACK);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const openManager = useCallback(() => setOpen(true), []);
  const closeManager = useCallback(() => setOpen(false), []);

  // Load categories on initial render
  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await categoriesAPI.list();
      if (res.success) {
        setCategories(res.data.map(c => c.name || c));
      } else {
        console.warn("Using fallback categories:", res.error);
        setCategories(FALLBACK);
      }
    } catch (error) {
      console.error("Failed to load categories:", error);
      setCategories(FALLBACK);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const addCategory = useCallback(async (name) => {
    const cleaned = (name || "").trim();
    if (!cleaned) return { ok: false, error: "Category name cannot be empty" };
    if (categories.includes(cleaned)) return { ok: false, error: "Category already exists" };

    try {
      const res = await categoriesAPI.create(cleaned);
      if (res.success) {
        await loadCategories();
        return { ok: true };
      } else {
        return { ok: false, error: res.error || "Failed to create category" };
      }
    } catch (error) {
      return { ok: false, error: error.message || "Failed to create category" };
    }
  }, [categories, loadCategories]);

  const renameCategory = useCallback(async (oldName, newName) => {
    const next = (newName || "").trim();
    if (!oldName || !next || oldName === next) return { ok: true };
    if (categories.includes(next)) return { ok: false, error: "Category already exists" };

    try {
      // For mock implementation, we'll just update the local state
      // In a real app, you would call the API here
      setCategories(prev => prev.map(cat => cat === oldName ? next : cat));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || "Failed to rename category" };
    }
  }, [categories]);

  const deleteCategory = useCallback(async (nameToDelete, reassignTo = "Other") => {
    if (!nameToDelete || nameToDelete === "Other") {
      return { ok: false, error: "Cannot delete this category" };
    }

    try {
      // For mock implementation, we'll just update the local state
      // In a real app, you would call the API here
      setCategories(prev => prev.filter(cat => cat !== nameToDelete));
      
      // Refresh expenses to reflect the category changes
      await refresh();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || "Failed to delete category" };
    }
  }, [refresh]);

  const filterOptions = useMemo(() => ["All", ...categories], [categories]);

  return {
    categories,
    filterOptions,
    addCategory,
    renameCategory,
    deleteCategory,
    open,
    openManager,
    closeManager,
    loading,
  };
}