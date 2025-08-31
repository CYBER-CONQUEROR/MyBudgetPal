const express = require("express");
const router = express.Router();
const {
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent
} = require("../eventControllers/eventController");

// Get all events
router.get("/", getEvents);

// Get single event by ID
router.get("/:id", getEventById);

// Create new event
router.post("/", createEvent);

// Update an event
router.put("/:id", updateEvent);

// Delete an event
router.delete("/:id", deleteEvent);

module.exports = router;
