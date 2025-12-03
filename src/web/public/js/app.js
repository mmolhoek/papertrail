// Papertrail Web Interface Client
class PapertrailClient {
  constructor() {
    this.socket = null;
    this.apiBase = "/api";
    this.autoRefreshInterval = null;
    this.setupHamburgerMenu = this.setupHamburgerMenu.bind(this);
    this.setupHamburgerMenu();

    this.init();
  }

  // Bind and initialize the hamburger menu

  setupHamburgerMenu() {
    const menuToggle = document.getElementById("menu-toggle");
    const menuContent = document.getElementById("menu-content");

    menuToggle.addEventListener("click", () => {
      menuContent.classList.toggle("hidden");
    });

    // Show the GPX Track Selection panel
    const trackSelectionButton = document.getElementById(
      "menu-track-selection",
    );
    const trackSelectionPanel = document.getElementById(
      "track-selection-panel",
    );
    trackSelectionButton.addEventListener("click", () => {
      const isHidden = trackSelectionPanel.style.display === "none";
      trackSelectionPanel.style.display = isHidden ? "block" : "none";
      menuContent.classList.add("hidden");

      // Toggle indicator icon
      const trackIndicator = document.getElementById(
        "track-selection-indicator",
      );
      trackIndicator.classList.toggle("hidden", !isHidden);
    });

    // Show the Display Controls panel
    const displayControlsButton = document.getElementById(
      "menu-display-controls",
    );
    const displayControlsPanel = document.getElementById(
      "display-controls-panel",
    );
    displayControlsButton.addEventListener("click", () => {
      const isHidden = displayControlsPanel.style.display === "none";
      displayControlsPanel.style.display = isHidden ? "block" : "none";
      menuContent.classList.add("hidden");

      // Toggle indicator icon
      const displayIndicator = document.getElementById(
        "display-controls-indicator",
      );
      displayIndicator.classList.toggle("hidden", !isHidden);
    });

    // Show the WiFi Settings panel
    const wifiSettingsButton = document.getElementById("menu-wifi-settings");
    const wifiSettingsPanel = document.getElementById("wifi-settings-panel");
    wifiSettingsButton.addEventListener("click", () => {
      const isHidden = wifiSettingsPanel.style.display === "none";
      wifiSettingsPanel.style.display = isHidden ? "block" : "none";
      menuContent.classList.add("hidden");

      // Toggle indicator icon
      const wifiIndicator = document.getElementById("wifi-settings-indicator");
      wifiIndicator.classList.toggle("hidden", !isHidden);

      // Load current WiFi config when opening
      if (isHidden) {
        this.loadWiFiConfig();
      }
    });
  }

  // Show a system message
  showMessage(message, type = "info") {
    const messageIndicator = document.getElementById("message-indicator");
    const messageText = document.getElementById("message-text");

    // Set message content and type
    messageText.textContent = message;
    messageIndicator.className = `indicator ${type}`;

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

    // Keep connection alive
    setInterval(() => {
      if (this.socket.connected) {
        this.socket.emit("ping");
      }
    }, 30000);
  }

  // Setup UI Event Listeners
  setupEventListeners() {
    // Track selection
    document.getElementById("load-track-btn").addEventListener("click", () => {
      this.loadSelectedTrack();
    });

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

    // WiFi settings
    document.getElementById("save-wifi-btn").addEventListener("click", () => {
      this.saveWiFiConfig();
    });

    document.getElementById("toggle-password").addEventListener("click", () => {
      this.togglePasswordVisibility();
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
    } catch (error) {
      console.error("Error loading initial data:", error);
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

      this.showMessage("Track loaded successfully", "success");
      this.refreshDisplay();
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
    btn.disabled = true;
    btn.textContent = "⏳ Refreshing...";

    try {
      await this.fetchJSON(`${this.apiBase}/display/update`, {
        method: "POST",
      });

      btn.textContent = "✓ Refreshed";
      setTimeout(() => {
        btn.textContent = "🔄 Refresh Display";
        btn.disabled = false;
      }, 2000);
    } catch (error) {
      console.error("Error refreshing display:", error);
      btn.textContent = "✗ Failed";
      setTimeout(() => {
        btn.textContent = "🔄 Refresh Display";
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
          currentSsidDisplay.textContent = `Current hotspot: ${response.data.ssid}`;
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
    saveBtn.textContent = "Saving...";

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
          `Current hotspot: ${ssid}`;
      } else {
        this.showMessage(
          result.error?.message || "Failed to save WiFi settings",
          "error",
        );
      }
    } catch (error) {
      console.error("Error saving WiFi config:", error);
      this.showMessage("Failed to save WiFi settings", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save WiFi Settings";
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
      document.getElementById("latitude").textContent =
        data.latitude.toFixed(6) + "°";
      document.getElementById("longitude").textContent =
        data.longitude.toFixed(6) + "°";
      document.getElementById("altitude").textContent = data.altitude
        ? data.altitude.toFixed(1) + " m"
        : "--";
    }
  }

  updateGPSStatus(data) {
    if (data) {
      // Update GPS connection status
      // If we're receiving GPS data, the GPS is active
      const gpsStatusElement = document.getElementById("gps-status");
      if (gpsStatusElement) {
        const isActive = data.isTracking !== undefined ? data.isTracking : true;
        gpsStatusElement.textContent = isActive ? "✓ Active" : "✗ Inactive";
        gpsStatusElement.className = isActive
          ? "value status-good"
          : "value status-bad";
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

        fixElement.textContent = hasFix ? "✓ " + fixName : "✗ " + fixName;
        fixElement.className = hasFix ? "status-good" : "status-bad";
      }

      // Update satellites count
      if (data.satellitesInUse !== undefined) {
        const satellitesElement = document.getElementById("satellites");
        satellitesElement.textContent = data.satellitesInUse;

        // Color-code satellites: green if 4+, yellow if 1-3, red if 0
        if (data.satellitesInUse >= 4) {
          satellitesElement.className = "value status-good";
        } else if (data.satellitesInUse > 0) {
          satellitesElement.className = "value status-unknown";
        } else {
          satellitesElement.className = "value status-bad";
        }
      }

      // Update HDOP (Horizontal Dilution of Precision - lower is better)
      const hdopElement = document.getElementById("gps-hdop");
      if (hdopElement && data.hdop !== undefined) {
        hdopElement.textContent = data.hdop.toFixed(1);

        // Color-code HDOP: <2=excellent, 2-5=good, 5-10=moderate, >10=poor
        if (data.hdop < 2) {
          hdopElement.className = "value status-good";
        } else if (data.hdop < 5) {
          hdopElement.className = "value status-good";
        } else if (data.hdop < 10) {
          hdopElement.className = "value status-unknown";
        } else {
          hdopElement.className = "value status-bad";
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
          const gpsStatus = data.gps.connected ? "✓ Active" : "✗ Inactive";
          gpsStatusElement.textContent = gpsStatus;
          gpsStatusElement.className = data.gps.connected
            ? "value status-good"
            : "value status-bad";
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
          displayElement.textContent = "✓ " + displayInfo;
          displayElement.className = "value status-good";
        } else {
          displayElement.textContent = "✗ Not Ready";
          displayElement.className = "value status-bad";
        }
      } else {
        // No display data available
        const displayElement = document.getElementById("display-status");
        displayElement.textContent = "Unknown";
        displayElement.className = "value status-unknown";
      }

      if (data.activeTrack) {
        document.getElementById("active-track").textContent =
          data.activeTrack.name || "None";
      }
    }
  }

  populateTrackList(data) {
    const select = document.getElementById("track-select");

    // Keep the first option
    select.innerHTML = '<option value="">Select a track...</option>';

    // Add tracks (placeholder for now)
    // Will be populated with actual track data from backend
    const tracks = ["Track 1", "Track 2", "Track 3"];
    tracks.forEach((track) => {
      const option = document.createElement("option");
      option.value = track;
      option.textContent = track;
      select.appendChild(option);
    });
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
}

// Initialize app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new PapertrailClient();
});
