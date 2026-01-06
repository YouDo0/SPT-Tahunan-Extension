// ============================================
// SPT Tahunan Scraper - Popup Script
// Menggunakan async/await untuk operasi non-blocking
// ============================================

class ScraperController {
    constructor() {
        this.isRunning = false;
        this.rowCount = 0;
        this.initializeUI();
        this.setupEventListeners();
    }

    /**
     * Inisialisasi UI Elements
     */
    initializeUI() {
        this.elements = {
            statusBox: document.getElementById('statusBox'),
            infoText: document.getElementById('infoText'),
            btnStart: document.getElementById('btnStart'),
            btnStop: document.getElementById('btnStop'),
            counter: document.getElementById('counter'),
            autoExport: document.getElementById('autoExport'),
            delay: document.getElementById('delay'),
        };

        // Load saved settings
        this.loadSettings();
    }

    /**
     * Setup Event Listeners
     */
    setupEventListeners() {
        this.elements.btnStart.addEventListener('click', () => this.startScraping());
        this.elements.btnStop.addEventListener('click', () => this.stopScraping());
        this.elements.autoExport.addEventListener('change', () => this.saveSettings());
        this.elements.delay.addEventListener('change', () => this.saveSettings());
    }

    /**
     * Load settings dari local storage
     */
    loadSettings() {
        chrome.storage.local.get(['autoExport', 'delay'], (result) => {
            if (result.autoExport !== undefined) {
                this.elements.autoExport.checked = result.autoExport;
            }
            if (result.delay !== undefined) {
                this.elements.delay.value = result.delay;
            }
        });
    }

    /**
     * Save settings ke local storage
     */
    saveSettings() {
        chrome.storage.local.set({
            autoExport: this.elements.autoExport.checked,
            delay: parseInt(this.elements.delay.value),
        });
    }

    /**
     * Update status display
     */
    updateStatus(message, type = 'normal') {
        const statusBox = this.elements.statusBox;
        
        // Remove previous classes
        statusBox.classList.remove('loading', 'error', 'success');
        
        // Set message
        if (type === 'loading') {
            statusBox.innerHTML = `<span class="spinner"></span>${message}`;
            statusBox.classList.add('loading');
        } else {
            const icons = {
                success: '✓',
                error: '✕',
                normal: '►'
            };
            statusBox.innerHTML = `${icons[type]} ${message}`;
            statusBox.classList.add(type);
        }
    }

    /**
     * Update info text
     */
    updateInfo(message) {
        this.elements.infoText.textContent = message;
    }

    /**
     * Update counter
     */
    updateCounter(count) {
        this.rowCount = count;
        this.elements.counter.textContent = `Rows: ${count}`;
    }

    /**
     * Set button states
     */
    setButtonStates(running) {
        this.elements.btnStart.disabled = running;
        this.elements.btnStop.disabled = !running;
    }

    /**
     * Main scraping function (async)
     */
    async startScraping() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.rowCount = 0;
        this.setButtonStates(true);
        this.updateStatus('Connecting to content script...', 'loading');

        try {
            // Get active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]) {
                throw new Error('No active tab found');
            }

            const tabId = tabs[0].id;

            // Send message to content script
            this.updateStatus('Initializing scraper...', 'loading');

            const response = await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(
                    tabId,
                    { action: 'START_SCRAPING', config: this.getConfig() },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (response && response.error) {
                            reject(new Error(response.error));
                        } else {
                            resolve(response);
                        }
                    }
                );
            });

            if (response.success) {
                this.updateStatus('Scraping completed!', 'success');
                this.updateInfo(`✓ Successfully scraped ${response.rowCount} rows`);
                this.updateCounter(response.rowCount);
            }

        } catch (error) {
            console.error('Scraping error:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
            this.updateInfo(`Failed to start scraping. Make sure you're on the correct page.`);
        } finally {
            this.isRunning = false;
            this.setButtonStates(false);
        }
    }

    /**
     * Stop scraping
     */
    async stopScraping() {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs[0]) {
                chrome.tabs.sendMessage(
                    tabs[0].id,
                    { action: 'STOP_SCRAPING' },
                    (response) => {
                        if (!chrome.runtime.lastError && response) {
                            this.updateStatus('Stopped by user', 'error');
                            this.updateInfo(`Partial data: ${response.rowCount} rows collected`);
                            this.updateCounter(response.rowCount);
                        }
                    }
                );
            }
        } catch (error) {
            console.error('Stop error:', error);
        } finally {
            this.isRunning = false;
            this.setButtonStates(false);
        }
    }

    /**
     * Get scraper configuration
     */
    getConfig() {
        return {
            autoExport: this.elements.autoExport.checked,
            delay: parseInt(this.elements.delay.value),
        };
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ScraperController();
});
