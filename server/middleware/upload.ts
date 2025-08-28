/**
 * Upload Middleware
 * Re-exports secure upload functionality from lib/secure-upload
 */

export {
  secureUpload,
  validateUploadedFile,
  cleanupOldUploads,
} from "../lib/secure-upload";
