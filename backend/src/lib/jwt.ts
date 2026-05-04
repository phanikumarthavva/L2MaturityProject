import jwt, { type SignOptions } from "jsonwebtoken";
import type { UserRole } from "../models/User.js";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  email: string;
}

export function signAccessToken(
  payload: AccessTokenPayload,
  secret: string,
  expiresIn: string,
): string {
  const options = {
    expiresIn,
    subject: payload.sub,
  } as SignOptions;
  return jwt.sign({ role: payload.role, email: payload.email }, secret, options);
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret) as jwt.JwtPayload & {
    role: UserRole;
    email: string;
  };
  if (!decoded.sub || !decoded.role) {
    throw new Error("Invalid token payload");
  }
  return {
    sub: decoded.sub,
    role: decoded.role,
    email: decoded.email,
  };
}
