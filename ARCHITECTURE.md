# SPT Tahunan Scraper - System Architecture

## 📚 Overview

SPT Tahunan Scraper adalah Chrome Extension yang otomatis mengekstrak data dari tabel PrimeNG pada halaman web SPT Tahunan, kemudian mengekspornya ke file Excel (XLSX). Sistem dirancang dengan fokus pada **reliability** dan **simplicity**.

---

## 🏗️ System Architecture

### High-Level Flow

```
┌──────────────────┐
│  User Opens      │
│  Popup UI        │
└────────┬─────────┘
         │
         │ (popup.js)
         ├─ Load saved settings (delay, autoExport)
         └─ Wait for user to click "Start Scraping"
                    │
                    ↓
         ┌──────────────────────┐
         │ User Clicks          │
         │ "Start Scraping"     │
         └──────────┬───────────┘
                    │
         (popup.js sends message)
                    │
                    ↓
         ┌──────────────────────────────────────┐
         │  Content Script (content.js)         │
         │  - Scan ALL tables on page           │
         │  - Filter by hardcoded headers       │
         │  - Check if >= 5 tables found        │
         │  - Auto-select table index 4 (5th)   │
         │  - Extract headers + data            │
         │  - Handle pagination (click Next)    │
         └──────────┬───────────────────────────┘
                    │
         (content.js sends data via message)
                    │
                    ↓
         ┌──────────────────────────────────────┐
         │  Background Script (background.js)   │
         │  - Generate XLSX file from data      │
         │  - Trigger download                  │
         └──────────────────────────────────────┘
                    │
                    ↓
         ┌──────────────────────┐
         │  File Downloaded     │
         │  SPT_Tahunan_...xlsx │
         └──────────────────────┘
```

---

## 📁 File Structure

```
SPT-Tahunan-Extension/
├── manifest.json          # Chrome Extension configuration (Manifest v3)
├── popup.html             # Popup UI layout
├── popup.js               # Popup controller logic
├── style.css              # UI styling
├── content.js             # Content script (runs on page)
├── background.js          # Background service worker
├── xlsx.full.min.js       # Local XLSX library (no internet needed)
├── README.md              # Quick start guide
└── ARCHITECTURE.md        # This file - Complete documentation
```

---

## 🔧 Core Components

### 1. **Manifest (manifest.json)**

**Purpose**: Define extension permissions, scripts, and configuration.

**Key Points**:
- Manifest v3 (latest Chrome extension standard)
- Content script injected into matching pages
- Background service worker for long-running tasks
- Permissions for `activeTab`, `scripting`, `storage`, `downloads`

---

### 2. **Popup UI (popup.html + popup.js + style.css)**

**Purpose**: User interface for controlling the scraper.

#### HTML Structure
- **Status Box**: Shows current operation status (Connecting, Scraping, Complete, Error)
- **Info Text**: Additional status information
- **Row Counter**: Shows number of rows extracted
- **Start Button**: Triggers scraping process
- **Stop Button**: Cancels scraping
- **Settings**:
  - Auto Export checkbox (default: enabled)
  - Delay slider in milliseconds (default: 500ms)

#### popup.js - ScraperController Class

```javascript
class ScraperController {
    constructor()
        // Initialize UI elements
        // Load saved settings
        // Setup event listeners

    initializeUI()
        // Get references to HTML elements
        // Initialize only needed elements (no table selection)

    setupEventListeners()
        // Attach handlers for Start/Stop buttons
        // Attach handlers for Settings changes

    startScraping()
        // Send START_SCRAPING message to content script
        // Display "Connecting..." status
        // Handle response and update UI

    stopScraping()
        // Send STOP_SCRAPING message to content script
        // Update status display

    loadSettings()
        // Read from chrome.storage.local
        // Populate UI with saved values

    saveSettings()
        // Save settings to chrome.storage.local
}
```

**Key Behavior**:
- ✅ No table scanning on popup load
- ✅ Scanning happens ONLY when user clicks "Start Scraping"
- ✅ Settings (delay, autoExport) are optional and configurable
- ✅ Clean, minimal UI with no dropdowns

---

### 3. **Content Script (content.js)**

**Purpose**: Runs on the web page to detect, extract, and process data from tables.

#### A. Table Detection System

**Hardcoded Reference Headers**:
```javascript
const REFERENCE_HEADERS = [
    "TINDAKAN",
    "NO.",
    "NAMA PEMOTONG/PEMUNGUT",
    "NPWPW PEMOTONG/PEMUNGUT",
    "Jenis Pajak",
    "DASAR PENGENAAN PAJAK (Rupiah)",
    "PPH YANG DIPOTONG/DIPUNGUT (Rupiah)",
    "BUKTI POTONG/SSP/SSPCP - NOMOR",
    "BUKTI POTONG/SSP/SSPCP - TANGGAL",
    "Pilih Jenis Pajak"
];
```

**Why hardcoded?**
- Table ID (`pr_id_82-table`) changes unpredictably
- Header values are stable across page loads
- Provides exact matching without false positives

#### B. Core Functions

**`analyzeTables()`**
```javascript
// Scans ALL <table> elements on page
// For each table:
//   - Extract headers from <thead>
//   - Compare against REFERENCE_HEADERS (must match exactly)
//   - Count rows in <tbody>
//   - Store table reference + metadata
// Returns array of matching tables with index 0-N
```

**`headersMatch(headers1, headers2)`**
```javascript
// Case-sensitive exact match comparison
// Both arrays must be identical in content and length
// Returns boolean
```

#### C. Scraping Process

**`startScraping(configData)`**

Step-by-step execution:
1. **Validation**:
   - Call `analyzeTables()` to find all matching tables
   - Check if `tables.length >= 5` → error if not
   
2. **Auto-Selection**:
   - Select `tables[4]` (5th table, 0-based indexing)
   - No user choice, always automatic

3. **Header Extraction**:
   - Extract headers from selected table's `<thead>`
   - Fallback to reference headers if not found

4. **Data Extraction Loop**:
   - Query `<tbody>` for all `<tr>` rows
   - For each row, extract all `<td>` cells
   - Clean data: remove PrimeNG labels, trim whitespace
   - Filter empty rows

5. **Pagination**:
   - Find `.p-paginator-next` button
   - If enabled: click and wait for data to load
   - If disabled: stop pagination
   - Repeat data extraction

6. **Export**:
   - Send `EXPORT_XLSX` message to background script
   - Pass headers + data array

**Error Handling**:
- If < 5 tables: throw `"Insufficient matching tables found..."`
- If no tbody: log warning and break pagination
- All errors propagated back to popup

---

### 4. **Background Script (background.js)**

**Purpose**: Handle XLSX export (long-running operation).

**Process**:
1. Listen for `EXPORT_XLSX` message
2. Use local `xlsx.full.min.js` library
3. Create workbook from headers + data
4. Generate XLSX blob
5. Trigger download with filename: `SPT_Tahunan_YYYY-MM-DD_HH-mm-ss.xlsx`

**Why background script?**
- XLSX library is large and needs worker context
- Allows content script to focus on scraping
- Handles file downloads properly in v3 manifests

---

## 🔄 Message Flow

### START_SCRAPING Flow

```
Popup                          Content Script              Background
│                              │                            │
├─ User clicks "Start"         │                            │
│                              │                            │
├─ Send message:               │                            │
│  {action: START_SCRAPING,    │                            │
│   config: {autoExport, delay}}                            │
│                              │                            │
├─ Display "Connecting..."     ├─ Analyze tables           │
│                              ├─ Validate (>=5)           │
│                              ├─ Auto-select index 4      │
│                              ├─ Extract headers          │
│                              ├─ Loop pages + extract     │
│                              │                            │
│                              ├─ If autoExport=true:      │
│                              │  Send EXPORT_XLSX ────────┼─ Generate XLSX
│                              │                            │
│                              ├─ Send response:           │
│                              │  {success, rowCount}      │
│                              │                            │
├─ Update status ✓             │                            │
├─ Show row count              │                            │
└─ Enable buttons              │                            │
```

---

## ⚙️ Configuration & Settings

### User-Configurable Settings

**Auto Export** (checkbox)
- **Default**: Enabled
- **Effect**: If true, automatically trigger XLSX export after scraping
- **Stored in**: `chrome.storage.local`

**Delay** (slider, milliseconds)
- **Default**: 500ms
- **Effect**: Wait time between pagination clicks for page to load
- **Range**: typically 200-1000ms
- **Stored in**: `chrome.storage.local`

### Hardcoded Configuration (in content.js)

```javascript
let config = {
    autoExport: true,    // Read from popup settings
    delay: 500,          // Read from popup settings
};
```

---

## 🚨 Error Handling

### Error Scenarios & Response

| Scenario | Error Message | User Sees |
|----------|---------------|-----------|
| Fewer than 5 tables | "Insufficient matching tables found..." | ❌ Error status |
| No matching headers | Caught in validation | ❌ Error status |
| Table structure changed | "No tbody found" | ❌ Warning, stop pagination |
| Network timeout | chrome.runtime.lastError | ❌ Error status |
| Export fails | "Export failed: ..." | ❌ Error status, partial data |

### Debug Information

**Console logs** (content.js):
```javascript
log(`Found ${tableList.length} tables matching reference headers`, 'info');
log(`Auto-selected table index 4 (5th table)`, 'info');
log(`Processing ${rows.length} rows on page ${pageCount}`, 'info');
```

**Debug function**:
```javascript
debugTableStructure()
// Logs complete DOM structure of all tables
// Helps identify why table detection failed
```

---

## 🔐 Data Privacy & Security

### What is Sent Where

- **To Background Script**: Headers + extracted data (for export)
- **Downloaded File**: Full data table as XLSX
- **NOT Sent to Internet**: All processing local, no external APIs

### Permissions Used

- `activeTab` - Access current page
- `scripting` - Inject content script
- `storage` - Save settings locally
- `downloads` - Save XLSX files

---

## 📊 Table Structure Expectations

### HTML Table Format

```html
<table id="pr_id_XXX-table">
    <thead>
        <tr>
            <th>TINDAKAN</th>
            <th>NO.</th>
            <th>NAMA PEMOTONG/PEMUNGUT</th>
            ... (10 total headers)
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>...</td>
            <td>...</td>
            ... (10 cells matching headers)
        </tr>
        ... (multiple rows)
    </tbody>
</table>
```

### Required Properties

- `<table>` element with `<thead>` and `<tbody>`
- `<thead>` has single `<tr>` with `<th>` elements
- Headers must match REFERENCE_HEADERS exactly (in order)
- `<tbody>` contains data rows with `<td>` elements
- Must have at least 5 matching tables on page

---

## 🔍 Troubleshooting

### Extension Not Detecting Tables

1. **Check browser console** (F12 → Console):
   - Look for `[Scraper] DEBUG TABLE STRUCTURE`
   - See how many tables detected, their headers

2. **Run debugTableStructure()**:
   - Execute in console: `debugTableStructure()`
   - Verify table IDs, header counts, row counts

3. **Verify header match**:
   - Check if REFERENCE_HEADERS in code matches page headers exactly
   - Headers are case-sensitive
   - Must be in same order

### Scraping Stops Early

- **Check pagination**: Is `.p-paginator-next` button available?
- **Check delay setting**: Increase if pages not loading in time
- **Check console for errors**: May indicate DOM change

### Export Not Triggering

- **Auto Export disabled**: Check Settings checkbox
- **Background script error**: Check extension background logs
- **File download blocked**: Check browser download settings

---

## 🚀 Development & Modification

### To Change Reference Headers

1. Open `content.js`
2. Find `REFERENCE_HEADERS` array
3. Update with new headers
4. Note: Must match exact case and order

### To Add New Export Format

1. Extend `exportToExcel()` function in `content.js`
2. Or add new export handler in `background.js`
3. Update message listener to handle new action

### To Modify Pagination Logic

1. Edit `startScraping()` → pagination section
2. Find `.p-paginator-next` button selector
3. Adjust if page structure differs

---

## 📝 Version History

### v1.0 - Auto-Select Mode
- ✅ Simplified UI - removed table dropdown
- ✅ Auto-detection and selection of 5th matching table
- ✅ Scanning happens only when "Start Scraping" clicked
- ✅ Cleaned up unused code (updateTableList, GET_TABLES handler)
- ✅ Comprehensive ARCHITECTURE.md documentation

---

## 🤝 Support

For issues:
1. Check console logs for error messages
2. Run `debugTableStructure()` to inspect DOM
3. Verify page has at least 5 matching tables
4. Confirm header values match REFERENCE_HEADERS exactly
