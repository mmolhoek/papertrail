import { Request, Response } from "express";
import * as fs from "fs/promises";
import * as path from "path";
import { IMapService, IConfigService, IMapSnapService } from "@core/interfaces";
import { isSuccess } from "@core/types";
import { getLogger } from "@utils/logger";
import { validateUploadedFile } from "@web/validation";
import { isNodeJSErrnoException } from "@utils/typeGuards";
import { MapSnapError } from "@core/errors";

const logger = getLogger("TrackController");

/**
 * Track Controller
 *
 * Handles GPX track file management endpoints including listing,
 * uploading, deleting, and getting track information.
 */
export class TrackController {
  constructor(
    private readonly mapService?: IMapService,
    private readonly configService?: IConfigService,
    private readonly mapSnapService?: IMapSnapService,
    private readonly gpxDirectory: string = "./data/gpx-files",
  ) {}

  /**
   * Get list of available GPX files
   */
  async getGPXFiles(_req: Request, res: Response): Promise<void> {
    logger.debug("GPX files list requested");

    if (!this.mapService) {
      logger.warn("MapService not available");
      res.json({
        success: true,
        data: {
          files: [],
        },
      });
      return;
    }

    const result = await this.mapService.getGPXFileInfo();

    if (isSuccess(result)) {
      logger.debug(`Found ${result.data.length} GPX files`);
      res.json({
        success: true,
        data: {
          files: result.data.map((info) => {
            // Always use filename as display name (user controls naming via upload)
            const displayName = info.fileName.replace(/\.gpx$/i, "");
            return {
              path: info.path,
              fileName: info.fileName,
              trackName: displayName,
              trackCount: info.trackCount,
              pointCount: info.pointCount,
              totalDistance: info.totalDistance,
              waypointCount: info.waypointCount,
              fileSize: info.fileSize,
              lastModified: info.lastModified,
            };
          }),
        },
      });
    } else {
      // No GPX files is not an error - return empty array
      logger.debug("No GPX files found or error occurred");
      res.json({
        success: true,
        data: {
          files: [],
        },
      });
    }
  }

  /**
   * Get starting point of active track
   * Used as fallback when GPS and browser geolocation are unavailable
   */
  async getActiveTrackStart(_req: Request, res: Response): Promise<void> {
    logger.debug("Active track starting point requested");

    if (!this.mapService) {
      logger.warn("MapService not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Map service not available",
        },
      });
      return;
    }

    if (!this.configService) {
      logger.warn("ConfigService not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Config service not available",
        },
      });
      return;
    }

    const activeGPXPath = this.configService.getActiveGPXPath();

    if (!activeGPXPath) {
      logger.debug("No active track set");
      res.json({
        success: true,
        data: {
          startPoint: null,
          message: "No active track set",
        },
      });
      return;
    }

    const trackResult = await this.mapService.getTrack(activeGPXPath);

    if (!isSuccess(trackResult)) {
      logger.error("Failed to load track:", trackResult.error);
      res.status(500).json({
        success: false,
        error: {
          code: "TRACK_LOAD_FAILED",
          message: "Failed to load track data",
        },
      });
      return;
    }

    const track = trackResult.data;

    // Get first point from first segment
    if (
      track.segments &&
      track.segments.length > 0 &&
      track.segments[0].points &&
      track.segments[0].points.length > 0
    ) {
      const firstPoint = track.segments[0].points[0];
      logger.debug(
        `Active track starting point: ${firstPoint.latitude}, ${firstPoint.longitude}`,
      );
      res.json({
        success: true,
        data: {
          startPoint: {
            lat: firstPoint.latitude,
            lon: firstPoint.longitude,
            altitude: firstPoint.altitude,
          },
          trackName: track.name,
        },
      });
    } else {
      logger.warn("Active track has no points");
      res.json({
        success: true,
        data: {
          startPoint: null,
          message: "Active track has no points",
        },
      });
    }
  }

  /**
   * Upload a GPX file
   * Expects multipart form data with a 'gpxFile' field
   */
  async uploadGPXFile(req: Request, res: Response): Promise<void> {
    logger.info("GPX file upload requested");

    if (!req.file) {
      logger.warn("Upload requested without file");
      res.status(400).json({
        success: false,
        error: {
          code: "NO_FILE",
          message: "No file was uploaded",
        },
      });
      return;
    }

    const file = req.file;
    const originalName = file.originalname;
    const customName = req.body.trackName as string | undefined;

    // Validate file using comprehensive validation (extension + magic bytes)
    const fileValidation = await validateUploadedFile(
      file,
      [".gpx"],
      10 * 1024 * 1024, // 10 MB max (matches multer config)
    );

    if (!fileValidation.valid) {
      logger.warn(
        `File validation failed for ${originalName}: ${fileValidation.error}`,
      );
      // Clean up uploaded file
      try {
        await fs.unlink(file.path);
      } catch {
        // Ignore cleanup errors
      }
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_FILE_TYPE",
          message: fileValidation.error || "Invalid file type",
          detectedType: fileValidation.detectedType,
        },
      });
      return;
    }

    try {
      // Ensure GPX directory exists
      await fs.mkdir(this.gpxDirectory, { recursive: true });

      // Validate the GPX file first (while still in temp location)
      if (this.mapService) {
        const validationResult = await this.mapService.validateGPXFile(
          file.path,
        );
        if (!validationResult.success) {
          await fs.unlink(file.path);
          logger.warn(`Invalid GPX file uploaded: ${originalName}`);
          res.status(400).json({
            success: false,
            error: {
              code: "INVALID_GPX",
              message: "The uploaded file is not a valid GPX file",
            },
          });
          return;
        }
      }

      // Determine the filename to use
      let baseName: string;
      if (customName) {
        // User provided a custom name (or chose to use filename)
        baseName = customName.replace(/[^a-zA-Z0-9._-]/g, "_");
      } else if (this.mapService) {
        // User chose to use track name from GPX file
        const trackResult = await this.mapService.getTrack(file.path);
        if (
          trackResult.success &&
          trackResult.data.name &&
          trackResult.data.name !== "Unnamed Track"
        ) {
          baseName = trackResult.data.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        } else {
          // Fall back to original filename if no track name
          baseName = originalName
            .replace(/\.gpx$/i, "")
            .replace(/[^a-zA-Z0-9._-]/g, "_");
        }
      } else {
        // No mapService, use original filename
        baseName = originalName
          .replace(/\.gpx$/i, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");
      }

      const safeFileName = baseName.endsWith(".gpx")
        ? baseName
        : `${baseName}.gpx`;
      const destPath = path.join(this.gpxDirectory, safeFileName);

      // Check if file already exists
      try {
        await fs.access(destPath);
        // File exists - remove uploaded temp file and return error
        await fs.unlink(file.path);
        res.status(409).json({
          success: false,
          error: {
            code: "FILE_EXISTS",
            message: `A file named "${safeFileName}" already exists`,
          },
        });
        return;
      } catch {
        // File doesn't exist, proceed
      }

      // Move file from temp location to GPX directory
      await fs.copyFile(file.path, destPath);
      await fs.unlink(file.path);

      // Clear cache to pick up the new file
      if (this.mapService) {
        this.mapService.clearCache();
      }

      // Get track info for point count, distance, and waypoints
      let pointCount = 0;
      let totalDistance = 0;
      let waypointCount = 0;
      if (this.mapService) {
        const fileResult = await this.mapService.loadGPXFile(destPath);
        if (fileResult.success) {
          const gpxFile = fileResult.data;
          if (gpxFile.tracks[0]?.segments[0]) {
            pointCount = gpxFile.tracks[0].segments[0].points.length;
            totalDistance = this.mapService.calculateDistance(
              gpxFile.tracks[0],
            );
          }
          waypointCount = gpxFile.waypoints?.length || 0;
        }
      }

      logger.info(
        `GPX file uploaded successfully: ${safeFileName} (${pointCount} points, ${totalDistance.toFixed(0)}m, ${waypointCount} waypoints)`,
      );
      res.json({
        success: true,
        message: "File uploaded successfully",
        data: {
          fileName: safeFileName,
          path: destPath,
          trackName: baseName,
          pointCount,
          totalDistance,
          waypointCount,
        },
      });
    } catch (error) {
      logger.error("Failed to upload GPX file:", error);
      // Try to clean up the temp file
      try {
        await fs.unlink(file.path);
      } catch {
        // Ignore cleanup errors
      }
      res.status(500).json({
        success: false,
        error: {
          code: "UPLOAD_FAILED",
          message: "Failed to upload file",
        },
      });
    }
  }

  /**
   * Delete a GPX file
   */
  async deleteGPXFile(req: Request, res: Response): Promise<void> {
    const fileName = req.params.fileName;

    if (!fileName) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "File name is required",
        },
      });
      return;
    }

    logger.info(`GPX file deletion requested: ${fileName}`);

    // Validate file extension
    if (!fileName.toLowerCase().endsWith(".gpx")) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_FILE_TYPE",
          message: "Only .gpx files can be deleted through this endpoint",
        },
      });
      return;
    }

    // Sanitize filename to prevent path traversal
    const safeName = path.basename(fileName);
    const filePath = path.join(this.gpxDirectory, safeName);

    try {
      // Check if file exists
      await fs.access(filePath);

      // Delete the file
      await fs.unlink(filePath);

      // Clear cache if mapService is available
      if (this.mapService) {
        this.mapService.clearCache();
      }

      logger.info(`GPX file deleted: ${safeName}`);
      res.json({
        success: true,
        message: "File deleted successfully",
      });
    } catch (error) {
      if (isNodeJSErrnoException(error) && error.code === "ENOENT") {
        res.status(404).json({
          success: false,
          error: {
            code: "FILE_NOT_FOUND",
            message: "File not found",
          },
        });
      } else {
        logger.error("Failed to delete GPX file:", error);
        res.status(500).json({
          success: false,
          error: {
            code: "DELETE_FAILED",
            message: "Failed to delete file",
          },
        });
      }
    }
  }

  /**
   * Snap active track to road network
   * Uses OSRM map matching to align GPS points to actual roads
   */
  async snapActiveTrack(req: Request, res: Response): Promise<void> {
    logger.info("Track snap requested");

    if (!this.mapSnapService) {
      logger.warn("MapSnapService not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Map snap service not available",
        },
      });
      return;
    }

    if (!this.mapService) {
      logger.warn("MapService not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Map service not available",
        },
      });
      return;
    }

    if (!this.configService) {
      logger.warn("ConfigService not available");
      res.status(503).json({
        success: false,
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Config service not available",
        },
      });
      return;
    }

    const activeGPXPath = this.configService.getActiveGPXPath();

    if (!activeGPXPath) {
      logger.warn("No active track set for snapping");
      res.status(400).json({
        success: false,
        error: {
          code: "NO_ACTIVE_TRACK",
          message: "No active track set. Please load a track first.",
        },
      });
      return;
    }

    // Get routing profile from request or config
    const profile =
      (req.body.profile as "car" | "bike" | "foot") ||
      this.configService.getRoutingProfile();

    try {
      // Initialize snap service if needed
      const initResult = await this.mapSnapService.initialize();
      if (!initResult.success) {
        throw initResult.error;
      }

      // Load the active track
      const trackResult = await this.mapService.getTrack(activeGPXPath);
      if (!trackResult.success) {
        logger.error("Failed to load track for snapping:", trackResult.error);
        res.status(500).json({
          success: false,
          error: {
            code: "TRACK_LOAD_FAILED",
            message: "Failed to load track data",
          },
        });
        return;
      }

      const track = trackResult.data;
      logger.info(
        `Snapping track "${track.name}" with ${track.segments.reduce((sum, s) => sum + s.points.length, 0)} points using ${profile} profile`,
      );

      // Perform the snap operation
      const snapResult = await this.mapSnapService.snapTrack(track, profile);

      if (!snapResult.success) {
        const error = snapResult.error;
        logger.error("Snap operation failed:", error);

        if (error instanceof MapSnapError) {
          res.status(400).json({
            success: false,
            error: {
              code: error.code,
              message: error.message,
            },
          });
        } else {
          res.status(500).json({
            success: false,
            error: {
              code: "SNAP_FAILED",
              message: "Failed to snap track to roads",
            },
          });
        }
        return;
      }

      const result = snapResult.data;
      logger.info(
        `Track snapped successfully: ${result.snappedPoints.length} points matched, ${result.unmatchedCount} unmatched, avg confidence: ${result.averageConfidence.toFixed(2)}`,
      );

      res.json({
        success: true,
        data: {
          snappedPoints: result.snappedPoints,
          geometry: result.geometry,
          matchedDistance: result.matchedDistance,
          averageConfidence: result.averageConfidence,
          unmatchedCount: result.unmatchedCount,
          originalPointCount: track.segments.reduce(
            (sum, s) => sum + s.points.length,
            0,
          ),
        },
      });
    } catch (error) {
      logger.error("Unexpected error during track snap:", error);
      res.status(500).json({
        success: false,
        error: {
          code: "SNAP_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unexpected error occurred",
        },
      });
    }
  }
}
