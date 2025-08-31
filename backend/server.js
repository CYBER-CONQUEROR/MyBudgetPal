const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config({ path: './config/config.env' });

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mybudgetpal', {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    console.log('Please make sure MongoDB is running on your system or update MONGO_URI in config.env');
    process.exit(1);
  });

// Import routes
const eventRoutes = require("./eventExpenses/eventRoutes/eventRoutes");
const expenseRoutes = require("./dayToDayExpenses/routes/expenseRoutes");

// Routes
app.use("/api/events", eventRoutes);
app.use("/api/expenses", expenseRoutes);

// Health check route
app.get("/", (req, res) => {
  res.json({ message: "MyBudgetPal API is running!" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
