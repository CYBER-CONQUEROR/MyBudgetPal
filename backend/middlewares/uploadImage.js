// middleware/uploadImage.js
import multer from "multer";

const storage = multer.memoryStorage(); // keep file in memory -> we'll save Buffer to Mongo

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    if (!ok) return cb(new Error("Only PNG/JPEG/WEBP images are allowed"));
    cb(null, true);
  },
});

export default upload;
