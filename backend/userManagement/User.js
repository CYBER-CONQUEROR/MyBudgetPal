// models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

const sriLankaPhoneRegex = /^(?:0\d{9}|\+94\d{9})$/; // 0712345678 or +94712345678

const AvatarSchema = new Schema(
  {
    data: { type: Buffer },
    contentType: { type: String, enum: ["image/png", "image/jpeg", "image/webp"], default: "image/png" },
    size: { type: Number, default: 0 }, // bytes
  },
  { _id: false }
);

const UserSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email"],
      unique: true,
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      match: [sriLankaPhoneRegex, "Invalid phone number"],
      unique: true,
      sparse: true, // allow null/undefined
      index: true,
    },
    passwordHash: { type: String, required: true },
    avatar: AvatarSchema, // stores the "bit image"
  },
  { timestamps: true }
);

// Hide sensitive fields when converting to JSON
UserSchema.methods.toJSON = function () {
  const obj = this.toObject({ versionKey: false });
  delete obj.passwordHash;
  // Don't ship raw bytes by default
  if (obj.avatar) {
    obj.avatar = {
      hasAvatar: !!(this.avatar?.data?.length),
      contentType: this.avatar?.contentType || null,
      size: this.avatar?.size || 0,
    };
  }
  return obj;
};

// Helper to set password
UserSchema.methods.setPassword = async function (plain) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plain, salt);
};

UserSchema.methods.verifyPassword = async function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export default mongoose.model("User", UserSchema);
