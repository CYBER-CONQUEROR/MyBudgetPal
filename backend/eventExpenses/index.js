const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const eventRoutes = require("./eventExpenses/eventRoutes/eventRoutes"); 

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect DB
mongoose.connect("mongodb://127.0.0.1:27017/mybudgetpal")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// Register routes
app.use("/api/events", eventRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;
