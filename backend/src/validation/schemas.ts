import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});

/** Maps login id `superadmin` to the canonical default admin email. */
export function normalizeLoginEmail(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t === "superadmin") return "superadmin@prm.local";
  return t;
}

export const loginSchema = z.object({
  email: z
    .string()
    .min(1)
    .transform((s) => normalizeLoginEmail(s))
    .pipe(z.string().email()),
  password: z.string().min(1),
});

export const updateMeSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
});

export const userRoleSchema = z.enum(["admin", "manager", "user"]);

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
  role: userRoleSchema,
});

export const updateUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  password: z.string().min(8).max(128).optional(),
  role: userRoleSchema.optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().default(""),
  memberIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).optional().default([]),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  memberIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(8000).optional().default(""),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  assigneeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(8000).optional(),
  status: z.enum(["todo", "in_progress", "done"]).optional(),
  assigneeId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
});

export const mongoIdParam = z.object({
  id: z.string().regex(/^[a-f0-9]{24}$/i),
});

export const projectIdParam = z.object({
  projectId: z.string().regex(/^[a-f0-9]{24}$/i),
});

export const taskIdParam = z.object({
  projectId: z.string().regex(/^[a-f0-9]{24}$/i),
  taskId: z.string().regex(/^[a-f0-9]{24}$/i),
});
