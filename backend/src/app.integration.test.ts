import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "./app.js";
import type { Env } from "./config/env.js";
import { User } from "./models/User.js";
import { hashPassword } from "./lib/password.js";
import { ensureDefaultSuperAdmin } from "./services/defaultSuperAdmin.js";

let mongo: MongoMemoryServer | undefined;
let app: ReturnType<typeof createApp>;
const testEnv: Env = {
  NODE_ENV: "test",
  PORT: 4000,
  MONGO_URI: "",
  JWT_SECRET: "test-jwt-secret-min-16",
  JWT_EXPIRES_IN: "1h",
  CORS_ORIGIN: "http://localhost:5173",
  SEED_ADMIN: false,
};

beforeAll(async () => {
  mongo = await MongoMemoryServer.create({
    instance: { launchTimeout: 120000 },
  });
  testEnv.MONGO_URI = mongo.getUri();
  await mongoose.connect(testEnv.MONGO_URI);
  await ensureDefaultSuperAdmin();
  app = createApp(testEnv);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe("Auth and RBAC", () => {
  it("logs in as default superadmin with username or email", async () => {
    const asUser = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "superadmin", password: "superadmin" });
    expect(asUser.status).toBe(200);
    expect(asUser.body.user.role).toBe("admin");

    const asEmail = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "superadmin@prm.local", password: "superadmin" });
    expect(asEmail.status).toBe(200);
  });

  it("registers and logs in", async () => {
    const reg = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "u1@test.dev", password: "password12", name: "User One" });
    expect(reg.status).toBe(201);
    expect(reg.body.token).toBeDefined();
    expect(reg.body.user.role).toBe("user");

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "u1@test.dev", password: "password12" });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeDefined();
  });

  it("admin can list users", async () => {
    await User.create({
      email: "admin@test.dev",
      passwordHash: await hashPassword("adminpass12"),
      name: "Admin",
      role: "admin",
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@test.dev", password: "adminpass12" });
    const token = login.body.token as string;
    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("non-admin cannot list users", async () => {
    await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "u2@test.dev", password: "password12", name: "Two" });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "u2@test.dev", password: "password12" });
    const res = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
  });
});

describe("Projects and tasks", () => {
  it("creates project and tasks with access control", async () => {
    await User.create({
      email: "pm@test.dev",
      passwordHash: await hashPassword("pmpass1234"),
      name: "PM",
      role: "manager",
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "pm@test.dev", password: "pmpass1234" });
    const token = login.body.token as string;

    const proj = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Alpha", description: "Desc" });
    expect(proj.status).toBe(201);
    const pid = proj.body.id as string;

    const tasks = await request(app)
      .get(`/api/v1/projects/${pid}/tasks`)
      .set("Authorization", `Bearer ${token}`);
    expect(tasks.status).toBe(200);
    expect(tasks.body).toEqual([]);

    const t1 = await request(app)
      .post(`/api/v1/projects/${pid}/tasks`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task 1", status: "todo" });
    expect(t1.status).toBe(201);
    expect(t1.body.title).toBe("Task 1");
  });
});
