// Image upload middleware for property photos.
// Install:  npm i multer   and   npm i -D @types/multer
//
// Files are kept in memory (not on disk) and streamed to Cloudinary by the
// controller. Limits: 10 files per request, 5 MB each.

import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AppError } from "../utils/appresponse";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 10;

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_FILES_PER_REQUEST },
}).array("images", MAX_FILES_PER_REQUEST);

const MULTER_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: "Each image must be 5 MB or smaller",
  LIMIT_FILE_COUNT: `Upload at most ${MAX_FILES_PER_REQUEST} images at a time`,
  LIMIT_UNEXPECTED_FILE: 'Send images in a form field named "images"',
};

// The file's own bytes decide its type, not its name or the browser's claim.
// A renamed .exe with a .jpg extension fails here
function isAllowedImage(b: Buffer): boolean {
  if (b.length < 12) return false;
  const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  const png =
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
  const webp =
    b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
  return jpeg || png || webp;
}

export function handleImageUpload(req: Request, res: Response, next: NextFunction) {
  parser(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      return next(new AppError(400, MULTER_MESSAGES[err.code] ?? "Invalid upload"));
    }
    if (err) return next(err);

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      return next(new AppError(400, 'Attach at least one image in the "images" field'));
    }
    for (const file of files) {
      if (!isAllowedImage(file.buffer)) {
        return next(new AppError(400, `${file.originalname} is not a JPEG, PNG or WebP image`));
      }
    }
    return next();
  });
}
