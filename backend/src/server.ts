import "dotenv/config";
import mongoose from "mongoose";
import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { User } from "./models/User.js";
import { hashPassword } from "./lib/password.js";
import { ensureDefaultSuperAdmin } from "./services/defaultSuperAdmin.js";
import { logger } from "./utils/logger.js";

async function maybeSeedAdmin(): Promise<void> {
  const seed = process.env.SEED_ADMIN === "true" || process.env.SEED_ADMIN === "1";
  if (!seed) return;
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) return;
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    logger.info({ email }, "Seed admin skipped: user exists");
    return;
  }
  await User.create({
    email: email.toLowerCase(),
    passwordHash: await hashPassword(password),
    name: "Administrator",
    role: "admin",
  });
  logger.info({ email }, "Seeded admin user");
}

async function main(): Promise<void> {
  const env = loadEnv();
  await mongoose.connect(env.MONGO_URI);
  logger.info("Connected to MongoDB");
  await maybeSeedAdmin();
  await ensureDefaultSuperAdmin();
  const app = createApp(env);
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "API listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
