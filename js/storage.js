/**
 * WhyMessenger - Profile Photo Processing & Storage Module
 * Client-side Canvas cropping, Firebase Storage upload, and Spark-plan fallback management.
 */

import {
  storage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "./firebase.js";
import { updatePhotoURL } from "./profiles.js";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/**
 * Validates an image file for type and size constraints.
 * @param {File} file 
 * @returns {string|null} Error string or null if valid
 */
export function validateImageFile(file) {
  if (!file) {
    return "No file selected.";
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return "Unsupported file format. Please upload a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
    return `File size (${sizeInMB} MB) exceeds the 2 MB maximum limit.`;
  }
  return null;
}

/**
 * Resizes and center-square-crops an image file using the HTML5 Canvas API.
 * Compresses output to an optimized Blob.
 * 
 * @param {File|Blob} file 
 * @param {number} targetSize Square dimensions in pixels (default 512)
 * @param {number} quality Compression quality 0.0 - 1.0 (default 0.85)
 * @returns {Promise<Blob>} Cropped and resized image Blob
 */
export function cropAndResizeImage(file, targetSize = 512, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Calculate center square crop bounds
        const minDim = Math.min(img.naturalWidth, img.naturalHeight);
        const startX = (img.naturalWidth - minDim) / 2;
        const startY = (img.naturalHeight - minDim) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext("2d");
        // Enable high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";

        ctx.drawImage(
          img,
          startX,
          startY,
          minDim,
          minDim,
          0,
          0,
          targetSize,
          targetSize
        );

        // Prefer WebP if supported, fallback to JPEG
        const outputMime = "image/webp";
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              // Fallback to JPEG if WebP blob generation fails
              canvas.toBlob((jpgBlob) => {
                if (jpgBlob) resolve(jpgBlob);
                else reject(new Error("Canvas blob generation failed."));
              }, "image/jpeg", quality);
            }
          },
          outputMime,
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to decode image file."));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error("Failed to read file from disk."));
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a Blob to a Data URI.
 * @param {Blob} blob 
 * @returns {Promise<string>}
 */
export function blobToDataURI(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Uploads a cropped photo blob to Firebase Cloud Storage.
 * Gracefully detects Firebase Spark plan or bucket unavailability and falls back to
 * a compressed data URI stored in Firestore without breaking the application.
 * 
 * @param {string} uid User ID
 * @param {Blob} photoBlob Processed 512x512 Blob
 * @param {Function} onProgress Progress callback (percent: number)
 * @returns {Promise<{photoURL: string, usedFallback: boolean, message: string}>}
 */
export async function uploadProfilePhoto(uid, photoBlob, onProgress = () => {}) {
  const storagePath = `profilePictures/${uid}/avatar`;
  const storageRef = ref(storage, storagePath);

  try {
    // Attempt standard Firebase Cloud Storage upload
    const uploadTask = uploadBytesResumable(storageRef, photoBlob, {
      contentType: photoBlob.type || "image/webp",
      cacheControl: "public, max-age=86400"
    });

    const downloadURL = await new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(Math.round(progress));
        },
        (error) => {
          // Catch Firebase Cloud Storage bucket errors (e.g. Spark plan limitations)
          reject(error);
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (urlErr) {
            reject(urlErr);
          }
        }
      );
    });

    // Update Firestore public profile with real Cloud Storage URL
    await updatePhotoURL(uid, downloadURL);

    return {
      photoURL: downloadURL,
      usedFallback: false,
      message: "Profile photo uploaded to Firebase Cloud Storage successfully!"
    };
  } catch (storageError) {
    console.warn("Cloud Storage upload failed (Spark plan or bucket issue):", storageError);

    // Fallback strategy: convert the 512x512 compressed blob (~25KB) to a local Data URI
    // and save to Firestore publicProfiles document so the user can still customize their avatar
    try {
      const fallbackDataUri = await blobToDataURI(photoBlob);
      await updatePhotoURL(uid, fallbackDataUri);

      return {
        photoURL: fallbackDataUri,
        usedFallback: true,
        message:
          "Firebase Cloud Storage requires the Blaze plan or active bucket configuration. WhyMessenger applied an optimized local avatar fallback."
      };
    } catch (fallbackError) {
      console.error("Local avatar fallback failed:", fallbackError);
      throw new Error(
        "Unable to upload photo: " + (storageError.message || "Storage unavailable.")
      );
    }
  }
}

/**
 * Removes the profile photo from Cloud Storage and clears photoURL in Firestore.
 * @param {string} uid 
 */
export async function removeProfilePhoto(uid) {
  try {
    const storagePath = `profilePictures/${uid}/avatar`;
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef).catch((err) => {
      // Ignore not-found errors if file was never on storage
      console.info("Storage delete notice:", err.message);
    });
  } catch (e) {
    console.warn("Could not delete from storage bucket:", e);
  }

  await updatePhotoURL(uid, null);
}
