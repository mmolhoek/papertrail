import { ServiceContainer } from "./di/ServiceContainer";
import { IntegratedWebService } from "./web/IntegratedWebService";
import { isSuccess } from "./core/types";

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
  console.log("🚀 Starting Papertrail GPS Tracker...\n");

  try {
    // Get service container instance
    const container = ServiceContainer.getInstance();

    // Initialize orchestrator (which initializes all dependent services)
    console.log("Initializing services...");
    const orchestrator = container.getRenderingOrchestrator();
    const initResult = await orchestrator.initialize();

    if (!isSuccess(initResult)) {
      console.error(
        "Failed to initialize orchestrator:",
        initResult.error.message,
      );
      process.exit(1);
    }

    console.log("✓ Services initialized\n");

    // Create and start web interface
    console.log("Starting web interface...");
    const webConfig = container.getWebConfig();
    const webService = new IntegratedWebService(orchestrator, webConfig);

    const webResult = await webService.start();
    if (!isSuccess(webResult)) {
      console.error("Failed to start web interface:", webResult.error.message);
      process.exit(1);
    }

    console.log(`✓ Web interface available at ${webService.getServerUrl()}\n`);

    // Start auto-update if configured
    const autoRefreshInterval = container
      .getConfigService()
      .getAutoRefreshInterval();
    if (autoRefreshInterval > 0) {
      console.log(
        `Starting auto-update (interval: ${autoRefreshInterval}s)...`,
      );
      await orchestrator.startAutoUpdate();
      console.log("✓ Auto-update started\n");
    }

    console.log("✅ Papertrail is ready!\n");
    console.log("Access the control panel from your mobile device:");
    console.log(`   ${webService.getServerUrl()}\n`);

    // Setup graceful shutdown
    setupGracefulShutdown(orchestrator, webService);
  } catch (error) {
    console.error("Fatal error during startup:", error);
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
    console.log(`\n${signal} received. Shutting down gracefully...`);

    try {
      // Stop auto-update
      if (orchestrator.isAutoUpdateRunning()) {
        console.log("Stopping auto-update...");
        orchestrator.stopAutoUpdate();
      }

      // Stop web interface
      console.log("Stopping web interface...");
      await webService.stop();

      // Dispose orchestrator (cleans up all services)
      console.log("Cleaning up services...");
      await orchestrator.dispose();

      console.log("✓ Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Handle uncaught errors
  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error);
    shutdown("UNCAUGHT_EXCEPTION");
  });

  process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled rejection at:", promise, "reason:", reason);
    shutdown("UNHANDLED_REJECTION");
  });
}

// Start the application
main().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
