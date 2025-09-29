// controllers/authController.js
import User from "../userManagement/User.js";
import jwt from "jsonwebtoken";
import Account from "../AccountManagement/AccountModel.js";
/* Helper: strip secrets/binary from user */
const sanitize = (u) => {
  if (!u) return null;
  const o = u.toObject ? u.toObject() : u;
  delete o.passwordHash;
  delete o.salt;
  delete o.avatar; // keep avatar binary out of JSON
  return o;
};

/**
 * POST /api/auth/register
 * multipart/form-data (fields + optional file "avatar")
 */
export const register = async (req, res) => {
  try {
    const { fullName, email, phone, password, confirmPassword } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ ok: false, message: "fullName, email, password are required" });
    }
    if (password.length < 8 || password.length > 12) {
      return res.status(400).json({ ok: false, message: "Password must be 8–12 characters" });
    }
    if (confirmPassword && confirmPassword !== password) {
      return res.status(400).json({ ok: false, message: "Passwords do not match" });
    }

    const emailLc = String(email).toLowerCase();
    if (await User.findOne({ email: emailLc })) {
      return res.status(409).json({ ok: false, message: "Email already in use" });
    }
    if (phone) {
      if (!/^(?:0\d{9}|\+94\d{9})$/.test(phone)) {
        return res.status(400).json({ ok: false, message: "Invalid Sri Lankan phone number" });
      }
      if (await User.findOne({ phone })) {
        return res.status(409).json({ ok: false, message: "Phone already in use" });
      }
    }

    // create user
    const user = new User({ fullName, email: emailLc, phone: phone || undefined });
    await user.setPassword(password);

    if (req.file) {
      user.avatar = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        size: req.file.size,
      };
    }

    await user.save();

    // create default cash account
    const cashAccount = new Account({
      userId: user._id,
      type: "cash",
      name: "Cash Wallet",
      currency: "LKR",
      openingBalanceCents: 0,
      balanceCents: 0,
    });
    await cashAccount.save();

    return res.status(201).json({ ok: true, user: sanitize(user), defaultAccount: cashAccount });
  } catch (err) {
    console.error("REGISTER_ERROR", err);
    return res.status(500).json({ ok: false, message: "Registration failed", error: err.message });
  }
};

/**
 * POST /api/auth/login
 * body: { email, password } -> sets HttpOnly cookie
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: String(email || "").toLowerCase() });
    if (!user || !(await user.verifyPassword(password || ""))) {
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ uid: user._id }, process.env.JWT_SECRET || "dev_secret", {
      expiresIn: "7d",
    });

    res.cookie("mbp_token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.json({ ok: true, user: sanitize(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: "Login failed" });
  }
};

export const logout = async (_req, res) => {
  res.clearCookie("mbp_token", {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  res.json({ ok: true });
};

/** GET /api/me (requires req.userId) */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });
    res.json({ ok: true, user: sanitize(user) });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
};

/** PATCH /api/auth/profile */
export const updateProfile = async (req, res) => {
  try {
    const u = await User.findById(req.userId);
    if (!u) return res.status(404).json({ ok: false, message: "User not found" });

    const next = {};
    if (typeof req.body?.fullName === "string" && req.body.fullName.trim()) {
      next.fullName = req.body.fullName.trim();
    }
    if (typeof req.body?.phone === "string" && req.body.phone.trim()) {
      const phone = req.body.phone.trim();
      if (!/^(?:0\d{9}|\+94\d{9})$/.test(phone)) {
        return res.status(400).json({ ok: false, message: "Invalid Sri Lankan phone number" });
      }
      const dupPhone = await User.findOne({ _id: { $ne: u._id }, phone });
      if (dupPhone) return res.status(409).json({ ok: false, message: "Phone already in use" });
      next.phone = phone;
    }
    if (typeof req.body?.email === "string" && req.body.email.trim()) {
      const emailLc = req.body.email.trim().toLowerCase();
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(emailLc)) {
        return res.status(400).json({ ok: false, message: "Invalid email format" });
      }
      const dupEmail = await User.findOne({ _id: { $ne: u._id }, email: emailLc });
      if (dupEmail) return res.status(409).json({ ok: false, message: "Email already in use" });
      next.email = emailLc;
    }

    if (!Object.keys(next).length) {
      return res.json({ ok: true, user: sanitize(u) });
    }

    await User.updateOne({ _id: u._id }, { $set: next });
    const fresh = await User.findById(u._id);
    res.json({ ok: true, user: sanitize(fresh) });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to update profile" });
  }
};

/** POST /api/auth/change-password */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, message: "Current and new password required" });
    }
    if (String(newPassword).length < 8 || String(newPassword).length > 12) {
      return res.status(400).json({ ok: false, message: "Password must be 8–12 characters" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });

    const ok = await user.verifyPassword(currentPassword);
    if (!ok) return res.status(401).json({ ok: false, message: "Current password is incorrect" });

    await user.setPassword(newPassword);
    await user.save();

    // rotate cookie
    try {
      const token = jwt.sign({ uid: user._id }, process.env.JWT_SECRET || "dev_secret", { expiresIn: "7d" });
      res.cookie("mbp_token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });
    } catch {}

    res.json({ ok: true, message: "Password changed" });
  } catch (e) {
    res.status(500).json({ ok: false, message: "Failed to change password" });
  }
};

/** GET /api/users/:id/avatar – stream */
export const getAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("avatar");
    if (!user || !user.avatar?.data?.length) {
      return res.status(404).send("No avatar");
    }
    res.set("Content-Type", user.avatar.contentType || "image/png");
    return res.send(user.avatar.data);
  } catch (err) {
    return res.status(500).send("Error fetching avatar");
  }
};

/** PUT /api/users/:id/avatar – own only */
export const putAvatar = async (req, res) => {
  try {
    const { id } = req.params;
    if (String(id) !== String(req.userId)) {
      return res.status(403).json({ ok: false, message: "Can only update your own avatar" });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });
    if (!req.file) return res.status(400).json({ ok: false, message: "No image uploaded" });

    user.avatar = {
      data: req.file.buffer,
      contentType: req.file.mimetype,
      size: req.file.size,
    };
    await user.save();

    return res.json({ ok: true, message: "Avatar updated" });
  } catch (err) {
    console.error("PUT_AVATAR_ERROR", err);
    return res.status(500).json({ ok: false, message: "Failed to update avatar" });
  }
};
