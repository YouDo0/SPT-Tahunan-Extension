# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SPT Tahunan Scraper is a Chrome Extension (Manifest V3) that automatically extracts data from the **5th table (index 4)** on Indonesian tax web pages and exports it to Excel (XLSX). The extension targets the CORETAX system specifically.

### Target Environment
- Web pages must have **at least 5 `<table>` elements**
- The target table is always at index 4 (the 5th table)
- Tables use PrimeNG components (`.p-datatable`, `.p-paginator-next`)

---

## Development Commands

### Load/Reload Extension in Chrome
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this extension directory
5. After code changes, click the reload icon on the extension card

### Debugging
- **Content script logs**: Open DevTools (F12) on the target page → Console tab → Look for `[Scraper]` prefixed logs
- **Popup logs**: Right-click the extension popup → Inspect → Console tab
- **Background script logs**: Go to `chrome://extensions/` → Service worker link for this extension

---

## Architecture

### Component Communication Flow

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   popup.js  │────────▶│  content.js  │────────▶│    XLSX     │
│  (UI Ctrl)  │  msgs   │  (Scraping)  │  uses   │   library   │
└─────────────┘         └──────────────┘         └─────────────┘
     │                                                      │
     │                   chrome.storage.local               │
     └──────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `content.js` | Main scraping logic, runs on target page. Handles table detection, data extraction, pagination, duplicate detection, and Excel export |
| `popup.js` | UI controller. Sends START_SCRAPING/STOP_SCRAPING messages to content script |
| `popup.html` | Extension popup UI with status display, start/stop buttons, and settings |
| `background.js` | Minimal service worker (logging only - export happens in content script) |
| `xlsx.full.min.js` | SheetJS library for XLSX export, loaded as content script |
| `manifest.json` | Manifest V3 configuration |

### Content Script Structure (`content.js`)

**State Variables:**
```javascript
let isRunning = false;        // Scraping active flag
let stopRequested = false;    // Stop signal from popup
let config = {                // Settings from popup
    autoExport: true,
    delay: 500,
};
```

**Core Functions:**

| Function | Purpose |
|----------|---------|
| `analyzeTables()` | Scans all `<table>` elements, returns metadata array. Validates minimum 5 tables exist. |
| `startScraping(configData)` | Main entry point. Orchestrates table selection, data extraction, pagination, and export. |
| `extractBuktiPotongValues()` | Extracts values from "BUKTI POTONG/SSP/SSPCP - NOMOR" column (index 8) for duplicate detection |
| `isDuplicatePage()` | Compares current page values with previous page to detect pagination loops |
| `waitForPageComplete()` | Waits for all table rows to load (excluding "TINDAKAN" column) before proceeding |
| `exportToExcel()` | Exports data to XLSX using SheetJS, with CSV fallback |
| `parseCurrency()` | Parses Indonesian currency format (e.g., "1.000.000,00") to numbers for specific columns |

**Pagination with Duplicate Detection:**

The scraper detects when pagination loops (same data repeating on "Next" click):

1. Click "Next" button
2. Wait 500ms for page load
3. Extract "BUKTI POTONG/SSP/SSPCP - NOMOR" values from new page
4. Compare with previous page's stored values
5. If duplicate (up to 10 retries):
   - Wait 500ms
   - Click "Previous" button
   - Wait 500ms
   - Click "Next" button again
   - Increment retry counter
6. After 10 consecutive duplicates: Stop and save data

**Selectors:**
- Next button: `.p-paginator-next`
- Previous button: `p-paginator > div > button.p-paginator-prev`
- Target table: `allTables[4]` (5th table by index, not by selector)

### Message Protocol

**From Popup to Content:**
```javascript
{ action: 'START_SCRAPING', config: { autoExport: boolean, delay: number } }
{ action: 'STOP_SCRAPING' }
```

**Response from Content:**
```javascript
{ success: true, rowCount: number, pageCount: number, message: string }
{ success: false, error: string }
{ stopped: true, rowCount: number }
```

---

## Important Constraints

### Table Selection Logic
- **Always targets table at index 4** (the 5th table on the page)
- Validation: Throws error if fewer than 5 tables exist
- No header matching - directly extracts whatever is in that table position

### Data Cleaning
- Removes `.p-column-title` spans (PrimeNG labels)
- Trims whitespace and collapses multiple spaces
- Filters out empty headers and "Silakan Pilih" placeholder text

### Currency Columns
Specific columns are automatically parsed as numbers:
- `DASAR PENGENAAN PAJAK (Rupiah)`
- `PPH YANG DIPOTONG/DIPUNGUT (Rupiah)`

### Duplicate Detection Column
- Target column: "BUKTI POTONG/SSP/SSPCP - NOMOR"
- Fallback index: 8 if column name not found
- Only stores last page's values for memory efficiency

---

## Common Modifications

### Change Target Table Index
Modify in `content.js`:
```javascript
// Line ~404: Change validation threshold
if (allTables.length < 5) { ... }

// Line ~411: Change selected index
const selectedTable = allTables[4];  // Change 4 to desired index
```

### Add/Remove Currency Columns
Modify in `content.js`:
```javascript
// In isCurrencyColumn() function
const currencyColumns = [
    'DASAR PENGENAAN PAJAK (Rupiah)',
    'PPH YANG DIPOTONG/DIPUNGUT (Rupiah)',
    // Add new column names here
];
```

### Change Duplicate Detection Column
Modify in `content.js`:
```javascript
// In extractBuktiPotongValues() function
const buktiPotongIndex = headers.findIndex(h => h === "YOUR_COLUMN_NAME");
const columnIndex = buktiPotongIndex !== -1 ? buktiPotongIndex : 8; // Change fallback index
```

### Adjust Pagination Delay
Set via popup UI (200-2000ms range) or modify default:
```javascript
// In content.js, line ~10
let config = {
    autoExport: true,
    delay: 500,  // Default delay in ms
};
```
