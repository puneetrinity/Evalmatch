import multer from "multer";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";
import { SecurityValidator } from "@shared/security-validation";

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

// Enhanced secure upload configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";
const TEMP_DIR = path.join(UPLOAD_DIR, "temp");
const QUARANTINE_DIR = path.join(UPLOAD_DIR, "quarantine");

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc", 
  ".docx",
  ".txt"
];

// Enhanced file size limits by type
const FILE_SIZE_LIMITS = {
  'application/pdf': 50 * 1024 * 1024, // 50MB for PDFs
  'application/msword': 25 * 1024 * 1024, // 25MB for DOC
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 25 * 1024 * 1024, // 25MB for DOCX
  'text/plain': 5 * 1024 * 1024, // 5MB for text files
  'default': 10 * 1024 * 1024 // 10MB default
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB absolute maximum

// Security patterns for enhanced detection
const DANGEROUS_PATTERNS = [
  // Script patterns
  /javascript:/gi,
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /eval\s*\(/gi,
  /document\.write/gi,
  /window\.location/gi,
  /document\.cookie/gi,
  
  // Binary patterns
  /\x4d\x5a/g, // MZ header (Windows executables)
  /\x7f\x45\x4c\x46/g, // ELF header (Linux executables) 
  /\xca\xfe\xba\xbe/g, // Mach-O header (macOS executables)
  
  // Command injection patterns
  /cmd\.exe/gi,
  /powershell/gi,
  /\/bin\/(sh|bash|zsh|fish)/gi,
  /system\(/gi,
  /exec\(/gi,
  
  // SQL injection patterns
  /(union|select|insert|update|delete|drop|create|alter)\s/gi,
  /(\x27|\'|(\x22|\"))/g, // SQL quotes
  
  // Data exfiltration patterns
  /base64,[\w+\/=]+/gi,
  /data:[\w\/]+;base64,/gi,
  /btoa\(/gi,
  /atob\(/gi,
  
  // Network patterns
  /ftp:\/\//gi,
  /file:\/\//gi,
  /mailto:/gi,
];

// Enhanced directory initialization
async function ensureUploadDirectories() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true, mode: 0o755 });
    logger.info(`Created upload directory: ${UPLOAD_DIR}`);
  }
  
  try {
    await fs.access(TEMP_DIR);
  } catch {
    await fs.mkdir(TEMP_DIR, { recursive: true, mode: 0o755 });
    logger.info(`Created temp directory: ${TEMP_DIR}`);
  }
  
  try {
    await fs.access(QUARANTINE_DIR);
  } catch {
    await fs.mkdir(QUARANTINE_DIR, { recursive: true, mode: 0o700 }); // Restricted access
    logger.info(`Created quarantine directory: ${QUARANTINE_DIR}`);
  }
}

// Initialize upload directories
ensureUploadDirectories();

// Generate secure filename with enhanced sanitization
function generateSecureFilename(originalname: string, userId: string): string {
  try {
    // Sanitize the original filename first
    const sanitizedName = SecurityValidator.sanitizeFilename(originalname);
    const ext = path.extname(sanitizedName).toLowerCase();
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString("hex");
    const hash = crypto.createHash('sha256').update(`${userId}_${timestamp}_${sanitizedName}`).digest('hex').substring(0, 8);
    
    // Enhanced secure filename with hash for uniqueness
    return `${userId}_${timestamp}_${hash}${ext}`;
  } catch (error) {
    logger.error("Error generating secure filename:", error);
    // Fallback to basic secure filename
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString("hex");
    return `${userId}_${timestamp}_${randomBytes}.bin`;
  }
}

// Enhanced file extension validation
function isValidExtension(filename: string): boolean {
  try {
    const ext = path.extname(filename).toLowerCase();
    
    // Check against allowed extensions
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return false;
    }
    
    // Additional checks for double extensions (e.g., file.pdf.exe)
    const fullName = path.basename(filename);
    const extensionCount = (fullName.match(/\./g) || []).length;
    
    // Allow only single extension or common patterns like .tar.gz
    if (extensionCount > 2) {
      return false;
    }
    
    // Check for suspicious extension combinations
    const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.com', '.pif', '.vbs', '.js', '.jar'];
    const filenameLower = filename.toLowerCase();
    
    for (const suspExt of suspiciousExtensions) {
      if (filenameLower.includes(suspExt)) {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    logger.error("Error validating file extension:", error);
    return false;
  }
}

// Enhanced security pattern detection with comprehensive scanning
async function checkForSuspiciousPatterns(filepath: string): Promise<{
  isSuspicious: boolean;
  threats: string[];
  confidence: number;
}> {
  const threats: string[] = [];
  let totalMatches = 0;
  
  try {
    const stats = await fs.stat(filepath);
    const buffer = await fs.readFile(filepath, { encoding: null, flag: "r" });
    
    // Check file size - empty files or extremely large files are suspicious
    if (stats.size === 0) {
      threats.push('Empty file');
      totalMatches++;
    }
    
    if (stats.size > MAX_FILE_SIZE) {
      threats.push('File exceeds size limit');
      totalMatches++;
    }
    
    // Convert to string for text-based pattern matching
    const textContent = buffer.toString('utf8', 0, Math.min(50000, buffer.length));
    const binaryContent = buffer.toString('binary', 0, Math.min(50000, buffer.length));
    
    // Check each dangerous pattern
    for (const pattern of DANGEROUS_PATTERNS) {
      const textMatches = (textContent.match(pattern) || []).length;
      const binaryMatches = (binaryContent.match(pattern) || []).length;
      const matches = textMatches + binaryMatches;
      
      if (matches > 0) {
        threats.push(`Suspicious pattern detected: ${pattern.source} (${matches} matches)`);
        totalMatches += matches;
      }
    }
    
    // Additional entropy check for encrypted/compressed malware
    const entropy = calculateEntropy(buffer.slice(0, Math.min(8192, buffer.length)));
    if (entropy > 7.8) { // High entropy might indicate encryption/compression
      threats.push(`High entropy detected: ${entropy.toFixed(2)}`);
      totalMatches++;
    }
    
    // Check for null bytes in text files (potential binary content)
    if (filepath.endsWith('.txt') || filepath.endsWith('.csv')) {
      const nullByteCount = (buffer.toString('binary').match(/\0/g) || []).length;
      if (nullByteCount > 10) {
        threats.push(`Excessive null bytes in text file: ${nullByteCount}`);
        totalMatches++;
      }
    }
    
    // Calculate confidence score
    const confidence = Math.min(100, (totalMatches * 20));
    const isSuspicious = confidence > 30; // Threshold for suspicious content
    
    return {
      isSuspicious,
      threats,
      confidence
    };
    
  } catch (error) {
    logger.error("Error checking for suspicious patterns:", error);
    return {
      isSuspicious: true,
      threats: ['Error during security scan'],
      confidence: 100
    };
  }
}

// Calculate Shannon entropy of data
function calculateEntropy(buffer: Buffer): number {
  const frequencies = new Array(256).fill(0);
  
  for (let i = 0; i < buffer.length; i++) {
    frequencies[buffer[i]]++;
  }
  
  let entropy = 0;
  for (const freq of frequencies) {
    if (freq > 0) {
      const probability = freq / buffer.length;
      entropy -= probability * Math.log2(probability);
    }
  }
  
  return entropy;
}

// Enhanced file content validation with comprehensive security checks
async function validateFileContent(
  filepath: string,
  mimetype: string,
): Promise<{
  isValid: boolean;
  details: string;
  securityInfo: {
    magicNumberValid: boolean;
    sizeValid: boolean;
    contentTypeConsistent: boolean;
  };
}> {
  try {
    const stats = await fs.stat(filepath);
    const buffer = await fs.readFile(filepath, { encoding: null, flag: "r" });
    const firstBytes = buffer.subarray(0, 16); // Read more bytes for better detection
    
    let magicNumberValid = false;
    let details = '';
    
    // Get file size limit for this MIME type
    const sizeLimit = FILE_SIZE_LIMITS[mimetype as keyof typeof FILE_SIZE_LIMITS] || FILE_SIZE_LIMITS.default;
    const sizeValid = stats.size <= sizeLimit && stats.size > 0;
    
    // Enhanced magic number validation
    switch (mimetype) {
      case "application/pdf":
        magicNumberValid = buffer.subarray(0, 4).toString() === "%PDF";
        if (magicNumberValid) {
          // Additional PDF validation - check for PDF version
          const pdfHeader = buffer.toString('ascii', 0, 16);
          const versionMatch = pdfHeader.match(/%PDF-(\d\.\d)/);
          if (versionMatch) {
            const version = parseFloat(versionMatch[1]);
            magicNumberValid = version >= 1.0 && version <= 2.0;
            details = `PDF version ${versionMatch[1]}`;
          }
        } else {
          details = 'Invalid PDF magic number';
        }
        break;

      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        // DOCX files are ZIP archives, check for PK signature and additional ZIP validation
        magicNumberValid = firstBytes[0] === 0x50 && firstBytes[1] === 0x4b && 
                          (firstBytes[2] === 0x03 || firstBytes[2] === 0x05);
        if (magicNumberValid) {
          // Check for DOCX-specific content structure
          const content = buffer.toString('utf8', 0, Math.min(2048, buffer.length));
          magicNumberValid = content.includes('word/') || content.includes('docx');
          details = 'Valid DOCX ZIP structure';
        } else {
          details = 'Invalid DOCX/ZIP magic number';
        }
        break;

      case "application/msword":
        // DOC files - OLE Compound Document structure
        magicNumberValid = firstBytes[0] === 0xd0 && firstBytes[1] === 0xcf &&
                          firstBytes[2] === 0x11 && firstBytes[3] === 0xe0 &&
                          firstBytes[4] === 0xa1 && firstBytes[5] === 0xb1;
        details = magicNumberValid ? 'Valid DOC OLE structure' : 'Invalid DOC magic number';
        break;

      case "text/plain": {
        // Enhanced text file validation
        const textContent = buffer.toString("utf8", 0, Math.min(4096, buffer.length));
        
        // Check for valid UTF-8 encoding
        try {
          const decoded = Buffer.from(textContent, 'utf8');
          const isValidUTF8 = decoded.toString('utf8') === textContent;
          
          if (isValidUTF8) {
            // Check character distribution
            const printableCount = textContent.split("").filter((c) => {
              const code = c.charCodeAt(0);
              return (code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13;
            }).length;
            
            const printableRatio = printableCount / textContent.length;
            const hasText = textContent.trim().length > 0;
            const nullByteCount = (buffer.toString('binary').match(/\0/g) || []).length;
            
            magicNumberValid = printableRatio > 0.7 && hasText && nullByteCount < 10;
            details = `Text file: ${(printableRatio * 100).toFixed(1)}% printable, ${nullByteCount} null bytes`;
          } else {
            magicNumberValid = false;
            details = 'Invalid UTF-8 encoding';
          }
        } catch (error) {
          magicNumberValid = false;
          details = 'Text encoding validation failed';
        }
        break;
      }

      default:
        magicNumberValid = false;
        details = `Unsupported MIME type: ${mimetype}`;
    }

    // Additional security check using SecurityValidator
    const contentTypeConsistent = SecurityValidator.validateFileContent(buffer, mimetype, sizeLimit);
    
    const isValid = magicNumberValid && sizeValid && contentTypeConsistent;
    
    return {
      isValid,
      details,
      securityInfo: {
        magicNumberValid,
        sizeValid,
        contentTypeConsistent
      }
    };
    
  } catch (error) {
    logger.error("Error validating file content:", error);
    return {
      isValid: false,
      details: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      securityInfo: {
        magicNumberValid: false,
        sizeValid: false,
        contentTypeConsistent: false
      }
    };
  }
}

// Quarantine suspicious files
async function quarantineFile(filepath: string, reason: string, userId?: string): Promise<void> {
  try {
    const filename = path.basename(filepath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const quarantinePath = path.join(QUARANTINE_DIR, `${timestamp}_${userId || 'unknown'}_${filename}`);
    
    await fs.rename(filepath, quarantinePath);
    
    // Create metadata file
    const metadata = {
      originalPath: filepath,
      quarantinedAt: new Date().toISOString(),
      reason,
      userId: userId || 'unknown',
      filesize: (await fs.stat(quarantinePath)).size
    };
    
    await fs.writeFile(quarantinePath + '.metadata', JSON.stringify(metadata, null, 2));
    
    logger.warn(`File quarantined: ${filename}`, {
      reason,
      userId,
      quarantinePath
    });
  } catch (error) {
    logger.error("Failed to quarantine file:", error);
    // If quarantine fails, delete the file
    try {
      await fs.unlink(filepath);
    } catch (deleteError) {
      logger.error("Failed to delete file after quarantine failure:", deleteError);
    }
  }
}

// Enhanced secure multer storage with comprehensive validation
const secureStorage = multer.diskStorage({
  destination: async function (req, file, cb) {
    try {
      await ensureUploadDirectories();
      // Use temp directory first for security scanning
      cb(null, TEMP_DIR);
    } catch (error) {
      cb(error as Error, "");
    }
  },
  filename: function (req, file, cb) {
    // Ensure user is authenticated
    if (!req.user?.uid) {
      return cb(new Error("User not authenticated"), "");
    }

    // Enhanced filename validation
    if (!isValidExtension(file.originalname)) {
      return cb(new Error("Invalid file extension"), "");
    }

    // Check file size against type-specific limits
    const sizeLimit = FILE_SIZE_LIMITS[file.mimetype as keyof typeof FILE_SIZE_LIMITS] || FILE_SIZE_LIMITS.default;
    if (file.size && file.size > sizeLimit) {
      return cb(new Error(`File size exceeds limit for ${file.mimetype}`), "");
    }

    try {
      // Generate secure filename with enhanced validation
      const secureFilename = generateSecureFilename(file.originalname, req.user.uid);
      cb(null, secureFilename);
    } catch (error) {
      cb(error as Error, "");
    }
  },
});

// Enhanced secure multer instance with strict validation
export const secureUpload = multer({
  storage: secureStorage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only allow one file at a time for security
    fieldSize: 1024 * 1024, // 1MB for field data
    fieldNameSize: 100, // Limit field name length
    fields: 10, // Limit number of fields
  },
  fileFilter: (req, file, cb) => {
    try {
      // Strict MIME type whitelist (removed image types for resume-only uploads)
      const allowedMimeTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/plain",
      ];

      // Check MIME type
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(
          new Error("Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed for resume uploads."),
        );
      }

      // Enhanced filename validation
      if (!isValidExtension(file.originalname)) {
        return cb(new Error("Invalid or suspicious file extension"));
      }

      // Check for suspicious filename patterns
      const filename = file.originalname.toLowerCase();
      const suspiciousNames = [
        'index.', 'default.', 'admin.', 'root.', 'config.', 'setup.',
        'install.', 'update.', 'backup.', 'temp.', 'tmp.', 'test.'
      ];
      
      for (const suspName of suspiciousNames) {
        if (filename.startsWith(suspName)) {
          return cb(new Error("Suspicious filename detected"));
        }
      }

      // Check file size against type-specific limits
      const sizeLimit = FILE_SIZE_LIMITS[file.mimetype as keyof typeof FILE_SIZE_LIMITS] || FILE_SIZE_LIMITS.default;
      if (file.size && file.size > sizeLimit) {
        return cb(new Error(`File size ${Math.round(file.size / 1024 / 1024)}MB exceeds limit of ${Math.round(sizeLimit / 1024 / 1024)}MB`));
      }

      // Rate limiting per user
      const userId = req.user?.uid;
      if (userId) {
        const rateLimitKey = `upload:${userId}`;
        if (!SecurityValidator.checkRateLimit(rateLimitKey, 10, 60000)) { // 10 uploads per minute
          return cb(new Error("Upload rate limit exceeded. Please wait before uploading more files."));
        }
      }

      logger.info("File passed initial validation", {
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        userId: req.user?.uid
      });

      cb(null, true);
    } catch (error) {
      logger.error("File filter error:", error);
      cb(error as Error);
    }
  },
});

// Enhanced post-upload validation middleware with comprehensive security scanning
export async function validateUploadedFile(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.file) {
    return next();
  }

  const startTime = Date.now();
  const userId = req.user?.uid;
  
  try {
    logger.info("Starting comprehensive file validation", {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      userId
    });

    // Step 1: Comprehensive content validation
    const contentValidation = await validateFileContent(req.file.path, req.file.mimetype);

    if (!contentValidation.isValid) {
      await quarantineFile(req.file.path, `Content validation failed: ${contentValidation.details}`, userId);
      
      logger.warn("File failed content validation", {
        userId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        details: contentValidation.details,
        securityInfo: contentValidation.securityInfo
      });

      return res.status(400).json({
        error: "Invalid file content",
        message: "File content validation failed",
        code: "CONTENT_VALIDATION_FAILED"
      });
    }

    // Step 2: Enhanced security pattern detection
    const securityScan = await checkForSuspiciousPatterns(req.file.path);
    
    if (securityScan.isSuspicious) {
      await quarantineFile(req.file.path, `Security scan failed: ${securityScan.threats.join(', ')}`, userId);
      
      logger.error("SECURITY ALERT: Suspicious file upload detected", {
        userId,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        threats: securityScan.threats,
        confidence: securityScan.confidence,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      });

      return res.status(400).json({
        error: "Security validation failed",
        message: "File contains potentially dangerous content",
        code: "SECURITY_SCAN_FAILED"
      });
    }

    // Step 3: Move file from temp to upload directory after validation
    const finalPath = path.join(UPLOAD_DIR, req.file.filename);
    await fs.rename(req.file.path, finalPath);
    req.file.path = finalPath; // Update path for downstream processing

    // Step 4: Add comprehensive security metadata
    req.file.securityChecked = true;
    req.file.uploadedBy = userId;
    req.file.uploadedAt = new Date().toISOString();
    
    // Add custom properties for detailed security info
    (req.file as any).securityInfo = {
      contentValidation: contentValidation.securityInfo,
      securityScan: {
        confidence: securityScan.confidence,
        threatsDetected: securityScan.threats.length,
        scanTime: Date.now() - startTime
      },
      validatedAt: new Date().toISOString()
    };

    const processingTime = Date.now() - startTime;
    
    // Log successful upload with comprehensive audit trail
    logger.info("File upload validation successful", {
      userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      securityChecked: true,
      uploadedAt: req.file.uploadedAt,
      processingTimeMs: processingTime,
      contentValidation: contentValidation.details,
      securityConfidence: 100 - securityScan.confidence, // Inverted confidence (higher is better)
      finalPath
    });

    // Performance monitoring
    if (processingTime > 5000) {
      logger.warn("Slow file validation detected", {
        userId,
        filename: req.file.filename,
        processingTimeMs: processingTime
      });
    }

    next();
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error("File validation error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      processingTimeMs: processingTime
    });

    // Quarantine file on validation error for investigation
    if (req.file?.path) {
      try {
        await quarantineFile(req.file.path, `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`, userId);
      } catch (quarantineError) {
        logger.error("Failed to quarantine file after validation error:", quarantineError);
      }
    }

    return res.status(500).json({
      error: "File validation failed",
      message: "Unable to complete security validation",
      code: "VALIDATION_ERROR"
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
