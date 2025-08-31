const API_BASE_URL = "http://localhost:4000/api";

export const categoriesAPI = {
  list: async () => {
    const res = await fetch(`${API_BASE_URL}/categories`);
    if (!res.ok) throw new Error("Failed to load categories");
    return res.json();
  },
  create: async (name) => {
    const res = await fetch(`${API_BASE_URL}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to create category");
    return res.json();
  },
  update: async (id, payload) => {
    const res = await fetch(`${API_BASE_URL}/categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to update category");
    return res.json();
  },
  delete: async (id, reassign = "Other") => {
    const res = await fetch(`${API_BASE_URL}/categories/${id}?reassign=${encodeURIComponent(reassign)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete category");
    return res.json();
  },
};
