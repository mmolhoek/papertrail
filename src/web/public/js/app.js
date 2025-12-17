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
    this.currentSpeedUnit = "kmh"; // 'kmh' or 'mph'

    // Drive navigation state
    this.driveMap = null;
    this.driveDestination = null; // { lat, lon, name }
    this.driveStartPoint = null; // { lat, lon, name } - custom starting point (optional)
    this.driveRoute = null;
    this.driveMarker = null;
    this.driveRouteLine = null;
    this.isDriveNavigating = false;
    this.isDriveSimulating = false; // Track if drive simulation is active
    this.addressSearchTimeout = null;
    this.startSearchTimeout = null;
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
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const panelId = item.dataset.panel;
        this.switchToPanel(panelId, item);
        // Close the menu after selection
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
      this.setupMockDisplayFullscreen();
    } else {
      this.mockDisplayPanelVisible = false;
      // Exit fullscreen when leaving mock display panel
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
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

    // Speed limit prefetch progress event
    this.socket.on("speedlimit:prefetch", (data) => {
      this.updateSpeedLimitPrefetchStatus(data);
    });

    // POI prefetch progress event
    this.socket.on("poi:prefetch", (data) => {
      this.updatePOIPrefetchStatus(data);
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

    // Speed unit control
    const speedUnitBtn = document.getElementById("speed-unit-btn");
    if (speedUnitBtn) {
      speedUnitBtn.addEventListener("click", () => {
        this.toggleSpeedUnit();
      });
    }

    // POI category toggles
    const poiToggles = document.querySelectorAll(".poi-toggle");
    poiToggles.forEach((toggle) => {
      toggle.addEventListener("change", (e) => {
        const category = e.target.dataset.category;
        this.setPOICategory(category, e.target.checked);
      });
    });

    // Show location name toggle
    const showLocationNameToggle =
      document.getElementById("show-location-name");
    if (showLocationNameToggle) {
      showLocationNameToggle.addEventListener("change", (e) => {
        this.setShowLocationName(e.target.checked);
      });
    }

    // Screen selection
    const screenSelect = document.getElementById("screen-select");
    if (screenSelect) {
      screenSelect.addEventListener("change", (e) => {
        this.setActiveScreen(e.target.value);
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

    // Update screen selector
    if (settings.activeScreen !== undefined) {
      const screenSelect = document.getElementById("screen-select");
      if (screenSelect) {
        screenSelect.value = settings.activeScreen;
      }
    }

    // Update speed unit button
    if (settings.speedUnit !== undefined) {
      const btn = document.getElementById("speed-unit-btn");
      const text = btn?.querySelector(".speed-unit-text");

      this.currentSpeedUnit = settings.speedUnit;
      if (text)
        text.textContent = settings.speedUnit === "kmh" ? "km/h" : "mph";
      if (btn) btn.classList.toggle("mph", settings.speedUnit === "mph");
    }

    // Update POI category toggles
    if (settings.enabledPOICategories !== undefined) {
      const allCategories = [
        "fuel",
        "parking",
        "food",
        "restroom",
        "viewpoint",
      ];
      allCategories.forEach((category) => {
        const checkbox = document.getElementById(`poi-${category}`);
        if (checkbox) {
          checkbox.checked = settings.enabledPOICategories.includes(category);
        }
      });
    }

    // Update show location name toggle
    if (settings.showLocationName !== undefined) {
      const checkbox = document.getElementById("show-location-name");
      if (checkbox) {
        checkbox.checked = settings.showLocationName;
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

  // Toggle speed unit between km/h and mph
  async toggleSpeedUnit() {
    const btn = document.getElementById("speed-unit-btn");
    const text = btn.querySelector(".speed-unit-text");

    // Toggle between units
    const newUnit = this.currentSpeedUnit === "kmh" ? "mph" : "kmh";

    // Send to backend
    try {
      const response = await fetch(`${this.apiBase}/config/speed-unit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit: newUnit }),
      });

      if (response.ok) {
        this.currentSpeedUnit = newUnit;
        text.textContent = newUnit === "kmh" ? "km/h" : "mph";
        btn.classList.toggle("mph", newUnit === "mph");
        this.showMessage(
          `Speed unit: ${newUnit === "kmh" ? "km/h" : "mph"}`,
          "success",
        );
      } else {
        throw new Error("Failed to set speed unit");
      }
    } catch (error) {
      console.error("Failed to set speed unit:", error);
      this.showMessage("Failed to change speed unit", "error");
    }
  }

  // Set POI category enabled/disabled
  async setPOICategory(category, enabled) {
    try {
      const response = await fetch(`${this.apiBase}/config/poi-category`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, enabled }),
      });

      if (response.ok) {
        const categoryNames = {
          fuel: "Fuel",
          parking: "Parking",
          food: "Food",
          restroom: "Restroom",
          viewpoint: "Viewpoint",
        };
        this.showMessage(
          `${categoryNames[category]} POI ${enabled ? "enabled" : "disabled"}`,
          "success",
        );
      } else {
        throw new Error("Failed to set POI category");
      }
    } catch (error) {
      console.error("Failed to set POI category:", error);
      this.showMessage("Failed to change POI setting", "error");
      // Revert the checkbox
      const checkbox = document.getElementById(`poi-${category}`);
      if (checkbox) checkbox.checked = !enabled;
    }
  }

  // Set show location name enabled/disabled
  async setShowLocationName(enabled) {
    try {
      const response = await fetch(
        `${this.apiBase}/config/show-location-name`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
      );

      if (response.ok) {
        this.showMessage(
          `Location name ${enabled ? "enabled" : "disabled"}`,
          "success",
        );
      } else {
        throw new Error("Failed to set location name setting");
      }
    } catch (error) {
      console.error("Failed to set location name setting:", error);
      this.showMessage("Failed to change location name setting", "error");
      // Revert the checkbox
      const checkbox = document.getElementById("show-location-name");
      if (checkbox) checkbox.checked = !enabled;
    }
  }

  // Set active screen type for display rendering
  async setActiveScreen(screenType) {
    try {
      const response = await fetch(`${this.apiBase}/config/screen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenType }),
      });

      if (response.ok) {
        const screenName =
          screenType === "track" ? "Track (Map + Info)" : "Turn-by-Turn";
        this.showMessage(`Display screen: ${screenName}`, "success");
      } else {
        throw new Error("Failed to set screen type");
      }
    } catch (error) {
      console.error("Failed to set active screen:", error);
      this.showMessage("Failed to change display screen", "error");
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
        option.dataset.waypoints = file.waypointCount || 0;
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
    const waypointsEl = document.getElementById("track-waypoints");

    const selectedOption = select.options[select.selectedIndex];

    if (selectedOption && selectedOption.value) {
      const points = selectedOption.dataset.points || "0";
      const distanceMeters = parseFloat(selectedOption.dataset.distance) || 0;
      const waypoints = selectedOption.dataset.waypoints || "0";

      if (pointsEl) {
        pointsEl.textContent = points;
      }

      if (distanceEl) {
        distanceEl.textContent = this.formatDistance(distanceMeters);
      }

      if (waypointsEl) {
        waypointsEl.textContent = waypoints;
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

  // Update simulation controls visibility based on whether a track is loaded
  updateSimulationPanel(hasActiveTrack) {
    const simulationControls = document.getElementById("simulation-controls");

    if (hasActiveTrack) {
      if (simulationControls) {
        simulationControls.classList.remove("hidden");
      }
    } else {
      if (simulationControls) {
        simulationControls.classList.add("hidden");
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
              // Set data attributes for point count, distance, and waypoints
              option.dataset.points = result.data.pointCount || 0;
              option.dataset.distance = result.data.totalDistance || 0;
              option.dataset.waypoints = result.data.waypointCount || 0;
              select.appendChild(option);
            }
            select.value = result.data.path;
          }

          // Update track info display immediately
          this.updateTrackInfo();

          // Load the track using the same method as dropdown selection
          await this.loadSelectedTrack();
          this.showMessage(
            `Track "${displayName}" uploaded and loaded`,
            "success",
          );

          // Reload full track list in background
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

  // Initialize drive map (placeholder - map container not yet implemented)
  initDriveMap() {
    // Map initialization will be added when map container is added to drive panel
    // For now, just ensure this doesn't throw an error
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

    // Clear destination button
    const clearDest = document.getElementById("drive-clear-dest");
    if (clearDest) {
      clearDest.addEventListener("click", () => {
        this.clearDriveDestination();
      });
    }

    // Starting point search input
    const startInput = document.getElementById("drive-start-input");
    if (startInput) {
      startInput.addEventListener("input", (e) => {
        this.handleStartPointSearch(e.target.value);
      });

      // Close results when clicking outside
      document.addEventListener("click", (e) => {
        const results = document.getElementById("drive-start-results");
        if (
          results &&
          !startInput.contains(e.target) &&
          !results.contains(e.target)
        ) {
          results.classList.add("hidden");
        }
      });
    }

    // Clear starting point button
    const clearStart = document.getElementById("drive-clear-start");
    if (clearStart) {
      clearStart.addEventListener("click", () => {
        this.clearDriveStartPoint();
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

    // Stop simulation button (in simulation status panel)
    const simStopBtn = document.getElementById("drive-sim-stop-btn");
    if (simStopBtn) {
      simStopBtn.addEventListener("click", () => {
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

    // Show route button
    const showRouteBtn = document.getElementById("drive-show-route-btn");
    if (showRouteBtn) {
      showRouteBtn.addEventListener("click", () => {
        this.showFullRoute();
      });
    }

    // Load recent destinations on panel show
    this.loadRecentDestinations();
    this.loadRecentStarts();
  }

  async loadRecentDestinations() {
    try {
      const response = await fetch(`${this.apiBase}/destinations/recent`);
      const data = await response.json();

      if (data.success && data.data.length > 0) {
        this.renderRecentDestinations(data.data);
      } else {
        // Hide the recent destinations section if empty
        const container = document.getElementById("recent-destinations");
        if (container) {
          container.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("Failed to load recent destinations:", error);
    }
  }

  renderRecentDestinations(destinations) {
    const container = document.getElementById("recent-destinations");
    const list = document.getElementById("recent-destinations-list");

    if (!container || !list) return;

    list.innerHTML = "";

    destinations.forEach((dest) => {
      const item = document.createElement("div");
      item.className = "recent-dest-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "recent-dest-name";
      // Truncate long names
      const displayName =
        dest.name.length > 40 ? dest.name.substring(0, 40) + "..." : dest.name;
      nameSpan.textContent = displayName;
      nameSpan.title = dest.name; // Full name on hover

      const removeBtn = document.createElement("button");
      removeBtn.className = "recent-dest-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove from recent";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeRecentDestination(dest.latitude, dest.longitude);
      });

      item.appendChild(nameSpan);
      item.appendChild(removeBtn);

      // Click to select this destination
      item.addEventListener("click", () => {
        this.setDriveDestination(dest.latitude, dest.longitude, dest.name);
        // Hide the quicklist after selection
        container.classList.add("hidden");
      });

      list.appendChild(item);
    });

    container.classList.remove("hidden");
  }

  async removeRecentDestination(latitude, longitude) {
    try {
      const response = await fetch(`${this.apiBase}/destinations/recent`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude }),
      });

      const data = await response.json();
      if (data.success) {
        // Reload the list
        this.loadRecentDestinations();
      }
    } catch (error) {
      console.error("Failed to remove recent destination:", error);
    }
  }

  async saveRecentDestination(name, latitude, longitude) {
    try {
      await fetch(`${this.apiBase}/destinations/recent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, latitude, longitude }),
      });
      // Reload the list to show the updated order
      this.loadRecentDestinations();
      this.loadRecentStarts();
    } catch (error) {
      console.error("Failed to save recent destination:", error);
    }
  }

  async loadRecentStarts() {
    try {
      // Use the same recent destinations as potential starting points
      const response = await fetch(`${this.apiBase}/destinations/recent`);
      const data = await response.json();

      if (data.success && data.data.length > 0) {
        this.renderRecentStarts(data.data);
      } else {
        const container = document.getElementById("recent-starts");
        if (container) {
          container.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("Failed to load recent starts:", error);
    }
  }

  renderRecentStarts(destinations) {
    const container = document.getElementById("recent-starts");
    const list = document.getElementById("recent-starts-list");

    if (!container || !list) return;

    list.innerHTML = "";

    destinations.forEach((dest) => {
      const item = document.createElement("div");
      item.className = "recent-dest-item";

      const nameSpan = document.createElement("span");
      nameSpan.className = "recent-dest-name";
      const displayName =
        dest.name.length > 40 ? dest.name.substring(0, 40) + "..." : dest.name;
      nameSpan.textContent = displayName;
      nameSpan.title = dest.name;

      item.appendChild(nameSpan);

      // Click to select this as starting point
      item.addEventListener("click", () => {
        this.setDriveStartPoint(dest.latitude, dest.longitude, dest.name);
        // Hide the quicklist after selection
        container.classList.add("hidden");
      });

      list.appendChild(item);
    });

    container.classList.remove("hidden");
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

    // Check if the input is a Google Maps URL
    if (this.isGoogleMapsUrl(query)) {
      this.resolveGoogleMapsLink(query);
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

  /**
   * Check if the input string is a Google Maps URL
   */
  isGoogleMapsUrl(str) {
    return (
      str.includes("google.com/maps") ||
      str.includes("maps.google.com") ||
      str.includes("maps.app.goo.gl") ||
      str.includes("goo.gl/maps")
    );
  }

  /**
   * Resolve a Google Maps link to coordinates via backend API
   */
  async resolveGoogleMapsLink(url) {
    // Clear address results
    document.getElementById("drive-address-results").classList.add("hidden");

    // Show loading state
    this.showMessage("Resolving Google Maps link...", "info");

    try {
      const response = await fetch(
        `${this.apiBase}/destinations/resolve-google-maps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        },
      );

      const data = await response.json();

      if (data.success && data.data) {
        const { latitude, longitude, name } = data.data;

        // Set the destination
        this.setDriveDestination(latitude, longitude, name);

        // Clear the input
        document.getElementById("drive-address-input").value = "";

        this.showMessage("Destination set from Google Maps link", "success");
      } else {
        const errorMsg =
          data.error?.message ||
          "Could not extract coordinates from Google Maps link";
        this.showMessage(errorMsg, "error");
      }
    } catch (error) {
      console.error("Failed to resolve Google Maps link:", error);
      this.showMessage("Failed to resolve Google Maps link", "error");
    }
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

  /**
   * Handle starting point search input
   */
  handleStartPointSearch(query) {
    // Debounce the search
    if (this.startSearchTimeout) {
      clearTimeout(this.startSearchTimeout);
    }

    if (query.length < 3) {
      document.getElementById("drive-start-results").classList.add("hidden");
      return;
    }

    // Check if the input is a Google Maps URL
    if (this.isGoogleMapsUrl(query)) {
      this.resolveGoogleMapsLinkForStart(query);
      return;
    }

    this.startSearchTimeout = setTimeout(async () => {
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
        this.showStartPointResults(results);
      } catch (error) {
        console.error("Start point search error:", error);
      }
    }, 300);
  }

  /**
   * Resolve a Google Maps link to coordinates for starting point
   */
  async resolveGoogleMapsLinkForStart(url) {
    // Clear start results
    document.getElementById("drive-start-results").classList.add("hidden");

    // Show loading state
    this.showMessage("Resolving Google Maps link...", "info");

    try {
      const response = await fetch(
        `${this.apiBase}/destinations/resolve-google-maps`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        },
      );

      const data = await response.json();

      if (data.success && data.data) {
        const { latitude, longitude, name } = data.data;

        // Set the starting point
        this.setDriveStartPoint(latitude, longitude, name);

        // Clear the input
        document.getElementById("drive-start-input").value = "";

        this.showMessage("Starting point set from Google Maps link", "success");
      } else {
        const errorMsg =
          data.error?.message ||
          "Could not extract coordinates from Google Maps link";
        this.showMessage(errorMsg, "error");
      }
    } catch (error) {
      console.error("Failed to resolve Google Maps link:", error);
      this.showMessage("Failed to resolve Google Maps link", "error");
    }
  }

  /**
   * Show starting point search results
   */
  showStartPointResults(results) {
    const container = document.getElementById("drive-start-results");
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
        this.setDriveStartPoint(
          parseFloat(result.lat),
          parseFloat(result.lon),
          result.display_name,
        );
        container.classList.add("hidden");
        document.getElementById("drive-start-input").value = "";
      });
      container.appendChild(item);
    });

    container.classList.remove("hidden");
  }

  /**
   * Set custom starting point for route
   */
  setDriveStartPoint(lat, lon, name) {
    this.driveStartPoint = { lat, lon, name };

    // Update starting point input field
    document.getElementById("drive-start-input").value = name;

    // Update starting point display
    const startContainer = document.getElementById("drive-start-point");
    const startText = document.getElementById("drive-start-text");
    startContainer.classList.remove("hidden");
    startText.textContent =
      name.length > 50 ? name.substring(0, 50) + "..." : name;
    startText.title = name; // Full name on hover

    // Clear previous route preview since start changed
    document.getElementById("drive-route-preview").classList.add("hidden");
    document.getElementById("drive-nav-controls").classList.add("hidden");
    this.driveRoute = null;

    this.showMessage("Starting point set", "success");
  }

  /**
   * Clear custom starting point
   */
  clearDriveStartPoint() {
    this.driveStartPoint = null;

    document.getElementById("drive-start-point").classList.add("hidden");
    document.getElementById("drive-start-input").value = "";

    // Clear previous route preview
    document.getElementById("drive-route-preview").classList.add("hidden");
    document.getElementById("drive-nav-controls").classList.add("hidden");
    this.driveRoute = null;

    this.showMessage("Starting point cleared - will use GPS position", "info");
  }

  setDriveDestination(lat, lon, name) {
    this.driveDestination = { lat, lon, name };

    // Update destination input field
    document.getElementById("drive-address-input").value = name;

    // Update destination display
    const destContainer = document.getElementById("drive-destination");
    const destText = document.getElementById("drive-dest-text");
    destContainer.classList.remove("hidden");
    destText.textContent = name;

    // Show starting point section (optional input for custom start)
    document
      .getElementById("starting-point-section")
      .classList.remove("hidden");

    // Enable calculate button
    document.getElementById("drive-calc-route").disabled = false;

    // Clear previous route preview
    document.getElementById("drive-route-preview").classList.add("hidden");
    document.getElementById("drive-nav-controls").classList.add("hidden");
    this.driveRoute = null;

    // Save to recent destinations
    this.saveRecentDestination(name, lat, lon);

    this.showMessage("Destination set", "success");
  }

  clearDriveDestination() {
    this.driveDestination = null;
    this.driveStartPoint = null;
    this.driveRoute = null;

    document.getElementById("drive-destination").classList.add("hidden");
    document.getElementById("starting-point-section").classList.add("hidden");
    document.getElementById("drive-start-point").classList.add("hidden");
    document.getElementById("drive-start-input").value = "";
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
    console.log("driveStartPoint:", this.driveStartPoint);
    console.log("currentPosition:", this.currentPosition);

    if (!this.driveDestination) {
      this.showMessage("Please set a destination first", "error");
      return;
    }

    // Determine the starting position to use for route calculation
    let routeStartPosition;

    // If custom starting point is set, use it directly
    if (this.driveStartPoint) {
      routeStartPosition = this.driveStartPoint;
      console.log("Using custom starting point:", routeStartPosition);

      // Also update mock GPS to the custom starting point for simulation
      const isMockGPS = await this.checkMockGPS();
      if (isMockGPS) {
        await this.setMockGPSPosition(
          routeStartPosition.lat,
          routeStartPosition.lon,
        );
        this.currentPosition = {
          lat: routeStartPosition.lat,
          lon: routeStartPosition.lon,
        };
        this.showMessage(
          "Mock GPS positioned at custom starting point",
          "info",
        );
      }
    } else {
      // No custom starting point - use GPS position with fallbacks
      if (!this.currentPosition) {
        this.showMessage("Waiting for GPS position...", "error");
        return;
      }

      routeStartPosition = this.currentPosition;

      // If using mock GPS, set position to track start point to avoid long distance routes
      const isMockGPS = await this.checkMockGPS();
      if (isMockGPS) {
        console.log(
          "Mock GPS detected - checking for active track start point",
        );
        const trackStart = await this.getActiveTrackStartPoint();
        if (trackStart) {
          console.log(
            `Setting mock GPS position to track start: ${trackStart.lat}, ${trackStart.lon}`,
          );
          const success = await this.setMockGPSPosition(
            trackStart.lat,
            trackStart.lon,
          );
          if (success) {
            this.currentPosition = trackStart;
            routeStartPosition = trackStart;
            this.showMessage(
              "Mock GPS positioned at track start point",
              "info",
            );
          }
        }
      }

      // Check for invalid 0,0 coordinates (no GPS fix)
      if (routeStartPosition.lat === 0 && routeStartPosition.lon === 0) {
        console.warn(
          "GPS position is 0,0 - trying browser geolocation as fallback",
        );
        try {
          const browserPos = await this.getBrowserGeolocation();
          if (browserPos) {
            routeStartPosition = browserPos;
            this.currentPosition = browserPos;
            console.log("Using browser geolocation:", routeStartPosition);
          } else {
            // Try active track starting point as final fallback
            console.warn(
              "Browser geolocation unavailable - trying active track starting point",
            );
            const trackStart = await this.getActiveTrackStartPoint();
            if (trackStart) {
              routeStartPosition = trackStart;
              this.currentPosition = trackStart;
              console.log(
                "Using active track starting point:",
                routeStartPosition,
              );
              this.showMessage(
                "Using track starting point as origin (no GPS fix)",
                "info",
              );
            } else {
              this.showMessage(
                "No valid position. Please wait for GPS fix, enable browser location, or select a track.",
                "error",
              );
              return;
            }
          }
        } catch {
          // Try active track starting point as final fallback
          console.warn(
            "Browser geolocation failed - trying active track starting point",
          );
          try {
            const trackStart = await this.getActiveTrackStartPoint();
            if (trackStart) {
              routeStartPosition = trackStart;
              this.currentPosition = trackStart;
              console.log(
                "Using active track starting point:",
                routeStartPosition,
              );
              this.showMessage(
                "Using track starting point as origin (no GPS fix)",
                "info",
              );
            } else {
              this.showMessage(
                "No valid position. Please wait for GPS fix, enable browser location, or select a track.",
                "error",
              );
              return;
            }
          } catch (trackError) {
            console.error("Failed to get track starting point:", trackError);
            this.showMessage(
              "No valid GPS position. Please wait for GPS fix.",
              "error",
            );
            return;
          }
        }
      }
    }

    const calcBtn = document.getElementById("drive-calc-route");
    const btnText = calcBtn.querySelector(".btn-text");
    calcBtn.disabled = true;
    if (btnText) btnText.textContent = "Calculating...";

    try {
      // Use backend proxy for OSRM routing (avoids CORS issues)
      const startLon = routeStartPosition.lon;
      const startLat = routeStartPosition.lat;
      const endLon = this.driveDestination.lon;
      const endLat = this.driveDestination.lat;

      console.log(
        `Calculating route from ${startLon},${startLat} to ${endLon},${endLat} (${this.driveDestination.name})`,
      );

      const proxyUrl = `${this.apiBase}/drive/calculate?startLon=${startLon}&startLat=${startLat}&endLon=${endLon}&endLat=${endLat}`;
      console.log("Proxy URL:", proxyUrl);

      const response = await fetch(proxyUrl);
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error?.message || "Route calculation failed");
      }

      const data = result.data;
      console.log("OSRM response:", data);

      if (!data.routes || data.routes.length === 0) {
        throw new Error("No route found between the selected points");
      }

      const route = data.routes[0];
      this.processOSRMRoute(route);
    } catch (error) {
      console.error("Route calculation error:", error);
      const errorMessage = error.message || "Unknown error";
      this.showMessage(`Failed to calculate route: ${errorMessage}`, "error");
    } finally {
      calcBtn.disabled = false;
      if (btnText) btnText.textContent = "Calculate Route";
    }
  }

  processOSRMRoute(route) {
    // Extract waypoints with turn instructions
    const waypoints = [];
    let waypointIndex = 0;

    route.legs.forEach((leg) => {
      leg.steps.forEach((step) => {
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

    // Use custom starting point if set, otherwise use current position
    const startLat = this.driveStartPoint
      ? this.driveStartPoint.lat
      : this.currentPosition.lat;
    const startLon = this.driveStartPoint
      ? this.driveStartPoint.lon
      : this.currentPosition.lon;

    // Build the route object
    this.driveRoute = {
      id: `route_${Date.now()}`,
      destination: this.driveDestination.name,
      createdAt: new Date().toISOString(),
      startPoint: {
        latitude: startLat,
        longitude: startLon,
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

    console.log(
      "OSRM route processed:",
      "legs:",
      route.legs?.length,
      "steps:",
      route.legs?.[0]?.steps?.length,
      "waypoints extracted:",
      waypoints.length,
      "geometry points:",
      geometry.length,
    );
    if (waypoints.length > 0) {
      console.log("First waypoint:", waypoints[0]);
      console.log("Last waypoint:", waypoints[waypoints.length - 1]);
    }

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

  /**
   * Get starting point of active track as fallback position
   * @returns {Promise<{lat: number, lon: number}|null>}
   */
  async getActiveTrackStartPoint() {
    try {
      const response = await fetch(`${this.apiBase}/map/track/start`);
      if (!response.ok) {
        console.warn(
          "Failed to fetch active track start point:",
          response.status,
        );
        return null;
      }

      const data = await response.json();
      if (data.success && data.data && data.data.startPoint) {
        console.log("Active track start point:", data.data.startPoint);
        return {
          lat: data.data.startPoint.lat,
          lon: data.data.startPoint.lon,
        };
      }

      console.warn(
        "No active track start point available:",
        data.data?.message,
      );
      return null;
    } catch (error) {
      console.error("Error fetching active track start point:", error);
      return null;
    }
  }

  /**
   * Check if using mock GPS service
   * @returns {Promise<boolean>}
   */
  async checkMockGPS() {
    try {
      const response = await fetch(`${this.apiBase}/gps/mock`);
      if (!response.ok) return false;
      const data = await response.json();
      console.log("Mock GPS check response:", data);
      return data.success && data.data?.isMockGPS === true;
    } catch (error) {
      console.error("Error checking mock GPS:", error);
      return false;
    }
  }

  /**
   * Set mock GPS position (only works when using mock GPS service)
   * @param {number} lat Latitude
   * @param {number} lon Longitude
   * @returns {Promise<boolean>} true if position was set successfully
   */
  async setMockGPSPosition(lat, lon) {
    try {
      const response = await fetch(`${this.apiBase}/gps/mock/position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lon }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.success === true;
    } catch (error) {
      console.error("Error setting mock GPS position:", error);
      return false;
    }
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
    const displayOptions = document.getElementById("drive-display-options");

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
    if (displayOptions) displayOptions.classList.remove("hidden");
    controls.classList.remove("hidden");
  }

  async startDriveNavigation() {
    if (!this.driveRoute) {
      this.showMessage("Please calculate a route first", "error");
      return;
    }

    const startBtn = document.getElementById("drive-start-btn");

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
        this.isDriveSimulating = false;
        // Hide simulation status
        document.getElementById("drive-sim-status")?.classList.add("hidden");
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
      // Set mock GPS to the route's starting point before simulation
      // This ensures simulation starts from the correct location
      const startPoint = this.driveRoute.startPoint;
      if (startPoint) {
        const isMockGPS = await this.checkMockGPS();
        if (isMockGPS) {
          console.log(
            `Setting mock GPS to route start: ${startPoint.latitude}, ${startPoint.longitude}`,
          );
          await this.setMockGPSPosition(
            startPoint.latitude,
            startPoint.longitude,
          );
          this.currentPosition = {
            lat: startPoint.latitude,
            lon: startPoint.longitude,
          };
        }
      }

      // Convert drive route geometry to simulation format
      // The geometry is an array of [lat, lon] pairs
      // Screen type (track vs turn-by-turn) is controlled by Display Controls setting
      console.log(
        "Sending drive route:",
        "waypoints:",
        this.driveRoute.waypoints?.length,
        "geometry:",
        this.driveRoute.geometry?.length,
      );
      const result = await this.fetchJSON(`${this.apiBase}/drive/simulate`, {
        method: "POST",
        body: JSON.stringify({
          route: this.driveRoute,
          speed: 100, // 100 km/h drive speed
        }),
      });

      if (result.success) {
        this.isDriveNavigating = true;
        this.isDriveSimulating = true;
        this.showMessage("Drive simulation started at 100 km/h", "success");
        // Hide start/simulate, show stop
        simulateBtn.classList.add("hidden");
        startBtn.classList.add("hidden");
        stopBtn.classList.remove("hidden");
        // Show simulation status
        document.getElementById("drive-sim-status").classList.remove("hidden");
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

  async showFullRoute() {
    if (!this.driveRoute) {
      this.showMessage("Please calculate a route first", "error");
      return;
    }

    const showRouteBtn = document.getElementById("drive-show-route-btn");
    if (showRouteBtn) {
      showRouteBtn.disabled = true;
    }

    try {
      const result = await this.fetchJSON(`${this.apiBase}/drive/show-route`, {
        method: "POST",
        body: JSON.stringify({
          route: this.driveRoute,
        }),
      });

      if (result.success) {
        this.showMessage("Route displayed on e-paper", "success");
      } else {
        this.showMessage(
          result.error?.message || "Failed to show route",
          "error",
        );
      }
    } catch (error) {
      console.error("Error showing route:", error);
      this.showMessage("Failed to show route", "error");
    } finally {
      if (showRouteBtn) {
        showRouteBtn.disabled = false;
      }
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

    // Update simulation status if simulating
    if (this.isDriveSimulating) {
      const simProgressBar = document.getElementById("drive-sim-progress-bar");
      const simProgress = document.getElementById("drive-sim-progress");
      const simDistance = document.getElementById("drive-sim-distance");
      const simTime = document.getElementById("drive-sim-time");

      if (simProgressBar && data.progress !== undefined) {
        simProgressBar.style.width = `${data.progress}%`;
      }
      if (simProgress && data.progress !== undefined) {
        simProgress.textContent = `${data.progress.toFixed(1)}%`;
      }
      if (simDistance && data.distanceRemaining !== undefined) {
        simDistance.textContent = this.formatDistance(data.distanceRemaining);
      }
      if (simTime && data.timeRemaining !== undefined) {
        const mins = Math.floor(data.timeRemaining / 60);
        const secs = Math.round(data.timeRemaining % 60);
        if (mins > 0) {
          simTime.textContent = `${mins}m ${secs}s`;
        } else {
          simTime.textContent = `${secs}s`;
        }
      }
    }

    // Show navigation status if navigating
    if (data.state === "navigating" || data.state === "off_road") {
      this.isDriveNavigating = true;
      this.updateDriveUI();
    } else if (data.state === "arrived" || data.state === "cancelled") {
      this.isDriveNavigating = false;
      this.isDriveSimulating = false;
      // Hide simulation status
      document.getElementById("drive-sim-status")?.classList.add("hidden");
      this.updateDriveUI();
    }
  }

  /**
   * Update speed limit prefetch progress indicator
   * Shows loading progress when navigation starts and speed limits are being fetched
   */
  updateSpeedLimitPrefetchStatus(data) {
    const container = document.getElementById("speedlimit-prefetch-status");
    const progressBar = document.getElementById("speedlimit-prefetch-bar");
    const progressText = document.getElementById("speedlimit-prefetch-text");
    const segmentsText = document.getElementById(
      "speedlimit-prefetch-segments",
    );

    if (!container) return;

    if (data.complete) {
      // Hide the prefetch status when complete
      container.classList.add("hidden");
      if (data.segmentsFound > 0) {
        this.showMessage(
          `Speed limits loaded (${data.segmentsFound} segments)`,
          "success",
        );
      }
    } else {
      // Show progress
      container.classList.remove("hidden");

      const progress =
        data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;

      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }
      if (progressText) {
        progressText.textContent = `${data.current}/${data.total} points`;
      }
      if (segmentsText) {
        segmentsText.textContent = `${data.segmentsFound} segments found`;
      }
    }
  }

  /**
   * Update POI prefetch progress indicator
   * Shows loading progress when navigation starts and POIs are being fetched
   */
  updatePOIPrefetchStatus(data) {
    const container = document.getElementById("poi-prefetch-status");
    const progressBar = document.getElementById("poi-prefetch-bar");
    const progressText = document.getElementById("poi-prefetch-text");
    const poisText = document.getElementById("poi-prefetch-pois");

    if (!container) return;

    if (data.complete) {
      // Hide the prefetch status when complete
      container.classList.add("hidden");
      if (data.poisFound > 0) {
        this.showMessage(`POIs loaded (${data.poisFound} found)`, "success");
      }
    } else {
      // Show progress
      container.classList.remove("hidden");

      const progress =
        data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;

      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }
      if (progressText) {
        progressText.textContent = `${data.current}/${data.total} points`;
      }
      if (poisText) {
        poisText.textContent = `${data.poisFound} POIs found`;
      }
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
   * Setup fullscreen mode for mock display in landscape
   */
  setupMockDisplayFullscreen() {
    // Check if already in landscape and request fullscreen
    const checkAndRequestFullscreen = () => {
      if (!this.mockDisplayPanelVisible) return;

      const isLandscape = window.matchMedia("(orientation: landscape)").matches;
      const panel = document.getElementById("mock-display-panel");

      if (isLandscape && panel && !panel.classList.contains("hidden")) {
        // Request fullscreen on the panel
        if (!document.fullscreenElement && panel.requestFullscreen) {
          panel.requestFullscreen().catch(() => {
            // Fullscreen request failed (user gesture required), that's ok
          });
        }
      }
    };

    // Listen for orientation changes
    window
      .matchMedia("(orientation: landscape)")
      .addEventListener("change", (e) => {
        if (e.matches && this.mockDisplayPanelVisible) {
          checkAndRequestFullscreen();
        } else if (!e.matches && document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      });

    // Check immediately
    checkAndRequestFullscreen();
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
