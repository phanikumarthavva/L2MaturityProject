import { User } from "../models/User.js";
import { hashPassword } from "../lib/password.js";
import { logger } from "../utils/logger.js";

/** Canonical DB email for the built-in superadmin (login may use `superadmin` or this address). */
export const DEFAULT_SUPERADMIN_EMAIL = "superadmin@prm.local";

const DEFAULT_SUPERADMIN_PASSWORD = "superadmin";

/**
 * Ensures the demo superadmin exists. Set DISABLE_DEFAULT_SUPERADMIN=true in production.
 */
export async function ensureDefaultSuperAdmin(): Promise<void> {
  const disabled =
    process.env.DISABLE_DEFAULT_SUPERADMIN === "true" ||
    process.env.DISABLE_DEFAULT_SUPERADMIN === "1";
  if (disabled) {
    logger.info("Default superadmin bootstrap skipped (DISABLE_DEFAULT_SUPERADMIN)");
    return;
  }
  const existing = await User.findOne({ email: DEFAULT_SUPERADMIN_EMAIL });
  if (existing) return;
  await User.create({
    email: DEFAULT_SUPERADMIN_EMAIL,
    passwordHash: await hashPassword(DEFAULT_SUPERADMIN_PASSWORD),
    name: "superadmin",
    role: "admin",
  });
  logger.info(
    { email: DEFAULT_SUPERADMIN_EMAIL },
    "Created default superadmin account (sign in as superadmin or superadmin@prm.local; set DISABLE_DEFAULT_SUPERADMIN=true to skip in production).",
  );
}
