/**
 * File Validation Utilities
 *
 * Validates uploaded files by checking magic bytes (file signatures)
 * in addition to file extensions.
 */

import * as fs from "fs/promises";
import { getLogger } from "@utils/logger";

const logger = getLogger("FileValidation");

/**
 * Known file type signatures (magic bytes)
 */
interface FileSignature {
  /** File extension */
  extension: string;
  /** MIME type */
  mimeType: string;
  /** Magic bytes at start of file (hex) */
  signature: number[];
  /** Offset from start of file */
  offset?: number;
}

/**
 * GPX files are XML-based and should start with XML declaration or gpx tag
 * We check for common XML/GPX patterns
 */
const GPX_SIGNATURES: FileSignature[] = [
  {
    extension: ".gpx",
    mimeType: "application/gpx+xml",
    // <?xml (UTF-8)
    signature: [0x3c, 0x3f, 0x78, 0x6d, 0x6c],
    offset: 0,
  },
  {
    extension: ".gpx",
    mimeType: "application/gpx+xml",
    // <gpx (direct start)
    signature: [0x3c, 0x67, 0x70, 0x78],
    offset: 0,
  },
  {
    extension: ".gpx",
    mimeType: "application/gpx+xml",
    // UTF-8 BOM + <?xml
    signature: [0xef, 0xbb, 0xbf, 0x3c, 0x3f, 0x78, 0x6d, 0x6c],
    offset: 0,
  },
];

/**
 * Result of file validation
 */
export interface FileValidationResult {
  /** Whether the file is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Detected file type */
  detectedType?: string;
}

/**
 * Validate a file's content matches its claimed type
 *
 * @param filePath - Path to the file to validate
 * @param expectedExtension - Expected file extension (e.g., ".gpx")
 * @returns Validation result
 */
export async function validateFileType(
  filePath: string,
  expectedExtension: string,
): Promise<FileValidationResult> {
  try {
    // Read first 1KB of file for signature checking
    const handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, 1024, 0);
    await handle.close();

    if (bytesRead === 0) {
      return {
        valid: false,
        error: "File is empty",
      };
    }

    const headerBytes = buffer.subarray(0, bytesRead);

    // Check based on expected extension
    if (expectedExtension.toLowerCase() === ".gpx") {
      return validateGPXContent(headerBytes);
    }

    // Unknown extension - allow by default
    logger.debug(
      `Unknown extension ${expectedExtension}, skipping content validation`,
    );
    return { valid: true };
  } catch (error) {
    logger.error("File validation error:", error);
    return {
      valid: false,
      error: "Failed to read file for validation",
    };
  }
}

/**
 * Validate GPX file content
 *
 * GPX files are XML documents that should:
 * 1. Start with XML declaration or <gpx tag
 * 2. Contain valid XML structure
 * 3. Have <gpx root element
 */
function validateGPXContent(headerBytes: Buffer): FileValidationResult {
  // Convert to string for text-based checking
  const content = headerBytes.toString("utf-8").trim();

  // Check for XML declaration or gpx tag
  const hasXmlDeclaration = content.startsWith("<?xml");
  const hasGpxTag = content.includes("<gpx");

  // Handle BOM
  const hasBOM =
    headerBytes[0] === 0xef &&
    headerBytes[1] === 0xbb &&
    headerBytes[2] === 0xbf;
  const contentWithoutBOM = hasBOM ? content.substring(1) : content;

  // Check magic bytes
  let matchesSignature = false;
  for (const sig of GPX_SIGNATURES) {
    const offset = sig.offset || 0;
    let matches = true;
    for (let i = 0; i < sig.signature.length; i++) {
      if (headerBytes[offset + i] !== sig.signature[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      matchesSignature = true;
      break;
    }
  }

  // Validate content structure
  if (
    !matchesSignature &&
    !hasXmlDeclaration &&
    !contentWithoutBOM.startsWith("<gpx")
  ) {
    return {
      valid: false,
      error: "File does not appear to be a valid XML/GPX document",
      detectedType: detectFileType(headerBytes),
    };
  }

  if (!hasGpxTag) {
    return {
      valid: false,
      error: "File does not contain a <gpx> element",
      detectedType: "xml",
    };
  }

  // Check for suspicious content that shouldn't be in a GPX file
  const suspiciousPatterns = [
    /<script/i,
    /<html/i,
    /javascript:/i,
    /data:text\/html/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(content)) {
      return {
        valid: false,
        error: "File contains suspicious content not expected in a GPX file",
      };
    }
  }

  return {
    valid: true,
    detectedType: "gpx",
  };
}

/**
 * Detect file type from magic bytes
 */
function detectFileType(bytes: Buffer): string {
  // Check common file signatures
  const signatures: Array<{ name: string; sig: number[] }> = [
    { name: "png", sig: [0x89, 0x50, 0x4e, 0x47] },
    { name: "jpg", sig: [0xff, 0xd8, 0xff] },
    { name: "gif", sig: [0x47, 0x49, 0x46, 0x38] },
    { name: "pdf", sig: [0x25, 0x50, 0x44, 0x46] },
    { name: "zip", sig: [0x50, 0x4b, 0x03, 0x04] },
    { name: "gzip", sig: [0x1f, 0x8b] },
    { name: "rar", sig: [0x52, 0x61, 0x72, 0x21] },
    { name: "exe", sig: [0x4d, 0x5a] },
  ];

  for (const { name, sig } of signatures) {
    let matches = true;
    for (let i = 0; i < sig.length; i++) {
      if (bytes[i] !== sig[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return name;
    }
  }

  // Check if it looks like text/XML
  const textContent = bytes.toString("utf-8", 0, Math.min(100, bytes.length));
  // eslint-disable-next-line no-control-regex -- Intentionally checking for ASCII/extended ASCII byte range
  if (/^[\x00-\x7F\xC0-\xFF]*$/.test(textContent.substring(0, 50))) {
    if (textContent.includes("<?xml") || textContent.includes("<?XML")) {
      return "xml";
    }
    if (textContent.includes("<html") || textContent.includes("<HTML")) {
      return "html";
    }
    if (textContent.includes("{") || textContent.includes("[")) {
      return "json";
    }
    return "text";
  }

  return "binary";
}

/**
 * Validate uploaded file with comprehensive checks
 *
 * @param file - Multer file object
 * @param allowedExtensions - List of allowed extensions (e.g., [".gpx"])
 * @param maxSizeBytes - Maximum file size in bytes
 * @returns Validation result
 */
export async function validateUploadedFile(
  file: Express.Multer.File,
  allowedExtensions: string[],
  maxSizeBytes: number,
): Promise<FileValidationResult> {
  // Check file size
  if (file.size > maxSizeBytes) {
    const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size exceeds maximum allowed size of ${maxSizeMB} MB`,
    };
  }

  // Check extension
  const ext = getFileExtension(file.originalname);
  const normalizedExt = ext.toLowerCase();
  const isAllowedExtension = allowedExtensions.some(
    (allowed) => allowed.toLowerCase() === normalizedExt,
  );

  if (!isAllowedExtension) {
    return {
      valid: false,
      error: `File type ${ext || "(none)"} is not allowed. Allowed types: ${allowedExtensions.join(", ")}`,
    };
  }

  // Validate file content matches extension
  const contentValidation = await validateFileType(file.path, normalizedExt);

  return contentValidation;
}

/**
 * Get file extension from filename
 */
function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1) {
    return "";
  }
  return filename.substring(lastDot);
}
