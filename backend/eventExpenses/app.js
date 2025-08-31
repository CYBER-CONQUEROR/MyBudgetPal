const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./config/config.env" });

const app = express();
app.use(express.json());

// --- Connect to MongoDB Atlas directly ---
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
});

// Event Expenses Routes
app.use("/api/event-expenses", require("./eventExpenses/eventExpenseRoutes"));

module.exports = app;
