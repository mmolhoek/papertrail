// Papertrail Web Interface Client
class PapertrailClient {
    constructor() {
        this.socket = null;
        this.apiBase = '/api';
        this.autoRefreshInterval = null;
        
        this.init();
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
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
            this.socket.emit('gps:subscribe');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
        });

        this.socket.on('gps:update', (data) => {
            this.updateGPSPosition(data);
        });

        this.socket.on('status:update', (data) => {
            this.updateSystemStatus(data);
        });

        // Keep connection alive
        setInterval(() => {
            if (this.socket.connected) {
                this.socket.emit('ping');
            }
        }, 30000);
    }

    // Setup UI Event Listeners
    setupEventListeners() {
        // Track selection
        document.getElementById('load-track-btn').addEventListener('click', () => {
            this.loadSelectedTrack();
        });

        // Zoom controls
        document.getElementById('zoom-in-btn').addEventListener('click', () => {
            this.changeZoom(1);
        });

        document.getElementById('zoom-out-btn').addEventListener('click', () => {
            this.changeZoom(-1);
        });

        document.getElementById('zoom-control').addEventListener('input', (e) => {
            this.setZoom(parseInt(e.target.value));
        });

        // Display controls
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refreshDisplay();
        });

        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearDisplay();
        });

        // Settings
        document.getElementById('auto-center').addEventListener('change', (e) => {
            this.setAutoCenter(e.target.checked);
        });

        document.getElementById('auto-refresh').addEventListener('change', (e) => {
            this.setAutoRefresh(e.target.checked);
        });
    }

    // API Methods
    async loadInitialData() {
        try {
            // Load available tracks
            const tracks = await this.fetchJSON(`${this.apiBase}/map/files`);
            this.populateTrackList(tracks);

            // Load system status
            const status = await this.fetchJSON(`${this.apiBase}/system/status`);
            this.updateSystemStatus(status);

            // Load GPS position
            const position = await this.fetchJSON(`${this.apiBase}/gps/position`);
            this.updateGPSPosition(position);
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async loadSelectedTrack() {
        const select = document.getElementById('track-select');
        const trackPath = select.value;
        
        if (!trackPath) {
            alert('Please select a track');
            return;
        }

        try {
            const result = await this.fetchJSON(`${this.apiBase}/map/active`, {
                method: 'POST',
                body: JSON.stringify({ path: trackPath }),
            });

            alert('Track loaded successfully');
            this.refreshDisplay();
        } catch (error) {
            console.error('Error loading track:', error);
            alert('Failed to load track');
        }
    }

    async changeZoom(delta) {
        const control = document.getElementById('zoom-control');
        const newZoom = Math.max(1, Math.min(20, parseInt(control.value) + delta));
        await this.setZoom(newZoom);
    }

    async setZoom(level) {
        const control = document.getElementById('zoom-control');
        const valueDisplay = document.getElementById('zoom-value');
        
        control.value = level;
        valueDisplay.textContent = level;

        try {
            await this.fetchJSON(`${this.apiBase}/config/zoom`, {
                method: 'POST',
                body: JSON.stringify({ zoom: level }),
            });
        } catch (error) {
            console.error('Error setting zoom:', error);
        }
    }

    async refreshDisplay() {
        const btn = document.getElementById('refresh-btn');
        btn.disabled = true;
        btn.textContent = '⏳ Refreshing...';

        try {
            await this.fetchJSON(`${this.apiBase}/display/update`, {
                method: 'POST',
            });

            btn.textContent = '✓ Refreshed';
            setTimeout(() => {
                btn.textContent = '🔄 Refresh Display';
                btn.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Error refreshing display:', error);
            btn.textContent = '✗ Failed';
            setTimeout(() => {
                btn.textContent = '🔄 Refresh Display';
                btn.disabled = false;
            }, 2000);
        }
    }

    async clearDisplay() {
        try {
            await this.fetchJSON(`${this.apiBase}/display/clear`, {
                method: 'POST',
            });
            alert('Display cleared');
        } catch (error) {
            console.error('Error clearing display:', error);
            alert('Failed to clear display');
        }
    }

    setAutoCenter(enabled) {
        console.log('Auto-center:', enabled);
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

    // UI Update Methods
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('connection-indicator');
        const text = document.getElementById('connection-text');
        
        if (connected) {
            indicator.classList.remove('disconnected');
            indicator.classList.add('connected');
            text.textContent = 'Connected';
        } else {
            indicator.classList.remove('connected');
            indicator.classList.add('disconnected');
            text.textContent = 'Disconnected';
        }
    }

    updateGPSPosition(data) {
        if (data && data.latitude !== undefined) {
            document.getElementById('latitude').textContent = 
                data.latitude.toFixed(6) + '°';
            document.getElementById('longitude').textContent = 
                data.longitude.toFixed(6) + '°';
            document.getElementById('altitude').textContent = 
                data.altitude ? data.altitude.toFixed(1) + ' m' : '--';
        }
    }

    updateSystemStatus(data) {
        if (data) {
            if (data.gps) {
                const gpsStatus = data.gps.connected ? '✓ Active' : '✗ Inactive';
                document.getElementById('gps-status').textContent = gpsStatus;
                document.getElementById('satellites').textContent = 
                    data.gps.satellitesInUse || 0;
            }

            if (data.display) {
                const displayStatus = data.display.initialized ? '✓ Ready' : '✗ Not Ready';
                document.getElementById('display-status').textContent = displayStatus;
            }

            if (data.activeTrack) {
                document.getElementById('active-track').textContent = 
                    data.activeTrack.name || 'None';
            }
        }
    }

    populateTrackList(data) {
        const select = document.getElementById('track-select');
        
        // Keep the first option
        select.innerHTML = '<option value="">Select a track...</option>';
        
        // Add tracks (placeholder for now)
        // Will be populated with actual track data from backend
        const tracks = ['Track 1', 'Track 2', 'Track 3'];
        tracks.forEach(track => {
            const option = document.createElement('option');
            option.value = track;
            option.textContent = track;
            select.appendChild(option);
        });
    }

    // Utility Methods
    async fetchJSON(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
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
document.addEventListener('DOMContentLoaded', () => {
    window.app = new PapertrailClient();
});