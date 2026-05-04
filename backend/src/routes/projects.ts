import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import type { Env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errors.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { canAccessProject, isAdmin } from "../services/access.js";
import { createProjectSchema, mongoIdParam, updateProjectSchema } from "../validation/schemas.js";

function toMemberObjectIds(ids: string[]): mongoose.Types.ObjectId[] {
  return ids.map((id) => new mongoose.Types.ObjectId(id));
}

export function projectsRouter(env: Env): Router {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const uid = req.auth!.sub;
      const role = req.auth!.role;
      let query = {};
      if (role === "admin") {
        query = {};
      } else {
        query = {
          $or: [{ owner: uid }, { members: uid }],
        };
      }
      const projects = await Project.find(query).sort({ updatedAt: -1 }).lean();
      res.json(
        projects.map((p) => ({
          id: p._id.toString(),
          name: p.name,
          description: p.description,
          ownerId: p.owner.toString(),
          memberIds: p.members.map((m) => m.toString()),
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        })),
      );
    } catch (e) {
      next(e);
    }
  });

  r.post("/", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createProjectSchema.parse(req.body);
      const ownerId = req.auth!.sub;
      const memberIds = [...new Set(body.memberIds)].filter((id) => id !== ownerId);
      for (const mid of memberIds) {
        const exists = await User.exists({ _id: mid });
        if (!exists) {
          next(new AppError(400, "BAD_REQUEST", `Invalid member id: ${mid}`));
          return;
        }
      }
      const project = await Project.create({
        name: body.name,
        description: body.description ?? "",
        owner: ownerId,
        members: toMemberObjectIds(memberIds),
      });
      res.status(201).json({
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        ownerId: project.owner.toString(),
        memberIds: project.members.map((m) => m.toString()),
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:id", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = mongoIdParam.parse(req.params);
      const project = await Project.findById(id).lean();
      if (!project) {
        next(new AppError(404, "NOT_FOUND", "Project not found"));
        return;
      }
      if (!canAccessProject(req.auth!, project)) {
        next(new AppError(403, "FORBIDDEN", "No access to this project"));
        return;
      }
      res.json({
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        ownerId: project.owner.toString(),
        memberIds: project.members.map((m) => m.toString()),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:id", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = mongoIdParam.parse(req.params);
      const body = updateProjectSchema.parse(req.body);
      const project = await Project.findById(id);
      if (!project) {
        next(new AppError(404, "NOT_FOUND", "Project not found"));
        return;
      }
      const admin = isAdmin(req.auth!);
      const isOwner = project.owner.toString() === req.auth!.sub;
      if (!canAccessProject(req.auth!, project)) {
        next(new AppError(403, "FORBIDDEN", "No access to this project"));
        return;
      }
      if (body.memberIds !== undefined && !admin && !isOwner) {
        next(new AppError(403, "FORBIDDEN", "Only owner or admin can change members"));
        return;
      }
      if (body.name) project.name = body.name;
      if (body.description !== undefined) project.description = body.description;
      if (body.memberIds !== undefined) {
        const ownerStr = project.owner.toString();
        const unique = [...new Set(body.memberIds)].filter((m) => m !== ownerStr);
        for (const mid of unique) {
          const exists = await User.exists({ _id: mid });
          if (!exists) {
            next(new AppError(400, "BAD_REQUEST", `Invalid member id: ${mid}`));
            return;
          }
        }
        project.members = toMemberObjectIds(unique);
      }
      await project.save();
      res.json({
        id: project._id.toString(),
        name: project.name,
        description: project.description,
        ownerId: project.owner.toString(),
        memberIds: project.members.map((m) => m.toString()),
      });
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:id", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = mongoIdParam.parse(req.params);
      const project = await Project.findById(id);
      if (!project) {
        next(new AppError(404, "NOT_FOUND", "Project not found"));
        return;
      }
      const isOwner = project.owner.toString() === req.auth!.sub;
      if (!isAdmin(req.auth!) && !isOwner) {
        next(new AppError(403, "FORBIDDEN", "Only owner or admin can delete"));
        return;
      }
      await project.deleteOne();
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
