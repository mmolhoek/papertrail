// Papertrail Web Interface Client
// Expedition Command - GPS Tracker Control

/* global L */

// Check for required libraries
if (typeof L === "undefined") {
  console.error(
    "Leaflet library not loaded! Drive navigation map will not work.",
  );
}

class PapertrailClient {
  constructor() {
    this.socket = null;
    this.apiBase = "/api";
    this.autoRefreshInterval = null;
    this.simulationPollingInterval = null;
    this.selectedSpeed = "walk";
    this.isSimulating = false;
    this.isPaused = false;
    this.currentOrientation = "north-up"; // 'north-up' or 'track-up'

    // Drive navigation state
    this.driveMap = null;
    this.driveDestination = null; // { lat, lon, name }
    this.driveRoute = null;
    this.driveMarker = null;
    this.driveRouteLine = null;
    this.isDriveNavigating = false;
    this.addressSearchTimeout = null;
    this.currentPosition = null; // { lat, lon }

    // Mock display state
    this.mockDisplayPanelVisible = false;

    this.setupHamburgerMenu = this.setupHamburgerMenu.bind(this);
    this.setupHamburgerMenu();

    this.init();
  }

  // Bind and initialize the hamburger menu
  setupHamburgerMenu() {
    const menuToggle = document.getElementById("menu-toggle");
    const menuContent = document.getElementById("menu-content");
    const menuItems = document.querySelectorAll(".nav-item");

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!menuToggle.contains(e.target) && !menuContent.contains(e.target)) {
        menuContent.classList.add("hidden");
      }
    });

    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      menuContent.classList.toggle("hidden");
    });

    // Setup radio-style panel switching
    menuItems.forEach((item) => {
      item.addEventListener("click", () => {
        const panelId = item.dataset.panel;
        this.switchToPanel(panelId, item);
        menuContent.classList.add("hidden");
      });
    });
  }

  // Switch to a specific panel (radio-style - only one active)
  switchToPanel(panelId, menuItem) {
    const allPanels = document.querySelectorAll(".panel-card");
    const allMenuItems = document.querySelectorAll(".nav-item");

    // Hide all panels
    allPanels.forEach((panel) => {
      panel.classList.add("hidden");
    });

    // Deactivate all menu items and hide their checkmarks
    allMenuItems.forEach((item) => {
      item.classList.remove("active");
      const check = item.querySelector(".nav-check");
      if (check) check.classList.add("hidden");
    });

    // Show the selected panel
    const targetPanel = document.getElementById(panelId);
    if (targetPanel) {
      targetPanel.classList.remove("hidden");
    }

    // Activate the menu item and show its checkmark
    if (menuItem) {
      menuItem.classList.add("active");
      const check = menuItem.querySelector(".nav-check");
      if (check) check.classList.remove("hidden");
    }

    // Special handling for WiFi panel - load config when shown
    if (panelId === "wifi-settings-panel") {
      this.loadWiFiConfig();
    }

    // Special handling for Drive panel - initialize map when shown
    if (panelId === "drive-panel") {
      this.initDriveMap();
    }

    // Special handling for Mock Display panel - track visibility for live updates
    if (panelId === "mock-display-panel") {
      this.mockDisplayPanelVisible = true;
      this.initMockDisplay();
    } else {
      this.mockDisplayPanelVisible = false;
    }
  }

  // Show a system message (toast notification)
  showMessage(message, type = "info") {
    const messageIndicator = document.getElementById("message-indicator");
    const messageText = document.getElementById("message-text");

    // Set message content and type
    messageText.textContent = message;
    messageIndicator.className = `toast ${type}`;

    // Show the message indicator
    messageIndicator.classList.remove("hidden");

    // Automatically hide the message after 5 seconds
    setTimeout(() => {
      messageIndicator.classList.add("hidden");
    }, 5000);
  }

  init() {
    // Initialize WebSocket
    this.initWebSocket();

    // Setup event listeners
    this.setupEventListeners();

    // Load initial data
    this.loadInitialData();
  }

  // WebSocket Connection
  initWebSocket() {
    this.socket = io();

    this.socket.on("connect", () => {
      console.log("Connected to server");
      this.updateConnectionStatus(true);
      this.socket.emit("gps:subscribe");
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
      this.updateConnectionStatus(false);
    });

    this.socket.on("gps:update", (data) => {
      this.updateGPSPosition(data);
      // Position updates now include fix status
      if (data.fixQuality !== undefined) {
        this.updateGPSStatus(data);
      }
    });

    this.socket.on("gps:status", (data) => {
      this.updateGPSStatus(data);
    });

    this.socket.on("status:update", (data) => {
      this.updateSystemStatus(data);
    });

    // Drive navigation events
    this.socket.on("drive:update", (data) => {
      this.updateDriveNavigationStatus(data);
    });

    this.socket.on("drive:arrived", (data) => {
      this.showMessage(
        `Arrived at ${data.destination || "destination"}!`,
        "success",
      );
      this.isDriveNavigating = false;
      this.updateDriveUI();
    });

    this.socket.on("drive:off-road", (data) => {
      console.log("Off-road detected:", data);
    });

    // Display update event - refresh mock display if visible
    this.socket.on("display:updated", (data) => {
      console.log("Display updated:", data);
      if (this.mockDisplayPanelVisible && data.success) {
        this.refreshMockDisplay();
      }
    });

    // Keep connection alive
    setInterval(() => {
      if (this.socket.connected) {
        this.socket.emit("ping");
      }
    }, 30000);
  }

  // Setup UI Event Listeners
  setupEventListeners() {
    // Track selection - auto-load on change
    document.getElementById("track-select").addEventListener("change", (e) => {
      if (e.target.value) {
        this.loadSelectedTrack();
      }
    });

    // Track upload
    const uploadBtn = document.getElementById("upload-track-btn");
    const uploadInput = document.getElementById("gpx-file-input");
    if (uploadBtn && uploadInput) {
      uploadBtn.addEventListener("click", () => {
        uploadInput.click();
      });
      uploadInput.addEventListener("change", (e) => {
        this.handleFileSelect(e);
      });
    }

    // Track delete
    const deleteBtn = document.getElementById("delete-track-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        this.deleteSelectedTrack();
      });
    }

    // Zoom controls
    document.getElementById("zoom-in-btn").addEventListener("click", () => {
      this.changeZoom(1);
    });

    document.getElementById("zoom-out-btn").addEventListener("click", () => {
      this.changeZoom(-1);
    });

    document.getElementById("zoom-control").addEventListener("input", (e) => {
      this.setZoom(parseInt(e.target.value));
    });

    // Display controls
    document.getElementById("refresh-btn").addEventListener("click", () => {
      this.refreshDisplay();
    });

    document.getElementById("clear-btn").addEventListener("click", () => {
      this.clearDisplay();
    });

    // Settings
    document.getElementById("auto-center").addEventListener("change", (e) => {
      this.setAutoCenter(e.target.checked);
    });

    document.getElementById("auto-refresh").addEventListener("change", (e) => {
      this.setAutoRefresh(e.target.checked);
    });

    // Orientation control
    const orientationBtn = document.getElementById("orientation-btn");
    if (orientationBtn) {
      orientationBtn.addEventListener("click", () => {
        this.cycleOrientation();
      });
    }

    // WiFi settings
    document.getElementById("save-wifi-btn").addEventListener("click", () => {
      this.saveWiFiConfig();
    });

    document.getElementById("toggle-password").addEventListener("click", () => {
      this.togglePasswordVisibility();
    });

    // Reset system
    document.getElementById("reset-btn").addEventListener("click", () => {
      this.confirmAndResetSystem();
    });

    // Simulation controls
    this.setupSimulationControls();

    // Drive navigation controls
    this.setupDriveControls();
  }

  // Setup simulation control event listeners
  setupSimulationControls() {
    // Speed buttons
    const speedButtons = document.querySelectorAll(".speed-btn");
    speedButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        speedButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.selectedSpeed = btn.dataset.speed;

        // If simulation is running, update speed
        if (this.isSimulating) {
          this.setSimulationSpeed(this.selectedSpeed);
        }
      });
    });

    // Start simulation
    document
      .getElementById("start-simulation-btn")
      .addEventListener("click", () => {
        this.startSimulation();
      });

    // Stop simulation
    document
      .getElementById("stop-simulation-btn")
      .addEventListener("click", () => {
        this.stopSimulation();
      });

    // Pause/Resume simulation
    document
      .getElementById("pause-simulation-btn")
      .addEventListener("click", () => {
        if (this.isPaused) {
          this.resumeSimulation();
        } else {
          this.pauseSimulation();
        }
      });
  }

  // API Methods
  async loadInitialData() {
    try {
      // Load available tracks
      const tracks = await this.fetchJSON(`${this.apiBase}/map/files`);
      this.populateTrackList(tracks);

      // Load system status
      const statusResponse = await this.fetchJSON(
        `${this.apiBase}/system/status`,
      );
      if (statusResponse && statusResponse.data) {
        this.updateSystemStatus(statusResponse.data);
      }

      // Load GPS position
      const positionResponse = await this.fetchJSON(
        `${this.apiBase}/gps/position`,
      );
      if (positionResponse && positionResponse.data) {
        this.updateGPSPosition(positionResponse.data);
      }

      // Load display settings (zoom, orientation, etc.)
      const displayResponse = await this.fetchJSON(
        `${this.apiBase}/config/display`,
      );
      if (displayResponse && displayResponse.data) {
        this.updateDisplaySettings(displayResponse.data);
      }
    } catch (error) {
      console.error("Error loading initial data:", error);
    }
  }

  updateZoomControl(zoomLevel) {
    const control = document.getElementById("zoom-control");
    const valueDisplay = document.getElementById("zoom-value");
    if (control) control.value = zoomLevel;
    if (valueDisplay) valueDisplay.textContent = zoomLevel;
  }

  updateDisplaySettings(settings) {
    // Update zoom control
    if (settings.zoomLevel !== undefined) {
      this.updateZoomControl(settings.zoomLevel);
    }

    // Update orientation button
    if (settings.rotateWithBearing !== undefined) {
      const btn = document.getElementById("orientation-btn");
      const icon = btn?.querySelector(".orientation-icon");
      const text = btn?.querySelector(".orientation-text");

      if (settings.rotateWithBearing) {
        this.currentOrientation = "track-up";
        if (icon) icon.textContent = "⬆";
        if (text) text.textContent = "Track Up";
        if (btn) btn.classList.add("track-up");
      } else {
        this.currentOrientation = "north-up";
        if (icon) icon.textContent = "↑";
        if (text) text.textContent = "North Up";
        if (btn) btn.classList.remove("track-up");
      }
    }
  }

  async loadSelectedTrack() {
    const select = document.getElementById("track-select");
    const trackPath = select.value;

    if (!trackPath) {
      this.showMessage("Please select a track", "error");
      return;
    }

    try {
      const result = await this.fetchJSON(`${this.apiBase}/map/active`, {
        method: "POST",
        body: JSON.stringify({ path: trackPath }),
      });

      if (result.success) {
        this.showMessage("Track loaded successfully", "success");
        // Note: setActiveGPX already does a FULL display update, no need to refresh again
        // Refresh system status to update active track display
        const statusResponse = await this.fetchJSON(
          `${this.apiBase}/system/status`,
        );
        if (statusResponse && statusResponse.data) {
          this.updateSystemStatus(statusResponse.data);
        }
        // Also directly update simulation panel since a track is now loaded
        this.updateSimulationPanel(true);
      } else {
        this.showMessage(
          result.error?.message || "Failed to load track",
          "error",
        );
      }
    } catch (error) {
      console.error("Error loading track:", error);
      this.showMessage("Failed to load track", "error");
    }
  }

  async changeZoom(delta) {
    const control = document.getElementById("zoom-control");
    const newZoom = Math.max(1, Math.min(20, parseInt(control.value) + delta));
    await this.setZoom(newZoom);
  }

  async setZoom(level) {
    const control = document.getElementById("zoom-control");
    const valueDisplay = document.getElementById("zoom-value");

    control.value = level;
    valueDisplay.textContent = level;

    try {
      await this.fetchJSON(`${this.apiBase}/config/zoom`, {
        method: "POST",
        body: JSON.stringify({ zoom: level }),
      });
    } catch (error) {
      console.error("Error setting zoom:", error);
    }
  }

  async refreshDisplay() {
    const btn = document.getElementById("refresh-btn");
    const btnText = btn.querySelector(".btn-text");
    const btnIcon = btn.querySelector(".btn-icon");

    btn.disabled = true;
    if (btnIcon) btnIcon.textContent = "⏳";
    if (btnText) btnText.textContent = "Refreshing...";

    try {
      await this.fetchJSON(`${this.apiBase}/display/update`, {
        method: "POST",
      });

      if (btnIcon) btnIcon.textContent = "✓";
      if (btnText) btnText.textContent = "Refreshed";

      setTimeout(() => {
        if (btnIcon) btnIcon.textContent = "↻";
        if (btnText) btnText.textContent = "Refresh Display";
        btn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error("Error refreshing display:", error);

      if (btnIcon) btnIcon.textContent = "✕";
      if (btnText) btnText.textContent = "Failed";

      setTimeout(() => {
        if (btnIcon) btnIcon.textContent = "↻";
        if (btnText) btnText.textContent = "Refresh Display";
        btn.disabled = false;
      }, 2000);
    }
  }

  async clearDisplay() {
    try {
      await this.fetchJSON(`${this.apiBase}/display/clear`, {
        method: "POST",
      });
      this.showMessage("Display cleared successfully", "success");
    } catch (error) {
      console.error("Error clearing display:", error);
      this.showMessage("Failed to clear display", "error");
    }
  }

  setAutoCenter(enabled) {
    console.log("Auto-center:", enabled);
    // Will be implemented when connected to backend
  }

  setAutoRefresh(enabled) {
    if (enabled) {
      this.autoRefreshInterval = setInterval(() => {
        this.refreshDisplay();
      }, 5000);
    } else {
      if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = null;
      }
    }
  }

  // Cycle through map orientation modes
  async cycleOrientation() {
    const btn = document.getElementById("orientation-btn");
    const icon = btn.querySelector(".orientation-icon");
    const text = btn.querySelector(".orientation-text");

    // Toggle between modes
    if (this.currentOrientation === "north-up") {
      this.currentOrientation = "track-up";
      icon.textContent = "⬆";
      text.textContent = "Track Up";
      btn.classList.add("track-up");
    } else {
      this.currentOrientation = "north-up";
      icon.textContent = "↑";
      text.textContent = "North Up";
      btn.classList.remove("track-up");
    }

    // Send to backend
    const rotateWithBearing = this.currentOrientation === "track-up";
    try {
      await fetch(`${this.apiBase}/config/rotate-bearing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: rotateWithBearing }),
      });
      this.showMessage(
        `Orientation: ${this.currentOrientation === "north-up" ? "North Up" : "Track Up"}`,
        "success",
      );
    } catch (error) {
      console.error("Failed to set orientation:", error);
      this.showMessage("Failed to change orientation", "error");
    }
  }

  // WiFi Configuration Methods

  async loadWiFiConfig() {
    try {
      const response = await this.fetchJSON(`${this.apiBase}/wifi/hotspot`);

      if (response && response.data) {
        const ssidInput = document.getElementById("wifi-ssid");
        const currentSsidDisplay = document.getElementById("wifi-current-ssid");

        // Set current SSID in the input field
        ssidInput.value = response.data.ssid || "";

        // Show current configuration info
        if (response.data.ssid) {
          currentSsidDisplay.textContent = `Current: ${response.data.ssid}`;
        } else {
          currentSsidDisplay.textContent = "No hotspot configured";
        }
      }
    } catch (error) {
      console.error("Error loading WiFi config:", error);
      this.showMessage("Failed to load WiFi settings", "error");
    }
  }

  async saveWiFiConfig() {
    const ssidInput = document.getElementById("wifi-ssid");
    const passwordInput = document.getElementById("wifi-password");
    const saveBtn = document.getElementById("save-wifi-btn");
    const btnText = saveBtn.querySelector(".btn-icon");

    const ssid = ssidInput.value.trim();
    const password = passwordInput.value;

    // Validate inputs
    if (!ssid) {
      this.showMessage("Please enter a hotspot name (SSID)", "error");
      return;
    }

    if (!password || password.length < 8) {
      this.showMessage("Password must be at least 8 characters", "error");
      return;
    }

    saveBtn.disabled = true;
    if (btnText) btnText.textContent = "⏳";

    try {
      const result = await this.fetchJSON(`${this.apiBase}/wifi/hotspot`, {
        method: "POST",
        body: JSON.stringify({ ssid, password }),
      });

      if (result.success) {
        this.showMessage("WiFi settings saved successfully", "success");
        // Clear password field after successful save
        passwordInput.value = "";
        // Update the display
        document.getElementById("wifi-current-ssid").textContent =
          `Current: ${ssid}`;
        if (btnText) btnText.textContent = "✓";
      } else {
        this.showMessage(
          result.error?.message || "Failed to save WiFi settings",
          "error",
        );
        if (btnText) btnText.textContent = "✕";
      }
    } catch (error) {
      console.error("Error saving WiFi config:", error);
      this.showMessage("Failed to save WiFi settings", "error");
      if (btnText) btnText.textContent = "✕";
    } finally {
      setTimeout(() => {
        saveBtn.disabled = false;
        if (btnText) btnText.textContent = "✓";
      }, 1500);
    }
  }

  togglePasswordVisibility() {
    const passwordInput = document.getElementById("wifi-password");
    const toggleBtn = document.getElementById("toggle-password");

    if (passwordInput.type === "password") {
      passwordInput.type = "text";
      toggleBtn.textContent = "Hide";
    } else {
      passwordInput.type = "password";
      toggleBtn.textContent = "Show";
    }
  }

  // System Reset Methods

  async confirmAndResetSystem() {
    // Show confirmation dialog
    const confirmed = confirm(
      "Are you sure you want to reset all settings?\n\n" +
        "This will:\n" +
        "- Clear WiFi hotspot configuration\n" +
        "- Reset display preferences\n" +
        "- Reset zoom level and active track\n" +
        "- Clear recent files list\n\n" +
        "The device will disconnect from WiFi and you may need to reconnect.",
    );

    if (!confirmed) {
      return;
    }

    await this.resetSystem();
  }

  async resetSystem() {
    const btn = document.getElementById("reset-btn");
    const btnIcon = btn.querySelector(".btn-icon");
    const originalIcon = btnIcon ? btnIcon.textContent : "";

    btn.disabled = true;
    if (btnIcon) btnIcon.textContent = "⏳";

    try {
      const result = await this.fetchJSON(`${this.apiBase}/system/reset`, {
        method: "POST",
      });

      if (result.success) {
        this.showMessage(
          "System reset complete. Device is restarting setup.",
          "success",
        );
        if (btnIcon) btnIcon.textContent = "✓";

        // After a short delay, the connection will likely be lost
        setTimeout(() => {
          this.showMessage(
            "Device will disconnect. Follow the setup instructions on the e-paper display.",
            "info",
          );
        }, 2000);
      } else {
        this.showMessage(result.error?.message || "Reset failed", "error");
        if (btnIcon) btnIcon.textContent = "✕";
      }
    } catch (error) {
      console.error("Reset error:", error);
      this.showMessage("Failed to reset system", "error");
      if (btnIcon) btnIcon.textContent = "✕";
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        if (btnIcon) btnIcon.textContent = originalIcon;
      }, 2000);
    }
  }

  // UI Update Methods
  updateConnectionStatus(connected) {
    const indicator = document.getElementById("connection-indicator");
    const text = document.getElementById("connection-text");

    if (connected) {
      indicator.classList.remove("disconnected");
      indicator.classList.add("connected");
      text.textContent = "Connected";
    } else {
      indicator.classList.remove("connected");
      indicator.classList.add("disconnected");
      text.textContent = "Disconnected";
    }
  }

  updateGPSPosition(data) {
    if (data && data.latitude !== undefined) {
      // Store current position for drive navigation
      this.currentPosition = { lat: data.latitude, lon: data.longitude };

      document.getElementById("latitude").textContent =
        data.latitude.toFixed(6) + "°";
      document.getElementById("longitude").textContent =
        data.longitude.toFixed(6) + "°";

      const altitudeEl = document.getElementById("altitude");
      if (data.altitude) {
        altitudeEl.textContent = data.altitude.toFixed(1);
      } else {
        altitudeEl.textContent = "--";
      }

      // Update mini status in position card
      const gpsPulse = document.getElementById("gps-pulse");
      const gpsStatusMini = document.getElementById("gps-status-mini");
      if (gpsPulse && gpsStatusMini) {
        gpsPulse.classList.add("active");
        gpsStatusMini.textContent = "Tracking";
      }
    }
  }

  updateGPSStatus(data) {
    if (data) {
      // Update GPS connection status
      const gpsStatusElement = document.getElementById("gps-status");
      const gpsPulse = document.getElementById("gps-pulse");
      const gpsStatusMini = document.getElementById("gps-status-mini");

      if (gpsStatusElement) {
        const isActive = data.isTracking !== undefined ? data.isTracking : true;
        gpsStatusElement.textContent = isActive ? "Active" : "Inactive";
        gpsStatusElement.className = isActive
          ? "status-value status-good"
          : "status-value status-bad";

        // Update mini status
        if (gpsPulse && gpsStatusMini) {
          if (isActive) {
            gpsPulse.classList.add("active");
            gpsStatusMini.textContent = "Tracking";
          } else {
            gpsPulse.classList.remove("active");
            gpsStatusMini.textContent = "Inactive";
          }
        }
      }

      // Update fix status display
      const fixElement = document.getElementById("gps-fix-status");
      if (fixElement) {
        const fixQualityNames = [
          "No Fix",
          "GPS Fix",
          "DGPS Fix",
          "PPS Fix",
          "RTK Fix",
          "Float RTK",
          "Estimated",
          "Manual",
          "Simulation",
        ];
        const fixName = fixQualityNames[data.fixQuality] || "Unknown";
        const hasFix = data.fixQuality > 0;

        fixElement.textContent = fixName;
        fixElement.className = hasFix
          ? "status-value status-good"
          : "status-value status-bad";
      }

      // Update satellites count
      if (data.satellitesInUse !== undefined) {
        const satellitesElement = document.getElementById("satellites");
        satellitesElement.textContent = data.satellitesInUse;

        // Color-code satellites: green if 4+, yellow if 1-3, red if 0
        if (data.satellitesInUse >= 4) {
          satellitesElement.className = "status-value status-good";
        } else if (data.satellitesInUse > 0) {
          satellitesElement.className = "status-value status-unknown";
        } else {
          satellitesElement.className = "status-value status-bad";
        }
      }

      // Update HDOP (Horizontal Dilution of Precision - lower is better)
      const hdopElement = document.getElementById("gps-hdop");
      if (hdopElement && data.hdop !== undefined) {
        hdopElement.textContent = data.hdop.toFixed(1);

        // Color-code HDOP: <2=excellent, 2-5=good, 5-10=moderate, >10=poor
        if (data.hdop < 2) {
          hdopElement.className = "status-value status-good";
        } else if (data.hdop < 5) {
          hdopElement.className = "status-value status-good";
        } else if (data.hdop < 10) {
          hdopElement.className = "status-value status-unknown";
        } else {
          hdopElement.className = "status-value status-bad";
        }
      }
    }
  }

  updateSystemStatus(data) {
    if (data) {
      if (data.gps) {
        // Note: GPS Status is now updated via real-time gps:update/gps:status events
        // Only update on initial load if element still shows "Unknown"
        const gpsStatusElement = document.getElementById("gps-status");
        if (gpsStatusElement && gpsStatusElement.textContent === "Unknown") {
          const gpsStatus = data.gps.connected ? "Active" : "Inactive";
          gpsStatusElement.textContent = gpsStatus;
          gpsStatusElement.className = data.gps.connected
            ? "status-value status-good"
            : "status-value status-bad";

          // Update mini status
          const gpsPulse = document.getElementById("gps-pulse");
          const gpsStatusMini = document.getElementById("gps-status-mini");
          if (gpsPulse && gpsStatusMini) {
            if (data.gps.connected) {
              gpsPulse.classList.add("active");
              gpsStatusMini.textContent = "Tracking";
            } else {
              gpsPulse.classList.remove("active");
              gpsStatusMini.textContent = "Acquiring";
            }
          }
        }

        // Note: Satellites are now updated via real-time gps:update/gps:status events
        // Only update if we don't have real-time data yet
        const satellitesElement = document.getElementById("satellites");
        if (
          satellitesElement.textContent === "0" ||
          satellitesElement.textContent === ""
        ) {
          satellitesElement.textContent = data.gps.satellitesInUse || 0;
        }
      }

      if (data.display) {
        const displayElement = document.getElementById("display-status");
        if (data.display.initialized) {
          // Show display model if available, otherwise just "Ready"
          const displayInfo = data.display.model || "Ready";
          displayElement.textContent = displayInfo;
          displayElement.className = "status-value status-good";
        } else {
          displayElement.textContent = "Not Ready";
          displayElement.className = "status-value status-bad";
        }
      } else {
        // No display data available
        const displayElement = document.getElementById("display-status");
        displayElement.textContent = "Unknown";
        displayElement.className = "status-value status-unknown";
      }

      // Update active track display (show "None" if no track)
      document.getElementById("active-track").textContent =
        data.activeTrack?.name || "None";

      // Update the dropdown to show the active track
      if (data.activeTrack?.path) {
        const select = document.getElementById("track-select");
        if (select && select.value !== data.activeTrack.path) {
          select.value = data.activeTrack.path;
          this.updateTrackInfo();
        }
      }

      // Update simulation panel based on whether a track is loaded
      this.updateSimulationPanel(!!data.activeTrack?.name);
    }
  }

  populateTrackList(data) {
    const select = document.getElementById("track-select");
    const trackInfo = document.getElementById("track-info");

    // Remember current selection before clearing
    const currentValue = select.value;

    // Keep the first option
    select.innerHTML = '<option value="">Select a track...</option>';

    // Check if we have actual file data
    if (data && data.data && data.data.files && data.data.files.length > 0) {
      const files = data.data.files;
      files.forEach((file) => {
        const option = document.createElement("option");
        option.value = file.path;
        option.textContent = file.trackName || file.fileName;
        // Store additional data for display
        option.dataset.points = file.pointCount || 0;
        option.dataset.distance = file.totalDistance || 0;
        option.dataset.fileName = file.fileName;
        select.appendChild(option);
      });

      // Show track count
      if (trackInfo) {
        trackInfo.classList.remove("hidden");
      }
    } else {
      // No files available
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No tracks available - upload one!";
      option.disabled = true;
      select.appendChild(option);
    }

    // Restore previous selection if it still exists
    if (currentValue) {
      select.value = currentValue;
    }

    // Add change listener to show track info when selected
    select.addEventListener("change", () => {
      this.updateTrackInfo();
    });
  }

  updateTrackInfo() {
    const select = document.getElementById("track-select");
    const trackInfo = document.getElementById("track-info");
    const pointsEl = document.getElementById("track-points");
    const distanceEl = document.getElementById("track-distance");

    const selectedOption = select.options[select.selectedIndex];

    if (selectedOption && selectedOption.value) {
      const points = selectedOption.dataset.points || "0";
      const distanceMeters = parseFloat(selectedOption.dataset.distance) || 0;

      if (pointsEl) {
        pointsEl.textContent = points;
      }

      if (distanceEl) {
        distanceEl.textContent = this.formatDistance(distanceMeters);
      }

      if (trackInfo) {
        trackInfo.classList.remove("hidden");
      }
    } else {
      if (trackInfo) {
        trackInfo.classList.add("hidden");
      }
    }
  }

  // Format distance: show meters if < 1km, otherwise km
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    } else {
      return `${(meters / 1000).toFixed(1)} km`;
    }
  }

  // Update simulation panel based on whether a track is loaded
  updateSimulationPanel(hasActiveTrack) {
    const simulationControls = document.getElementById("simulation-controls");
    const simulationMessage = document.getElementById("simulation-no-track");

    if (hasActiveTrack) {
      if (simulationControls) {
        simulationControls.classList.remove("hidden");
      }
      if (simulationMessage) {
        simulationMessage.classList.add("hidden");
      }
    } else {
      if (simulationControls) {
        simulationControls.classList.add("hidden");
      }
      if (simulationMessage) {
        simulationMessage.classList.remove("hidden");
      }
    }
  }

  // GPX File Management Methods

  async uploadGPXFile(file, customName = null) {
    const formData = new FormData();
    formData.append("gpxFile", file);
    if (customName) {
      formData.append("trackName", customName);
    }

    try {
      const response = await fetch(`${this.apiBase}/map/upload`, {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.success) {
        // Use track name from response if available, otherwise customName, otherwise filename
        const displayName =
          result.data?.trackName ||
          customName ||
          file.name.replace(/\.gpx$/i, "");

        // Auto-load the uploaded track as active
        if (result.data && result.data.path) {
          // Immediately add to dropdown and select it
          const select = document.getElementById("track-select");
          if (select) {
            // Add new option if it doesn't exist
            let option = select.querySelector(
              `option[value="${result.data.path}"]`,
            );
            if (!option) {
              option = document.createElement("option");
              option.value = result.data.path;
              option.textContent = displayName;
              select.appendChild(option);
            }
            select.value = result.data.path;
          }

          // Load the track using the same method as dropdown selection
          await this.loadSelectedTrack();
          this.showMessage(
            `Track "${displayName}" uploaded and loaded`,
            "success",
          );

          // Reload full track list in background (for point counts, etc.)
          this.reloadTrackList();
        } else {
          this.showMessage(`Track "${displayName}" uploaded`, "success");
          this.reloadTrackList();
        }
      } else {
        this.showMessage(result.error?.message || "Upload failed", "error");
      }
    } catch (error) {
      console.error("Upload error:", error);
      this.showMessage("Failed to upload file", "error");
    }
  }

  async deleteSelectedTrack() {
    const select = document.getElementById("track-select");
    const selectedOption = select.options[select.selectedIndex];

    if (!selectedOption || !selectedOption.value) {
      this.showMessage("Please select a track to delete", "error");
      return;
    }

    const fileName = selectedOption.dataset.fileName;
    if (!fileName) {
      this.showMessage("Cannot determine file name", "error");
      return;
    }

    // Confirm deletion
    if (
      !confirm(
        `Are you sure you want to delete "${selectedOption.textContent}"?`,
      )
    ) {
      return;
    }

    try {
      const response = await fetch(
        `${this.apiBase}/map/files/${encodeURIComponent(fileName)}`,
        { method: "DELETE" },
      );

      const result = await response.json();

      if (result.success) {
        this.showMessage("Track deleted successfully", "success");
        // Reload the track list
        await this.reloadTrackList();
      } else {
        this.showMessage(result.error?.message || "Delete failed", "error");
      }
    } catch (error) {
      console.error("Delete error:", error);
      this.showMessage("Failed to delete track", "error");
    }
  }

  async reloadTrackList() {
    try {
      const tracks = await this.fetchJSON(`${this.apiBase}/map/files`);
      this.populateTrackList(tracks);
    } catch (error) {
      console.error("Failed to reload track list:", error);
    }
  }

  handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".gpx")) {
        this.showMessage("Please select a GPX file", "error");
        event.target.value = "";
        return;
      }

      // Check if user wants to use track name from GPX file
      const useTrackName = document.getElementById("use-track-name").checked;

      if (useTrackName) {
        // Pass null to let backend use track name from GPX file
        this.uploadGPXFile(file, null);
      } else {
        // Use filename (without .gpx extension)
        const fileName = file.name.replace(/\.gpx$/i, "");
        this.uploadGPXFile(file, fileName);
      }
    }
    // Reset input so same file can be selected again
    event.target.value = "";
  }

  // Simulation Methods

  async startSimulation() {
    const select = document.getElementById("track-select");
    const trackPath = select.value;

    if (!trackPath) {
      this.showMessage("Please select a track first", "error");
      return;
    }

    const btn = document.getElementById("start-simulation-btn");
    btn.disabled = true;

    try {
      const result = await this.fetchJSON(`${this.apiBase}/simulation/start`, {
        method: "POST",
        body: JSON.stringify({
          trackPath: trackPath,
          speed: this.selectedSpeed,
        }),
      });

      if (result.success) {
        this.isSimulating = true;
        this.isPaused = false;
        this.updateSimulationUI();
        this.startSimulationPolling();
        this.showMessage("Simulation started", "success");

        // Sync zoom level from server
        if (result.data?.zoomLevel !== undefined) {
          this.updateZoomControl(result.data.zoomLevel);
        }
      } else {
        this.showMessage(
          result.error?.message || "Failed to start simulation",
          "error",
        );
      }
    } catch (error) {
      console.error("Error starting simulation:", error);
      this.showMessage("Failed to start simulation", "error");
    } finally {
      btn.disabled = false;
    }
  }

  async stopSimulation() {
    try {
      const result = await this.fetchJSON(`${this.apiBase}/simulation/stop`, {
        method: "POST",
      });

      if (result.success) {
        this.isSimulating = false;
        this.isPaused = false;
        this.stopSimulationPolling();
        this.updateSimulationUI();
        this.showMessage("Simulation stopped", "info");
      } else {
        this.showMessage(
          result.error?.message || "Failed to stop simulation",
          "error",
        );
      }
    } catch (error) {
      console.error("Error stopping simulation:", error);
      this.showMessage("Failed to stop simulation", "error");
    }
  }

  async pauseSimulation() {
    try {
      const result = await this.fetchJSON(`${this.apiBase}/simulation/pause`, {
        method: "POST",
      });

      if (result.success) {
        this.isPaused = true;
        this.updateSimulationUI();
        this.showMessage("Simulation paused", "info");
      } else {
        this.showMessage(
          result.error?.message || "Failed to pause simulation",
          "error",
        );
      }
    } catch (error) {
      console.error("Error pausing simulation:", error);
      this.showMessage("Failed to pause simulation", "error");
    }
  }

  async resumeSimulation() {
    try {
      const result = await this.fetchJSON(`${this.apiBase}/simulation/resume`, {
        method: "POST",
      });

      if (result.success) {
        this.isPaused = false;
        this.updateSimulationUI();
        this.showMessage("Simulation resumed", "success");
      } else {
        this.showMessage(
          result.error?.message || "Failed to resume simulation",
          "error",
        );
      }
    } catch (error) {
      console.error("Error resuming simulation:", error);
      this.showMessage("Failed to resume simulation", "error");
    }
  }

  async setSimulationSpeed(speed) {
    try {
      const result = await this.fetchJSON(`${this.apiBase}/simulation/speed`, {
        method: "POST",
        body: JSON.stringify({ speed }),
      });

      // Sync zoom level from server
      if (result?.data?.zoomLevel !== undefined) {
        this.updateZoomControl(result.data.zoomLevel);
      }
    } catch (error) {
      console.error("Error setting simulation speed:", error);
    }
  }

  startSimulationPolling() {
    // Poll simulation status every 500ms
    this.simulationPollingInterval = setInterval(async () => {
      try {
        const result = await this.fetchJSON(
          `${this.apiBase}/simulation/status`,
        );
        if (result.success && result.data) {
          this.updateSimulationStatus(result.data);

          // Stop polling if simulation stopped
          if (result.data.state === "stopped") {
            this.isSimulating = false;
            this.isPaused = false;
            this.stopSimulationPolling();
            this.updateSimulationUI();
          }
        }
      } catch (error) {
        console.error("Error polling simulation status:", error);
      }
    }, 500);
  }

  stopSimulationPolling() {
    if (this.simulationPollingInterval) {
      clearInterval(this.simulationPollingInterval);
      this.simulationPollingInterval = null;
    }
  }

  updateSimulationUI() {
    const controls = document.getElementById("simulation-controls");
    const startBtn = document.getElementById("start-simulation-btn");
    const stopBtn = document.getElementById("stop-simulation-btn");
    const pauseBtn = document.getElementById("pause-simulation-btn");
    const statusEl = document.getElementById("simulation-status");
    const pauseBtnText = pauseBtn.querySelector(".btn-text");

    if (this.isSimulating) {
      controls.classList.add("running");
      startBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      pauseBtn.classList.remove("hidden");
      statusEl.classList.remove("hidden");

      if (this.isPaused) {
        controls.classList.add("paused");
        pauseBtnText.textContent = "Resume";
        pauseBtn.querySelector(".btn-icon").textContent = "▶";
      } else {
        controls.classList.remove("paused");
        pauseBtnText.textContent = "Pause";
        pauseBtn.querySelector(".btn-icon").textContent = "⏸";
      }
    } else {
      controls.classList.remove("running", "paused");
      startBtn.classList.remove("hidden");
      stopBtn.classList.add("hidden");
      pauseBtn.classList.add("hidden");
      statusEl.classList.add("hidden");
    }
  }

  updateSimulationStatus(data) {
    const progressBar = document.getElementById("sim-progress-bar");
    const progressText = document.getElementById("sim-progress");
    const remainingText = document.getElementById("sim-remaining");

    if (progressBar && progressText) {
      progressBar.style.width = `${data.progress}%`;
      progressText.textContent = `${data.progress.toFixed(1)}%`;
    }

    if (remainingText && data.estimatedTimeRemaining !== undefined) {
      const mins = Math.floor(data.estimatedTimeRemaining / 60);
      const secs = data.estimatedTimeRemaining % 60;
      if (mins > 0) {
        remainingText.textContent = `${mins}m ${secs}s`;
      } else {
        remainingText.textContent = `${secs}s`;
      }
    }
  }

  // Utility Methods
  async fetchJSON(url, options = {}) {
    const defaultOptions = {
      headers: {
        "Content-Type": "application/json",
      },
    };

    const response = await fetch(url, { ...defaultOptions, ...options });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  }

  // ============================================
  // DRIVE NAVIGATION METHODS
  // ============================================

  setupDriveControls() {
    // Tab switching
    const tabs = document.querySelectorAll(".drive-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        this.switchDriveTab(tab.dataset.tab);
      });
    });

    // Address search input
    const addressInput = document.getElementById("drive-address-input");
    if (addressInput) {
      addressInput.addEventListener("input", (e) => {
        this.handleAddressSearch(e.target.value);
      });

      // Close results when clicking outside
      document.addEventListener("click", (e) => {
        const results = document.getElementById("drive-address-results");
        if (!addressInput.contains(e.target) && !results.contains(e.target)) {
          results.classList.add("hidden");
        }
      });
    }

    // Coordinate apply button
    const coordsApply = document.getElementById("drive-coords-apply");
    if (coordsApply) {
      coordsApply.addEventListener("click", () => {
        this.applyCoordinates();
      });
    }

    // Clear destination button
    const clearDest = document.getElementById("drive-clear-dest");
    if (clearDest) {
      clearDest.addEventListener("click", () => {
        this.clearDriveDestination();
      });
    }

    // Calculate route button
    const calcRoute = document.getElementById("drive-calc-route");
    if (calcRoute) {
      calcRoute.addEventListener("click", () => {
        this.calculateRoute();
      });
    }

    // Start navigation button
    const startBtn = document.getElementById("drive-start-btn");
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        this.startDriveNavigation();
      });
    }

    // Stop navigation button
    const stopBtn = document.getElementById("drive-stop-btn");
    if (stopBtn) {
      stopBtn.addEventListener("click", () => {
        this.stopDriveNavigation();
      });
    }

    // Simulate drive button
    const simulateBtn = document.getElementById("drive-simulate-btn");
    if (simulateBtn) {
      simulateBtn.addEventListener("click", () => {
        this.simulateDriveRoute();
      });
    }
  }

  switchDriveTab(tabName) {
    // Update tab buttons
    const tabs = document.querySelectorAll(".drive-tab");
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    });

    // Update tab content
    const contents = document.querySelectorAll(".drive-tab-content");
    contents.forEach((content) => {
      const contentId = content.id.replace("drive-tab-", "");
      content.classList.toggle("active", contentId === tabName);
    });

    // Initialize map if switching to map tab
    if (tabName === "map") {
      setTimeout(() => this.initDriveMap(), 100);
    }
  }

  initDriveMap() {
    if (this.driveMap) {
      this.driveMap.invalidateSize();
      return;
    }

    const mapContainer = document.getElementById("drive-map");
    if (!mapContainer || typeof L === "undefined") {
      return;
    }

    // Remove placeholder text
    mapContainer.innerHTML = "";

    // Default center (will be updated with GPS position)
    const defaultLat = this.currentPosition?.lat || 52.52;
    const defaultLon = this.currentPosition?.lon || 13.405;

    this.driveMap = L.map("drive-map").setView([defaultLat, defaultLon], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(this.driveMap);

    // Click to select destination
    this.driveMap.on("click", (e) => {
      this.setDriveDestination(e.latlng.lat, e.latlng.lng, "Map selection");
    });
  }

  handleAddressSearch(query) {
    // Debounce the search
    if (this.addressSearchTimeout) {
      clearTimeout(this.addressSearchTimeout);
    }

    if (query.length < 3) {
      document.getElementById("drive-address-results").classList.add("hidden");
      return;
    }

    this.addressSearchTimeout = setTimeout(async () => {
      try {
        // Use Nominatim for geocoding
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
          {
            headers: {
              "User-Agent": "Papertrail GPS Tracker",
            },
          },
        );

        const results = await response.json();
        this.showAddressResults(results);
      } catch (error) {
        console.error("Address search error:", error);
      }
    }, 300);
  }

  showAddressResults(results) {
    const container = document.getElementById("drive-address-results");
    container.innerHTML = "";

    if (results.length === 0) {
      container.classList.add("hidden");
      return;
    }

    results.forEach((result) => {
      const item = document.createElement("div");
      item.className = "address-result-item";
      item.textContent = result.display_name;
      item.addEventListener("click", () => {
        this.setDriveDestination(
          parseFloat(result.lat),
          parseFloat(result.lon),
          result.display_name,
        );
        container.classList.add("hidden");
        document.getElementById("drive-address-input").value = "";
      });
      container.appendChild(item);
    });

    container.classList.remove("hidden");
  }

  applyCoordinates() {
    const lat = parseFloat(document.getElementById("drive-lat-input").value);
    const lon = parseFloat(document.getElementById("drive-lon-input").value);

    if (isNaN(lat) || isNaN(lon)) {
      this.showMessage("Please enter valid coordinates", "error");
      return;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      this.showMessage("Coordinates out of range", "error");
      return;
    }

    this.setDriveDestination(lat, lon, `${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  }

  setDriveDestination(lat, lon, name) {
    this.driveDestination = { lat, lon, name };

    // Update destination display
    const destContainer = document.getElementById("drive-destination");
    const destText = document.getElementById("drive-dest-text");
    destContainer.classList.remove("hidden");
    destText.textContent = name;

    // Enable calculate button
    document.getElementById("drive-calc-route").disabled = false;

    // Clear previous route preview
    document.getElementById("drive-route-preview").classList.add("hidden");
    document.getElementById("drive-nav-controls").classList.add("hidden");
    this.driveRoute = null;

    // Update map marker if map is initialized
    if (this.driveMap) {
      if (this.driveMarker) {
        this.driveMarker.setLatLng([lat, lon]);
      } else {
        this.driveMarker = L.marker([lat, lon]).addTo(this.driveMap);
      }
      this.driveMap.setView([lat, lon], 14);
    }

    this.showMessage("Destination set", "success");
  }

  clearDriveDestination() {
    this.driveDestination = null;
    this.driveRoute = null;

    document.getElementById("drive-destination").classList.add("hidden");
    document.getElementById("drive-route-preview").classList.add("hidden");
    document.getElementById("drive-nav-controls").classList.add("hidden");
    document.getElementById("drive-calc-route").disabled = true;

    if (this.driveMarker) {
      this.driveMarker.remove();
      this.driveMarker = null;
    }

    if (this.driveRouteLine) {
      this.driveRouteLine.remove();
      this.driveRouteLine = null;
    }
  }

  async calculateRoute() {
    console.log("calculateRoute called");
    console.log("driveDestination:", this.driveDestination);
    console.log("currentPosition:", this.currentPosition);

    if (!this.driveDestination) {
      this.showMessage("Please set a destination first", "error");
      return;
    }

    if (!this.currentPosition) {
      this.showMessage("Waiting for GPS position...", "error");
      return;
    }

    // Check for invalid 0,0 coordinates (no GPS fix)
    if (this.currentPosition.lat === 0 && this.currentPosition.lon === 0) {
      console.warn(
        "GPS position is 0,0 - trying browser geolocation as fallback",
      );
      try {
        const browserPos = await this.getBrowserGeolocation();
        if (browserPos) {
          this.currentPosition = browserPos;
          console.log("Using browser geolocation:", this.currentPosition);
        } else {
          this.showMessage(
            "No valid GPS position. Please wait for GPS fix or enable browser location.",
            "error",
          );
          return;
        }
      } catch (error) {
        this.showMessage(
          "No valid GPS position. Please wait for GPS fix.",
          "error",
        );
        return;
      }
    }

    const calcBtn = document.getElementById("drive-calc-route");
    const btnText = calcBtn.querySelector(".btn-text");
    calcBtn.disabled = true;
    if (btnText) btnText.textContent = "Calculating...";

    try {
      // Use OSRM for routing
      const start = `${this.currentPosition.lon},${this.currentPosition.lat}`;
      const end = `${this.driveDestination.lon},${this.driveDestination.lat}`;

      console.log(
        `Calculating route from ${start} to ${end} (${this.driveDestination.name})`,
      );

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=true`;
      console.log("OSRM URL:", osrmUrl);

      const response = await fetch(osrmUrl);

      if (!response.ok) {
        throw new Error(
          `OSRM request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      console.log("OSRM response:", data);

      if (data.code !== "Ok") {
        throw new Error(
          `OSRM error: ${data.code} - ${data.message || "Unknown error"}`,
        );
      }

      if (!data.routes || data.routes.length === 0) {
        throw new Error("No route found between the selected points");
      }

      const route = data.routes[0];
      this.processOSRMRoute(route, data);
    } catch (error) {
      console.error("Route calculation error:", error);
      const errorMessage = error.message || "Unknown error";
      this.showMessage(`Failed to calculate route: ${errorMessage}`, "error");
    } finally {
      calcBtn.disabled = false;
      if (btnText) btnText.textContent = "Calculate Route";
    }
  }

  processOSRMRoute(route, data) {
    // Extract waypoints with turn instructions
    const waypoints = [];
    let waypointIndex = 0;

    route.legs.forEach((leg) => {
      leg.steps.forEach((step, stepIndex) => {
        const maneuver = step.maneuver;
        const maneuverType = this.osrmManeuverToType(
          maneuver.type,
          maneuver.modifier,
        );

        waypoints.push({
          latitude: maneuver.location[1],
          longitude: maneuver.location[0],
          instruction: step.name
            ? `${this.formatManeuverType(maneuverType)} onto ${step.name}`
            : this.formatManeuverType(maneuverType),
          maneuverType: maneuverType,
          distance: step.distance,
          streetName: step.name || undefined,
          bearingAfter: maneuver.bearing_after,
          index: waypointIndex++,
        });
      });
    });

    // Extract geometry as [lat, lon] pairs
    const geometry = route.geometry.coordinates.map((coord) => [
      coord[1],
      coord[0],
    ]);

    // Build the route object
    this.driveRoute = {
      id: `route_${Date.now()}`,
      destination: this.driveDestination.name,
      createdAt: new Date().toISOString(),
      startPoint: {
        latitude: this.currentPosition.lat,
        longitude: this.currentPosition.lon,
      },
      endPoint: {
        latitude: this.driveDestination.lat,
        longitude: this.driveDestination.lon,
      },
      waypoints: waypoints,
      geometry: geometry,
      totalDistance: route.distance,
      estimatedTime: route.duration,
    };

    // Update route preview
    this.showRoutePreview();

    // Draw route on map
    if (this.driveMap) {
      if (this.driveRouteLine) {
        this.driveRouteLine.remove();
      }
      this.driveRouteLine = L.polyline(geometry, {
        color: "#1a3c34",
        weight: 4,
      }).addTo(this.driveMap);
      this.driveMap.fitBounds(this.driveRouteLine.getBounds(), {
        padding: [20, 20],
      });
    }
  }

  /**
   * Get position from browser's geolocation API as fallback
   * @returns {Promise<{lat: number, lon: number}|null>}
   */
  getBrowserGeolocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn("Browser geolocation not available");
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          console.warn("Browser geolocation error:", error.message);
          resolve(null);
        },
        { timeout: 10000, enableHighAccuracy: false },
      );
    });
  }

  osrmManeuverToType(type, modifier) {
    // Map OSRM maneuver types to our ManeuverType enum
    const modifierMap = {
      sharp_left: "sharp_left",
      left: "left",
      slight_left: "slight_left",
      straight: "straight",
      slight_right: "slight_right",
      right: "right",
      sharp_right: "sharp_right",
      uturn: "uturn",
    };

    if (type === "depart") return "depart";
    if (type === "arrive") return "arrive";
    if (type === "roundabout" || type === "rotary") {
      return "roundabout";
    }
    if (type === "turn" || type === "new name" || type === "continue") {
      return modifierMap[modifier] || "straight";
    }

    return modifierMap[modifier] || "straight";
  }

  formatManeuverType(type) {
    const names = {
      depart: "Depart",
      straight: "Continue straight",
      slight_left: "Turn slightly left",
      left: "Turn left",
      sharp_left: "Turn sharp left",
      slight_right: "Turn slightly right",
      right: "Turn right",
      sharp_right: "Turn sharp right",
      uturn: "Make a U-turn",
      arrive: "Arrive",
      roundabout: "Enter roundabout",
    };
    return names[type] || "Continue";
  }

  showRoutePreview() {
    const preview = document.getElementById("drive-route-preview");
    const controls = document.getElementById("drive-nav-controls");

    // Format distance
    const distanceKm = (this.driveRoute.totalDistance / 1000).toFixed(1);
    document.getElementById("drive-route-distance").textContent =
      `${distanceKm} km`;

    // Format time
    const minutes = Math.round(this.driveRoute.estimatedTime / 60);
    document.getElementById("drive-route-time").textContent = `${minutes} min`;

    // Count turns (exclude depart and arrive)
    const turns = this.driveRoute.waypoints.filter(
      (w) => w.maneuverType !== "depart" && w.maneuverType !== "arrive",
    ).length;
    document.getElementById("drive-route-turns").textContent = turns;

    preview.classList.remove("hidden");
    controls.classList.remove("hidden");
  }

  async startDriveNavigation() {
    if (!this.driveRoute) {
      this.showMessage("Please calculate a route first", "error");
      return;
    }

    const startBtn = document.getElementById("drive-start-btn");
    const stopBtn = document.getElementById("drive-stop-btn");

    startBtn.disabled = true;

    try {
      // Send route to server and start navigation
      const result = await this.fetchJSON(`${this.apiBase}/drive/start`, {
        method: "POST",
        body: JSON.stringify({ route: this.driveRoute }),
      });

      if (result.success) {
        this.isDriveNavigating = true;
        this.updateDriveUI();
        this.showMessage("Navigation started", "success");
      } else {
        this.showMessage(
          result.error?.message || "Failed to start navigation",
          "error",
        );
      }
    } catch (error) {
      console.error("Error starting navigation:", error);
      this.showMessage("Failed to start navigation", "error");
    } finally {
      startBtn.disabled = false;
    }
  }

  async stopDriveNavigation() {
    try {
      const result = await this.fetchJSON(`${this.apiBase}/drive/stop`, {
        method: "POST",
      });

      if (result.success) {
        this.isDriveNavigating = false;
        this.updateDriveUI();
        this.showMessage("Navigation stopped", "info");
      } else {
        this.showMessage(
          result.error?.message || "Failed to stop navigation",
          "error",
        );
      }
    } catch (error) {
      console.error("Error stopping navigation:", error);
      this.showMessage("Failed to stop navigation", "error");
    }
  }

  async simulateDriveRoute() {
    if (!this.driveRoute) {
      this.showMessage("Please calculate a route first", "error");
      return;
    }

    const simulateBtn = document.getElementById("drive-simulate-btn");
    const startBtn = document.getElementById("drive-start-btn");
    const stopBtn = document.getElementById("drive-stop-btn");

    simulateBtn.disabled = true;
    startBtn.disabled = true;

    try {
      // Convert drive route geometry to simulation format
      // The geometry is an array of [lat, lon] pairs
      const result = await this.fetchJSON(`${this.apiBase}/drive/simulate`, {
        method: "POST",
        body: JSON.stringify({
          route: this.driveRoute,
          speed: 100, // 100 km/h drive speed
        }),
      });

      if (result.success) {
        this.isDriveNavigating = true;
        this.showMessage("Drive simulation started at 100 km/h", "success");
        // Hide start/simulate, show stop
        simulateBtn.classList.add("hidden");
        startBtn.classList.add("hidden");
        stopBtn.classList.remove("hidden");
      } else {
        this.showMessage(
          result.error?.message || "Failed to start simulation",
          "error",
        );
      }
    } catch (error) {
      console.error("Error starting drive simulation:", error);
      this.showMessage("Failed to start drive simulation", "error");
    } finally {
      simulateBtn.disabled = false;
      startBtn.disabled = false;
    }
  }

  updateDriveUI() {
    const startBtn = document.getElementById("drive-start-btn");
    const simulateBtn = document.getElementById("drive-simulate-btn");
    const stopBtn = document.getElementById("drive-stop-btn");
    const navStatus = document.getElementById("drive-nav-status");

    if (this.isDriveNavigating) {
      startBtn.classList.add("hidden");
      simulateBtn.classList.add("hidden");
      stopBtn.classList.remove("hidden");
      navStatus.classList.remove("hidden");
    } else {
      startBtn.classList.remove("hidden");
      simulateBtn.classList.remove("hidden");
      stopBtn.classList.add("hidden");
      navStatus.classList.add("hidden");
    }
  }

  updateDriveNavigationStatus(data) {
    if (!data) return;

    // Update navigation state
    const stateEl = document.getElementById("drive-nav-state");
    if (stateEl) {
      const stateNames = {
        idle: "Idle",
        navigating: "Navigating",
        off_road: "Off Road",
        arrived: "Arrived",
        cancelled: "Cancelled",
      };
      stateEl.textContent = stateNames[data.state] || data.state;
    }

    // Update turn icon
    const turnIcon = document.getElementById("drive-turn-icon");
    if (turnIcon && data.nextManeuver) {
      const iconMap = {
        left: "↰",
        right: "↱",
        straight: "↑",
        uturn: "↩",
        slight_left: "↖",
        slight_right: "↗",
        sharp_left: "↰",
        sharp_right: "↱",
        arrive: "◉",
        depart: "⬆",
        roundabout: "↻",
      };
      turnIcon.textContent = iconMap[data.nextManeuver] || "→";
    }

    // Update turn distance
    const turnDist = document.getElementById("drive-turn-distance");
    if (turnDist && data.distanceToNextTurn !== undefined) {
      turnDist.textContent = this.formatDistance(data.distanceToNextTurn);
    }

    // Update instruction
    const instruction = document.getElementById("drive-instruction");
    if (instruction && data.instruction) {
      let text = data.instruction;
      if (data.streetName) {
        text += ` - ${data.streetName}`;
      }
      instruction.textContent = text;
    }

    // Update progress
    const progressBar = document.getElementById("drive-progress-bar");
    if (progressBar && data.progress !== undefined) {
      progressBar.style.width = `${data.progress}%`;
    }

    // Update remaining distance
    const remaining = document.getElementById("drive-remaining");
    if (remaining && data.distanceRemaining !== undefined) {
      remaining.textContent = `${this.formatDistance(data.distanceRemaining)} remaining`;
    }

    // Show navigation status if navigating
    if (data.state === "navigating" || data.state === "off_road") {
      this.isDriveNavigating = true;
      this.updateDriveUI();
    } else if (data.state === "arrived" || data.state === "cancelled") {
      this.isDriveNavigating = false;
      this.updateDriveUI();
    }
  }

  // ============================================
  // Mock Display Methods
  // ============================================

  /**
   * Initialize the mock display panel
   * Uses WebSocket push for live updates when display changes
   */
  initMockDisplay() {
    // Setup refresh button listener (only once)
    const refreshBtn = document.getElementById("mock-display-refresh");

    // Remove existing listeners to avoid duplicates
    refreshBtn.replaceWith(refreshBtn.cloneNode(true));

    // Re-get the element after cloning
    const newRefreshBtn = document.getElementById("mock-display-refresh");

    newRefreshBtn.addEventListener("click", () => {
      this.refreshMockDisplay();
    });

    // Load the initial image
    this.refreshMockDisplay();
  }

  /**
   * Refresh the mock display image
   */
  async refreshMockDisplay() {
    const statusEl = document.getElementById("mock-display-status");
    const imageEl = document.getElementById("mock-display-image");

    // Show loading state (only if no image is shown yet)
    if (imageEl.classList.contains("hidden")) {
      statusEl.textContent = "Loading...";
      statusEl.className = "mock-display-status";
      statusEl.classList.remove("hidden");
    }

    try {
      // First check if mock display is available
      const statusResponse = await fetch(`${this.apiBase}/mock-display/status`);
      const statusData = await statusResponse.json();

      if (!statusData.success || !statusData.data.available) {
        statusEl.textContent =
          "Mock display not available. Make sure you are running in development mode with the mock e-paper service, and trigger a display update first.";
        statusEl.className = "mock-display-status error";
        statusEl.classList.remove("hidden");
        imageEl.classList.add("hidden");
        return;
      }

      // Fetch the image with cache-busting
      const imageUrl = `${this.apiBase}/mock-display/image?t=${Date.now()}`;
      const imageResponse = await fetch(imageUrl);

      if (!imageResponse.ok) {
        throw new Error(`Failed to load image: ${imageResponse.status}`);
      }

      // Convert to blob and create URL
      const blob = await imageResponse.blob();
      const objectUrl = URL.createObjectURL(blob);

      // Clean up old object URL if any
      if (imageEl.dataset.objectUrl) {
        URL.revokeObjectURL(imageEl.dataset.objectUrl);
      }

      // Display the image
      imageEl.src = objectUrl;
      imageEl.dataset.objectUrl = objectUrl;
      imageEl.classList.remove("hidden");
      statusEl.classList.add("hidden");
    } catch (error) {
      console.error("Failed to load mock display:", error);
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = "mock-display-status error";
      statusEl.classList.remove("hidden");
      imageEl.classList.add("hidden");
    }
  }
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new PapertrailClient();
});
