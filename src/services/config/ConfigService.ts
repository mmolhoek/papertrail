import * as fs from "fs/promises";
import * as path from "path";
import { IConfigService } from "@core/interfaces";
import {
  Result,
  AppConfig,
  UserState,
  RenderOptions,
  FallbackNetworkConfig,
  HotspotConfig,
  ScreenType,
  success,
  failure,
} from "@core/types";
import { ConfigError } from "@core/errors";

/**
 * Config Service Implementation
 *
 * Manages application configuration and user state.
 * Handles both static configuration and runtime state persistence.
 */
export class ConfigService implements IConfigService {
  private isInitialized: boolean = false;
  private config: AppConfig;
  private userState: UserState;

  constructor(
    private readonly configPath: string = "./config/default.json",
    private readonly statePath: string = "./data/user-state.json",
  ) {
    // Initialize with default config
    this.config = this.getDefaultConfig();
    this.userState = this.getDefaultUserState();
  }

  /**
   * Initialize the config service
   */
  async initialize(): Promise<Result<void>> {
    if (this.isInitialized) {
      return success(undefined);
    }

    try {
      // Try to load config from file
      const configResult = await this.loadConfigFile();
      if (configResult.success) {
        this.config = configResult.data;
      }

      // Try to load user state from file
      const stateResult = await this.loadUserState();
      if (stateResult.success) {
        this.userState = stateResult.data;
      }

      this.isInitialized = true;
      return success(undefined);
    } catch (error) {
      if (error instanceof Error) {
        return failure(ConfigError.parseError(error));
      }
      return failure(ConfigError.parseError(new Error("Unknown error")));
    }
  }

  /**
   * Get the complete application configuration
   */
  getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get the current user state
   */
  getUserState(): UserState {
    return this.userState;
  }

  // Display configuration

  getDisplayWidth(): number {
    return this.config.display.width;
  }

  getDisplayHeight(): number {
    return this.config.display.height;
  }

  // Zoom level management

  getZoomLevel(): number {
    return this.userState.zoomLevel;
  }

  setZoomLevel(level: number): void {
    const clamped = Math.max(
      this.config.map.minZoomLevel,
      Math.min(this.config.map.maxZoomLevel, level),
    );
    this.userState.zoomLevel = clamped;
  }

  getMinZoomLevel(): number {
    return this.config.map.minZoomLevel;
  }

  getMaxZoomLevel(): number {
    return this.config.map.maxZoomLevel;
  }

  // Active GPX file management

  getActiveGPXPath(): string | null {
    return this.userState.activeGPXPath;
  }

  setActiveGPXPath(path: string | null): void {
    this.userState.activeGPXPath = path;

    // Add to recent files if it's a valid path
    if (path) {
      this.addRecentFile(path);
    }
  }

  // GPS configuration

  getGPSUpdateInterval(): number {
    return this.config.gps.updateInterval;
  }

  setGPSUpdateInterval(intervalMs: number): void {
    if (intervalMs < 100) {
      throw ConfigError.outOfRange(
        "gps.updateInterval",
        intervalMs,
        100,
        60000,
      );
    }
    this.config.gps.updateInterval = intervalMs;
  }

  // Rendering options

  getRenderOptions(): RenderOptions {
    return this.config.rendering;
  }

  updateRenderOptions(options: Partial<RenderOptions>): void {
    this.config.rendering = {
      ...this.config.rendering,
      ...options,
    };
  }

  // Display preferences

  getAutoCenter(): boolean {
    return this.userState.displayPreferences.autoCenter;
  }

  setAutoCenter(enabled: boolean): void {
    this.userState.displayPreferences.autoCenter = enabled;
  }

  getRotateWithBearing(): boolean {
    return this.userState.displayPreferences.rotateWithBearing;
  }

  setRotateWithBearing(enabled: boolean): void {
    this.userState.displayPreferences.rotateWithBearing = enabled;
  }

  getAutoRefreshInterval(): number {
    return this.userState.displayPreferences.autoRefreshInterval;
  }

  setAutoRefreshInterval(seconds: number): void {
    if (seconds < 0) {
      throw ConfigError.outOfRange("autoRefreshInterval", seconds, 0, 3600);
    }
    this.userState.displayPreferences.autoRefreshInterval = seconds;
  }

  // Speed limit display

  getShowSpeedLimit(): boolean {
    return this.userState.displayPreferences.showSpeedLimit ?? true;
  }

  setShowSpeedLimit(enabled: boolean): void {
    this.userState.displayPreferences.showSpeedLimit = enabled;
  }

  // Speed unit preference

  getSpeedUnit(): "kmh" | "mph" {
    return this.userState.displayPreferences.speedUnit ?? "kmh";
  }

  setSpeedUnit(unit: "kmh" | "mph"): void {
    this.userState.displayPreferences.speedUnit = unit;
  }

  // Active screen management

  getActiveScreen(): ScreenType {
    return this.userState.activeScreen ?? ScreenType.TRACK;
  }

  setActiveScreen(screenType: ScreenType): void {
    this.userState.activeScreen = screenType;
  }

  // Recent files

  getRecentFiles(): string[] {
    return [...this.userState.recentFiles];
  }

  addRecentFile(filePath: string): void {
    // Remove if already exists
    const index = this.userState.recentFiles.indexOf(filePath);
    if (index > -1) {
      this.userState.recentFiles.splice(index, 1);
    }

    // Add to beginning
    this.userState.recentFiles.unshift(filePath);

    // Keep only last 10
    if (this.userState.recentFiles.length > 10) {
      this.userState.recentFiles = this.userState.recentFiles.slice(0, 10);
    }
  }

  clearRecentFiles(): void {
    this.userState.recentFiles = [];
  }

  // Recent destinations management

  getRecentDestinations(): Array<{
    name: string;
    latitude: number;
    longitude: number;
    usedAt: string;
  }> {
    // Initialize if missing (for backwards compatibility)
    if (!this.userState.recentDestinations) {
      this.userState.recentDestinations = [];
    }
    return [...this.userState.recentDestinations];
  }

  addRecentDestination(destination: {
    name: string;
    latitude: number;
    longitude: number;
  }): void {
    // Initialize if missing
    if (!this.userState.recentDestinations) {
      this.userState.recentDestinations = [];
    }

    // Remove if already exists (by coordinates)
    this.userState.recentDestinations =
      this.userState.recentDestinations.filter(
        (d) =>
          d.latitude !== destination.latitude ||
          d.longitude !== destination.longitude,
      );

    // Add to beginning with timestamp
    this.userState.recentDestinations.unshift({
      ...destination,
      usedAt: new Date().toISOString(),
    });

    // Keep only last 10
    if (this.userState.recentDestinations.length > 10) {
      this.userState.recentDestinations =
        this.userState.recentDestinations.slice(0, 10);
    }
  }

  removeRecentDestination(latitude: number, longitude: number): void {
    if (!this.userState.recentDestinations) {
      return;
    }
    this.userState.recentDestinations =
      this.userState.recentDestinations.filter(
        (d) => d.latitude !== latitude || d.longitude !== longitude,
      );
  }

  clearRecentDestinations(): void {
    this.userState.recentDestinations = [];
  }

  // Onboarding management

  isOnboardingCompleted(): boolean {
    return this.userState.onboardingCompleted === true;
  }

  setOnboardingCompleted(completed: boolean): void {
    this.userState.onboardingCompleted = completed;
    if (completed) {
      this.userState.onboardingTimestamp = new Date().toISOString();
    }
  }

  // WiFi fallback network management

  getWiFiFallbackNetwork(): FallbackNetworkConfig | undefined {
    return this.userState.wifiFallbackNetwork;
  }

  setWiFiFallbackNetwork(config: FallbackNetworkConfig | null): void {
    if (config === null) {
      this.userState.wifiFallbackNetwork = undefined;
    } else {
      this.userState.wifiFallbackNetwork = config;
    }
  }

  // Hotspot configuration management

  getHotspotConfig(): HotspotConfig | undefined {
    return this.userState.hotspotConfig;
  }

  setHotspotConfig(config: HotspotConfig | null): void {
    if (config === null) {
      this.userState.hotspotConfig = undefined;
    } else {
      this.userState.hotspotConfig = config;
    }
  }

  // Persistence

  async save(): Promise<Result<void>> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.statePath);
      await fs.mkdir(dir, { recursive: true });

      // Save user state
      const stateJson = JSON.stringify(this.userState, null, 2);
      await fs.writeFile(this.statePath, stateJson, "utf-8");

      return success(undefined);
    } catch (error) {
      if (error instanceof Error) {
        return failure(ConfigError.writeError(this.statePath, error));
      }
      return failure(
        ConfigError.writeError(this.statePath, new Error("Unknown error")),
      );
    }
  }

  async reload(): Promise<Result<void>> {
    try {
      // Reload config
      const configResult = await this.loadConfigFile();
      if (configResult.success) {
        this.config = configResult.data;
      }

      // Reload user state
      const stateResult = await this.loadUserState();
      if (stateResult.success) {
        this.userState = stateResult.data;
      }

      return success(undefined);
    } catch (error) {
      if (error instanceof Error) {
        return failure(ConfigError.parseError(error));
      }
      return failure(ConfigError.parseError(new Error("Unknown error")));
    }
  }

  async resetToDefaults(): Promise<Result<void>> {
    this.userState = this.getDefaultUserState();
    return await this.save();
  }

  exportConfig(): string {
    return JSON.stringify(
      {
        config: this.config,
        userState: this.userState,
      },
      null,
      2,
    );
  }

  importConfig(json: string): Result<void> {
    try {
      const parsed = JSON.parse(json);

      if (parsed.config) {
        this.config = parsed.config;
      }

      if (parsed.userState) {
        this.userState = parsed.userState;
      }

      return success(undefined);
    } catch (error) {
      if (error instanceof Error) {
        return failure(ConfigError.invalidJSON("imported config", error));
      }
      return failure(
        ConfigError.invalidJSON("imported config", new Error("Unknown error")),
      );
    }
  }

  // Private helper methods

  private async loadConfigFile(): Promise<Result<AppConfig>> {
    try {
      const content = await fs.readFile(this.configPath, "utf-8");
      const parsed = JSON.parse(content);
      return success(parsed as AppConfig);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("ENOENT")) {
          // File not found, use defaults
          return success(this.getDefaultConfig());
        }
        return failure(ConfigError.readError(this.configPath, error));
      }
      return failure(
        ConfigError.readError(this.configPath, new Error("Unknown error")),
      );
    }
  }

  private async loadUserState(): Promise<Result<UserState>> {
    try {
      const content = await fs.readFile(this.statePath, "utf-8");
      const parsed = JSON.parse(content);
      return success(parsed as UserState);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes("ENOENT")) {
          // File not found, use defaults
          return success(this.getDefaultUserState());
        }
        return failure(ConfigError.readError(this.statePath, error));
      }
      return failure(
        ConfigError.readError(this.statePath, new Error("Unknown error")),
      );
    }
  }

  private getDefaultConfig(): AppConfig {
    return {
      version: "1.0.0",
      environment: "development",
      gps: {
        devicePath: "/dev/ttyAMA0",
        baudRate: 9600,
        updateInterval: 1000,
        minAccuracy: 10,
      },
      display: {
        width: 800,
        height: 480,
        spiDevice: "/dev/spidev0.0",
        pins: {
          reset: 17,
          dc: 25,
          busy: 24,
        },
        refreshMode: "full",
        rotation: 0,
      },
      rendering: {
        lineWidth: 2,
        pointRadius: 3,
        showPoints: true,
        showLine: true,
        highlightCurrentPosition: true,
        currentPositionRadius: 8,
        showDirection: false,
        antiAlias: false,
      },
      map: {
        gpxDirectory: "./data/gpx-files",
        maxFileSize: 10 * 1024 * 1024, // 10 MB
        enableCache: true,
        cacheDirectory: "./data/cache",
        defaultZoomLevel: 14,
        minZoomLevel: 1,
        maxZoomLevel: 20,
      },
      web: {
        port: 3000,
        host: "0.0.0.0",
        cors: true,
        apiBasePath: "/api",
        staticDirectory: "./src/web/public",
      },
      logging: {
        level: "info",
        directory: "./logs",
        console: true,
        file: true,
        maxFileSize: 10 * 1024 * 1024, // 10 MB
        maxFiles: 5,
      },
    };
  }

  private getDefaultUserState(): UserState {
    return {
      activeGPXPath: null,
      zoomLevel: 17,
      onboardingCompleted: false,
      onboardingTimestamp: undefined,
      displayPreferences: {
        autoCenter: true,
        rotateWithBearing: false,
        brightness: 100,
        autoRefreshInterval: 30,
        showSpeedLimit: true,
        speedUnit: "kmh",
      },
      recentFiles: [],
      customWaypoints: [],
      recentDestinations: [],
      wifiFallbackNetwork: undefined,
      hotspotConfig: undefined,
    };
  }
}
