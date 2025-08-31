// src/Expenses.js
import React, { useState } from "react";
import "./eExpenses.css";

function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [newExpense, setNewExpense] = useState({ description: "", amount: "", paidBy: "" });

  const handleAddExpense = () => {
    if (!newExpense.description || !newExpense.amount || !newExpense.paidBy) {
      return alert("Please fill all fields!");
    }
    setExpenses([...expenses, { ...newExpense, id: Date.now() }]);
    setNewExpense({ description: "", amount: "", paidBy: "" });
  };

  const handleDeleteExpense = (id) => {
    setExpenses(expenses.filter((exp) => exp.id !== id));
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);

  return (
    <div className="expenses-container">
      <h1>💰 Event Expenses</h1>

      {/* Summary Section */}
      <div className="summary">
        <div className="summary-card">
          <h3>Total Expenses</h3>
          <p>Rs. {totalExpenses}</p>
        </div>
        <div className="summary-card">
          <h3>Total Records</h3>
          <p>{expenses.length}</p>
        </div>
      </div>

      {/* Form Card */}
      <div className="form-card">
        <input
          type="text"
          placeholder="Description"
          value={newExpense.description}
          onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
        />
        <input
          type="number"
          placeholder="Amount (Rs.)"
          value={newExpense.amount}
          onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
        />
        <input
          type="text"
          placeholder="Paid By"
          value={newExpense.paidBy}
          onChange={(e) => setNewExpense({ ...newExpense, paidBy: e.target.value })}
        />
        <button onClick={handleAddExpense}>➕ Add Expense</button>
      </div>

      {/* Expenses Grid */}
      <div className="expenses-grid">
        {expenses.length === 0 && <p className="empty-msg">No expenses added yet</p>}
        {expenses.map((exp) => (
          <div key={exp.id} className="expense-card">
            <h3>{exp.description}</h3>
            <p>💰 Amount: Rs. {exp.amount}</p>
            <p>👤 Paid By: {exp.paidBy}</p>
            <button className="delete-btn" onClick={() => handleDeleteExpense(exp.id)}>
              ❌ Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Expenses;
