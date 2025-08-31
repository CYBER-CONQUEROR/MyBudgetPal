import React, { useState, useEffect } from "react";
import axios from "axios";
import "./EventManagement.css";

function EventManagement() {
  const [events, setEvents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [newEvent, setNewEvent] = useState({ name: "", date: "", budget: "", estimated: "", expenses: "", notes: "" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState(""); // "", "date", "budget", "expenses"
  const [toastMessage, setToastMessage] = useState("");

  const API_URL = "http://localhost:5000/api/events";

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const response = await axios.get(API_URL);
      setEvents(response.data);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvents(); }, []);

  const validateForm = () => {
    const errs = {};
    if (!newEvent.name) errs.name = "Event name is required.";
    if (!newEvent.date) errs.date = "Event date is required.";
    if (!newEvent.budget || isNaN(Number(newEvent.budget))) errs.budget = "Valid budget is required.";
    if (newEvent.estimated && isNaN(Number(newEvent.estimated))) errs.estimated = "Estimated expenses must be a number.";
    if (newEvent.expenses && isNaN(Number(newEvent.expenses))) errs.expenses = "Actual expenses must be a number.";
    return errs;
  };

  const handleAddOrUpdateEvent = async () => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const eventObj = {
      ...newEvent,
      budget: parseFloat(newEvent.budget),
      estimated: parseFloat(newEvent.estimated) || 0,
      expenses: parseFloat(newEvent.expenses) || 0,
    };

    try {
      if (editingId) {
        await axios.put(`${API_URL}/${editingId}`, eventObj);
        showToast("Event updated successfully!");
      } else {
        await axios.post(API_URL, eventObj);
        showToast("Event added successfully!");
      }
      fetchEvents();
      setShowForm(false);
      setEditingId(null);
      setNewEvent({ name: "", date: "", budget: "", estimated: "", expenses: "", notes: "" });
      setErrors({});
    } catch (error) {
      console.error("Error saving event:", error);
      showToast("Error saving event!");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    try {
      await axios.delete(`${API_URL}/${id}`);
      fetchEvents();
      showToast("Event deleted successfully!");
    } catch (error) {
      console.error("Error deleting event:", error);
      showToast("Error deleting event!");
    }
  };

  const handleEdit = (event) => {
    setNewEvent({ ...event });
    setEditingId(event._id);
    setShowForm(true);
  };

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(""), 3000);
  };

  // Filtering
  const filteredEvents = events.filter(e =>
    e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.notes && e.notes.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Sorting
  if (sortKey) {
    filteredEvents.sort((a, b) => {
      if (sortKey === "date") return new Date(a.date) - new Date(b.date);
      if (sortKey === "budget") return a.budget - b.budget;
      if (sortKey === "expenses") return a.expenses - b.expenses;
      return 0;
    });
  }

  const totalBudget = events.reduce((sum, e) => sum + e.budget, 0);
  const totalExpenses = events.reduce((sum, e) => sum + e.expenses, 0);

  return (
    <>
      <header className="app-header">
        <h1>MyBudgetPal</h1>
      </header>

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
          <div className="summary-card">
            <h3>Total Expenses</h3>
            <p>Rs. {totalExpenses}</p>
          </div>
          <div className="summary-card">
            <h3>Remaining Budget</h3>
            <p>Rs. {totalBudget - totalExpenses}</p>
          </div>
        </div>

        <div className="controls">
          <input
            type="text"
            placeholder="🔍 Search by name or notes..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <div className="sort-buttons">
            <button onClick={() => setSortKey("date")}>Sort by Date</button>
            <button onClick={() => setSortKey("budget")}>Sort by Budget</button>
            <button onClick={() => setSortKey("expenses")}>Sort by Expenses</button>
            <button onClick={() => setSortKey("")}>Clear Sort</button>
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

        {loading ? <p>Loading events...</p> : (
          <div className="events-grid">
            {filteredEvents.map(event => {
              const spentPercentage = Math.min(Math.round((event.expenses / event.budget) * 100), 150);
              const barClass = event.expenses > event.budget ? "budget-bar-red" : "budget-bar-green";
              return (
                <div className={`event-card ${event.expenses > event.budget ? "overspent" : ""}`} key={event._id}>
                  <h3>{event.name}</h3>
                  <p>📅 {new Date(event.date).toLocaleDateString()}</p>
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
                    <button onClick={() => handleDelete(event._id)}>🗑️ Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {toastMessage && <div className="toast">{toastMessage}</div>}

      <footer className="app-footer">© 2025 MyBudgetPal. All Rights Reserved.</footer>
    </>
  );
}

export default EventManagement;
