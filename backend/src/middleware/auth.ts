import type { NextFunction, Request, Response } from "express";
import type { Env } from "../config/env.js";
import { verifyAccessToken, type AccessTokenPayload } from "../lib/jwt.js";
import { AppError } from "./errors.js";

export function requireAuth(env: Env) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new AppError(401, "UNAUTHORIZED", "Missing or invalid authorization"));
      return;
    }
    const token = header.slice(7);
    try {
      req.auth = verifyAccessToken(token, env.JWT_SECRET);
      req.env = env;
      next();
    } catch {
      next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
    }
  };
}

export function requireRole(...roles: AccessTokenPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, "UNAUTHORIZED", "Not authenticated"));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new AppError(403, "FORBIDDEN", "Insufficient permissions"));
      return;
    }
    next();
  };
}
