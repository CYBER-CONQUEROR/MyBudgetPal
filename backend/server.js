// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

// Routers
import incomeRouter from "./incomeManagement/routes.js";
import expenseRoutes from "./dayToDayExpenses/expenseRoutes.js";
import bankRoutes from "./bankTransactions/bankRoutes.js";
import categoryRoutes from "./dayToDayExpenses/categoryRoutes.js";
import budgetPlanRouter from "./budgetManagement/budgetRoutes.js";
import eventRoutes from "./eventExpenses/eventRoutes.js";
import accountRoutes from "./AccountManagement/AccountRoutes.js";
import savingRoutes from "./savingGoals/savingsRoutes.js";
import authRoutes from "./userManagement/authRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Optional demo fallback (disabled by default)
const ALLOW_DEMO = process.env.ALLOW_DEMO === "1";
const DEMO_USER_ID = (() => {
  if (!ALLOW_DEMO) return null;
  const envId = process.env.DEMO_USER_ID;
  if (envId && mongoose.isValidObjectId(envId)) return new mongoose.Types.ObjectId(envId);
  return new mongoose.Types.ObjectId("000000000000000000000001");
})();

// ===== Core middleware =====
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true, // allow cookies
  })
);
app.use(express.json());
app.use(cookieParser());

// Identify user (cookie -> bearer -> header -> optional demo)
app.use((req, _res, next) => {
  const asId = (v) => (mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null);

  // 1) JWT in HttpOnly cookie
  const cookieToken = req.cookies?.mbp_token || null;

  // 2) Authorization: Bearer <token>
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;

  const token = cookieToken || bearer;
  if (token && !req.userId) {
    try {
      const { uid } = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
      const id = asId(uid);
      if (id) {
        req.userId = id;
        req.authMethod = cookieToken ? "jwt-cookie" : "jwt-bearer";
      }
    } catch {
      // ignore invalid/expired token
    }
  }

  // 3) x-user-id header (dev convenience) — only if present AND no user yet
  if (!req.userId) {
    const id = asId(req.header("x-user-id"));
    if (id) {
      req.userId = id;
      req.authMethod = "x-user-id";
    }
  }

  // 4) DEMO fallback (only if ALLOW_DEMO=1)
  if (!req.userId && ALLOW_DEMO && DEMO_USER_ID) {
    req.userId = DEMO_USER_ID;
    req.authMethod = "demo";
  }

  next();
});

// Simple guard for protected routes
function requireUser(req, res, next) {
  if (!req.userId) return res.status(401).json({ ok: false, message: "Not logged in" });
  next();
}

// ===== Health =====
app.get("/health", (_req, res) => res.json({ ok: true }));

// Debug: whoami (public; helps you verify the middleware result)
app.get("/api/_whoami", (req, res) =>
  res.json({
    userId: req.userId || null,
    method: req.authMethod || null,
    hasCookie: !!req.cookies?.mbp_token,
  })
);

// ===== Public routes (auth) – must come BEFORE protection =====
app.use("/api", authRoutes); // /auth/register, /auth/login, /auth/logout, /users/:id/avatar, etc.

// ===== Protected routes (everything below requires user) =====
app.use("/api", requireUser);
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

// ===== Start after DB connects =====
async function start() {
  try {
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
