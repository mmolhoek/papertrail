import { Bitmap1Bit, Result, success } from "@core/types";
import { FollowTrackInfo } from "@core/interfaces";
import { getLogger } from "@utils/logger";
import {
  renderBitmapText,
  calculateBitmapTextHeight,
  calculateBitmapTextWidth,
} from "@utils/bitmapFont";
import { BitmapUtils } from "./BitmapUtils";

const logger = getLogger("UIRenderer");

/**
 * Renderer for UI elements on bitmaps.
 *
 * Handles rendering of:
 * - Compass rose with heading indicator
 * - Scale bar with distance labels
 * - Info panels (speed, satellites, progress)
 * - Progress bars
 */
export class UIRenderer {
  // ============================================
  // Compass Methods
  // ============================================

  /**
   * Add a compass rose to indicate direction.
   *
   * @param bitmap - Target bitmap
   * @param x - Center X coordinate
   * @param y - Center Y coordinate
   * @param radius - Compass radius
   * @param heading - Current heading in degrees (0 = north)
   * @returns The bitmap (for chaining)
   */
  static async addCompass(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    radius: number,
    heading: number,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(
      `Adding compass at (${x}, ${y}), radius=${radius}, heading=${heading}°`,
    );

    const center = { x, y };

    // Draw outer circle
    BitmapUtils.drawCircle(bitmap, center, radius);
    BitmapUtils.drawCircle(bitmap, center, radius - 1);

    // Draw inner circle (smaller)
    BitmapUtils.drawCircle(bitmap, center, Math.floor(radius * 0.3));

    // Calculate north direction (adjusted by heading)
    // When heading is 0, north is up. As heading increases, north rotates clockwise
    // So we need to rotate the north indicator counter-clockwise by heading
    const northAngle = -heading; // degrees

    // Draw north arrow/triangle
    UIRenderer.drawCompassArrow(bitmap, center, radius, northAngle, true);

    // Draw south indicator (opposite direction, smaller)
    UIRenderer.drawCompassArrow(
      bitmap,
      center,
      radius,
      northAngle + 180,
      false,
    );

    // Draw "N" label near the north arrow using bitmap font
    const labelScale = 2; // ~14px height
    const labelDistance = radius + 16;
    const northRadians = ((northAngle - 90) * Math.PI) / 180;
    const labelX = Math.round(x + labelDistance * Math.cos(northRadians));
    const labelY = Math.round(y + labelDistance * Math.sin(northRadians));

    // Center the "N" label
    const nWidth = calculateBitmapTextWidth("N", labelScale);
    const nHeight = calculateBitmapTextHeight(labelScale);
    renderBitmapText(
      bitmap,
      "N",
      labelX - Math.floor(nWidth / 2),
      labelY - Math.floor(nHeight / 2),
      { scale: labelScale, bold: true },
    );

    return success(bitmap);
  }

  /**
   * Draw a compass arrow pointing in a direction.
   */
  private static drawCompassArrow(
    bitmap: Bitmap1Bit,
    center: { x: number; y: number },
    radius: number,
    angleDegrees: number,
    isNorth: boolean,
  ): void {
    const angleRadians = ((angleDegrees - 90) * Math.PI) / 180; // -90 to make 0 degrees point up

    // Arrow tip at the edge of the compass
    const tipDistance = radius - 3;
    const tipX = Math.round(center.x + tipDistance * Math.cos(angleRadians));
    const tipY = Math.round(center.y + tipDistance * Math.sin(angleRadians));

    // Arrow base (closer to center)
    const baseDistance = isNorth ? radius * 0.35 : radius * 0.5;
    const baseX = Math.round(center.x + baseDistance * Math.cos(angleRadians));
    const baseY = Math.round(center.y + baseDistance * Math.sin(angleRadians));

    // Draw the main arrow line
    BitmapUtils.drawLine(
      bitmap,
      { x: baseX, y: baseY },
      { x: tipX, y: tipY },
      2,
    );

    if (isNorth) {
      // Draw arrowhead for north
      const headSize = Math.max(4, Math.floor(radius * 0.25));
      const perpAngle = angleRadians + Math.PI / 2;

      const leftX = Math.round(
        tipX -
          headSize * Math.cos(angleRadians) +
          (headSize / 2) * Math.cos(perpAngle),
      );
      const leftY = Math.round(
        tipY -
          headSize * Math.sin(angleRadians) +
          (headSize / 2) * Math.sin(perpAngle),
      );

      const rightX = Math.round(
        tipX -
          headSize * Math.cos(angleRadians) -
          (headSize / 2) * Math.cos(perpAngle),
      );
      const rightY = Math.round(
        tipY -
          headSize * Math.sin(angleRadians) -
          (headSize / 2) * Math.sin(perpAngle),
      );

      BitmapUtils.drawLine(
        bitmap,
        { x: tipX, y: tipY },
        { x: leftX, y: leftY },
        2,
      );
      BitmapUtils.drawLine(
        bitmap,
        { x: tipX, y: tipY },
        { x: rightX, y: rightY },
        2,
      );
      BitmapUtils.drawLine(
        bitmap,
        { x: leftX, y: leftY },
        { x: rightX, y: rightY },
        1,
      );

      // Fill the arrowhead
      BitmapUtils.fillTriangle(
        bitmap,
        { x: tipX, y: tipY },
        { x: leftX, y: leftY },
        { x: rightX, y: rightY },
      );
    }
  }

  // ============================================
  // Scale Bar Methods
  // ============================================

  /**
   * Add a scale bar to the bitmap.
   *
   * @param bitmap - Target bitmap
   * @param x - Left X coordinate
   * @param y - Y coordinate
   * @param maxWidth - Maximum width in pixels
   * @param metersPerPixel - Scale factor
   * @returns The bitmap (for chaining)
   */
  static async addScaleBar(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    maxWidth: number,
    metersPerPixel: number,
  ): Promise<Result<Bitmap1Bit>> {
    logger.debug(
      `Adding scale bar at (${x}, ${y}), maxWidth=${maxWidth}, metersPerPixel=${metersPerPixel}`,
    );

    // Calculate max distance the bar could represent
    const maxDistance = maxWidth * metersPerPixel;

    // Find a nice round distance that fits within maxWidth
    const niceDistance = UIRenderer.getNiceScaleDistance(maxDistance);

    // Calculate actual bar width for this nice distance
    const barWidth = Math.round(niceDistance / metersPerPixel);

    // Format the distance label
    const label = UIRenderer.formatScaleDistance(niceDistance);

    // Bar dimensions
    const barHeight = 8;
    const capHeight = 20;

    // Draw the main horizontal bar
    BitmapUtils.drawHorizontalLine(bitmap, x, y, barWidth, barHeight);

    // Draw left end cap (vertical line)
    BitmapUtils.drawVerticalLine(
      bitmap,
      x,
      y - Math.floor((capHeight - barHeight) / 2),
      capHeight,
      4,
    );

    // Draw right end cap (vertical line)
    BitmapUtils.drawVerticalLine(
      bitmap,
      x + barWidth - 4,
      y - Math.floor((capHeight - barHeight) / 2),
      capHeight,
      4,
    );

    // Draw the distance label centered above the bar using bitmap font
    const labelScale = 4; // ~28px height
    const labelHeight = calculateBitmapTextHeight(labelScale);
    const labelY = y - labelHeight - 12; // Position above bar with gap
    const labelWidth = calculateBitmapTextWidth(label, labelScale);
    const labelX = x + Math.floor(barWidth / 2) - Math.floor(labelWidth / 2);

    renderBitmapText(bitmap, label, labelX, labelY, {
      scale: labelScale,
      bold: true,
    });

    return success(bitmap);
  }

  /**
   * Get a nice round distance for scale bar.
   */
  private static getNiceScaleDistance(maxDistance: number): number {
    const niceDistances = [
      10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000,
    ];

    // Find the largest nice distance that fits
    for (let i = niceDistances.length - 1; i >= 0; i--) {
      if (niceDistances[i] <= maxDistance) {
        return niceDistances[i];
      }
    }

    return niceDistances[0];
  }

  /**
   * Format distance for scale bar display (m or km).
   */
  private static formatScaleDistance(meters: number): string {
    if (meters >= 1000) {
      const km = meters / 1000;
      return km % 1 === 0 ? `${km} KM` : `${km.toFixed(1)} KM`;
    }
    return `${meters} M`;
  }

  // ============================================
  // Info Panel Methods
  // ============================================

  /**
   * Render the info panel for the Follow Track screen.
   * Displays speed, satellites, progress in a vertical layout.
   *
   * @param bitmap - Target bitmap
   * @param x - Left X coordinate of the panel
   * @param info - Follow track info data
   * @param width - Panel width (unused but kept for API consistency)
   * @param height - Panel height (unused but kept for API consistency)
   */
  static renderFollowTrackInfoPanel(
    bitmap: Bitmap1Bit,
    x: number,
    info: FollowTrackInfo,
    _width: number,
    _height: number,
  ): void {
    logger.debug(`Rendering follow track info panel at x=${x}`);

    // Panel layout constants - using bitmap font scales
    const padding = 10;
    const labelScale = 4; // ~28px
    const valueScale = 5; // ~35px
    const lineSpacing = 4;
    const sectionSpacing = 16;

    let currentY = padding;

    // Section 1: Speed label
    renderBitmapText(bitmap, "SPEED", x + padding, currentY, {
      scale: labelScale,
    });
    currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

    // Speed value with unit inline (e.g., "42 KM/H")
    const speedText = `${Math.round(info.speed)} KM/H`;
    renderBitmapText(bitmap, speedText, x + padding, currentY, {
      scale: valueScale,
      bold: true,
    });
    currentY += calculateBitmapTextHeight(valueScale) + sectionSpacing;

    // Section 2: Satellites label
    renderBitmapText(bitmap, "SATS", x + padding, currentY, {
      scale: labelScale,
    });
    currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

    // Satellites value
    renderBitmapText(
      bitmap,
      info.satellites.toString(),
      x + padding,
      currentY,
      {
        scale: valueScale,
        bold: true,
      },
    );
    currentY += calculateBitmapTextHeight(valueScale) + sectionSpacing;

    // Section 3: Zoom level
    if (info.zoomLevel !== undefined) {
      renderBitmapText(bitmap, "ZOOM", x + padding, currentY, {
        scale: labelScale,
      });
      currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

      renderBitmapText(
        bitmap,
        info.zoomLevel.toString(),
        x + padding,
        currentY,
        {
          scale: valueScale,
          bold: true,
        },
      );
      currentY += calculateBitmapTextHeight(valueScale) + sectionSpacing;
    }

    // Section 4: Progress percentage
    if (info.progress !== undefined) {
      renderBitmapText(bitmap, "DONE", x + padding, currentY, {
        scale: labelScale,
      });
      currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

      const progressText = `${Math.round(info.progress)}%`;
      renderBitmapText(bitmap, progressText, x + padding, currentY, {
        scale: valueScale,
        bold: true,
      });
      currentY += calculateBitmapTextHeight(valueScale) + sectionSpacing;
    }

    // Section 5: Time remaining
    if (info.estimatedTimeRemaining !== undefined) {
      renderBitmapText(bitmap, "ETA", x + padding, currentY, {
        scale: labelScale,
      });
      currentY += calculateBitmapTextHeight(labelScale) + lineSpacing;

      const timeStr = UIRenderer.formatTimeRemaining(
        info.estimatedTimeRemaining,
      );
      renderBitmapText(bitmap, timeStr, x + padding, currentY, {
        scale: valueScale,
        bold: true,
      });
    }
  }

  /**
   * Format time remaining in seconds to a readable string (e.g., "1H 23M" or "45M").
   */
  static formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
      return "<1M";
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}H ${minutes}M`;
    }
    return `${minutes}M`;
  }

  // ============================================
  // Progress Bar Methods
  // ============================================

  /**
   * Draw a progress bar at the bottom of the screen.
   *
   * @param bitmap - Target bitmap
   * @param width - Screen width
   * @param height - Screen height
   * @param progress - Progress percentage (0-100)
   */
  static drawProgressBar(
    bitmap: Bitmap1Bit,
    width: number,
    height: number,
    progress: number,
  ): void {
    const progressBarY = Math.floor(height * 0.88);
    const progressBarHeight = 8;
    const progressBarMarginLeft = 40;
    const progressBarMarginRight = 80; // Extra space for percentage text
    const progressBarWidth =
      width - progressBarMarginLeft - progressBarMarginRight;

    // Draw progress bar outline
    BitmapUtils.drawHorizontalLine(
      bitmap,
      progressBarMarginLeft,
      progressBarY,
      progressBarWidth,
    );
    BitmapUtils.drawHorizontalLine(
      bitmap,
      progressBarMarginLeft,
      progressBarY + progressBarHeight,
      progressBarWidth,
    );
    BitmapUtils.drawVerticalLine(
      bitmap,
      progressBarMarginLeft,
      progressBarY,
      progressBarHeight,
    );
    BitmapUtils.drawVerticalLine(
      bitmap,
      progressBarMarginLeft + progressBarWidth,
      progressBarY,
      progressBarHeight,
    );

    // Draw progress bar fill
    const fillWidth = Math.floor((progressBarWidth - 2) * (progress / 100));
    if (fillWidth > 0) {
      for (
        let y = progressBarY + 1;
        y < progressBarY + progressBarHeight;
        y++
      ) {
        BitmapUtils.drawHorizontalLine(
          bitmap,
          progressBarMarginLeft + 1,
          y,
          fillWidth,
        );
      }
    }

    // Draw percentage text to the right of the bar
    const percentText = `${Math.round(progress)}%`;
    const percentScale = 2;
    const percentX = progressBarMarginLeft + progressBarWidth + 10;
    const percentY = progressBarY - 2;
    renderBitmapText(bitmap, percentText, percentX, percentY, {
      scale: percentScale,
      bold: true,
    });
  }

  // ============================================
  // Distance Formatting
  // ============================================

  /**
   * Format distance for display (m or km).
   * Used for turn screens and navigation displays.
   *
   * @param meters - Distance in meters
   * @returns Formatted string (e.g., "500 M", "1.5 KM", "15 KM")
   */
  static formatDistanceForDisplay(meters: number): string {
    if (meters >= 1000) {
      const km = meters / 1000;
      if (km >= 10) {
        return `${Math.round(km)} KM`;
      }
      return `${km.toFixed(1)} KM`;
    }
    return `${Math.round(meters)} M`;
  }

  /**
   * Convert bearing to cardinal direction.
   *
   * @param bearing - Bearing in degrees (0-360)
   * @returns Cardinal direction (N, NE, E, SE, S, SW, W, NW)
   */
  static bearingToDirection(bearing: number): string {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }
}
