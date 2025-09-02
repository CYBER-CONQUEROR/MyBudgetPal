import Event from "./Event.js";

// Validate event data
const validateEventData = (data) => {
  const { name, date, budget, estimated, expenses } = data;
  if (!name || typeof name !== "string") return "Event name is required and must be a string.";
  if (!date || isNaN(Date.parse(date))) return "Valid date is required.";
  if (budget === undefined || isNaN(Number(budget))) return "Budget is required and must be a number.";
  if (estimated !== undefined && isNaN(Number(estimated))) return "Estimated expenses must be a number.";
  if (expenses !== undefined && isNaN(Number(expenses))) return "Actual expenses must be a number.";
  return null;
};

// Get all events
export const getEvents = async (req, res) => {
  try {
    const events = await Event.find();
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single event by ID
export const getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    res.json(event);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new event
export const createEvent = async (req, res) => {
  try {
    const error = validateEventData(req.body);
    if (error) return res.status(400).json({ message: error });

    const event = new Event({
      ...req.body,
      budget: Number(req.body.budget),
      estimated: Number(req.body.estimated) || 0,
      expenses: Number(req.body.expenses) || 0,
    });

    const savedEvent = await event.save();
    res.status(201).json(savedEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update an event
export const updateEvent = async (req, res) => {
  try {
    const error = validateEventData(req.body);
    if (error) return res.status(400).json({ message: error });

    const updatedEvent = await Event.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        budget: Number(req.body.budget),
        estimated: Number(req.body.estimated) || 0,
        expenses: Number(req.body.expenses) || 0,
      },
      { new: true }
    );

    if (!updatedEvent) return res.status(404).json({ message: "Event not found" });
    res.json(updatedEvent);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete an event
export const deleteEvent = async (req, res) => {
  try {
    const deletedEvent = await Event.findByIdAndDelete(req.params.id);
    if (!deletedEvent) return res.status(404).json({ message: "Event not found" });
    res.json({ message: "Event deleted" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
