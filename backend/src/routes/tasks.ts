import { Router, type Request, type Response, type NextFunction } from "express";
import mongoose from "mongoose";
import type { Env } from "../config/env.js";
import type { AccessTokenPayload } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { AppError } from "../middleware/errors.js";
import { Project } from "../models/Project.js";
import { Task } from "../models/Task.js";
import { User } from "../models/User.js";
import { canAccessProject } from "../services/access.js";
import { createTaskSchema, projectIdParam, taskIdParam, updateTaskSchema } from "../validation/schemas.js";

async function assertProjectAccess(projectId: string, auth: AccessTokenPayload) {
  const project = await Project.findById(projectId).lean();
  if (!project) {
    return { error: new AppError(404, "NOT_FOUND", "Project not found") };
  }
  if (!canAccessProject(auth, project)) {
    return { error: new AppError(403, "FORBIDDEN", "No access to this project") };
  }
  return { project };
}

export function tasksRouter(env: Env): Router {
  const r = Router();
  const auth = requireAuth(env);

  r.get("/:projectId/tasks", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = projectIdParam.parse(req.params);
      const check = await assertProjectAccess(projectId, req.auth!);
      if ("error" in check && check.error) {
        next(check.error);
        return;
      }
      const tasks = await Task.find({ project: projectId }).sort({ createdAt: -1 }).lean();
      res.json(
        tasks.map((t) => ({
          id: t._id.toString(),
          projectId: t.project.toString(),
          title: t.title,
          description: t.description,
          status: t.status,
          assigneeId: t.assignee ? t.assignee.toString() : null,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      );
    } catch (e) {
      next(e);
    }
  });

  r.post("/:projectId/tasks", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId } = projectIdParam.parse(req.params);
      const check = await assertProjectAccess(projectId, req.auth!);
      if ("error" in check && check.error) {
        next(check.error);
        return;
      }
      const body = createTaskSchema.parse(req.body);
      if (body.assigneeId) {
        const u = await User.exists({ _id: body.assigneeId });
        if (!u) {
          next(new AppError(400, "BAD_REQUEST", "Invalid assignee"));
          return;
        }
      }
      const task = await Task.create({
        project: new mongoose.Types.ObjectId(projectId),
        title: body.title,
        description: body.description ?? "",
        status: body.status ?? "todo",
        assignee: body.assigneeId ? new mongoose.Types.ObjectId(body.assigneeId) : undefined,
      });
      res.status(201).json({
        id: task._id.toString(),
        projectId: task.project.toString(),
        title: task.title,
        description: task.description,
        status: task.status,
        assigneeId: task.assignee ? task.assignee.toString() : null,
      });
    } catch (e) {
      next(e);
    }
  });

  r.get("/:projectId/tasks/:taskId", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, taskId } = taskIdParam.parse(req.params);
      const check = await assertProjectAccess(projectId, req.auth!);
      if ("error" in check && check.error) {
        next(check.error);
        return;
      }
      const task = await Task.findOne({ _id: taskId, project: projectId }).lean();
      if (!task) {
        next(new AppError(404, "NOT_FOUND", "Task not found"));
        return;
      }
      res.json({
        id: task._id.toString(),
        projectId: task.project.toString(),
        title: task.title,
        description: task.description,
        status: task.status,
        assigneeId: task.assignee ? task.assignee.toString() : null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
    } catch (e) {
      next(e);
    }
  });

  r.patch("/:projectId/tasks/:taskId", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, taskId } = taskIdParam.parse(req.params);
      const check = await assertProjectAccess(projectId, req.auth!);
      if ("error" in check && check.error) {
        next(check.error);
        return;
      }
      const body = updateTaskSchema.parse(req.body);
      const task = await Task.findOne({ _id: taskId, project: projectId });
      if (!task) {
        next(new AppError(404, "NOT_FOUND", "Task not found"));
        return;
      }
      if (body.title !== undefined) task.title = body.title;
      if (body.description !== undefined) task.description = body.description;
      if (body.status !== undefined) task.status = body.status;
      if (body.assigneeId !== undefined) {
        if (body.assigneeId === null) task.assignee = undefined;
        else {
          const u = await User.exists({ _id: body.assigneeId });
          if (!u) {
            next(new AppError(400, "BAD_REQUEST", "Invalid assignee"));
            return;
          }
          task.assignee = new mongoose.Types.ObjectId(body.assigneeId);
        }
      }
      await task.save();
      res.json({
        id: task._id.toString(),
        projectId: task.project.toString(),
        title: task.title,
        description: task.description,
        status: task.status,
        assigneeId: task.assignee ? task.assignee.toString() : null,
      });
    } catch (e) {
      next(e);
    }
  });

  r.delete("/:projectId/tasks/:taskId", auth, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { projectId, taskId } = taskIdParam.parse(req.params);
      const check = await assertProjectAccess(projectId, req.auth!);
      if ("error" in check && check.error) {
        next(check.error);
        return;
      }
      const task = await Task.findOneAndDelete({ _id: taskId, project: projectId });
      if (!task) {
        next(new AppError(404, "NOT_FOUND", "Task not found"));
        return;
      }
      res.status(204).send();
    } catch (e) {
      next(e);
    }
  });

  return r;
}
