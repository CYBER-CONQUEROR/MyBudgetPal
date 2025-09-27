// middleware/authRequired.js
import jwt from "jsonwebtoken";

export default function authRequired(req, res, next) {
  const fromCookie = req.cookies?.mbp_token;
  const fromHeader = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;

  const token = fromCookie || fromHeader;
  if (!token) return res.status(401).json({ ok: false, message: "Not logged in" });

  try {
    const { uid } = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    req.userId = uid;        // <- backend “learned” the user
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "Invalid/expired token" });
  }
}
