// userManagement/authRoutes.js
import express from "express";
import multer from "multer";
import {
  register,
  login,
  logout,
  getMe,
  updateProfile,
  changePassword,
  getAvatar,
  putAvatar,
} from "../userManagement/authController.js";

const router = express.Router();
const upload = multer();

// Public auth
router.post("/auth/register", upload.single("avatar"), register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);

// Public avatar read
router.get("/users/:id/avatar", getAvatar);

// Protected below
const ensureAuth = (req, res, next) => {
  if (!req.userId) return res.status(401).json({ ok: false, message: "Not logged in" });
  next();
};
router.use(ensureAuth);

// Me / profile / password
router.get("/me", getMe);
router.patch("/auth/profile", updateProfile);
router.post("/auth/change-password", changePassword);

// Avatar write (own only)
router.put("/users/:id/avatar", upload.single("avatar"), putAvatar);

export default router;
