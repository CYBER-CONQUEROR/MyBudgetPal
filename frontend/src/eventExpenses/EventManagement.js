import React, { useState } from "react";
import "./EventManagement.css";

function EventManagement() {
  const [events, setEvents] = useState([
    { id: 1, name: "Birthday Party", date: "2025-08-20", budget: 5000, estimated: 3000, expenses: 2000, notes: "Cake + decorations" },
    { id: 2, name: "Wedding Anniversary", date: "2025-09-10", budget: 7000, estimated: 5000, expenses: 4000, notes: "Dinner reservation" },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newEvent, setNewEvent] = useState({ name: "", date: "", budget: "", estimated: "", expenses: "", notes: "" });
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const errs = {};
    if (!newEvent.name) errs.name = "Event name is required.";
    if (!newEvent.date) errs.date = "Event date is required.";
    if (!newEvent.budget || isNaN(Number(newEvent.budget))) errs.budget = "Valid budget is required.";
    if (newEvent.estimated && isNaN(Number(newEvent.estimated))) errs.estimated = "Estimated expenses must be a number.";
    if (newEvent.expenses && isNaN(Number(newEvent.expenses))) errs.expenses = "Actual expenses must be a number.";
    return errs;
  };

  const handleAddOrUpdateEvent = () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const eventObj = {
      ...newEvent,
      budget: parseFloat(newEvent.budget),
      estimated: parseFloat(newEvent.estimated) || 0,
      expenses: parseFloat(newEvent.expenses) || 0
    };

    if (editingId) {
      setEvents(events.map(e => e.id === editingId ? { ...eventObj, id: editingId } : e));
      setEditingId(null);
    } else {
      setEvents([...events, { ...eventObj, id: Date.now() }]);
    }

    setNewEvent({ name: "", date: "", budget: "", estimated: "", expenses: "", notes: "" });
    setErrors({});
    setShowForm(false);
  };

  const handleDelete = id => {
    if (window.confirm("Are you sure you want to delete this event?")) {
      setEvents(events.filter(e => e.id !== id));
    }
  };

  const handleEdit = event => {
    setNewEvent({ ...event });
    setEditingId(event.id);
    setShowForm(true);
  };

  const totalBudget = events.reduce((sum, e) => sum + e.budget, 0);

  return (
    <>
      {/* ===== Header ===== */}
      <header className="app-header">
        <h1>MyBudgetPal</h1>
        <nav>
          <ul>
            <li>Home</li>
            <li>Events</li>
            <li>About</li>
          </ul>
        </nav>
      </header>

      {/* ===== Main Container ===== */}
      <div className="container">
        <h1>🎉 Event Expense Management</h1>

        <div className="intro-text">
          <h2>“Plan Smart. Spend Wise. Celebrate More.”</h2>
          <p>Organize and track your family’s event expenses in detail.</p>
        </div>

        <div className="summary">
          <div className="summary-card">
            <h3>Total Events</h3>
            <p>{events.length}</p>
          </div>
          <div className="summary-card">
            <h3>Total Budget</h3>
            <p>Rs. {totalBudget}</p>
          </div>
        </div>

        <button className="add-event-btn" onClick={() => { setShowForm(true); setEditingId(null); }}>
          ➕ Add Event
        </button>

        {showForm && (
          <div className="form-popup">
            <div className="form-card">
              <h2>{editingId ? "Edit Event" : "Add New Event"}</h2>
              <input type="text" placeholder="Event Name" value={newEvent.name} onChange={e => setNewEvent({ ...newEvent, name: e.target.value })} />
              {errors.name && <small className="error">{errors.name}</small>}

              <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} />
              {errors.date && <small className="error">{errors.date}</small>}

              <input type="number" placeholder="Budget (Rs.)" value={newEvent.budget} onChange={e => setNewEvent({ ...newEvent, budget: e.target.value })} />
              {errors.budget && <small className="error">{errors.budget}</small>}

              <input type="number" placeholder="Estimated Expenses (Rs.)" value={newEvent.estimated} onChange={e => setNewEvent({ ...newEvent, estimated: e.target.value })} />
              {errors.estimated && <small className="error">{errors.estimated}</small>}

              <input type="number" placeholder="Actual Expenses (Rs.)" value={newEvent.expenses} onChange={e => setNewEvent({ ...newEvent, expenses: e.target.value })} />
              {errors.expenses && <small className="error">{errors.expenses}</small>}

              <textarea placeholder="Notes" value={newEvent.notes} onChange={e => setNewEvent({ ...newEvent, notes: e.target.value })}></textarea>
              
              <div className="form-actions">
                <button onClick={handleAddOrUpdateEvent}>✅ {editingId ? "Update" : "Save"}</button>
                <button className="cancel-btn" onClick={() => { setShowForm(false); setErrors({}); setEditingId(null); }}>❌ Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="events-grid">
          {events.map(event => {
            const spentPercentage = Math.min(Math.round((event.expenses / event.budget) * 100), 100);
            const barClass = spentPercentage <= 100 ? "budget-bar-green" : "budget-bar-red";
            return (
              <div className="event-card" key={event.id}>
                <h3>{event.name}</h3>
                <p>📅 {event.date}</p>
                <p>💰 Budget: Rs. {event.budget}</p>
                <p>📊 Estimated: Rs. {event.estimated}</p>
                <p>💸 Expenses: Rs. {event.expenses}</p>
                {event.notes && <p>📝 Notes: {event.notes}</p>}

                <div className="budget-bar-container">
                  <div className={`budget-bar ${barClass}`} style={{ width: `${spentPercentage}%` }}>
                    <span className="bar-label">{spentPercentage}%</span>
                  </div>
                </div>

                <div className="event-actions">
                  <button onClick={() => handleEdit(event)}>✏️ Edit</button>
                  <button onClick={() => handleDelete(event.id)}>🗑️ Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Footer ===== */}
      <footer className="app-footer">
        © 2025 MyBudgetPal. All Rights Reserved.
      </footer>
    </>
  );
}

export default EventManagement;
