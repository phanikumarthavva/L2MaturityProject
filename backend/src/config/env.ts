import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SEED_ADMIN: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  const data = parsed.data;
  if (data.SEED_ADMIN) {
    if (!data.SEED_ADMIN_EMAIL || !data.SEED_ADMIN_PASSWORD) {
      console.error("SEED_ADMIN requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD");
      process.exit(1);
    }
  }
  return data;
}
