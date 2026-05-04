import { Router, type Request, type Response, type NextFunction } from "express";
import type { Env } from "../config/env.js";
import { signAccessToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { AppError } from "../middleware/errors.js";
import { User } from "../models/User.js";
import { loginSchema, registerSchema } from "../validation/schemas.js";

export function authRouter(env: Env): Router {
  const r = Router();

  r.post("/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = registerSchema.parse(req.body);
      const existing = await User.findOne({ email: body.email });
      if (existing) {
        next(new AppError(409, "CONFLICT", "Email already registered"));
        return;
      }
      const passwordHash = await hashPassword(body.password);
      const user = await User.create({
        email: body.email,
        passwordHash,
        name: body.name,
        role: "user",
      });
      const token = signAccessToken(
        { sub: user._id.toString(), role: user.role, email: user.email },
        env.JWT_SECRET,
        env.JWT_EXPIRES_IN,
      );
      res.status(201).json({
        token,
        user: { id: user._id.toString(), email: user.email, name: user.name, role: user.role },
      });
    } catch (e) {
      next(e);
    }
  });

  r.post("/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.parse(req.body);
      const user = await User.findOne({ email: body.email }).select("+passwordHash");
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
        next(new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password"));
        return;
      }
      const token = signAccessToken(
        { sub: user._id.toString(), role: user.role, email: user.email },
        env.JWT_SECRET,
        env.JWT_EXPIRES_IN,
      );
      res.json({
        token,
        user: { id: user._id.toString(), email: user.email, name: user.name, role: user.role },
      });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
