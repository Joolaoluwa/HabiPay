import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { db } from "./config/db";
import { sql } from "drizzle-orm";
import { authRouter } from "./modules/auth/auth.routes";
import { userRouter } from "./modules/users/users.routes";
import { landLordRouter } from "./modules/landlords/landlord.routes";
import { tenantRouter } from "./modules/tenants/tenant.router";
import { propertyRouter } from "./modules/properties/properties.router";

const app = express();

// ─── Global Middleware ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get("/health", async (_req: Request, res: Response) => {
  try {
    // Ping the database to confirm the connection is live
    await db.execute(sql`SELECT 1`);
    res.status(200).json({
      status: "ok",
      message: "HabiPay server is running",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "HabiPay server is running but database connection failed",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── API Routes ────────────────────────────────────────────────────────────────
// Routes will be registered here as modules are built
// e.g. app.use('/api/auth', authRoutes);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1/tenants", tenantRouter);
app.use("/api/v1/landlords", landLordRouter);
app.use("/api/v1/properties", propertyRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ status: "error", message: "Route not found" });
});

export default app;
