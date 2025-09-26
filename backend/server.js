import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import incomeRouter from "./incomeManagement/routes.js";
import expenseRoutes from "./dayToDayExpenses/expenseRoutes.js";
import bankRoutes from "./bankTransactions/bankRoutes.js";
import categoryRoutes from "./dayToDayExpenses/categoryRoutes.js";
import budgetPlanRouter from "./budgetManagement/budgetRoutes.js";
import eventRoutes from "./eventExpenses/eventRoutes.js";
import accountRoutes from './AccountManagement/AccountRoutes.js';
import savingRoutes from './savingGoals/savingsRoutes.js';


dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const DEMO_USER_ID = new mongoose.Types.ObjectId("000000000000000000000001");

// Middleware
app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());
app.use((req, _res, next) => {
  // if client sends a valid ObjectId, use it; otherwise use demo user
  const raw = req.header("x-user-id");
  req.userId = mongoose.isValidObjectId(raw) ? new mongoose.Types.ObjectId(raw) : DEMO_USER_ID;
  next();
});                      

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Feature mounts
app.use("/api/incomes", incomeRouter);
app.use("/api/expenses", expenseRoutes);
app.use("/api/commitments", bankRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/budget", budgetPlanRouter);
app.use("/api/events", eventRoutes);
app.use("/api/accounts", accountRoutes);
app.use("/api/savings-goals", savingRoutes);

// 404 fallback
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Start after DB connects (ONLY ONCE)
async function start() {
  try {
    // Optional: quick log to ensure env is loaded (don’t print password)
    // console.log("Connecting to:", process.env.MONGODB_URI?.replace(/\/\/.*?:.*?@/, "//<redacted>:<redacted>@"));

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME,
    });

    console.log("✅ connected to MongoDB Atlas with mongoose");
    app.listen(PORT, () => {
      console.log(`🚀 API running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Mongo connect error:", err);
    process.exit(1);
  }
}

start();
