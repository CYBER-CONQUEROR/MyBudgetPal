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

  // ---------- Stable "today start" to satisfy eslint/useMemo deps ----------
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime(); // primitive = stable dep
  }, []);

  // ---------- Derived lists ----------
  const upcoming = useMemo(
    () =>
      (transactions || [])
        .filter((t) => String(t.status).toLowerCase() === "pending")
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [transactions]
  );

  const paid = useMemo(
    () =>
      (transactions || [])
        .filter((t) => String(t.status).toLowerCase() === "paid")
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions]
  );

  // “Next Payment” (closest pending due today or later; if none, earliest pending)
  const nextPayment = useMemo(() => {
    const futureOrToday = upcoming.filter((t) => {
      const d = new Date(t.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() >= todayStart;
    });
    return (futureOrToday[0] || upcoming[0]) || null;
  }, [upcoming, todayStart]);

  // “Last Paid” (most recent paid not after today)
  const lastPaid = useMemo(() => {
    const pastPaid = paid.filter((t) => {
      const d = new Date(t.date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() <= todayStart;
    });
    return (pastPaid[0] || paid[0]) || null;
  }, [paid, todayStart]);

  return (
    <div className="bank-page">
      <div className="page-header">
        <div>
          <h1>Bank Commitment Manager</h1>
          <p className="sub">Track loans, credit cards & recurring payments in one place.</p>
        </div>
        <button className="action-btn" onClick={handleAddClick}>+ Add Payment</button>
      </div>

      {/* ===== Summary strip (Next Payment / Last Paid) ===== */}
      <div className="summary-row">
        <div className="summary-card next">
          <div className="s-head">
            <span className="s-title">Next Payment</span>
            <span className="chip chip-pending">Pending</span>
          </div>
          {nextPayment ? (
            <>
              <div className="s-main">
                <div className="s-amount">{formatCurrency(nextPayment.amount)}</div>
                <div className="s-name">{nextPayment.name}</div>
              </div>
              <div className="s-meta">
                <span>{formatDate(nextPayment.date)}</span>
                <span>•</span>
                <span>{nextPayment.bankAccount}</span>
                <span className="type-pill">{nextPayment.type}</span>
              </div>
            </>
          ) : (
            <div className="s-empty">No upcoming payments.</div>
          )}
        </div>

        <div className="summary-card last">
          <div className="s-head">
            <span className="s-title">Last Paid</span>
            <span className="chip chip-paid">Paid</span>
          </div>
          {lastPaid ? (
            <>
              <div className="s-main">
                <div className="s-amount">{formatCurrency(lastPaid.amount)}</div>
                <div className="s-name">{lastPaid.name}</div>
              </div>
              <div className="s-meta">
                <span>{formatDate(lastPaid.date)}</span>
                <span>•</span>
                <span>{lastPaid.bankAccount}</span>
                <span className="type-pill">{lastPaid.type}</span>
              </div>
            </>
          ) : (
            <div className="s-empty">No payments marked paid yet.</div>
          )}
        </div>
      </div>

      {/* ===== Upcoming Cards ===== */}
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

      {/* ===== Completed Cards ===== */}
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
            {transactions.length === 0 && (
              <tr className="row-empty">
                <td colSpan={7}>No payments found.</td>
              </tr>
            )}
            {transactions.map((p) => (
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
                  <button className="btn ghost" onClick={() => handleEditClick(p)}>Edit</button>
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
                <small className="help">A short title for the commitment.</small>
              </div>

              <div className="field">
                <label htmlFor="amount">Amount</label>
                <input id="amount" type="number" name="amount" placeholder="e.g., 50000" value={formData.amount} onChange={handleChange} min="0" step="0.01" required />
                <small className="help">Enter the full amount in LKR.</small>
              </div>

              <div className="field">
                <label htmlFor="date">Due date</label>
                <input id="date" type="date" name="date" value={formData.date} onChange={handleChange} required />
                <small className="help">When this payment is/was due.</small>
              </div>

              <div className="field">
                <label htmlFor="bankAccount">Bank Account</label>
                <input id="bankAccount" type="text" name="bankAccount" placeholder="e.g., HNB-12345" value={formData.bankAccount} onChange={handleChange} required />
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
                <button className="btn primary" type="submit">
                  {editingPayment ? "Update Payment" : "Add Payment"}
                </button>
                <button type="button" className="btn soft" onClick={handleCloseForm}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
