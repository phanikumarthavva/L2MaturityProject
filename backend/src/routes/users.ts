import { Router, type Request, type Response, type NextFunction } from "express";
import type { Env } from "../config/env.js";
import { hashPassword } from "../lib/password.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AppError } from "../middleware/errors.js";
import { User } from "../models/User.js";
import {
  createUserSchema,
  mongoIdParam,
  updateMeSchema,
  updateUserSchema,
} from "../validation/schemas.js";

export function usersRouter(env: Env): Router {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/me", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await User.findById(req.auth!.sub);
      if (!user) {
        next(new AppError(404, "NOT_FOUND", "User not found"));
        return;
      }
      res.json({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/me", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateMeSchema.parse(req.body);
      const user = await User.findById(req.auth!.sub).select("+passwordHash");
      if (!user) {
        next(new AppError(404, "NOT_FOUND", "User not found"));
        return;
      }
      if (body.name) user.name = body.name;
      if (body.password) user.passwordHash = await hashPassword(body.password);
      await user.save();
      res.json({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/", auth, requireRole("admin"), async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      res.json(
        users.map((u) => ({
          id: u._id.toString(),
          email: u.email,
          name: u.name,
          role: u.role,
          createdAt: u.createdAt,
        })),
      );
    } catch (e) {
      next(e);
    }
  });

  r.post("/", auth, requireRole("admin"), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createUserSchema.parse(req.body);
      const existing = await User.findOne({ email: body.email });
      if (existing) {
        next(new AppError(409, "CONFLICT", "Email already in use"));
        return;
      }
      const passwordHash = await hashPassword(body.password);
      const user = await User.create({
        email: body.email,
        passwordHash,
        name: body.name,
        role: body.role,
      });
      res.status(201).json({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      });
    } catch (e) {
      next(e);
    }
  });

  r.patch(
    "/:id",
    auth,
    requireRole("admin"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = mongoIdParam.parse(req.params);
        const body = updateUserSchema.parse(req.body);
        const user = await User.findById(id).select("+passwordHash");
        if (!user) {
          next(new AppError(404, "NOT_FOUND", "User not found"));
          return;
        }
        if (body.name) user.name = body.name;
        if (body.password) user.passwordHash = await hashPassword(body.password);
        if (body.role) user.role = body.role;
        await user.save();
        res.json({
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,
        });
      } catch (e) {
        next(e);
      }
    },
  );

  r.delete(
    "/:id",
    auth,
    requireRole("admin"),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = mongoIdParam.parse(req.params);
        if (id === req.auth!.sub) {
          next(new AppError(400, "BAD_REQUEST", "Cannot delete your own account"));
          return;
        }
        const user = await User.findByIdAndDelete(id);
        if (!user) {
          next(new AppError(404, "NOT_FOUND", "User not found"));
          return;
        }
        res.status(204).send();
      } catch (e) {
        next(e);
      }
    },
  );

  return r;
}
