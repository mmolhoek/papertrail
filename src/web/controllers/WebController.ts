import { Request, Response } from "express";
import { IRenderingOrchestrator } from "@core/interfaces";
import { isSuccess } from "@core/types";
import { WebError } from "core/errors";

/**
 * Web Controller
 *
 * Handles HTTP requests and connects them to the orchestrator.
 * Acts as the integration layer between the web interface and business logic.
 */
export class WebController {
  constructor(private readonly orchestrator: IRenderingOrchestrator) {}

  /**
   * Health check endpoint
   */
  async getHealth(_req: Request, res: Response): Promise<void> {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current GPS position
   */
  async getGPSPosition(_req: Request, res: Response): Promise<void> {
    const result = await this.orchestrator.getCurrentPosition();

    if (isSuccess(result)) {
      res.json({
        success: true,
        data: {
          latitude: result.data.latitude,
          longitude: result.data.longitude,
          altitude: result.data.altitude,
          timestamp: result.data.timestamp,
          accuracy: result.data.accuracy,
          speed: result.data.speed,
          bearing: result.data.bearing,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Get GPS status
   */
  async getGPSStatus(_req: Request, res: Response): Promise<void> {
    const result = await this.orchestrator.getSystemStatus();

    if (isSuccess(result)) {
      res.json({
        success: true,
        data: {
          connected: result.data.gps.connected,
          tracking: result.data.gps.tracking,
          satellitesInUse: result.data.gps.satellitesInUse,
          lastUpdate: result.data.gps.lastUpdate,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Get list of available GPX files
   */
  async getGPXFiles(_req: Request, res: Response): Promise<void> {
    // This will be implemented when MapService is available
    // For now, return placeholder
    res.json({
      success: true,
      data: {
        files: [],
      },
    });
  }

  /**
   * Get active GPX file
   */
  async getActiveGPX(_req: Request, res: Response): Promise<void> {
    const result = await this.orchestrator.getSystemStatus();

    if (isSuccess(result)) {
      res.json({
        success: true,
        data: {
          active: result.data.activeTrack || null,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Set active GPX file
   */
  async setActiveGPX(req: Request, res: Response): Promise<void> {
    const { path } = req.body;

    if (!path) {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "GPX file path is required",
        },
      });
      return;
    }

    const result = await this.orchestrator.setActiveGPX(path);

    if (isSuccess(result)) {
      res.json({
        success: true,
        message: "GPX file loaded successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Update display
   */
  async updateDisplay(_req: Request, res: Response): Promise<void> {
    const result = await this.orchestrator.updateDisplay();

    if (isSuccess(result)) {
      res.json({
        success: true,
        message: "Display updated successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Clear display
   */
  async clearDisplay(_req: Request, res: Response): Promise<void> {
    const result = await this.orchestrator.clearDisplay();

    if (isSuccess(result)) {
      res.json({
        success: true,
        message: "Display cleared successfully",
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Get system status
   */
  async getSystemStatus(_req: Request, res: Response): Promise<void> {
    const result = await this.orchestrator.getSystemStatus();

    if (isSuccess(result)) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Set zoom level
   */
  async setZoom(req: Request, res: Response): Promise<void> {
    const { zoom, delta } = req.body;

    let result;
    if (zoom !== undefined) {
      result = await this.orchestrator.setZoom(zoom);
    } else if (delta !== undefined) {
      result = await this.orchestrator.changeZoom(delta);
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Either zoom or delta parameter is required",
        },
      });
      return;
    }

    if (isSuccess(result)) {
      res.json({
        success: true,
        message: "Zoom level updated",
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Start auto-update
   */
  async startAutoUpdate(_req: Request, res: Response): Promise<void> {
    const result = await this.orchestrator.startAutoUpdate();

    if (isSuccess(result)) {
      res.json({
        success: true,
        message: "Auto-update started",
      });
    } else {
      res.status(500).json({
        success: false,
        error: {
          code: (result.error as WebError).code,
          message: (result.error as WebError).getUserMessage(),
        },
      });
    }
  }

  /**
   * Stop auto-update
   */
  async stopAutoUpdate(_req: Request, res: Response): Promise<void> {
    this.orchestrator.stopAutoUpdate();
    res.json({
      success: true,
      message: "Auto-update stopped",
    });
  }

  /**
   * Set auto-center preference
   */
  async setAutoCenter(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled parameter must be a boolean",
        },
      });
      return;
    }

    this.orchestrator.setAutoCenter(enabled);
    res.json({
      success: true,
      message: `Auto-center ${enabled ? "enabled" : "disabled"}`,
    });
  }

  /**
   * Set rotate-with-bearing preference
   */
  async setRotateWithBearing(req: Request, res: Response): Promise<void> {
    const { enabled } = req.body;

    if (typeof enabled !== "boolean") {
      res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "enabled parameter must be a boolean",
        },
      });
      return;
    }

    this.orchestrator.setRotateWithBearing(enabled);
    res.json({
      success: true,
      message: `Rotate with bearing ${enabled ? "enabled" : "disabled"}`,
    });
  }
}
