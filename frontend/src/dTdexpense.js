import React, { useState, useEffect, useCallback } from 'react';
import './dTdexpense.css';
import walletImage from './wallet.png'; // Import your image here

// --- API Service ---
const API_BASE_URL = "http://localhost:5000/api";

const expenseAPI = {
    getAll: async (filters = {}) => {
        const queryParams = new URLSearchParams(filters);
        const response = await fetch(`${API_BASE_URL}/expenses?${queryParams.toString()}`);
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    },
    create: async (expenseData) => {
        const response = await fetch(`${API_BASE_URL}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        });
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    },
    update: async (id, expenseData) => {
        const response = await fetch(`${API_BASE_URL}/expenses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(expenseData)
        });
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    },
    delete: async (id) => {
        const response = await fetch(`${API_BASE_URL}/expenses/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    },
    getStats: async () => {
        const response = await fetch(`${API_BASE_URL}/expenses/stats`);
        if (!response.ok) throw new Error('Network response was not ok');
        return response.json();
    }
};

// --- Main App Component ---
function ExpensesApp() {
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [filters, setFilters] = useState({ category: 'All', startDate: '', endDate: '', sortBy: 'date', order: 'desc' });
    const [stats, setStats] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const [expenseResponse, statsResponse] = await Promise.all([
                expenseAPI.getAll(filters),
                expenseAPI.getStats()
            ]);
            if (expenseResponse.success) setExpenses(expenseResponse.data || []);
            else setError(expenseResponse.error || 'Failed to fetch expenses');

            if (statsResponse.success) setStats(statsResponse.data);
            else console.error('Failed to fetch stats:', statsResponse.error);

        } catch (err) {
            setError('Could not connect to the server. Is it running?');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFormSubmit = async (expenseData) => {
        try {
            const action = editingExpense ? expenseAPI.update(editingExpense._id, expenseData) : expenseAPI.create(expenseData);
            const response = await action;

            if (response.success) {
                fetchData(); // Refresh all data
                setShowForm(false);
                setEditingExpense(null);
            } else {
                setError(response.error || `Failed to ${editingExpense ? 'update' : 'create'} expense`);
            }
        } catch (err) {
            setError(`Failed to ${editingExpense ? 'update' : 'create'} expense`);
            console.error(err);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this expense?')) return;
        try {
            const response = await expenseAPI.delete(id);
            if (response.success) {
                fetchData(); // Refresh all data
            } else {
                setError(response.error || 'Failed to delete expense');
            }
        } catch (err) {
            setError('Failed to delete expense');
            console.error(err);
        }
    };

    const handleEdit = (expense) => {
        setEditingExpense(expense);
        setShowForm(true);
    };

    const openAddForm = () => {
        setEditingExpense(null);
        setShowForm(true);
    };

    return (
        <div className="container">
            <header className="header">
                {/* Image added here! */}
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
                <button onClick={openAddForm} className="button button-add">
                    ➕ Add New Expense
                </button>
            </div>

            {stats && <StatsComponent stats={stats} />}
            <FiltersComponent filters={filters} setFilters={setFilters} />

            {showForm && (
                <ExpenseForm
                    expense={editingExpense}
                    onSubmit={handleFormSubmit}
                    onCancel={() => setShowForm(false)}
                />
            )}

            <ExpensesList
                expenses={expenses}
                loading={loading}
                onEdit={handleEdit}
                onDelete={handleDelete}
            />
        </div>
    );
}

// --- Child Components ---

function ExpenseForm({ expense, onSubmit, onCancel }) {
    const [formData, setFormData] = useState({
        title: expense?.title || '',
        amount: expense?.amount || '',
        category: expense?.category || 'Food',
        description: expense?.description || '',
        date: expense?.date ? new Date(expense.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        paymentMethod: expense?.paymentMethod || 'Cash'
    });

    const categories = ['Food', 'Transportation', 'Entertainment', 'Shopping', 'Bills', 'Healthcare', 'Education', 'Other'];
    const paymentMethods = ['Cash', 'Credit Card', 'Debit Card', 'Bank Transfer', 'Mobile Payment'];

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({ ...formData, amount: parseFloat(formData.amount) });
    };

    return (
        <div className="popup-overlay" onClick={onCancel}>
            <div className="popup-content" onClick={(e) => e.stopPropagation()}>
                <div className="popup-header">
                    <h3>{expense ? '✏️ Edit Expense' : '➕ Add New Expense'}</h3>
                    <button className="popup-close" onClick={onCancel}>×</button>
                </div>
                <form onSubmit={handleSubmit} className="popup-form">
                    <div className="form-group">
                        <label>Title</label>
                        <input type="text" name="title" value={formData.title} onChange={handleChange} required />
                    </div>
                    <div className="form-group">
                        <label>Amount (LKR)</label>
                        <input type="number" name="amount" value={formData.amount} onChange={handleChange} min="0" step="0.01" required />
                    </div>
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
                    <div className="form-group">
                        <label>Payment Method</label>
                        <select name="paymentMethod" value={formData.paymentMethod} onChange={handleChange}>
                            {paymentMethods.map(method => <option key={method} value={method}>{method}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Description (Optional)</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} rows={3}></textarea>
                    </div>
                    <div className="popup-buttons">
                        <button type="button" className="button button-cancel" onClick={onCancel}>Cancel</button>
                        <button type="submit" className="button button-add">{expense ? '✅ Update' : '➕ Add'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function FiltersComponent({ filters, setFilters }) {
    const categories = ['All', 'Food', 'Transportation', 'Entertainment', 'Shopping', 'Bills', 'Healthcare', 'Education', 'Other'];

    const handleChange = (e) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

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
                    <option value="date">Date</option>
                    <option value="amount">Amount</option>
                    <option value="title">Title</option>
                </select>
                <select name="order" value={filters.order} onChange={handleChange}>
                    <option value="desc">Descending</option>
                    <option value="asc">Ascending</option>
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
                <div className="stats-item total-spent">
                    <div className="stats-icon">💰</div>
                    <h4>Total Spent</h4>
                    <p>LKR {stats.totalAmount?.toLocaleString() || '0'}</p>
                </div>
                <div className="stats-item transactions">
                    <div className="stats-icon">🧾</div>
                    <h4>Transactions</h4>
                    <p>{stats.totalExpenses || '0'}</p>
                </div>
                <div className="stats-item average">
                    <div className="stats-icon">📊</div>
                    <h4>Average</h4>
                    <p>LKR {stats.averageExpense?.toFixed(2) || '0.00'}</p>
                </div>
                <div className="stats-item top-category">
                    <div className="stats-icon">🏆</div>
                    <h4>Top Category</h4>
                    <p>{stats.categoryStats[0]?._id || 'N/A'}</p>
                </div>
            </div>
        </div>
    );
}

function ExpensesList({ expenses, loading, onEdit, onDelete }) {
    if (loading) return (
        <div className="spinner-container">
            <div className="money-spinner">
                <div className="coin">💰</div>
            </div>
            <p>Counting your money...</p>
        </div>
    );
    
    if (expenses.length === 0) return (
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
                    <div 
                        key={expense._id} 
                        className="expense-card"
                        data-category={expense.category}
                    >
                        <div className="expense-header">
                            <h4 className="expense-title">{expense.title}</h4>
                            <span className={`category-badge category-${expense.category.toLowerCase()}`}>
                                {expense.category}
                            </span>
                        </div>
                        <div className="expense-amount">LKR {expense.amount.toLocaleString()}</div>
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