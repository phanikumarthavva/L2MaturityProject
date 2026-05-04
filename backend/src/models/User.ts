import mongoose, { Schema, type Document, type Types } from "mongoose";

export type UserRole = "admin" | "manager" | "user";

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    role: {
      type: String,
      enum: ["admin", "manager", "user"],
      default: "user",
    },
  },
  { timestamps: true },
);

export const User = mongoose.model<IUser>("User", userSchema);
