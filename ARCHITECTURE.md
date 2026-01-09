# SPT Tahunan Scraper - System Architecture

## 📚 Overview

SPT Tahunan Scraper adalah Chrome Extension yang mengekstrak data dari **tabel ke-5 (index 4)** pada halaman web, kemudian mengekspornya ke file Excel (XLSX). Sistem dirancang dengan pendekatan **simple & direct** tanpa perlu header matching yang kompleks.

---

## 🏗️ System Architecture

### High-Level Flow

```
┌──────────────────┐
│  User Opens      │
│  Popup UI        │
└────────┬─────────┘
         │ Load settings
         │ Wait for click
         ↓
┌──────────────────────┐
│ Click "Start"        │
│ (send message)       │
└──────────┬───────────┘
           │
           ↓
┌─────────────────────────────────┐
│  Content Script (content.js)    │
│  1. Scan ALL tables             │
│  2. Validate >= 5 tables        │
│  3. Select table[4]             │
│  4. Extract headers + data      │
│  5. Handle pagination           │
└──────────┬──────────────────────┘
           │ (headers + data)
           ↓
┌─────────────────────────────────┐
│  Background (background.js)     │
│  - Generate XLSX                │
│  - Trigger download             │
└─────────────────────────────────┘
           │
           ↓
    ✓ File downloaded
```

---

## 📁 File Structure

```
SPT-Tahunan-Extension/
├── manifest.json          # Extension configuration
├── popup.html             # UI layout
├── popup.js               # UI controller
├── style.css              # Styling
├── content.js             # Main logic (runs on page)
├── background.js          # XLSX export handler
├── xlsx.full.min.js       # Local XLSX library
├── README.md              # Quick start
└── ARCHITECTURE.md        # This file
```

---

## 🔧 Core Components

### 1. **Content Script (content.js)**

**Purpose**: Scan, select, and extract data from table index 4.

#### Function: `analyzeTables()`

```javascript
// Simple: scan ALL tables, no filtering
function analyzeTables() {
    const allTables = document.querySelectorAll('table');
    
    return allTables.map((table, index) => ({
        index: index,
        id: table.id || `table-${index}`,
        rowCount: tbody ? tbody.querySelectorAll('tr').length : 0,
        element: table,
        headers: extract from <thead>,
        // ... metadata
    }));
}
```

**Returns**: Array of all tables, indexed 0 to N

#### Function: `startScraping(configData)`

**Workflow**:
```
1. GET ALL TABLES
   └─ allTables = analyzeTables()

2. VALIDATE
   └─ if (allTables.length < 5) → ERROR

3. SELECT TABLE INDEX 4
   └─ tableElement = allTables[4].element

4. EXTRACT HEADERS
   └─ headers = <thead> th values

5. LOOP: Extract Rows
   ├─ Query <tbody> tr
   ├─ Extract all td values
   ├─ Clean whitespace + labels
   └─ Add to allData[]

6. PAGINATION
   ├─ Find .p-paginator-next button
   ├─ If enabled: click + wait
   ├─ If disabled: break loop
   └─ Repeat extraction

7. EXPORT
   └─ Send EXPORT_XLSX to background
```

#### Data Extraction

```javascript
// For each row in table[4]
const rowData = [];
row.querySelectorAll('td').forEach(td => {
    // Remove PrimeNG labels
    const clone = td.cloneNode(true);
    clone.querySelector('.p-column-title')?.remove();
    
    // Extract text (clean)
    const text = clone.textContent.trim()
        .replace(/\s+/g, ' '); // single space
    rowData.push(text);
});

allData.push(rowData);
```

#### Pagination

```javascript
// Check if more pages exist
const nextBtn = tableElement.closest('.p-datatable')
    ?.parentElement?.querySelector('.p-paginator-next');

if (nextBtn && !nextBtn.classList.contains('p-disabled')) {
    nextBtn.click();
    await sleep(config.delay); // wait for load
    // Loop again to extract next page data
}
```

#### Message Handler

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_SCRAPING') {
        startScraping(request.config)
            .then(result => sendResponse({ success: true, ...result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // async
    }
    
    if (request.action === 'STOP_SCRAPING') {
        stopRequested = true;
        sendResponse({ stopped: true });
    }
});
```

---

### 2. **Popup (popup.html + popup.js)**

**Purpose**: User controls and settings.

#### UI Elements

- **Status Box** - Current operation status
- **Info Text** - Status details
- **Row Counter** - Extracted row count
- **Start Button** - Trigger scraping
- **Stop Button** - Cancel scraping
- **Settings**:
  - Auto Export (checkbox)
  - Delay slider (ms)

#### Controller: `ScraperController`

```javascript
class ScraperController {
    initializeUI()
        // Get element references
        // Load settings from chrome.storage.local
    
    setupEventListeners()
        // Start → startScraping()
        // Stop → stopScraping()
        // Settings → saveSettings()
    
    startScraping()
        // Send START_SCRAPING message
        // Wait for response
        // Update UI
    
    stopScraping()
        // Send STOP_SCRAPING message
    
    saveSettings()
        // Save to chrome.storage.local
}
```

---

### 3. **Background Script (background.js)**

**Purpose**: Generate XLSX and trigger download.

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXPORT_XLSX') {
        const { headers, data } = request;
        
        // Use local xlsx.full.min.js
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        XLSX.utils.book_append_sheet(wb, ws);
        
        // Generate filename: SPT_Tahunan_YYYY-MM-DD_HH-mm-ss.xlsx
        const filename = `SPT_Tahunan_${getTimestamp()}.xlsx`;
        XLSX.writeFile(wb, filename);
        
        sendResponse({ success: true });
    }
});
```

---

## 🔄 Message Flow

```
Popup                  Content Script              Background
 │                         │                          │
 ├─ Click "Start"          │                          │
 │                         │                          │
 ├─ START_SCRAPING ───────>│                          │
 │                         ├─ Scan tables            │
 │                         ├─ Validate >= 5          │
 │                         ├─ Select index 4         │
 │                         ├─ Extract headers        │
 │                         ├─ Loop pages + rows      │
 │                         ├─ EXPORT_XLSX ─────────>│
 │                         │                         ├─ Generate XLSX
 │                         │                         ├─ Download
 │                         │<─────── { success } ────┤
 │<─ { success, rowCount } ┤                         │
 │                         │                         │
 ├─ Update UI + results    │                         │
```

---

## ⚙️ Configuration

### Settings (Persistent in chrome.storage.local)

```javascript
{
    autoExport: boolean,  // Auto-export after scraping
    delay: number         // Wait time between pagination (ms)
}
```

### Content Script Config

```javascript
let config = {
    autoExport: true,
    delay: 500,  // Default, read from popup settings
};
```

---

## ✅ Workflow Requirements

### Halaman Web harus punya:

1. **Minimal 5 `<table>` elements** 
   - Tabel ke-5 (index 4) adalah target

2. **Setiap tabel format standar**:
   ```html
   <table>
       <thead>
           <tr><th>Col1</th><th>Col2</th>...</tr>
       </thead>
       <tbody>
           <tr><td>Val1</td><td>Val2</td>...</tr>
           ...
       </tbody>
   </table>
   ```

3. **Pagination (optional)**
   - Tombol `.p-paginator-next` untuk halaman berikutnya
   - Otomatis di-handle jika ada

---

## 🚨 Error Handling

| Scenario | Response |
|----------|----------|
| < 5 tables | Error: "Need at least 5 tables..." |
| No tbody | Warning: skip extraction, break pagination |
| Export fails | Fallback to binary CSV export |

---

## 🔍 Debug

**Console output** (browser F12):

```
[Scraper] INFO: Found 8 total tables on page
[Scraper] INFO: Selected table index 4 (5th table): ...
[Scraper] INFO: Headers found: 10
[Scraper] INFO: Processing 25 rows on page 1
[Scraper] SUCCESS: File exported
```

**Debug function**:
```javascript
debugTableStructure()  // Logs all tables info
```

---

## 📊 Data Processing

### Input
- Halaman dengan >= 5 tables
- Table[4] punya data di `<tbody>`

### Processing
1. Extract headers from `<thead>`
2. Extract all rows from `<tbody>`
3. Clean: remove labels, trim whitespace
4. Handle pagination across multiple pages

### Output
```
SPT_Tahunan_2024-01-09_14-30-45.xlsx
├── Headers row
├── Data rows (all pages combined)
└── Total: rowCount rows
```

---

## 🎯 Key Differences from Previous Version

| Aspect | Before | Now |
|--------|--------|-----|
| Table Selection | Header matching | Index-based (table[4]) |
| Complexity | Complex filtering | Simple & direct |
| Header Check | REFERENCE_HEADERS array | None - just extract |
| Selector IDs | Hardcoded selectors | Not needed |
| Validation | Header validation | Just count tables |

---

**Version:** 2.0 (Simplified)  
**Last Updated:** January 2026  
**Approach:** Index-Based Direct Extraction
