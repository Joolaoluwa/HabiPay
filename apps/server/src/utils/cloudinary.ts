// Cloudinary wrapper. Property photos use public delivery (they're meant to be seen).
// Tenant documents will use private delivery through this same file in the
// documents phase, so storage stays in one place.
//
// Install:  npm i cloudinary
// .env:     CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

import { v2 as cloudinary, UploadApiResponse } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type UploadedImage = Pick<
  UploadApiResponse,
  "public_id" | "secure_url" | "width" | "height" | "bytes"
>;

// Streams a buffer from memory (multer) straight to Cloudinary. Nothing touches
// local disk, which matters on Render, where the disk is wiped on every deploy
export function uploadImage(
  buffer: Buffer,
  folder: string,
): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", type: "upload" },
      (err, result) => {
        if (err || !result)
          return reject(err ?? new Error("Image upload failed"));
        resolve({
          public_id: result.public_id,
          secure_url: result.secure_url,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        });
      },
    );
    stream.end(buffer);
  });
}

export async function deleteImage(publicId: string): Promise<void> {
  await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
}
