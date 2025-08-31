import { useCallback, useEffect, useMemo, useState } from "react";
import { categoriesAPI } from "../api/categoriesAPI";

const FALLBACK = ["Food","Transportation","Entertainment","Shopping","Bills","Healthcare","Education","Other"];

export default function useCategories({ expenses = [], refresh = async () => {} , expenseAPI } = {}) {
  const [categories, setCategories] = useState(FALLBACK);
  const [open, setOpen] = useState(false);
  const openManager = useCallback(() => setOpen(true), []);
  const closeManager = useCallback(() => setOpen(false), []);

  // initial load
  useEffect(() => {
    (async () => {
      try {
        const res = await categoriesAPI.list();
        if (res.success) {
          // server returns array of { _id, name, ... }
          setCategories(res.data.map(c => c.name));
        }
      } catch {
        // leave FALLBACK so UI still works
      }
    })();
  }, []);

  const reload = useCallback(async () => {
    const res = await categoriesAPI.list();
    if (res.success) setCategories(res.data.map(c => c.name));
  }, []);

  const addCategory = useCallback(async (name) => {
    const cleaned = (name || "").trim();
    if (!cleaned) return { ok: false, error: "Empty name" };
    try {
      const res = await categoriesAPI.create(cleaned);
      if (!res.success) return { ok: false, error: res.error || "Create failed" };
      await reload();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Create failed" };
    }
  }, [reload]);

  const renameCategory = useCallback(async (oldName, newName) => {
    const next = (newName || "").trim();
    if (!oldName || !next || oldName === next) return { ok: true };

    try {
      // find id by name
      const list = await categoriesAPI.list();
      if (!list.success) return { ok: false, error: "Load failed" };
      const hit = list.data.find(c => c.name.toLowerCase() === oldName.toLowerCase());
      if (!hit) return { ok: false, error: "Category not found" };

      const res = await categoriesAPI.update(hit._id, { name: next });
      if (!res.success) return { ok: false, error: res.error || "Update failed" };

      await reload();
      // backend already migrated expenses on rename; refresh expenses/stats
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Update failed" };
    }
  }, [reload, refresh]);

  const deleteCategory = useCallback(async (nameToDelete, reassignTo = "Other") => {
    if (!nameToDelete) return { ok: false, error: "No category" };

    try {
      // find id by name
      const list = await categoriesAPI.list();
      if (!list.success) return { ok: false, error: "Load failed" };
      const hit = list.data.find(c => c.name.toLowerCase() === nameToDelete.toLowerCase());
      if (!hit) return { ok: false, error: "Category not found" };

      const res = await categoriesAPI.delete(hit._id, reassignTo);
      if (!res.success) return { ok: false, error: res.error || "Delete failed" };

      await reload();
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || "Delete failed" };
    }
  }, [reload, refresh]);

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
  };
}
