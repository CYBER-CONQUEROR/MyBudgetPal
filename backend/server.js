import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";

import incomeRouter from "./incomeManagement/routes.js";
import expenseRoutes from "./dayToDayExpenses/expenseRoutes.js";
import bankRoutes from "./bankTransactions/bankRoutes.js";
import categoryRoutes from "./dayToDayExpenses/categoryRoutes.js";

const DEMO_USER_ID = "u_demo_1";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());
app.use((req, _res, next) => {
  
  req.userId = req.header("x-user-id") || DEMO_USER_ID;
  next();
});

mongoose
  .connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME,
  })
  .then(() => {
    console.log("✅ connected to MongoDB Atlas with mongoose");
    app.listen(PORT, () =>
      console.log(`🚀 API running at http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("❌ Mongo connect error:", err);
    process.exit(1);
  });
// health
app.get("/health", (_req, res) => res.json({ ok: true }));

// feature mount
app.use("/api/incomes", incomeRouter);
app.use('/api/expenses', expenseRoutes);
app.use('/api/transactions', bankRoutes);
app.use("/api/categories", categoryRoutes);
// 404 fallback
app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
