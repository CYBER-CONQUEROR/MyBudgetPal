// assist/middleware/upload.js
import multer from "multer";
import fs from "fs";

const UPLOAD_DIR = "uploads";
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const upload = multer({ dest: `${UPLOAD_DIR}/` });
