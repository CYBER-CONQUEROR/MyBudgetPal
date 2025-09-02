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

// Success/Error Message Component
function MessageNotification({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`notification ${type}`}>
      <div className="notification-content">
        <span className="notification-icon">
          {type === 'success' ? '✓' : '!'}
        </span>
        <span className="notification-message">{message}</span>
        <button className="notification-close" onClick={onClose}>×</button>
      </div>
    </div>
  );
}

function ExpensesApp() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [filters, setFilters] = useState({ category: "All", startDate: "", endDate: "", sortBy: "date", order: "desc" });
  const [stats, setStats] = useState(null);
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
  };

  const hideNotification = () => {
    setNotification(null);
  };

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

  const getTopCategoryName = useCallback(() => {
    if (!stats?.categoryStats?.[0]?._id) return null;
    
    const topCategoryId = stats.categoryStats[0]._id;
    
    if (/^[0-9a-fA-F]{24}$/.test(topCategoryId)) {
      const expenseWithCategory = expenses.find(expense => 
        expense.category === topCategoryId || expense.categoryId === topCategoryId
      );
      
      if (expenseWithCategory) {
        return expenseWithCategory.categoryName || expenseWithCategory.category || topCategoryId;
      }
      
      return topCategoryId;
    }
    
    return topCategoryId;
  }, [stats, expenses]);

  const topCategory = getTopCategoryName();

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
        showNotification(
          editingExpense ? 'Expense updated successfully!' : 'Expense added successfully!',
          'success'
        );
      } else {
        setError(res.error || "Failed to save expense");
        showNotification('Failed to save expense', 'error');
      }
    } catch (e) {
      console.error(e);
      setError("Failed to save expense");
      showNotification('Failed to save expense', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;
    try {
      const res = await expenseAPI.delete(id);
      if (res.success) {
        refresh();
        showNotification('Expense deleted successfully!', 'success');
      } else {
        setError(res.error || "Failed to delete expense");
        showNotification('Failed to delete expense', 'error');
      }
    } catch (e) {
      setError("Failed to delete expense");
      showNotification('Failed to delete expense', 'error');
    }
  };

  return (
    <div className="expenses-app">
      <div className="container">
        <header className="header">
          <h1>💰 Day-to-Day Expenses Manager</h1>
          <p>Track your daily spending and stay on budget.</p>
        </header>

        {notification && (
          <MessageNotification
            message={notification.message}
            type={notification.type}
            onClose={hideNotification}
          />
        )}

        {error && <div className="error-banner">{error}</div>}

        <div className="main-controls">
          <button onClick={() => { setEditingExpense(null); setShowForm(true); }} className="button button-primary">
            ➕ Add New Expense
          </button>
          <button onClick={openManager} className="button button-secondary">
             🗂️ Manage Categories
          </button>
        </div>

        {stats && <StatsComponent stats={stats} topCategoryName={topCategory} />}

        <FiltersComponent
          filters={filters}
          setFilters={setFilters}
          categories={filterOptions}
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
          <h3>{expense ? "Edit Expense" : "Add New Expense"}</h3>
          <button className="popup-close" onClick={onCancel}>×</button>
        </div>
        <div className="popup-form-container">
          <form onSubmit={handleSubmit} className="popup-form">
            <div className="form-row">
              <div className="form-group">
                <label>Title</label>
                <input type="text" name="title" value={formData.title} onChange={handleChange} required />
              </div>
              <div className="form-group">
                <label>Amount (LKR)</label>
                <input type="number" name="amount" value={formData.amount} onChange={handleChange} min="0" step="0.01" required />
              </div>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Category</label>
                <select name="category" value={formData.category} onChange={handleChange}>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input type="date" name="date" value={formData.date} onChange={handleChange} required />
              </div>
            </div>
            
            <div className="form-group">
              <label>Payment Method</label>
              <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange}>
                {paymentMethods.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            
            <div className="form-group">
              <label>Description (Optional)</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={3} />
            </div>
            
            <div className="popup-buttons">
              <button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button>
              <button type="submit" className="button button-primary">{expense ? "Update" : "Add"}</button>
            </div>
          </form>
        </div>
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
        <div className="filter-group">
          <label>Category</label>
          <select name="category" value={filters.category} onChange={handleChange}>
            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <label>Start Date</label>
          <input type="date" name="startDate" value={filters.startDate} onChange={handleChange} />
        </div>
        <div className="filter-group">
          <label>End Date</label>
          <input type="date" name="endDate" value={filters.endDate} onChange={handleChange} />
        </div>
        <div className="filter-group">
          <label>Sort By</label>
          <select name="sortBy" value={filters.sortBy} onChange={handleChange}>
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="title">Title</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Order</label>
          <select name="order" value={filters.order} onChange={handleChange}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function StatsComponent({ stats, topCategoryName }) {
  return (
    <div className="card stats-card">
      <h3>📊 Expenses Overview</h3>
      <div className="stats-grid">
        <div className="stats-item total-spent">
          <div className="stats-icon">💰</div>
          <h4>Total Spent</h4>
          <p>LKR {stats.totalAmount?.toLocaleString() || "0"}</p>
        </div>
        <div className="stats-item transactions">
          <div className="stats-icon">🧾</div>
          <h4>Transactions</h4>
          <p>{stats.totalExpenses || "0"}</p>
        </div>
        <div className="stats-item average">
          <div className="stats-icon">📊</div>
          <h4>Average</h4>
          <p>LKR {stats.averageExpense?.toFixed(2) || "0.00"}</p>
        </div>
        <div className="stats-item top-category">
          <div className="stats-icon">🏆</div>
          <h4>Top Category</h4>
          <p>{topCategoryName || stats.categoryStats?.[0]?._id || "N/A"}</p>
          {stats.categoryStats?.[0] && (
            <small>LKR {stats.categoryStats[0].total?.toLocaleString()}</small>
          )}
        </div>
      </div>
    </div>
  );
}

function ExpensesList({ expenses, loading, onEdit, onDelete }) {
  if (loading) return (
    <div className="spinner-container">
      <div className="spinner">
        <div className="spinner-circle"></div>
      </div>
      <p>Loading expenses...</p>
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
      <h3>Your Expenses ({expenses.length})</h3>
      <div className="expenses-grid">
        {expenses.map(expense => {
          const displayCategory = expense.categoryName || expense.category;
          
          return (
            <div 
              key={expense._id} 
              className="expense-card"
              data-category={displayCategory}
            >
              <div className="expense-header">
                <h4 className="expense-title">{expense.title}</h4>
                <span className={`category-badge category-${getCategorySlug(displayCategory)}`}>
                  {displayCategory}
                </span>
              </div>
              <div className="expense-amount">LKR {Number(expense.amount).toLocaleString()}</div>
              <div className="expense-details">
                <p><span className="detail-icon">📅</span> {new Date(expense.date).toLocaleDateString()}</p>
                <p><span className="detail-icon">💳</span> {expense.paymentMethod}</p>
              </div>
              {expense.description && (
                <p className="expense-description">
                  <span className="detail-icon">📝</span> {expense.description}
                </p>
              )}
              <div className="expense-actions">
                <button className="button-icon edit-btn" onClick={() => onEdit(expense)} title="Edit">
                  ✏️
                </button>
                <button className="button-icon delete-btn" onClick={() => onDelete(expense._id)} title="Delete">
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getCategorySlug(category) {
  if (!category) return 'other';
  return category.toLowerCase().replace(/\s+/g, '-');
}

export default ExpensesApp;