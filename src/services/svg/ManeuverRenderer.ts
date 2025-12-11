import { Bitmap1Bit, ManeuverType } from "@core/types";
import { getLogger } from "@utils/logger";
import { BitmapUtils } from "./BitmapUtils";

const logger = getLogger("ManeuverRenderer");

/**
 * Renderer for navigation maneuver icons.
 *
 * Handles rendering of:
 * - Turn arrows (left, right, slight, sharp)
 * - Straight arrows
 * - U-turn arrows
 * - Roundabout indicators
 * - Destination markers
 * - Directional arrows
 * - Checkmark (arrival indicator)
 */
export class ManeuverRenderer {
  /**
   * Draw a maneuver arrow for turn display.
   *
   * Routes to the appropriate specialized drawing method based on maneuver type.
   *
   * @param bitmap - Target bitmap
   * @param x - Center X coordinate
   * @param y - Center Y coordinate
   * @param maneuverType - Type of maneuver
   * @param size - Size of the arrow
   */
  static drawManeuverArrow(
    bitmap: Bitmap1Bit,
    x: number,
    y: number,
    maneuverType: ManeuverType,
    size: number,
  ): void {
    // Get arrow angle based on maneuver type
    const angle = ManeuverRenderer.getManeuverAngle(maneuverType);

    if (maneuverType === ManeuverType.UTURN) {
      ManeuverRenderer.drawUturnArrow(bitmap, x, y, size);
    } else if (maneuverType === ManeuverType.STRAIGHT) {
      ManeuverRenderer.drawStraightArrow(bitmap, x, y, size);
    } else if (maneuverType === ManeuverType.ARRIVE) {
      ManeuverRenderer.drawDestinationMarker(bitmap, x, y, size);
    } else if (maneuverType.startsWith("roundabout")) {
      ManeuverRenderer.drawRoundaboutArrow(bitmap, x, y, size, maneuverType);
    } else {
      // Turn arrows (left, right, slight, sharp)
      ManeuverRenderer.drawTurnArrow(bitmap, x, y, size, angle);
    }
  }

  /**
   * Get angle for maneuver type.
   *
   * @param maneuverType - Type of maneuver
   * @returns Angle in degrees (0 = straight up, positive = clockwise)
   */
  static getManeuverAngle(maneuverType: ManeuverType): number {
    switch (maneuverType) {
      case ManeuverType.SHARP_LEFT:
        return -135;
      case ManeuverType.LEFT:
        return -90;
      case ManeuverType.SLIGHT_LEFT:
        return -45;
      case ManeuverType.STRAIGHT:
        return 0;
      case ManeuverType.SLIGHT_RIGHT:
        return 45;
      case ManeuverType.RIGHT:
        return 90;
      case ManeuverType.SHARP_RIGHT:
        return 135;
      case ManeuverType.UTURN:
        return 180;
      case ManeuverType.FORK_LEFT:
        return -30;
      case ManeuverType.FORK_RIGHT:
        return 30;
      case ManeuverType.RAMP_LEFT:
        return -45;
      case ManeuverType.RAMP_RIGHT:
        return 45;
      default:
        return 0;
    }
  }

  /**
   * Draw a turn arrow at specified angle.
   *
   * @param bitmap - Target bitmap
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param size - Arrow size
   * @param angleDegrees - Turn angle in degrees
   */
  static drawTurnArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
    angleDegrees: number,
  ): void {
    const arrowLength = size * 0.8;
    const headSize = size * 0.3;
    const lineWidth = Math.max(4, Math.floor(size / 20));

    // Arrow shaft
    const angleRad = ((angleDegrees - 90) * Math.PI) / 180; // -90 to make 0 degrees point up
    const endX = Math.round(centerX + arrowLength * Math.cos(angleRad));
    const endY = Math.round(centerY + arrowLength * Math.sin(angleRad));

    // Draw curved path from bottom to turn direction
    const startY = centerY + size * 0.4;

    // Draw shaft
    BitmapUtils.drawLine(
      bitmap,
      { x: centerX, y: startY },
      { x: centerX, y: centerY },
      lineWidth,
    );
    BitmapUtils.drawLine(
      bitmap,
      { x: centerX, y: centerY },
      { x: endX, y: endY },
      lineWidth,
    );

    // Draw arrowhead
    const headAngle1 = angleRad + Math.PI * 0.8;
    const headAngle2 = angleRad - Math.PI * 0.8;

    const head1X = Math.round(endX + headSize * Math.cos(headAngle1));
    const head1Y = Math.round(endY + headSize * Math.sin(headAngle1));
    const head2X = Math.round(endX + headSize * Math.cos(headAngle2));
    const head2Y = Math.round(endY + headSize * Math.sin(headAngle2));

    BitmapUtils.drawLine(
      bitmap,
      { x: endX, y: endY },
      { x: head1X, y: head1Y },
      lineWidth,
    );
    BitmapUtils.drawLine(
      bitmap,
      { x: endX, y: endY },
      { x: head2X, y: head2Y },
      lineWidth,
    );

    // Fill arrowhead
    BitmapUtils.fillTriangle(
      bitmap,
      { x: endX, y: endY },
      { x: head1X, y: head1Y },
      { x: head2X, y: head2Y },
    );
  }

  /**
   * Draw straight arrow (going up).
   *
   * @param bitmap - Target bitmap
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param size - Arrow size
   */
  static drawStraightArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    const lineWidth = Math.max(4, Math.floor(size / 20));
    const arrowLength = size * 0.8;
    const headSize = size * 0.25;

    const topY = centerY - arrowLength / 2;
    const bottomY = centerY + arrowLength / 2;

    // Draw shaft
    BitmapUtils.drawLine(
      bitmap,
      { x: centerX, y: bottomY },
      { x: centerX, y: topY },
      lineWidth,
    );

    // Draw arrowhead
    const head1 = { x: centerX - headSize, y: topY + headSize };
    const head2 = { x: centerX + headSize, y: topY + headSize };

    BitmapUtils.drawLine(bitmap, { x: centerX, y: topY }, head1, lineWidth);
    BitmapUtils.drawLine(bitmap, { x: centerX, y: topY }, head2, lineWidth);
    BitmapUtils.fillTriangle(bitmap, { x: centerX, y: topY }, head1, head2);
  }

  /**
   * Draw U-turn arrow.
   *
   * @param bitmap - Target bitmap
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param size - Arrow size
   */
  static drawUturnArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    const lineWidth = Math.max(4, Math.floor(size / 20));
    const arcRadius = size * 0.3;

    // Draw the U shape
    const startX = centerX + arcRadius;
    const endX = centerX - arcRadius;
    const bottomY = centerY + size * 0.3;
    const topY = centerY - size * 0.2;

    // Right side going up
    BitmapUtils.drawLine(
      bitmap,
      { x: startX, y: bottomY },
      { x: startX, y: topY },
      lineWidth,
    );

    // Arc at top (simplified as lines)
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const angle1 = (Math.PI * i) / steps;
      const angle2 = (Math.PI * (i + 1)) / steps;
      const x1 = Math.round(centerX + arcRadius * Math.cos(angle1));
      const y1 = Math.round(topY - arcRadius * Math.sin(angle1));
      const x2 = Math.round(centerX + arcRadius * Math.cos(angle2));
      const y2 = Math.round(topY - arcRadius * Math.sin(angle2));
      BitmapUtils.drawLine(
        bitmap,
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        lineWidth,
      );
    }

    // Left side going down with arrowhead
    const arrowY = bottomY;
    BitmapUtils.drawLine(
      bitmap,
      { x: endX, y: topY },
      { x: endX, y: arrowY },
      lineWidth,
    );

    // Arrowhead pointing down
    const headSize = size * 0.15;
    BitmapUtils.drawLine(
      bitmap,
      { x: endX, y: arrowY },
      { x: endX - headSize, y: arrowY - headSize },
      lineWidth,
    );
    BitmapUtils.drawLine(
      bitmap,
      { x: endX, y: arrowY },
      { x: endX + headSize, y: arrowY - headSize },
      lineWidth,
    );
  }

  /**
   * Draw destination marker (location pin).
   *
   * @param bitmap - Target bitmap
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param size - Marker size
   */
  static drawDestinationMarker(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    // Draw location pin shape
    const pinHeight = size * 0.8;
    const pinWidth = size * 0.5;
    const circleRadius = size * 0.2;

    // Draw outer pin shape
    const topY = centerY - pinHeight / 2;
    const bottomY = centerY + pinHeight / 2;

    // Circle part at top
    BitmapUtils.drawCircle(
      bitmap,
      { x: centerX, y: topY + circleRadius },
      circleRadius,
    );
    BitmapUtils.drawCircle(
      bitmap,
      { x: centerX, y: topY + circleRadius },
      circleRadius + 2,
    );

    // Triangular point
    const leftX = centerX - pinWidth / 2;
    const rightX = centerX + pinWidth / 2;
    const pointY = bottomY;

    BitmapUtils.drawLine(
      bitmap,
      { x: leftX, y: topY + circleRadius },
      { x: centerX, y: pointY },
      3,
    );
    BitmapUtils.drawLine(
      bitmap,
      { x: rightX, y: topY + circleRadius },
      { x: centerX, y: pointY },
      3,
    );
  }

  /**
   * Draw roundabout arrow with exit indicator.
   *
   * @param bitmap - Target bitmap
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param size - Arrow size
   * @param maneuverType - Roundabout maneuver type (contains exit number)
   */
  static drawRoundaboutArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
    maneuverType: ManeuverType,
  ): void {
    const lineWidth = Math.max(3, Math.floor(size / 25));
    const circleRadius = size * 0.25;

    // Draw roundabout circle
    BitmapUtils.drawCircle(bitmap, { x: centerX, y: centerY }, circleRadius);
    BitmapUtils.drawCircle(
      bitmap,
      { x: centerX, y: centerY },
      circleRadius - 2,
    );

    // Draw entry from bottom
    const entryY = centerY + size * 0.4;
    BitmapUtils.drawLine(
      bitmap,
      { x: centerX, y: entryY },
      { x: centerX, y: centerY + circleRadius },
      lineWidth,
    );

    // Draw exit based on exit number
    const exitNumber = ManeuverRenderer.getExitNumber(maneuverType);
    const exitAngle = -90 + (exitNumber - 1) * 45; // First exit is straight
    const exitRad = (exitAngle * Math.PI) / 180;

    const exitStartX = Math.round(centerX + circleRadius * Math.cos(exitRad));
    const exitStartY = Math.round(centerY + circleRadius * Math.sin(exitRad));
    const exitEndX = Math.round(
      centerX + (circleRadius + size * 0.3) * Math.cos(exitRad),
    );
    const exitEndY = Math.round(
      centerY + (circleRadius + size * 0.3) * Math.sin(exitRad),
    );

    BitmapUtils.drawLine(
      bitmap,
      { x: exitStartX, y: exitStartY },
      { x: exitEndX, y: exitEndY },
      lineWidth,
    );

    // Draw arrowhead on exit
    const headSize = size * 0.1;
    const headAngle1 = exitRad + Math.PI * 0.8;
    const headAngle2 = exitRad - Math.PI * 0.8;

    BitmapUtils.drawLine(
      bitmap,
      { x: exitEndX, y: exitEndY },
      {
        x: Math.round(exitEndX + headSize * Math.cos(headAngle1)),
        y: Math.round(exitEndY + headSize * Math.sin(headAngle1)),
      },
      lineWidth,
    );
    BitmapUtils.drawLine(
      bitmap,
      { x: exitEndX, y: exitEndY },
      {
        x: Math.round(exitEndX + headSize * Math.cos(headAngle2)),
        y: Math.round(exitEndY + headSize * Math.sin(headAngle2)),
      },
      lineWidth,
    );
  }

  /**
   * Get exit number from roundabout maneuver type.
   *
   * @param maneuverType - Roundabout maneuver type
   * @returns Exit number (1-8)
   */
  static getExitNumber(maneuverType: ManeuverType): number {
    switch (maneuverType) {
      case ManeuverType.ROUNDABOUT_EXIT_1:
        return 1;
      case ManeuverType.ROUNDABOUT_EXIT_2:
        return 2;
      case ManeuverType.ROUNDABOUT_EXIT_3:
        return 3;
      case ManeuverType.ROUNDABOUT_EXIT_4:
        return 4;
      case ManeuverType.ROUNDABOUT_EXIT_5:
        return 5;
      case ManeuverType.ROUNDABOUT_EXIT_6:
        return 6;
      case ManeuverType.ROUNDABOUT_EXIT_7:
        return 7;
      case ManeuverType.ROUNDABOUT_EXIT_8:
        return 8;
      default:
        return 1;
    }
  }

  /**
   * Draw directional arrow for off-road display.
   *
   * @param bitmap - Target bitmap
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param bearing - Direction in degrees (0 = north)
   * @param size - Arrow size
   */
  static drawDirectionalArrow(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    bearing: number,
    size: number,
  ): void {
    const lineWidth = Math.max(4, Math.floor(size / 20));
    const arrowLength = size * 0.7;
    const headSize = size * 0.25;

    // Convert bearing to radians (0 = north/up)
    const angleRad = ((bearing - 90) * Math.PI) / 180;

    const endX = Math.round(centerX + arrowLength * Math.cos(angleRad));
    const endY = Math.round(centerY + arrowLength * Math.sin(angleRad));

    // Draw shaft
    BitmapUtils.drawLine(
      bitmap,
      { x: centerX, y: centerY },
      { x: endX, y: endY },
      lineWidth,
    );

    // Draw arrowhead
    const headAngle1 = angleRad + Math.PI * 0.85;
    const headAngle2 = angleRad - Math.PI * 0.85;

    const head1 = {
      x: Math.round(endX + headSize * Math.cos(headAngle1)),
      y: Math.round(endY + headSize * Math.sin(headAngle1)),
    };
    const head2 = {
      x: Math.round(endX + headSize * Math.cos(headAngle2)),
      y: Math.round(endY + headSize * Math.sin(headAngle2)),
    };

    BitmapUtils.drawLine(bitmap, { x: endX, y: endY }, head1, lineWidth);
    BitmapUtils.drawLine(bitmap, { x: endX, y: endY }, head2, lineWidth);
    BitmapUtils.fillTriangle(bitmap, { x: endX, y: endY }, head1, head2);

    // Draw circle at base
    BitmapUtils.drawCircle(bitmap, { x: centerX, y: centerY }, 10);
  }

  /**
   * Draw checkmark for arrival screen.
   *
   * @param bitmap - Target bitmap
   * @param centerX - Center X coordinate
   * @param centerY - Center Y coordinate
   * @param size - Checkmark size
   */
  static drawCheckmark(
    bitmap: Bitmap1Bit,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    const lineWidth = Math.max(5, Math.floor(size / 15));

    // Draw circle
    BitmapUtils.drawCircle(bitmap, { x: centerX, y: centerY }, size / 2);
    BitmapUtils.drawCircle(bitmap, { x: centerX, y: centerY }, size / 2 - 2);

    // Draw checkmark
    const checkStart = {
      x: centerX - size * 0.25,
      y: centerY,
    };
    const checkMid = {
      x: centerX - size * 0.05,
      y: centerY + size * 0.2,
    };
    const checkEnd = {
      x: centerX + size * 0.25,
      y: centerY - size * 0.15,
    };

    BitmapUtils.drawLine(bitmap, checkStart, checkMid, lineWidth);
    BitmapUtils.drawLine(bitmap, checkMid, checkEnd, lineWidth);
  }
}
