import {
  createEmptyMetrics,
  PerformanceTimer,
  setMetricsEnabled,
  isMetricsEnabled,
  createTimer,
  addMetrics,
  getAccumulatedMetrics,
  resetMetrics,
  logMetricsSummary,
} from "@utils/performance";

describe("Performance Utilities", () => {
  beforeEach(() => {
    resetMetrics();
    setMetricsEnabled(false);
  });

  describe("createEmptyMetrics", () => {
    it("should create metrics with all zero values", () => {
      const metrics = createEmptyMetrics();

      expect(metrics.totalMs).toBe(0);
      expect(metrics.projectionMs).toBe(0);
      expect(metrics.bitmapMs).toBe(0);
      expect(metrics.pointsProjected).toBe(0);
      expect(metrics.pixelsDrawn).toBe(0);
      expect(metrics.linesDrawn).toBe(0);
      expect(metrics.cacheHits).toBe(0);
      expect(metrics.cacheMisses).toBe(0);
    });
  });

  describe("PerformanceTimer", () => {
    it("should return 0 when disabled", () => {
      const timer = new PerformanceTimer(false);
      timer.start();
      const elapsed = timer.stop();

      expect(elapsed).toBe(0);
    });

    it("should measure time when enabled", async () => {
      const timer = new PerformanceTimer(true);
      timer.start();

      // Wait a small amount of time
      await new Promise((resolve) => setTimeout(resolve, 10));

      const elapsed = timer.stop();
      expect(elapsed).toBeGreaterThan(0);
    });

    it("should report enabled status correctly", () => {
      const enabledTimer = new PerformanceTimer(true);
      const disabledTimer = new PerformanceTimer(false);

      expect(enabledTimer.isEnabled()).toBe(true);
      expect(disabledTimer.isEnabled()).toBe(false);
    });
  });

  describe("setMetricsEnabled and isMetricsEnabled", () => {
    it("should enable metrics", () => {
      setMetricsEnabled(true);
      expect(isMetricsEnabled()).toBe(true);
    });

    it("should disable metrics", () => {
      setMetricsEnabled(true);
      setMetricsEnabled(false);
      expect(isMetricsEnabled()).toBe(false);
    });
  });

  describe("createTimer", () => {
    it("should create disabled timer when metrics disabled", () => {
      setMetricsEnabled(false);
      const timer = createTimer();
      expect(timer.isEnabled()).toBe(false);
    });

    it("should create enabled timer when metrics enabled", () => {
      setMetricsEnabled(true);
      const timer = createTimer();
      expect(timer.isEnabled()).toBe(true);
    });
  });

  describe("addMetrics and getAccumulatedMetrics", () => {
    it("should not accumulate when metrics disabled", () => {
      setMetricsEnabled(false);
      addMetrics({ totalMs: 100, pointsProjected: 50 });

      const { total, renderCount } = getAccumulatedMetrics();
      expect(renderCount).toBe(0);
      expect(total.totalMs).toBe(0);
    });

    it("should accumulate metrics when enabled", () => {
      setMetricsEnabled(true);

      addMetrics({ totalMs: 100, pointsProjected: 50 });
      addMetrics({ totalMs: 200, pointsProjected: 100 });

      const { total, average, renderCount } = getAccumulatedMetrics();

      expect(renderCount).toBe(2);
      expect(total.totalMs).toBe(300);
      expect(total.pointsProjected).toBe(150);
      expect(average.totalMs).toBe(150);
      expect(average.pointsProjected).toBe(75);
    });

    it("should handle partial metrics", () => {
      setMetricsEnabled(true);

      addMetrics({ totalMs: 100 });
      addMetrics({ pointsProjected: 50 });

      const { total, renderCount } = getAccumulatedMetrics();

      expect(renderCount).toBe(2);
      expect(total.totalMs).toBe(100);
      expect(total.pointsProjected).toBe(50);
    });
  });

  describe("resetMetrics", () => {
    it("should reset all accumulated metrics", () => {
      setMetricsEnabled(true);

      addMetrics({ totalMs: 100, pointsProjected: 50 });
      addMetrics({ totalMs: 200, pointsProjected: 100 });

      resetMetrics();

      const { total, renderCount } = getAccumulatedMetrics();
      expect(renderCount).toBe(0);
      expect(total.totalMs).toBe(0);
      expect(total.pointsProjected).toBe(0);
    });
  });

  describe("logMetricsSummary", () => {
    it("should not throw when metrics disabled", () => {
      setMetricsEnabled(false);
      expect(() => logMetricsSummary()).not.toThrow();
    });

    it("should not throw when no metrics recorded", () => {
      setMetricsEnabled(true);
      expect(() => logMetricsSummary()).not.toThrow();
    });

    it("should not throw with recorded metrics", () => {
      setMetricsEnabled(true);
      addMetrics({ totalMs: 100, projectionMs: 50, bitmapMs: 40 });
      expect(() => logMetricsSummary()).not.toThrow();
    });
  });
});
