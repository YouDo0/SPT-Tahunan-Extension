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
            sptTypeRadios: document.querySelectorAll('input[name="sptType"]'),
            l9Options: document.getElementById('l9Options'),
            l9ChooseAll: document.getElementById('l9ChooseAll'),
            l9Categories: document.querySelectorAll('.l9-category'),
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

        // L3/L9 radio switch
        this.elements.sptTypeRadios.forEach(radio => {
            radio.addEventListener('change', () => this.onSptTypeChange());
        });

        // L9 Choose All checkbox
        this.elements.l9ChooseAll.addEventListener('change', () => this.onChooseAllChange());

        // L9 category checkboxes
        this.elements.l9Categories.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.onCategoryChange());
        });
    }

    /**
     * Handle SPT Type radio change
     */
    onSptTypeChange() {
        const selectedType = document.querySelector('input[name="sptType"]:checked').value;
        if (selectedType === 'L9') {
            this.elements.l9Options.classList.add('visible');
        } else {
            this.elements.l9Options.classList.remove('visible');
        }
        this.saveSettings();
    }

    /**
     * Handle Choose All checkbox change
     */
    onChooseAllChange() {
        const isChecked = this.elements.l9ChooseAll.checked;
        this.elements.l9Categories.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    }

    /**
     * Handle individual category checkbox change
     */
    onCategoryChange() {
        const allChecked = Array.from(this.elements.l9Categories).every(cb => cb.checked);
        const someChecked = Array.from(this.elements.l9Categories).some(cb => cb.checked);
        this.elements.l9ChooseAll.checked = allChecked;
        this.elements.l9ChooseAll.indeterminate = someChecked && !allChecked;
    }

    /**
     * Load settings dari local storage
     */
    loadSettings() {
        chrome.storage.local.get(['autoExport', 'delay', 'sptType'], (result) => {
            if (result.autoExport !== undefined) {
                this.elements.autoExport.checked = result.autoExport;
            }
            if (result.delay !== undefined) {
                this.elements.delay.value = result.delay;
            }
            if (result.sptType !== undefined) {
                const radio = document.querySelector(`input[name="sptType"][value="${result.sptType}"]`);
                if (radio) radio.checked = true;
                this.onSptTypeChange();
            } else {
                this.onSptTypeChange();
            }
        });
    }

    /**
     * Save settings ke local storage
     */
    saveSettings() {
        const sptType = document.querySelector('input[name="sptType"]:checked').value;
        const selectedCategories = sptType === 'L9'
            ? Array.from(this.elements.l9Categories).filter(cb => cb.checked).map(cb => parseInt(cb.value))
            : [];

        chrome.storage.local.set({
            autoExport: this.elements.autoExport.checked,
            delay: parseInt(this.elements.delay.value),
            sptType: sptType,
            selectedCategories: selectedCategories,
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

        if (!this.validateL9Selection()) {
            return;
        }

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
                const sptType = response.sptType || 'L3';
                if (sptType === 'L9') {
                    this.updateStatus('Scraping L9 completed!', 'success');
                    this.updateInfo(`✓ ${response.message}`);
                } else {
                    this.updateStatus('Scraping completed!', 'success');
                    this.updateInfo(`✓ Successfully scraped ${response.rowCount} rows`);
                }
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
        const sptType = document.querySelector('input[name="sptType"]:checked').value;
        const selectedCategories = sptType === 'L9'
            ? Array.from(this.elements.l9Categories).filter(cb => cb.checked).map(cb => parseInt(cb.value))
            : [];

        return {
            sptType: sptType,
            selectedCategories: selectedCategories,
            autoExport: this.elements.autoExport.checked,
            delay: parseInt(this.elements.delay.value),
        };
    }

    /**
     * Validate L9 selections before scraping
     */
    validateL9Selection() {
        const sptType = document.querySelector('input[name="sptType"]:checked').value;
        if (sptType === 'L9') {
            const selectedCategories = Array.from(this.elements.l9Categories).filter(cb => cb.checked);
            if (selectedCategories.length === 0) {
                this.updateStatus('Pilih minimal 1 kategori', 'error');
                this.updateInfo('Untuk L9, pilih setidaknya 1 kategori untuk discrap');
                return false;
            }
        }
        return true;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new ScraperController();
});
