import { getLogger } from "@utils/logger";

const logger = getLogger("Performance");

/**
 * Performance metrics collection for rendering pipeline optimization.
 *
 * Provides opt-in timing and metrics for:
 * - Coordinate projection
 * - Bitmap operations
 * - Track rendering
 * - Full render cycles
 */

/**
 * Performance metrics for a single render operation
 */
export interface RenderMetrics {
  /** Total render time in milliseconds */
  totalMs: number;
  /** Time spent on coordinate projection in milliseconds */
  projectionMs: number;
  /** Time spent on bitmap operations in milliseconds */
  bitmapMs: number;
  /** Number of points projected */
  pointsProjected: number;
  /** Number of pixels drawn */
  pixelsDrawn: number;
  /** Number of lines drawn */
  linesDrawn: number;
  /** Cache hits for coordinate projection */
  cacheHits: number;
  /** Cache misses for coordinate projection */
  cacheMisses: number;
}

/**
 * Create an empty metrics object
 */
export function createEmptyMetrics(): RenderMetrics {
  return {
    totalMs: 0,
    projectionMs: 0,
    bitmapMs: 0,
    pointsProjected: 0,
    pixelsDrawn: 0,
    linesDrawn: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
}

/**
 * Performance timer for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: number = 0;
  private enabled: boolean;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  /**
   * Start timing an operation
   */
  start(): void {
    if (this.enabled) {
      this.startTime = performance.now();
    }
  }

  /**
   * Stop timing and return elapsed milliseconds
   */
  stop(): number {
    if (this.enabled) {
      return performance.now() - this.startTime;
    }
    return 0;
  }

  /**
   * Check if timing is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Global flag for enabling performance metrics.
 * Set via PERF_METRICS=true environment variable or programmatically.
 */
let metricsEnabled = process.env.PERF_METRICS === "true";

/**
 * Enable or disable performance metrics collection
 */
export function setMetricsEnabled(enabled: boolean): void {
  metricsEnabled = enabled;
  logger.info(`Performance metrics ${enabled ? "enabled" : "disabled"}`);
}

/**
 * Check if performance metrics are enabled
 */
export function isMetricsEnabled(): boolean {
  return metricsEnabled;
}

/**
 * Create a performance timer with current enabled state
 */
export function createTimer(): PerformanceTimer {
  return new PerformanceTimer(metricsEnabled);
}

/**
 * Accumulated metrics for reporting
 */
let accumulatedMetrics: RenderMetrics = createEmptyMetrics();
let renderCount = 0;

/**
 * Add metrics from a render operation to accumulated totals
 */
export function addMetrics(metrics: Partial<RenderMetrics>): void {
  if (!metricsEnabled) return;

  renderCount++;
  Object.keys(metrics).forEach((key) => {
    const k = key as keyof RenderMetrics;
    accumulatedMetrics[k] += metrics[k] || 0;
  });
}

/**
 * Get accumulated metrics and averages
 */
export function getAccumulatedMetrics(): {
  total: RenderMetrics;
  average: RenderMetrics;
  renderCount: number;
} {
  const average = createEmptyMetrics();
  if (renderCount > 0) {
    Object.keys(average).forEach((key) => {
      const k = key as keyof RenderMetrics;
      average[k] = accumulatedMetrics[k] / renderCount;
    });
  }

  return {
    total: { ...accumulatedMetrics },
    average,
    renderCount,
  };
}

/**
 * Reset accumulated metrics
 */
export function resetMetrics(): void {
  accumulatedMetrics = createEmptyMetrics();
  renderCount = 0;
}

/**
 * Log accumulated metrics summary
 */
export function logMetricsSummary(): void {
  if (!metricsEnabled || renderCount === 0) return;

  const { total, average } = getAccumulatedMetrics();

  logger.info(`=== Performance Metrics Summary (${renderCount} renders) ===`);
  logger.info(`Total time: ${total.totalMs.toFixed(2)}ms`);
  logger.info(`Avg render time: ${average.totalMs.toFixed(2)}ms`);
  logger.info(
    `Avg projection time: ${average.projectionMs.toFixed(2)}ms (${((average.projectionMs / average.totalMs) * 100 || 0).toFixed(1)}%)`,
  );
  logger.info(
    `Avg bitmap time: ${average.bitmapMs.toFixed(2)}ms (${((average.bitmapMs / average.totalMs) * 100 || 0).toFixed(1)}%)`,
  );
  logger.info(`Total points projected: ${total.pointsProjected}`);
  logger.info(`Total pixels drawn: ${total.pixelsDrawn}`);
  logger.info(`Total lines drawn: ${total.linesDrawn}`);
  logger.info(
    `Cache hit rate: ${((total.cacheHits / (total.cacheHits + total.cacheMisses)) * 100 || 0).toFixed(1)}%`,
  );
}
