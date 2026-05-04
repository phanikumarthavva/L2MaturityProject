import type { Types } from "mongoose";
import type { AccessTokenPayload } from "../lib/jwt.js";
import type { IProject } from "../models/Project.js";

export function userIdString(id: Types.ObjectId | string): string {
  return typeof id === "string" ? id : id.toString();
}

export function canAccessProject(auth: AccessTokenPayload, project: Pick<IProject, "owner" | "members">): boolean {
  if (auth.role === "admin") return true;
  const uid = auth.sub;
  if (userIdString(project.owner) === uid) return true;
  return project.members.some((m) => userIdString(m) === uid);
}

export function isAdmin(auth: AccessTokenPayload): boolean {
  return auth.role === "admin";
}
