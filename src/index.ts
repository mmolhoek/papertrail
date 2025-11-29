import { ServiceContainer } from "./di/ServiceContainer";
import { IntegratedWebService } from "./web/IntegratedWebService";
import { isSuccess } from "./core/types";
import { getLogger } from "./utils/logger";

const logger = getLogger("Main");

/**
 * Main Entry Point for Papertrail GPS Tracker
 *
 * This is where the application starts. It:
 * 1. Creates the service container
 * 2. Initializes all services
 * 3. Starts the web interface
 * 4. Sets up graceful shutdown
 */

async function main() {
  logger.info("🚀 Starting Papertrail GPS Tracker...\n");

  try {
    // Get service container instance
    const container = ServiceContainer.getInstance();

    // Initialize orchestrator (which initializes all dependent services)
    logger.info("Initializing services...");
    const orchestrator = container.getRenderingOrchestrator();
    const initResult = await orchestrator.initialize();

    if (!isSuccess(initResult)) {
      logger.error(
        "Failed to initialize orchestrator:",
        initResult.error.message,
      );
      process.exit(1);
    }

    logger.info("✓ Services initialized\n");

    // Create and start web interface
    logger.info("Starting web interface...");
    const webConfig = container.getWebConfig();
    const webService = new IntegratedWebService(orchestrator, webConfig);

    const webResult = await webService.start();
    if (!isSuccess(webResult)) {
      logger.error("Failed to start web interface:", webResult.error.message);
      process.exit(1);
    }

    logger.info(`✓ Web interface available at ${webService.getServerUrl()}\n`);

    // Start auto-update if configured
    const autoRefreshInterval = container
      .getConfigService()
      .getAutoRefreshInterval();
    if (autoRefreshInterval > 0) {
      logger.info(
        `Starting auto-update (interval: ${autoRefreshInterval}s)...`,
      );
      await orchestrator.startAutoUpdate();
      logger.info("✓ Auto-update started\n");
    }

    logger.info("✅ Papertrail is ready!\n");
    logger.info("Access the control panel from your mobile device:");
    logger.info(`   ${webService.getServerUrl()}\n`);

    // Setup graceful shutdown
    setupGracefulShutdown(orchestrator, webService);
  } catch (error) {
    logger.error("Fatal error during startup:", error);
    process.exit(1);
  }
}

/**
 * Setup handlers for graceful shutdown
 */
function setupGracefulShutdown(
  orchestrator: any,
  webService: IntegratedWebService,
): void {
  const shutdown = async (signal: string) => {
    logger.info(`\n${signal} received. Shutting down gracefully...`);

    try {
      // Stop auto-update
      if (orchestrator.isAutoUpdateRunning()) {
        logger.info("Stopping auto-update...");
        orchestrator.stopAutoUpdate();
      }

      // Stop web interface
      logger.info("Stopping web interface...");
      await webService.stop();

      // Dispose orchestrator (cleans up all services)
      logger.info("Cleaning up services...");
      await orchestrator.dispose();

      logger.info("✓ Shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
    shutdown("UNCAUGHT_EXCEPTION");
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled rejection at:", promise, "reason:", reason);
    shutdown("UNHANDLED_REJECTION");
  });
}

// Start the application
main().catch((error) => {
  logger.error("Failed to start application:", error);
  process.exit(1);
});
