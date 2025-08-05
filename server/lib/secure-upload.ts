import multer from "multer";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

// Extend the File interface to include security metadata
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        securityChecked?: boolean;
        uploadedBy?: string;
        uploadedAt?: string;
      }
    }
  }
}

// Secure upload directory configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".jpg",
  ".jpeg",
  ".png",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Ensure upload directory exists
async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    logger.info(`Created upload directory: ${UPLOAD_DIR}`);
  }
}

// Initialize upload directory
ensureUploadDir();

// Generate secure filename with sanitization
function generateSecureFilename(originalname: string, userId: string): string {
  const ext = path.extname(originalname).toLowerCase();
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString("hex");
  // Include user ID for better organization and security
  return `${userId}_${timestamp}_${randomBytes}${ext}`;
}

// Validate file extension
function isValidExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext);
}

// Check for suspicious file patterns (basic malware detection)
async function checkForSuspiciousPatterns(filepath: string): Promise<boolean> {
  try {
    const buffer = await fs.readFile(filepath, { encoding: null, flag: "r" });
    const content = buffer.toString('utf8', 0, Math.min(10000, buffer.length));
    
    // Common malicious patterns to detect
    const suspiciousPatterns = [
      /javascript:/i,
      /<script/i,
      /eval\(/i,
      /document\.write/i,
      /\.exe\b/i,
      /cmd\.exe/i,
      /powershell/i,
      /base64,/i,
      /vbscript/i,
      /activex/i,
    ];
    
    return suspiciousPatterns.some(pattern => pattern.test(content));
  } catch (error) {
    logger.warn("Error checking for suspicious patterns:", error);
    return false; // If we can't read, assume safe but log warning
  }
}

// File content validation (magic number checking)
async function validateFileContent(
  filepath: string,
  mimetype: string,
): Promise<boolean> {
  try {
    const buffer = await fs.readFile(filepath, { encoding: null, flag: "r" });
    const firstBytes = buffer.subarray(0, 8);

    // Check magic numbers (file signatures)
    switch (mimetype) {
      case "application/pdf":
        // PDF files start with %PDF
        return buffer.subarray(0, 4).toString() === "%PDF";

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        // DOCX files are ZIP archives, check for PK signature
        return firstBytes[0] === 0x50 && firstBytes[1] === 0x4b;

      case "application/msword":
        // DOC files start with D0 CF 11 E0 A1 B1 1A E1 (OLE Compound Document)
        return (
          firstBytes[0] === 0xd0 &&
          firstBytes[1] === 0xcf &&
          firstBytes[2] === 0x11 &&
          firstBytes[3] === 0xe0
        );

      case "image/jpeg":
        // JPEG files start with FF D8 FF
        return (
          firstBytes[0] === 0xff &&
          firstBytes[1] === 0xd8 &&
          firstBytes[2] === 0xff
        );

      case "image/png":
        // PNG files start with 89 50 4E 47 0D 0A 1A 0A
        return (
          firstBytes[0] === 0x89 &&
          firstBytes[1] === 0x50 &&
          firstBytes[2] === 0x4e &&
          firstBytes[3] === 0x47
        );

      case "text/plain": {
        // Text files should contain readable ASCII/UTF-8 content
        const textContent = buffer.toString(
          "utf8",
          0,
          Math.min(1000, buffer.length),
        );
        // Check if content is mostly printable characters
        const printableRatio =
          textContent.split("").filter((c) => {
            const code = c.charCodeAt(0);
            return (
              (code >= 32 && code <= 126) ||
              code === 9 ||
              code === 10 ||
              code === 13
            );
          }).length / textContent.length;
        return printableRatio > 0.8 && textContent.length > 0;
      }

      default:
        return false;
    }
  } catch (error) {
    logger.error("Error validating file content:", error);
    return false;
  }
}

// Configure secure multer storage
const secureStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      await ensureUploadDir();
      cb(null, UPLOAD_DIR);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: function (req, file, cb) {
    // Ensure user is authenticated
    if (!req.user?.uid) {
      return cb(new Error("User not authenticated"), "");
    }

    // Validate extension
    if (!isValidExtension(file.originalname)) {
      return cb(new Error("Invalid file extension"), "");
    }

    // Generate secure filename
    const secureFilename = generateSecureFilename(
      file.originalname,
      req.user.uid,
    );
    cb(null, secureFilename);
  },
});

// Create secure multer instance
export const secureUpload = multer({
  storage: secureStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only allow one file at a time
    fieldSize: 1024 * 1024, // 1MB for field data
  },
  fileFilter: (req, file, cb) => {
    // Check MIME type whitelist
    const allowedMimeTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword", // Support for .doc files
      "text/plain",
      "image/jpeg",
      "image/png",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Invalid file type. Only PDF, DOC, DOCX, TXT, JPEG and PNG files are allowed.",
        ),
      );
    }

    // Additional extension validation
    if (!isValidExtension(file.originalname)) {
      return cb(new Error("Invalid file extension"));
    }

    cb(null, true);
  },
});

// Post-upload validation middleware
export async function validateUploadedFile(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.file) {
    return next();
  }

  try {
    // Validate file content matches MIME type
    const isValid = await validateFileContent(req.file.path, req.file.mimetype);

    if (!isValid) {
      // Delete the file if validation fails
      await fs.unlink(req.file.path);
      logger.warn(`Deleted invalid file upload attempt: ${req.file.filename}`, {
        userId: req.user?.uid,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });

      return res.status(400).json({
        error: "Invalid file content",
        message: "File content does not match the declared file type",
      });
    }
    
    // Check for suspicious patterns
    const hasSuspiciousPatterns = await checkForSuspiciousPatterns(req.file.path);
    
    if (hasSuspiciousPatterns) {
      // Delete the file and log security incident
      await fs.unlink(req.file.path);
      logger.error(`SECURITY: Suspicious file upload detected and blocked`, {
        userId: req.user?.uid,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(400).json({
        error: "Security validation failed",
        message: "File contains potentially malicious content",
      });
    }

    // Add security metadata
    req.file.securityChecked = true;
    req.file.uploadedBy = req.user?.uid;
    req.file.uploadedAt = new Date().toISOString();
    
    // Log successful upload for audit purposes
    logger.info(`File upload successful`, {
      userId: req.user?.uid,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      securityChecked: true,
      uploadedAt: req.file.uploadedAt
    });

    next();
  } catch (error) {
    logger.error("File validation error:", error);

    // Try to clean up the file
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error("Failed to delete invalid file:", unlinkError);
      }
    }

    return res.status(500).json({
      error: "File validation failed",
      message: "Unable to validate uploaded file",
    });
  }
}

// Cleanup old uploads (run periodically)
export async function cleanupOldUploads(maxAgeHours: number = 24) {
  try {
    const files = await fs.readdir(UPLOAD_DIR);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    for (const file of files) {
      const filepath = path.join(UPLOAD_DIR, file);
      const stats = await fs.stat(filepath);

      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filepath);
        logger.info(`Cleaned up old upload: ${file}`);
      }
    }
  } catch (error) {
    logger.error("Error cleaning up old uploads:", error);
  }
}
