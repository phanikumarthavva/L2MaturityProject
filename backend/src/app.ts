import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { Env } from "./config/env.js";
import { errorHandler } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { tasksRouter } from "./routes/tasks.js";
import { usersRouter } from "./routes/users.js";
import { logger } from "./utils/logger.js";

export function createApp(env: Env): express.Application {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(
    pinoHttp({
      logger,
      autoLogging: true,
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use(globalLimiter);
  app.use("/api/v1/auth", authLimiter, authRouter(env));
  app.use("/api/v1/users", usersRouter(env));
  app.use("/api/v1/projects", projectsRouter(env));
  app.use("/api/v1/projects", tasksRouter(env));

  app.use(errorHandler);

  return app;
}
