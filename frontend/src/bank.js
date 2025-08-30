import React, { useEffect, useState } from "react";
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
    status: "Pending"
  });

  const fetchTransactions = async () => {
    try {
      const res = await getTransactions();
      setTransactions(res.data || []);
    } catch (err) {
      console.error("Failed to load payments", err);
      alert("Failed to load payments");
    }
  };

  useEffect(() => { fetchTransactions(); }, []);

  const handleAddClick = () => {
    setEditingPayment(null);
    setFormData({ name: "", amount: "", date: "", bankAccount: "", type: "Loan", status: "Pending" });
    setShowForm(true);
  };

  const handleEditClick = (payment) => {
    setEditingPayment(payment);
    setFormData({ ...payment });
    setShowForm(true);
  };

  const handleCloseForm = () => setShowForm(false);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPayment) await updateTransaction(editingPayment._id, formData);
      else await createTransaction(formData);
      setShowForm(false);
      fetchTransactions();
    } catch (err) {
      console.error("Error saving transaction:", err);
      alert("Error saving transaction");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure?")) return;
    try { await deleteTransaction(id); fetchTransactions(); }
    catch (err) { console.error("Error deleting transaction:", err); alert("Error deleting"); }
  };

  return (
    <div className="bank-page">
      <h1>Bank Payments</h1>
      <button className="action-btn" onClick={handleAddClick}>+ Add Payment</button>

      <table className="payment-table">
        <thead>
          <tr>
            <th>Name</th><th>Amount</th><th>Date</th><th>Account</th><th>Type</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {transactions.length === 0 && <tr><td colSpan={7}>No payments found.</td></tr>}
          {transactions.map(p => (
            <tr key={p._id}>
              <td>{p.name}</td>
              <td>${p.amount}</td>
              <td>{new Date(p.date).toLocaleDateString()}</td>
              <td>{p.bankAccount}</td>
              <td>{p.type}</td>
              <td>
                <span className={`badge badge-${p.status.toLowerCase()}`}>{p.status}</span>
              </td>
              <td>
                <button className="btn-edit" onClick={() => handleEditClick(p)}>Edit</button>
                <button className="btn-delete" onClick={() => handleDelete(p._id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <div className="modal-overlay" onClick={handleCloseForm}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2>{editingPayment ? "Edit Payment" : "Add Payment"}</h2>
            <form onSubmit={handleSubmit}>
              <input type="text" name="name" placeholder="Name" value={formData.name} onChange={handleChange} required />
              <input type="number" name="amount" placeholder="Amount" value={formData.amount} onChange={handleChange} required />
              <input type="date" name="date" value={formData.date?.slice(0,10)} onChange={handleChange} required />
              <input type="text" name="bankAccount" placeholder="Bank Account" value={formData.bankAccount} onChange={handleChange} required />
              <select name="type" value={formData.type} onChange={handleChange}>
                <option>Loan</option><option>Credit Card</option><option>Insurance</option><option>Bill</option><option>Other</option>
              </select>
              <select name="status" value={formData.status} onChange={handleChange}>
                <option>Pending</option><option>Paid</option>
              </select>
              <button className="btn-primary" type="submit">{editingPayment ? "Update" : "Add"}</button>
              <button type="button" onClick={handleCloseForm}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
