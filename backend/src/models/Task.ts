import mongoose, { Schema, type Document, type Types } from "mongoose";

export type TaskStatus = "todo" | "in_progress" | "done";

export interface ITask extends Document {
  _id: Types.ObjectId;
  project: Types.ObjectId;
  title: string;
  description: string;
  status: TaskStatus;
  assignee?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const taskSchema = new Schema<ITask>(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    status: {
      type: String,
      enum: ["todo", "in_progress", "done"],
      default: "todo",
    },
    assignee: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

taskSchema.index({ project: 1 });

export const Task = mongoose.model<ITask>("Task", taskSchema);
