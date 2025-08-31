// FILE: src/bank.js
import React, { useEffect, useMemo, useState } from "react";
import { getTransactions, createTransaction, updateTransaction, deleteTransaction } from "./api";
import "./bank.css";

export default function Bank() {
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    date: "",
    bankAccount: "",
    type: "Loan",
    status: "Pending",
  });

  // 🔎 Search & Filter state
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState(""); // new filter state

  const formatCurrency = (n) =>
    new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency: "LKR",
      maximumFractionDigits: 2,
    }).format(Number(n || 0));

  const formatDate = (value) => {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d)) return "";
    return d.toLocaleDateString();
  };

  const fetchTransactions = async () => {
    try {
      const res = await getTransactions();
      setTransactions(res.data || []);
    } catch (err) {
      console.error("Failed to load payments", err);
      alert("Failed to load payments");
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleAddClick = () => {
    setEditingPayment(null);
    setFormData({
      name: "",
      amount: "",
      date: "",
      bankAccount: "",
      type: "Loan",
      status: "Pending",
    });
    setShowForm(true);
  };

  const handleEditClick = (payment) => {
    setEditingPayment(payment);
    setFormData({
      name: payment.name || "",
      amount: payment.amount || "",
      date: payment.date ? String(payment.date).slice(0, 10) : "",
      bankAccount: payment.bankAccount || "",
      type: payment.type || "Loan",
      status: payment.status || "Pending",
    });
    setShowForm(true);
  };

  const handleCloseForm = () => setShowForm(false);
  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        amount: Number(formData.amount),
        date: formData.date ? new Date(formData.date).toISOString() : "",
      };
      if (editingPayment) await updateTransaction(editingPayment._id, payload);
      else await createTransaction(payload);
      setShowForm(false);
      fetchTransactions();
    } catch (err) {
      console.error("Error saving transaction:", err);
      alert("Error saving transaction");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      await deleteTransaction(id);
      fetchTransactions();
    } catch (err) {
      console.error("Error deleting transaction:", err);
      alert("Error deleting");
    }
  };

  // 🔎 Filtering by search + status
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const matchesSearch =
        t.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.bankAccount?.toLowerCase().includes(search.toLowerCase());

      const matchesFilter = filterStatus
        ? String(t.status).toLowerCase() === filterStatus.toLowerCase()
        : true;

      return matchesSearch && matchesFilter;
    });
  }, [transactions, search, filterStatus]);

  // Derived lists from filtered
  const upcoming = useMemo(
    () => filteredTransactions.filter((t) => String(t.status).toLowerCase() === "pending"),
    [filteredTransactions]
  );

  const paid = useMemo(
    () => filteredTransactions.filter((t) => String(t.status).toLowerCase() === "paid"),
    [filteredTransactions]
  );

  return (
    <div className="bank-page">
      <div className="page-header">
        <div>
          <h1>🏦 Bank Commitment Manager</h1>
          <p className="sub">Track loans, credit cards & recurring payments in one place.</p>
        </div>
        <button className="action-btn" onClick={handleAddClick}>+ Add Payment</button>
      </div>

      {/* 🔎 Search bar with icon + filter */}
      <div className="search-bar">
        <span className="icon">🔍</span>
        <input
          type="text"
          placeholder="Search by name or account..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All</option>
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
        </select>
      </div>

      {/* ===== Upcoming Payments ===== */}
      <section>
        <h2>Upcoming Payments</h2>
        <div className="cards-container">
          {upcoming.length === 0 && <div className="empty">No upcoming payments.</div>}
          {upcoming.map((t) => (
            <div key={t._id} className="transaction-card is-pending">
              <header className="tcard-head">
                <h3>{t.bankAccount}</h3>
                <span className="chip chip-pending">Pending</span>
              </header>
              <p className="tname">{t.name}</p>
              <p className="tmeta">
                <span>{formatCurrency(t.amount)}</span>
                <span>•</span>
                <span>{formatDate(t.date)}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Completed Payments ===== */}
      <section>
        <h2>Completed Payments</h2>
        <div className="cards-container">
          {paid.length === 0 && <div className="empty">No completed payments.</div>}
          {paid.map((t) => (
            <div key={t._id} className="transaction-card is-paid">
              <header className="tcard-head">
                <h3>{t.bankAccount}</h3>
                <span className="chip chip-paid">Paid</span>
              </header>
              <p className="tname">{t.name}</p>
              <p className="tmeta">
                <span>{formatCurrency(t.amount)}</span>
                <span>•</span>
                <span>{formatDate(t.date)}</span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Table ===== */}
      <div className="table-wrap">
        <table className="payment-table pro">
          <thead>
            <tr>
              <th>Name</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Account</th>
              <th>Type</th>
              <th>Status</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.length === 0 && (
              <tr className="row-empty">
                <td colSpan={7}>No payments found.</td>
              </tr>
            )}
            {filteredTransactions.map((p) => (
              <tr key={p._id}>
                <td className="cell-name">
                  <div className="stack">
                    <span className="title">{p.name}</span>
                    <span className="muted">{p.bankAccount}</span>
                  </div>
                </td>
                <td>{formatCurrency(p.amount)}</td>
                <td>{formatDate(p.date)}</td>
                <td>{p.bankAccount}</td>
                <td><span className="type-pill">{p.type}</span></td>
                <td>
                  <span className={`chip ${String(p.status).toLowerCase() === "paid" ? "chip-paid" : "chip-pending"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="actions">
                  <button className="btn ghost" onClick={() => handleEditClick(p)}>✏️Edit</button>
                  <button className="btn danger" onClick={() => handleDelete(p._id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== Modal Form ===== */}
      {showForm && (
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingPayment ? "Edit Payment" : "Add Payment"}</h2>
              <button className="icon-btn" onClick={handleCloseForm} aria-label="Close">×</button>
            </div>

            <form onSubmit={handleSubmit} className="payment-form form-pro">
              <div className="field">
                <label htmlFor="name">Name</label>
                <input id="name" type="text" name="name" placeholder="e.g., Car Loan" value={formData.name} onChange={handleChange} required />
              </div>
              <div className="field">
                <label htmlFor="amount">Amount</label>
                <input id="amount" type="number" name="amount" value={formData.amount} onChange={handleChange} min="0" step="0.01" required />
              </div>
              <div className="field">
                <label htmlFor="date">Due date</label>
                <input id="date" type="date" name="date" value={formData.date} onChange={handleChange} required />
              </div>
              <div className="field">
                <label htmlFor="bankAccount">Bank Account</label>
                <input id="bankAccount" type="text" name="bankAccount" value={formData.bankAccount} onChange={handleChange} required />
              </div>
              <div className="field">
                <label htmlFor="type">Type</label>
                <select id="type" name="type" value={formData.type} onChange={handleChange}>
                  <option>Loan</option>
                  <option>Credit Card</option>
                  <option>Insurance</option>
                  <option>Bill</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="status">Status</label>
                <select id="status" name="status" value={formData.status} onChange={handleChange}>
                  <option>Pending</option>
                  <option>Paid</option>
                </select>
              </div>
              <div className="form-actions">
                <button className="btn primary" type="submit">{editingPayment ? "Update Payment" : "Add Payment"}</button>
                <button type="button" className="btn soft" onClick={handleCloseForm}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
