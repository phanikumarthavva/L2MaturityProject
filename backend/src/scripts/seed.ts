/**
 * Create admin user: ensure MONGO_URI, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD are set, then run npm run seed
 */
import "dotenv/config";
import mongoose from "mongoose";
import { z } from "zod";
import { User } from "../models/User.js";
import { hashPassword } from "../lib/password.js";

const seedEnv = z.object({
  MONGO_URI: z.string().min(1),
  SEED_ADMIN_EMAIL: z.string().email(),
  SEED_ADMIN_PASSWORD: z.string().min(8),
});

async function run(): Promise<void> {
  const env = seedEnv.parse(process.env);
  await mongoose.connect(env.MONGO_URI);
  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log("Admin already exists:", email);
    await mongoose.disconnect();
    return;
  }
  await User.create({
    email,
    passwordHash: await hashPassword(env.SEED_ADMIN_PASSWORD),
    name: "Administrator",
    role: "admin",
  });
  console.log("Created admin:", email);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
