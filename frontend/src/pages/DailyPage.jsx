// src/pages/ExpensesApp.jsx
import React, { useState, useEffect, useCallback } from "react";
import "../css/dTdexpense.css";
import walletImage from "../images/wallet.png";
import useCategories from "../hooks/useCategories";
import CategoryManager from "../components/CategoryManager";

// --- API Service ---
const API_BASE_URL = "http://localhost:4000/api";
const expenseAPI = {
  getAll: async (filters = {}) => {
    const queryParams = new URLSearchParams(filters);
    const response = await fetch(`${API_BASE_URL}/expenses?${queryParams.toString()}`);
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  },
  create: async (expenseData) => {
    const response = await fetch(`${API_BASE_URL}/expenses`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(expenseData)
    });
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  },
  update: async (id, expenseData) => {
    const response = await fetch(`${API_BASE_URL}/expenses/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(expenseData)
    });
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  },
  delete: async (id) => {
    const response = await fetch(`${API_BASE_URL}/expenses/${id}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  },
  getStats: async () => {
    const response = await fetch(`${API_BASE_URL}/expenses/stats`);
    if (!response.ok) throw new Error("Network response was not ok");
    return response.json();
  },
};

function ExpensesApp() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [filters, setFilters] = useState({ category: "All", startDate: "", endDate: "", sortBy: "date", order: "desc" });
  const [stats, setStats] = useState(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [expenseResponse, statsResponse] = await Promise.all([
        expenseAPI.getAll(filters),
        expenseAPI.getStats(),
      ]);
      if (expenseResponse.success) setExpenses(expenseResponse.data || []);
      else setError(expenseResponse.error || "Failed to fetch expenses");
      if (statsResponse.success) setStats(statsResponse.data);
    } catch (e) {
      console.error(e);
      setError("Could not connect to the server. Is it running?");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { refresh(); }, [refresh]);

  // 🔗 categories handled elsewhere
  const {
    categories,
    filterOptions,
    addCategory,
    renameCategory,
    deleteCategory,
    open,
    openManager,
    closeManager,
  } = useCategories({ expenses, refresh, expenseAPI });

  const handleFormSubmit = async (data) => {
    try {
      const action = editingExpense
        ? expenseAPI.update(editingExpense._id, data)
        : expenseAPI.create(data);
      const res = await action;
      if (res.success) {
        setShowForm(false);
        setEditingExpense(null);
        refresh();
      } else setError(res.error || "Failed to save expense");
    } catch (e) {
      console.error(e);
      setError("Failed to save expense");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    try {
      const res = await expenseAPI.delete(id);
      if (res.success) refresh();
      else setError(res.error || "Failed to delete expense");
    } catch (e) {
      setError("Failed to delete expense");
    }
  };

  return (
    <div className="expenses-app">{/* <-- CSS scope wrapper */}
      <div className="container">
        <header className="header">
          <img src={walletImage} alt="Wallet Icon" className="header-image" />
          <h1>💰 Day-to-Day Expenses Manager</h1>
          <p>Track your daily spending and stay on budget.</p>
          <div className="header-decoration">
            <span className="floating-coin">🪙</span>
            <span className="floating-bill">💵</span>
            <span className="floating-gem">💎</span>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <div className="main-controls">
          <button onClick={() => { setEditingExpense(null); setShowForm(true); }} className="button button-add">
            ➕ Add New Expense
          </button>
          <button onClick={openManager} className="button" style={{ marginLeft: 8 }}>
            🗂️ Manage Categories
          </button>
        </div>

        {stats && <StatsComponent stats={stats} />}

        <FiltersComponent
          filters={filters}
          setFilters={setFilters}
          categories={filterOptions} // includes "All"
        />

        {showForm && (
          <ExpenseForm
            expense={editingExpense}
            onSubmit={handleFormSubmit}
            onCancel={() => setShowForm(false)}
            categories={categories}
          />
        )}

        <CategoryManager
          open={open}
          onClose={closeManager}
          categories={categories}
          expenses={expenses}
          addCategory={addCategory}
          renameCategory={renameCategory}
          deleteCategory={deleteCategory}
        />

        <ExpensesList
          expenses={expenses}
          loading={loading}
          onEdit={(e) => { setEditingExpense(e); setShowForm(true); }}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}

/* --- the small child components stay the same, just using props --- */

function ExpenseForm({ expense, onSubmit, onCancel, categories }) {
  const [formData, setFormData] = useState({
    title: expense?.title || "",
    amount: expense?.amount || "",
    category: expense?.category || (categories[0] || "Food"),
    description: expense?.description || "",
    date: expense?.date ? new Date(expense.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    paymentMethod: expense?.paymentMethod || "Cash",
  });
  const paymentMethods = ["Cash", "Credit Card", "Debit Card", "Bank Transfer", "Mobile Payment"];
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });
  const handleSubmit = (e) => { e.preventDefault(); onSubmit({ ...formData, amount: parseFloat(formData.amount) }); };

  return (
    <div className="popup-overlay" onClick={onCancel}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <div className="popup-header">
          <h3>{expense ? "✏️ Edit Expense" : "➕ Add New Expense"}</h3>
          <button className="popup-close" onClick={onCancel}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="popup-form">
          <div className="form-group"><label>Title</label><input type="text" name="title" value={formData.title} onChange={handleChange} required /></div>
          <div className="form-group"><label>Amount (LKR)</label><input type="number" name="amount" value={formData.amount} onChange={handleChange} min="0" step="0.01" required /></div>
          <div className="form-group">
            <label>Category</label>
            <select name="category" value={formData.category} onChange={handleChange}>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Date</label><input type="date" name="date" value={formData.date} onChange={handleChange} required /></div>
          <div className="form-group">
            <label>Payment Method</label>
            <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange}>
              {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Description (Optional)</label><textarea name="description" value={formData.description} onChange={handleChange} rows={3} /></div>
          <div className="popup-buttons">
            <button type="button" className="button button-cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="button button-add">{expense ? "✅ Update" : "➕ Add"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FiltersComponent({ filters, setFilters, categories }) {
  const handleChange = (e) => setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  return (
    <div className="card filters-card">
      <h3>🔍 Filters & Sorting</h3>
      <div className="filters-grid">
        <select name="category" value={filters.category} onChange={handleChange}>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </select>
        <input type="date" name="startDate" value={filters.startDate} onChange={handleChange} />
        <input type="date" name="endDate" value={filters.endDate} onChange={handleChange} />
        <select name="sortBy" value={filters.sortBy} onChange={handleChange}>
          <option value="date">Date</option><option value="amount">Amount</option><option value="title">Title</option>
        </select>
        <select name="order" value={filters.order} onChange={handleChange}>
          <option value="desc">Descending</option><option value="asc">Ascending</option>
        </select>
      </div>
    </div>
  );
}

function StatsComponent({ stats }) {
  return (
    <div className="card stats-card">
      <h3>📊 Expenses Overview</h3>
      <div className="stats-grid">
        <div className="stats-item total-spent"><div className="stats-icon">💰</div><h4>Total Spent</h4><p>LKR {stats.totalAmount?.toLocaleString() || "0"}</p></div>
        <div className="stats-item transactions"><div className="stats-icon">🧾</div><h4>Transactions</h4><p>{stats.totalExpenses || "0"}</p></div>
        <div className="stats-item average"><div className="stats-icon">📊</div><h4>Average</h4><p>LKR {stats.averageExpense?.toFixed(2) || "0.00"}</p></div>
        <div className="stats-item top-category"><div className="stats-icon">🏆</div><h4>Top Category</h4><p>{stats.categoryStats?.[0]?._id || "N/A"}</p></div>
      </div>
    </div>
  );
}

function ExpensesList({ expenses, loading, onEdit, onDelete }) {
  if (loading) return (
    <div className="spinner-container">
      <div className="money-spinner"><div className="coin">💰</div></div>
      <p>Counting your money...</p>
    </div>
  );
  if (!expenses.length) return (
    <div className="card empty-state">
      <div className="empty-icon">💸</div>
      <h3>No expenses found.</h3>
      <p>Start tracking your spending journey!</p>
    </div>
  );
  return (
    <div className="card">
      <h3>📝 Your Expenses ({expenses.length})</h3>
      <div className="expenses-grid">
        {expenses.map(expense => (
          <div key={expense._id} className="expense-card" data-category={expense.category}>
            <div className="expense-header">
              <h4 className="expense-title">{expense.title}</h4>
              <span className={`category-badge category-${(expense.category || "other").toLowerCase()}`}>
                {expense.category}
              </span>
            </div>
            <div className="expense-amount">LKR {Number(expense.amount).toLocaleString()}</div>
            <div className="expense-details">
              <p>📅 {new Date(expense.date).toLocaleDateString()}</p>
              <p>💳 {expense.paymentMethod}</p>
            </div>
            {expense.description && <p className="expense-description">📝 {expense.description}</p>}
            <div className="expense-actions">
              <button className="button-icon edit-btn" onClick={() => onEdit(expense)}>✏️</button>
              <button className="button-icon delete-btn" onClick={() => onDelete(expense._id)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ExpensesApp;
