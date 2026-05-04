import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../utils/logger.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: err.flatten(),
      },
    });
    return;
  }
  logger.error({ err }, "Unhandled error");
  const isProd = process.env.NODE_ENV === "production";
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: isProd ? "An unexpected error occurred" : String(err),
    },
  });
}
