import dotenv from "dotenv";
dotenv.config();

import { ServiceContainer } from "@di/ServiceContainer";
import { IntegratedWebService } from "@web/IntegratedWebService";
import { isSuccess } from "@core/types";
import { IRenderingOrchestrator } from "@core/interfaces";
import { getLogger } from "@utils/logger";

const logger = getLogger("Papertrail");

/**
 * Main Entry Point for Papertrail GPS Tracker
 *
 * This is where the application starts. It:
 * 1. Creates the service container
 * 2. Initializes all services
 * 3. Starts the web interface
 * 4. Sets up graceful shutdown
 */

/**
 * Display security warnings about credentials at startup.
 * This ensures users are aware when passwords are auto-generated
 * or when they're using insecure default passwords.
 */
function displaySecurityWarnings(container: ServiceContainer): void {
  const securityInfo = container.getCredentialSecurityInfo();
  const { warnings, generatedPasswords } = securityInfo;

  if (!container.hasSecurityWarnings()) {
    return;
  }

  logger.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.warn("                 SECURITY NOTICE                    ");
  logger.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // WiFi AP password warnings
  if (warnings.wifiApGenerated && generatedPasswords.wifiAp) {
    logger.warn("");
    logger.warn("WiFi Access Point Password (auto-generated):");
    logger.warn(`  SSID: Papertrail-Setup`);
    logger.warn(`  Password: ${generatedPasswords.wifiAp}`);
    logger.warn("");
    logger.warn("  To set a permanent password, add to your .env file:");
    logger.warn("    WIFI_PRIMARY_PASSWORD=your-secure-password");
  } else if (warnings.wifiApInsecure) {
    logger.warn("");
    logger.warn("WARNING: WiFi AP is using an insecure default password!");
    logger.warn("  Please set a secure password in your .env file:");
    logger.warn("    WIFI_PRIMARY_PASSWORD=your-secure-password");
  }

  // Web auth password warnings
  if (warnings.webAuthGenerated && generatedPasswords.webAuth) {
    logger.warn("");
    logger.warn("Web Authentication Password (auto-generated):");
    logger.warn(`  Username: admin`);
    logger.warn(`  Password: ${generatedPasswords.webAuth}`);
    logger.warn("");
    logger.warn("  To set a permanent password, add to your .env file:");
    logger.warn("    WEB_AUTH_PASSWORD=your-secure-password");
  } else if (warnings.webAuthInsecure) {
    logger.warn("");
    logger.warn("WARNING: Web auth is using an insecure default password!");
    logger.warn("  Please set a secure password in your .env file:");
    logger.warn("    WEB_AUTH_PASSWORD=your-secure-password");
  }

  logger.warn("");
  logger.warn("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

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
      logger.error("Failed to initialize orchestrator:", initResult.error);
      process.exit(1);
    }

    logger.info("✓ Services initialized\n");

    // Initialize WiFi service (state machine handles connection management)
    logger.info("Initializing WiFi service...");
    const wifiService = container.getWiFiService();
    const wifiInitResult = await wifiService.initialize();

    if (!isSuccess(wifiInitResult)) {
      logger.error(
        "Failed to initialize WiFi service:",
        wifiInitResult.error.message,
      );
      logger.warn("WiFi connection management will not be available");
    } else {
      logger.info("✓ WiFi service initialized\n");
    }

    // Check for onboarding and show appropriate screen on e-paper
    logger.info("Checking onboarding status...");
    const onboardingResult = await orchestrator.checkAndShowOnboardingScreen();
    if (!isSuccess(onboardingResult)) {
      logger.warn(
        "Failed to show onboarding screen:",
        onboardingResult.error.message,
      );
    } else {
      logger.info("✓ Onboarding screen check complete\n");
    }

    // Create and start web interface
    logger.info("Starting web interface...");
    const webConfig = container.getWebConfig();
    const mapConfig = container.getMapConfig();
    const mapService = container.getMapService();
    const configService = container.getConfigService();
    const simulationService = container.getTrackSimulationService();
    const driveNavigationService = container.getDriveNavigationService();
    const webService = new IntegratedWebService(
      orchestrator,
      webConfig,
      wifiService,
      mapService,
      mapConfig.gpxDirectory,
      configService,
      simulationService,
      driveNavigationService,
    );

    const webResult = await webService.start();
    if (!isSuccess(webResult)) {
      logger.error("Failed to start web interface:", webResult.error);
      process.exit(1);
    }

    logger.info(`✓ Web interface available at ${webService.getServerUrl()}\n`);

    // Start auto-update only if configured AND onboarding is complete
    // Don't start auto-update during onboarding to avoid overwriting WiFi setup screens
    const autoRefreshInterval = container
      .getConfigService()
      .getAutoRefreshInterval();
    const onboardingComplete = container
      .getConfigService()
      .isOnboardingCompleted();
    if (autoRefreshInterval > 0 && onboardingComplete) {
      logger.info(
        `Starting auto-update (interval: ${autoRefreshInterval}s)...`,
      );
      await orchestrator.startAutoUpdate();
      logger.info("✓ Auto-update started\n");
    } else if (autoRefreshInterval > 0 && !onboardingComplete) {
      logger.info(
        "Skipping auto-update during onboarding (will start after onboarding completes)",
      );
    }

    logger.info("✅ Papertrail is ready!\n");
    logger.info("Access the control panel from your mobile device:");
    logger.info(`   ${webService.getServerUrl()}\n`);

    // Display security warnings if any credentials were auto-generated or insecure
    displaySecurityWarnings(container);

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
  orchestrator: IRenderingOrchestrator,
  webService: IntegratedWebService,
): void {
  const shutdown = async (signal: string) => {
    logger.info(`\n${signal} received. Shutting down gracefully...`);

    // Force exit after 5 seconds if graceful shutdown hangs
    const forceExitTimeout = setTimeout(() => {
      logger.warn("Shutdown timed out, forcing exit");
      process.exit(1);
    }, 5000);

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

      clearTimeout(forceExitTimeout);
      logger.info("✓ Shutdown complete");
      process.exit(0);
    } catch (error) {
      clearTimeout(forceExitTimeout);
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
