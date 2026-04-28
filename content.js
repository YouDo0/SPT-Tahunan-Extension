// ============================================
// SPT Tahunan Scraper - Content Script
// Menggunakan async/await untuk kontrol penuh
// ============================================

let isRunning = false;
let stopRequested = false;
let config = {
    sptType: 'L3',
    selectedCategories: [],
    autoExport: true,
    delay: 500,
};

const MAX_DUPLICATE_RETRY = 10;

// L9 Category mapping (by accordion + panel semantic path)
const L9_CATEGORY_MAP = {
    1: { accordion: 'Harta Berwujud', panel: 'Kelompok 1', name: 'Harta Berwujud - Kelompok 1' },
    2: { accordion: 'Harta Berwujud', panel: 'Kelompok 2', name: 'Harta Berwujud - Kelompok 2' },
    3: { accordion: 'Harta Berwujud', panel: 'Kelompok 3', name: 'Harta Berwujud - Kelompok 3' },
    4: { accordion: 'Harta Berwujud', panel: 'Kelompok 4', name: 'Harta Berwujud - Kelompok 4' },
    5: { accordion: 'Harta Berwujud', panel: 'Kelompok Lainnya', name: 'Harta Berwujud - Kelompok Lainnya' },
    6: { accordion: 'Bangunan', panel: 'Permanen', name: 'Bangunan - Permanen' },
    7: { accordion: 'Bangunan', panel: 'Tidak Permanen', name: 'Bangunan - Tidak Permanen' },
    8: { accordion: 'Harta Tidak Berwujud', panel: 'Kelompok 1', name: 'Harta Tidak Berwujud - Kelompok 1' },
    9: { accordion: 'Harta Tidak Berwujud', panel: 'Kelompok 2', name: 'Harta Tidak Berwujud - Kelompok 2' },
    10: { accordion: 'Harta Tidak Berwujud', panel: 'Kelompok 3', name: 'Harta Tidak Berwujud - Kelompok 3' },
    11: { accordion: 'Harta Tidak Berwujud', panel: 'Kelompok 4', name: 'Harta Tidak Berwujud - Kelompok 4' },
    12: { accordion: 'Harta Tidak Berwujud', panel: 'Kelompok Lainnya', name: 'Harta Tidak Berwujud - Kelompok Lainnya' },
};

// ============================================
// SEMANTIC DOM FINDER FUNCTIONS (L9/L3)
// ============================================

/**
 * Find tabPanel element by its label text (L3 / L9)
 */
function findTabPanelByLabel(targetLabel) {
    log(`Searching for tabPanel with label: "${targetLabel}"`, 'info');

    // Try PrimeNG p-tabPanel
    let tabPanels = document.querySelectorAll('p-tabPanel, [p-tabpanel], .p-tabpanel, [role="tabpanel"]');
    log(`Found ${tabPanels.length} potential tabPanels`, 'info');

    for (const panel of tabPanels) {
        const labelText = panel.innerText || '';
        const ariaLabel = panel.getAttribute('aria-label') || '';
        const id = panel.id || '';
        log(`Checking panel: id="${id}", aria-label="${ariaLabel}", text="${labelText.substring(0, 50)}"`, 'info');

        if (labelText.toLowerCase().includes(targetLabel.toLowerCase()) ||
            ariaLabel.toLowerCase().includes(targetLabel.toLowerCase()) ||
            id.toLowerCase().includes(targetLabel.toLowerCase())) {
            log(`Found matching tabPanel: ${id}`, 'success');
            return panel;
        }
    }

    // Fallback: search by aria-label or data attributes
    const allElements = document.querySelectorAll('[aria-label*="L3"], [aria-label*="L9"], [data-label*="L3"], [data-label*="L9"], [p-tabpanel]');
    log(`Fallback search found ${allElements.length} elements with L3/L9 attributes`, 'info');
    for (const el of allElements) {
        const label = el.getAttribute('aria-label') || el.getAttribute('data-label') || el.getAttribute('p-tabpanel') || '';
        if (label.toLowerCase().includes(targetLabel.toLowerCase())) {
            log(`Found matching element via attribute: ${label}`, 'success');
            return el;
        }
    }

    // Last resort: look for any element containing L3/L9 text
    const textElements = document.querySelectorAll('[class*="tab"], [class*="panel"]');
    for (const el of textElements) {
        const text = el.innerText || '';
        const className = el.className || '';
        if ((text.toLowerCase().includes('l9') || text.toLowerCase().includes('l3')) &&
            (text.toLowerCase().includes(targetLabel.toLowerCase()))) {
            log(`Found element by text match: ${className}`, 'success');
            return el;
        }
    }

    log(`TabPanel with label "${targetLabel}" not found`, 'warning');
    return null;
}

/**
 * Find accordion element by name within a container
 */
function findAccordionInContainer(container, accordionName) {
    // Look for p-accordion headers with matching text
    const accordions = container.querySelectorAll('p-accordion, .p-accordion, [p-accordion]');
    for (const accordion of accordions) {
        const header = accordion.querySelector('.p-accordion-header, .p-accordion-header-text, [class*="accordion-header"]');
        if (header && header.innerText.toLowerCase().includes(accordionName.toLowerCase())) {
            return accordion;
        }
    }
    // Fallback: search in all headers
    const headers = container.querySelectorAll('[class*="accordion-header"], .p-accordiontab');
    for (const h of headers) {
        if (h.innerText.toLowerCase().includes(accordionName.toLowerCase())) {
            return h.closest('p-accordion, .p-accordion, [p-accordion]') || h.parentElement;
        }
    }
    return null;
}

/**
 * Find panel element by name within an accordion
 */
function findPanelInAccordion(accordion, panelName) {
    const panels = accordion.querySelectorAll('p-panel, .p-panel, [p-panel]');
    for (const panel of panels) {
        const header = panel.querySelector('.p-panel-header, .p-panel-title, [class*="panel-header"]');
        if (header && header.innerText.toLowerCase().includes(panelName.toLowerCase())) {
            return panel;
        }
    }
    return null;
}

/**
 * Find table element within a panel's content area
 */
function findTableInPanel(panel) {
    // Tables are usually in the panel content body
    const content = panel.querySelector('.p-panel-body, .p-panel-content, [class*="panel-body"]');
    if (content) {
        const table = content.querySelector('table');
        if (table) return table;
    }
    // Fallback: look for first table in panel
    return panel.querySelector('table');
}

/**
 * Get table element for L9 category using semantic path
 */
function getTableElementByCategoryL9(catNum) {
    const catInfo = L9_CATEGORY_MAP[catNum];
    if (!catInfo) {
        log(`Category ${catNum} not found in L9_CATEGORY_MAP`, 'error');
        return null;
    }

    // Find L9 tabPanel first
    const l9TabPanel = findTabPanelByLabel('L9');
    if (!l9TabPanel) {
        log('L9 tabPanel not found', 'error');
        return null;
    }
    log(`Found L9 tabPanel`, 'info');

    // Find accordion within L9 tabPanel
    const accordion = findAccordionInContainer(l9TabPanel, catInfo.accordion);
    if (!accordion) {
        log(`Accordion "${catInfo.accordion}" not found`, 'error');
        return null;
    }
    log(`Found accordion "${catInfo.accordion}"`, 'info');

    // Find panel within accordion
    const panel = findPanelInAccordion(accordion, catInfo.panel);
    if (!panel) {
        log(`Panel "${catInfo.panel}" not found in accordion "${catInfo.accordion}"`, 'error');
        return null;
    }
    log(`Found panel "${catInfo.panel}"`, 'info');

    // Find table within panel
    const table = findTableInPanel(panel);
    if (!table) {
        log(`Table not found in panel "${catInfo.panel}"`, 'error');
        return null;
    }
    log(`Found table in panel "${catInfo.panel}"`, 'success');

    return table;
}

/**
 * Get table element for L3 using header text matching
 */
function getTableElementByCategoryL3() {
    // Find L3 tabPanel
    const l3TabPanel = findTabPanelByLabel('L3');
    if (!l3TabPanel) {
        log('L3 tabPanel not found', 'error');
        return null;
    }
    log(`Found L3 tabPanel`, 'info');

    // Find all tables in L3 tabPanel
    const tables = l3TabPanel.querySelectorAll('table');
    log(`Found ${tables.length} tables in L3 tabPanel`, 'info');

    // Look for table with header containing "PPh" and "dipotong"
    for (const table of tables) {
        const headerText = table.innerText || '';
        if (headerText.toLowerCase().includes('pph') && headerText.toLowerCase().includes('dipotong')) {
            log(`Found L3 table by header text matching "PPh" and "dipotong"`, 'success');
            return table;
        }
    }

    // Fallback: return first table
    if (tables.length > 0) {
        log(`Using first table as fallback for L3`, 'warning');
        return tables[0];
    }

    log('No table found in L3 tabPanel', 'error');
    return null;
}

// ============================================
// TABLE DETECTION SYSTEM
// ============================================

/**
 * Analisis semua tabel di halaman
 * Scan semua <table> elements dan kembalikan daftar lengkap
 */
function analyzeTables() {
    const tableList = [];
    const allTables = document.querySelectorAll('table');
    
    log(`Found ${allTables.length} tables on page`, 'info');
    
    allTables.forEach((table, index) => {
        try {
            // Ambil headers dari tabel ini
            const thead = table.querySelector('thead');
            const headers = [];
            
            if (thead) {
                thead.querySelectorAll('th').forEach(th => {
                    const text = th.innerText.trim();
                    if (text.length > 0 && text !== 'Silakan Pilih') {
                        headers.push(text);
                    }
                });
            }
            
            // Ambil jumlah rows
            const tbody = table.querySelector('tbody');
            const rowCount = tbody ? tbody.querySelectorAll('tr').length : 0;
            
            // Generate nama tabel dari header pertama (jika ada)
            const tableName = headers.length > 0 ? headers.slice(0, 3).join(' → ') : `Table ${index + 1}`;
            
            tableList.push({
                index: index,
                domIndex: index,
                id: table.id || `table-${index}`,
                selector: `table:nth-of-type(${index + 1})`,
                headers: headers,
                headerPreview: tableName,
                rowCount: rowCount,
                hasData: rowCount > 0,
                element: table
            });
        } catch (e) {
            console.error('Error analyzing table:', e);
        }
    });
    
    return tableList;
}

// ============================================
// EXPORT FUNCTION - Menggunakan XLSX Library langsung di content script
// ============================================

async function exportToExcel(headers, data, categoryName) {
    try {
        // Validasi XLSX library
        if (typeof XLSX === 'undefined') {
            log('XLSX library not found, using fallback CSV export', 'warning');
            return exportToXLSXBinary(headers, data, categoryName);
        }

        log(`Preparing to export ${data.length} rows...`, 'info');
        console.log('Headers:', headers);
        console.log('Data sample (first 3 rows):', data.slice(0, 3));

        // Buat workbook dengan headers + data
        const wsData = [headers, ...data];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);

        // Set column width ke 25 untuk readability
        const wscols = headers.map(() => ({ wch: 25 }));
        ws['!cols'] = wscols;

        // Sanitize sheet name (max 31 chars, no special chars)
        // Abbreviate long category prefixes for L9
        let shortName = categoryName || "SPT Tahunan Data";
        if (shortName.startsWith("Harta Berwujud")) {
            shortName = "HB" + shortName.substring(13); // "HB" + rest after "Harta Berwujud"
        } else if (shortName.startsWith("Harta Tidak Berwujud")) {
            shortName = "HTB" + shortName.substring(21); // "HTB" + rest after "Harta Tidak Berwujud"
        }
        const sheetName = shortName.substring(0, 31).replace(/[\\/?*\[\]]/g, '_');
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        // Generate filename dengan timestamp and category suffix
        const dateStr = new Date().toISOString().slice(0, 10);
        const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
        const filename = categoryName
            ? `SPT_Tahunan_${sanitizeFilename(categoryName)}_${dateStr}_${timeStr}.xlsx`
            : `SPT_Tahunan_${dateStr}_${timeStr}.xlsx`;

        // Download file
        XLSX.writeFile(wb, filename);

        log(`File downloaded successfully: ${filename}`, 'success');
        return true;

    } catch (error) {
        log(`Export error: ${error.message}`, 'error');
        console.error('Full export error:', error);

        // Fallback ke CSV binary jika XLSX gagal
        log('Attempting fallback CSV export...', 'warning');
        return exportToXLSXBinary(headers, data, categoryName);
    }
}

function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 30);
}

/**
 * Export L9 multiple categories to separate sheets in one workbook
 * @param {Array} categoryDataArray - Array of { categoryName, headers, data } objects
 */
async function exportL9ToExcel(categoryDataArray) {
    try {
        if (typeof XLSX === 'undefined') {
            log('XLSX library not found, falling back to individual CSV exports', 'warning');
            for (const catData of categoryDataArray) {
                await exportToXLSXBinary(catData.headers, catData.data, catData.categoryName);
            }
            return true;
        }

        log(`Preparing to export ${categoryDataArray.length} categories...`, 'info');

        const wb = XLSX.utils.book_new();

        for (const catData of categoryDataArray) {
            const wsData = [catData.headers, ...catData.data];
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            const wscols = catData.headers.map(() => ({ wch: 25 }));
            ws['!cols'] = wscols;

            let shortName = catData.categoryName || "Data";
            if (shortName.startsWith("Harta Berwujud")) {
                shortName = "HB" + shortName.substring(13);
            } else if (shortName.startsWith("Harta Tidak Berwujud")) {
                shortName = "HTB" + shortName.substring(21);
            }
            const sheetName = shortName.substring(0, 31).replace(/[\\/?*\[\]]/g, '_');
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }

        // Generate filename
        const dateStr = new Date().toISOString().slice(0, 10);
        const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
        const filename = `SPT_Tahunan_L9_${dateStr}_${timeStr}.xlsx`;

        XLSX.writeFile(wb, filename);
        log(`L9 file downloaded: ${filename}`, 'success');
        return true;

    } catch (error) {
        log(`L9 export error: ${error.message}`, 'error');
        console.error('L9 export error:', error);
        return false;
    }
}

// Metode 2: Export Pure CSV ke file (Fallback jika XLSX tidak tersedia)
function exportToXLSXBinary(headers, data, categoryName) {
    try {
        const escapeCSV = (val) => {
            val = String(val).trim();
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        };

        // Buat CSV content
        const csvContent = [
            headers.map(escapeCSV).join(','),
            ...data.map(row => row.map(escapeCSV).join(','))
        ].join('\n');

        // Gunakan BOM untuk UTF-8 Excel compatibility
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], {
            type: 'application/vnd.ms-excel;charset=utf-8;'
        });

        const dateStr = new Date().toISOString().slice(0, 10);
        const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
        const filename = categoryName
            ? `SPT_Tahunan_${sanitizeFilename(categoryName)}_${dateStr}_${timeStr}.csv`
            : `SPT_Tahunan_${dateStr}_${timeStr}.csv`;

        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        URL.revokeObjectURL(url);

        log(`Fallback file downloaded: ${filename}`, 'warning');
        return true;

    } catch (error) {
        log(`CSV export failed: ${error.message}`, 'error');
        return false;
    }
}

// --- 2. UTILITY FUNCTIONS ---
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message, type = 'info') {
    console.log(`[Scraper] ${type.toUpperCase()}: ${message}`);
}

/**
 * Parse Indonesian currency format to number
 * Handles formats like: "1.000.000,00", "Rp 1.000.000,00", "1.000.000"
 * @param {string} value - Currency string to parse
 * @returns {number|string} - Parsed number or original string if not a currency
 */
function parseCurrency(value) {
    if (!value || typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();

    // Check if it looks like a currency (contains digits and separators)
    const currencyPattern = /^Rp\s*[\d\.\,]+|[\d\.\,]+$/;
    if (!currencyPattern.test(trimmed)) {
        return trimmed;
    }

    try {
        // Remove "Rp" prefix and whitespace
        let cleaned = trimmed.replace(/^Rp\s*/i, '');

        // Remove thousand separators (dots)
        cleaned = cleaned.replace(/\./g, '');

        // Replace decimal separator (comma) with dot
        cleaned = cleaned.replace(/,/g, '.');

        // Parse as number
        const num = parseFloat(cleaned);

        // Return 0 if NaN, otherwise return the number
        return isNaN(num) ? trimmed : num;
    } catch (e) {
        return trimmed;
    }
}

/**
 * Check if a column name is a currency column that should be converted
 * @param {string} headerName - Column header name
 * @returns {boolean} - True if column should be converted to number
 */
function isCurrencyColumn(headerName) {
    const currencyColumns = [
        'DASAR PENGENAAN PAJAK (Rupiah)',
        'PPH YANG DIPOTONG/DIPUNGUT (Rupiah)'
    ];
    return currencyColumns.includes(headerName);
}

// Debug function untuk analisis DOM
function debugTableStructure() {
    console.log('=== DEBUG TABLE STRUCTURE ===');

    // Cari semua tabel di halaman
    const allTables = document.querySelectorAll('table');
    console.log(`Total tables found: ${allTables.length}`);

    allTables.forEach((table, index) => {
        console.log(`\n--- Table ${index + 1} ---`);
        console.log(`ID: ${table.id}`);
        console.log(`Classes: ${table.className}`);

        // Check thead
        const thead = table.querySelector('thead');
        if (thead) {
            const headers = thead.querySelectorAll('th');
            console.log(`Headers (${headers.length}):`);
            headers.forEach((h, i) => {
                console.log(`  [${i}] ${h.textContent.trim()}`);
            });
        } else {
            console.log('No thead found');
        }

        // Check tbody
        const tbody = table.querySelector('tbody');
        if (tbody) {
            const rows = tbody.querySelectorAll('tr');
            console.log(`Rows in tbody: ${rows.length}`);
            if (rows.length > 0) {
                const cells = rows[0].querySelectorAll('td');
                console.log(`Cells in first row: ${cells.length}`);
            }
        } else {
            console.log('No tbody found');
        }
    });

    // Cari element dengan id mengandung "pr_id"
    console.log('\n=== Elements with pr_id ===');
    const prElements = document.querySelectorAll('[id*="pr_id"]');
    console.log(`Found ${prElements.length} elements with pr_id`);
    prElements.forEach(el => {
        console.log(`- ${el.id} (${el.tagName})`);
    });

    // Cari p-datatable
    console.log('\n=== DataTables ===');
    const dataTables = document.querySelectorAll('p-datatable, [role="grid"]');
    console.log(`Found ${dataTables.length} data tables`);
}

/**
 * Extract cell value from a DOM element with multiple fallback strategies.
 * Handles CORETAX lazy loading patterns including:
 * - Input/textarea/select values
 * - PrimeNG hidden inputs
 * - data-* attributes
 * - Hidden elements (not filtered by display:none visibility)
 * - contenteditable elements
 *
 * @param {HTMLTableCellElement} td - The table cell element to extract value from
 * @returns {string} - The extracted cell value, trimmed and normalized
 */
function getCellValue(td) {
    // Priority 1: Check for input/textarea/select elements
    const input = td.querySelector('input');
    if (input) {
        const value = input.value;
        if (value !== undefined && value !== null && value.trim() !== '') {
            return value.trim();
        }
    }

    const textarea = td.querySelector('textarea');
    if (textarea) {
        const value = textarea.value;
        if (value !== undefined && value !== null && value.trim() !== '') {
            return value.trim();
        }
    }

    const select = td.querySelector('select');
    if (select) {
        const selectedOption = select.querySelector('option:checked') || select.options[select.selectedIndex];
        if (selectedOption) {
            const value = selectedOption.textContent;
            if (value !== undefined && value !== null && value.trim() !== '') {
                return value.trim();
            }
        }
    }

    // Priority 2: Check PrimeNG hidden input patterns
    const hiddenInput = td.querySelector('input[type="hidden"]');
    if (hiddenInput) {
        const value = hiddenInput.value;
        if (value !== undefined && value !== null && value.trim() !== '') {
            return value.trim();
        }
    }

    // Priority 3: Check data-* attributes
    const dataAttributes = ['data-value', 'data-content', 'data-display', 'data-id', 'data-raw-value'];
    for (const attr of dataAttributes) {
        if (td.hasAttribute(attr)) {
            const value = td.getAttribute(attr);
            if (value !== undefined && value !== null && value.trim() !== '') {
                return value.trim();
            }
        }

        const childWithAttr = td.querySelector(`[${attr}]`);
        if (childWithAttr) {
            const value = childWithAttr.getAttribute(attr);
            if (value !== undefined && value !== null && value.trim() !== '') {
                return value.trim();
            }
        }
    }

    // Priority 4: Check contenteditable elements
    const contenteditable = td.querySelector('[contenteditable="true"], [contenteditable]');
    if (contenteditable) {
        const value = contenteditable.textContent;
        if (value !== undefined && value !== null && value.trim() !== '') {
            return value.trim();
        }
    }

    // Priority 5: Check PrimeNG-specific elements (ng-reflect-* attributes)
    const primeElement = td.querySelector('[class*="p-"], [ng-reflect-model], [ng-reflect-value]');
    if (primeElement) {
        for (const attr of primeElement.attributes) {
            if (attr.name.startsWith('ng-reflect-')) {
                const value = attr.value;
                if (value !== undefined && value !== null && value.trim() !== '') {
                    return value.trim();
                }
            }
        }

        if (primeElement.hasAttribute('data-value')) {
            return primeElement.getAttribute('data-value').trim();
        }
    }

    // Priority 6: All child elements including hidden ones
    const allElements = td.querySelectorAll('span, div, input');
    for (const el of allElements) {
        if (el.classList && el.classList.contains('p-column-title')) {
            continue;
        }

        if (el.tagName === 'INPUT') {
            const value = el.value;
            if (value !== undefined && value !== null && value.trim() !== '') {
                return value.trim();
            }
        } else {
            const value = el.textContent;
            if (value !== undefined && value !== null && value.trim() !== '') {
                return value.trim();
            }
        }
    }

    // Priority 7: Fall back to textContent
    const clone = td.cloneNode(true);
    const labelSpan = clone.querySelector('.p-column-title');
    if (labelSpan) {
        labelSpan.remove();
    }

    let textContent = clone.textContent || '';
    textContent = textContent.trim().replace(/\s+/g, ' ');

    return textContent;
}

/**
 * Cek apakah row sudah lengkap (semua kolom terisi kecuali TINDAKAN)
 * @param {HTMLTableRowElement} row - Row element yang dicek
 * @param {Array} headers - Array header names
 * @returns {boolean} - True jika row lengkap, false jika masih ada kolom kosong
 */
function isRowComplete(row, headers) {
    const cells = row.querySelectorAll('td');

    for (let i = 0; i < cells.length; i++) {
        const headerName = headers[i] || '';

        // Skip cek untuk kolom TINDAKAN
        if (headerName === 'TINDAKAN') {
            continue;
        }

        // Use robust getCellValue instead of textContent.trim()
        const cellText = getCellValue(cells[i]);

        // Cek apakah kolom kosong (kecuali TINDAKAN)
        if (cellText === '') {
            return false;
        }
    }

    return true;
}

/**
 * Cek apakah semua rows di halaman sudah lengkap
 * @param {HTMLTableSectionElement} tbody - TBody element
 * @param {Array} headers - Array header names
 * @returns {Object} - { isComplete: boolean, incompleteRows: number }
 */
function checkPageCompleteness(tbody, headers) {
    const rows = tbody.querySelectorAll('tr');
    let incompleteRows = 0;

    rows.forEach(row => {
        if (!isRowComplete(row, headers)) {
            incompleteRows++;
        }
    });

    return {
        isComplete: incompleteRows === 0,
        incompleteRows: incompleteRows,
        totalRows: rows.length
    };
}

/**
 * Extract page data with retry if cells are empty (handles API loading delay)
 * @param {HTMLTableElement} tableElement - Element tabel
 * @param {Array} headers - Array header names
 * @param {number} maxRetries - Jumlah retry maksimal (default 5)
 * @param {number} retryDelay - Delay antar retry dalam ms (default 7000 = 7 detik)
 * @returns {Promise<Array>} - Array of row data arrays
 */
async function waitAndExtractPageData(tableElement, headers, maxRetries = 5, retryDelay = 7000) {
    let attempt = 0;

    // Key columns to check for completeness (L9: KODE HARTA only; L3: BUKTI POTONG)
    const keyColumnNames = config.sptType === 'L9'
        ? ['KODE HARTA']
        : ['BUKTI POTONG/SSP/SSPCP - NOMOR'];

    // Find indices of key columns in headers
    const keyColumnIndices = keyColumnNames.map(name => {
        const idx = headers ? headers.findIndex(h => h === name) : -1;
        return idx !== -1 ? idx : -1;
    });
    // Fallback indices for L9
    if (config.sptType === 'L9') {
        if (keyColumnIndices[0] === -1) keyColumnIndices[0] = 2; // KODE HARTA
    } else {
        if (keyColumnIndices[0] === -1) keyColumnIndices[0] = 8; // BUKTI POTONG
    }

    while (attempt < maxRetries && isRunning && !stopRequested) {
        attempt++;
        const pageData = extractPageData(tableElement, headers);

        // Check if we got data
        if (pageData.length > 0) {
            const firstRow = pageData[0];

            // First check: any content in cells (excluding TINDAKAN/index 0)
            let hasGeneralContent = false;
            for (let i = 1; i < firstRow.length; i++) {
                if (firstRow[i] && firstRow[i].toString().trim() !== '') {
                    hasGeneralContent = true;
                    break;
                }
            }

            if (hasGeneralContent) {
                // Second check: ensure key columns have values
                let keyColumnsFilled = true;
                for (const idx of keyColumnIndices) {
                    if (idx < 0 || idx >= firstRow.length) {
                        keyColumnsFilled = false;
                        break;
                    }
                    if (!firstRow[idx] || firstRow[idx].toString().trim() === '') {
                        keyColumnsFilled = false;
                        break;
                    }
                }

                if (keyColumnsFilled) {
                    // Solution 2: Check if key column cell is visually rendered (offsetWidth/Height > 0)
                    // If not rendered, skip the 3000ms stability wait and let the retry loop handle it
                    const tbody = tableElement.querySelector('tbody');
                    const firstRowDOM = tbody?.querySelector('tr');
                    const keyColIndex = keyColumnIndices[0];
                    const keyCell = firstRowDOM?.querySelectorAll('td')[keyColIndex];
                    const isVisuallyRendered = keyCell && keyCell.offsetWidth > 0 && keyCell.offsetHeight > 0;

                    if (isVisuallyRendered) {
                        // All key columns filled AND visually rendered - wait extra 3000ms for stability
                        log(`Key columns filled and visually rendered. Waiting 3000ms for data stability...`, 'info');
                        await sleep(3000);

                        // Re-extract after wait to ensure fresh data
                        const finalData = extractPageData(tableElement, headers);
                        log(`Data extracted successfully on attempt ${attempt}/${maxRetries}`, 'success');
                        return finalData;
                    } else {
                        // Key column has data in model but NOT visually rendered yet
                        log(`Attempt ${attempt}/${maxRetries}: Key column has value but NOT visually rendered yet (offsetWidth=${keyCell?.offsetWidth}, offsetHeight=${keyCell?.offsetHeight}), waiting ${retryDelay}ms...`, 'warning');
                    }
                }

                log(`Attempt ${attempt}/${maxRetries}: Key column empty (KODE_HARTA=${firstRow[keyColumnIndices[0]]}), waiting ${retryDelay}ms...`, 'warning');
            } else {
                log(`Attempt ${attempt}/${maxRetries}: Cells still empty, waiting ${retryDelay}ms...`, 'warning');
            }
        } else {
            log(`Attempt ${attempt}/${maxRetries}: No rows found, waiting ${retryDelay}ms...`, 'warning');
        }

        if (attempt < maxRetries) {
            await sleep(retryDelay);
        }
    }

    // If all retries failed, return whatever we got (even if empty)
    const finalData = extractPageData(tableElement, headers);
    if (finalData.length === 0) {
        log(`Failed to extract data after ${maxRetries} attempts`, 'error');
    } else {
        log(`Returning partial data (${finalData.length} rows) after ${maxRetries} failed attempts`, 'warning');
    }
    return finalData;
}

/**
 * Tunggu sampai semua rows di halaman terisi (kecuali kolom TINDAKAN)
 * @param {HTMLTableElement} tableElement - Element tabel
 * @param {Array} headers - Array header names
 * @param {number} maxWaitTime - Maksimum waktu tunggu dalam ms (default 30000ms = 30 detik)
 * @param {number} checkInterval - Interval cek dalam ms (default 500ms)
 * @returns {Promise<boolean>} - True jika semua row lengkap, false jika timeout
 */
async function waitForPageComplete(tableElement, headers, maxRetries = 10) {
    const checkInterval = 500; // Cek setiap 500ms
    const maxWaitPerCycle = 30000; // 30 detik per cycle sebelum increment retry
    let startTime = Date.now();
    let retryCount = 0;
    let lastLogTime = 0;
    const logInterval = 5000; // Log setiap 5 detik

    log('Waiting for all rows to be filled (except TINDAKAN column)...', 'info');

    while (isRunning && !stopRequested) {
        // Cek jika sudah melebihi batas retry
        if (retryCount >= maxRetries) {
            log(`Max retry count (${maxRetries} x 30s = ${maxRetries * 30}s) exceeded. Data never loaded.`, 'error');
            throw new Error(`Data tidak muncul setelah menunggu ${maxRetries * 30} detik. Kemungkinan halaman tidak memuat data dengan benar.`);
        }

        const tbody = tableElement.querySelector('tbody');

        if (!tbody) {
            log('No tbody found while waiting for completion', 'warning');
            await sleep(checkInterval);
            continue;
        }

        const completeness = checkPageCompleteness(tbody, headers);

        // Log progress secara periodik
        const now = Date.now();
        if (now - lastLogTime >= logInterval) {
            log(`Row completion: ${completeness.totalRows - completeness.incompleteRows}/${completeness.totalRows} rows complete (${completeness.incompleteRows} remaining)`, 'info');
            lastLogTime = now;
        }

        // Cek jika sudah lengkap
        if (completeness.isComplete) {
            log('All rows on this page are complete!', 'success');
            return true;
        }

        // Cek elapsed time untuk increment retry
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxWaitPerCycle) {
            startTime = Date.now();
            retryCount++;
            log(`Retry ${retryCount}/${maxRetries} - waiting 30s for data to load...`, 'info');
        }

        // Cek stop requested
        if (stopRequested) {
            log('Stop requested while waiting for page completion', 'warning');
            return false;
        }

        // Tunggu sebelum cek lagi
        await sleep(checkInterval);
    }

    return false;
}

/**
 * Extract "BUKTI POTONG/SSP/SSPCP - NOMOR" values from the current page
 * @param {HTMLTableElement} tableElement - Element tabel
 * @param {Array} headers - Array header names
 * @returns {Array} - Array of "BUKTI POTONG/SSP/SSPCP - NOMOR" values
 */
function extractBuktiPotongValues(tableElement, headers) {
    const tbody = tableElement.querySelector("tbody");
    if (!tbody) return [];

    const values = [];
    const rows = tbody.querySelectorAll("tr");

    // Find index of "BUKTI POTONG/SSP/SSPCP - NOMOR" column
    const buktiPotongIndex = headers.findIndex(h => h === "BUKTI POTONG/SSP/SSPCP - NOMOR");

    // Fallback to index 8 if not found by name
    const columnIndex = buktiPotongIndex !== -1 ? buktiPotongIndex : 8;

    rows.forEach(row => {
        const cells = row.querySelectorAll("td");
        if (cells[columnIndex]) {
            // Use robust getCellValue with clone fallback
            let value = getCellValue(cells[columnIndex]);

            if (value === '') {
                const clone = cells[columnIndex].cloneNode(true);
                const labelSpan = clone.querySelector(".p-column-title");
                if (labelSpan) {
                    labelSpan.remove();
                }
                value = clone.textContent.trim().replace(/\s+/g, " ");
            }

            values.push(value);
        }
    });

    return values;
}

/**
 * Check if current page has duplicate data (same as previous page)
 * @param {Array} currentPageValues - Values from current page
 * @param {Array} previousPageValues - Values from previous page
 * @returns {boolean} - True if duplicate detected
 */
function isDuplicatePage(currentPageValues, previousPageValues) {
    if (!previousPageValues || previousPageValues.length === 0) {
        return false;
    }

    // Check if all values in current page match the previous page
    if (currentPageValues.length !== previousPageValues.length) {
        return false;
    }

    for (let i = 0; i < currentPageValues.length; i++) {
        if (currentPageValues[i] !== previousPageValues[i]) {
            return false;
        }
    }

    return true;
}

/**
 * Extract all row data from current page into array
 * @param {HTMLTableElement} tableElement - Element tabel
 * @param {Array} headers - Array header names
 * @returns {Array} - Array of row data arrays
 */
function extractPageData(tableElement, headers) {
    const pageData = [];
    const tbody = tableElement.querySelector('tbody');

    if (!tbody) return pageData;

    const rows = tbody.querySelectorAll('tr');

    rows.forEach(row => {
        const rowData = [];
        const cells = row.querySelectorAll('td');

        cells.forEach((td, index) => {
            // Use robust getCellValue with clone fallback
            let cellText = getCellValue(td);

            // If getCellValue returned empty, try clone method as fallback
            if (cellText === '') {
                const clone = td.cloneNode(true);
                const labelSpan = clone.querySelector('.p-column-title');
                if (labelSpan) {
                    labelSpan.remove();
                }
                cellText = clone.textContent.trim().replace(/\s+/g, ' ');
            }

            const headerName = headers[index] || '';
            if (isCurrencyColumn(headerName)) {
                cellText = parseCurrency(cellText);
            }

            rowData.push(cellText);
        });

        if (rowData.some(cell => cell && cell.length > 0)) {
            pageData.push(rowData);
        }
    });

    return pageData;
}

/**
 * Compare two pages of data using only the specific unique column (BUKTI POTONG/SSP/SSPCP - NOMOR)
 * @param {Array} currentPageData - Data from current page
 * @param {Array} previousPageData - Data from previous page
 * @param {Array} headers - Column headers to find the index
 * @returns {boolean} - True if duplicate detected
 */
function isPageDataDuplicate(currentPageData, previousPageData, headers) {
    if (!previousPageData || previousPageData.length === 0) {
        return false;
    }

    if (currentPageData.length !== previousPageData.length) {
        return false;
    }

    // Determine columns to check for duplicate detection based on SPT type
    let checkColumns = [];
    if (config.sptType === 'L9') {
        // L9: Check KETERANGAN column (like L3 uses BUKTI POTONG)
        checkColumns = ['KETERANGAN'];
    } else {
        // L3: Check BUKTI POTONG/SSP/SSPCP - NOMOR
        checkColumns = ['BUKTI POTONG/SSP/SSPCP - NOMOR'];
    }

    // Find indices of the columns
    const columnIndices = checkColumns.map(colName => {
        const idx = headers ? headers.findIndex(h => h === colName) : -1;
        return idx !== -1 ? idx : -1;
    });

    // If any column not found, fallback to index-based checking
    if (config.sptType === 'L9') {
        if (columnIndices[0] === -1) columnIndices[0] = 3; // KETERANGAN fallback
    } else {
        if (columnIndices[0] === -1) columnIndices[0] = 8; // BUKTI POTONG fallback
    }

    // Compare only the specific columns
    for (let i = 0; i < currentPageData.length; i++) {
        const currentRow = currentPageData[i];
        const previousRow = previousPageData[i];

        for (const checkIndex of columnIndices) {
            if (checkIndex < 0 || checkIndex >= currentRow.length || checkIndex >= previousRow.length) {
                continue;
            }

            if (!currentRow[checkIndex] || !previousRow[checkIndex]) {
                return false;
            }

            if (currentRow[checkIndex] !== previousRow[checkIndex]) {
                return false;
            }
        }
    }

    return true; // All values in the key columns match - is a duplicate
}

// --- 3. CORE SCRAPING LOGIC ---

/**
 * Scrape a single table (reusable for L3 and L9)
 */
async function scrapeSingleTable(tableIndex, allTables) {
    if (tableIndex >= allTables.length) {
        log(`Table index ${tableIndex} out of range (only ${allTables.length} tables)`, 'error');
        return { headers: [], data: [], pageCount: 0 };
    }

    const selectedTable = allTables[tableIndex];
    const tableElement = selectedTable.element;

    log(`Selected table index ${tableIndex}: ${selectedTable.headerPreview}`, 'info');
    log(`Table has ${selectedTable.rowCount} rows`, 'info');

    let allData = [];
    let headers = [];
    let pageCount = 0;
    let lastPageData = [];
    let duplicateRetryCount = 0;

    // Ambil Header dari elemen tabel yang dipilih
    let headerRow = tableElement.querySelector('thead > tr:first-child');

    // Fallback 1: Jika tidak ada thead, cari tr pertama dengan th
    if (!headerRow) {
        const allTr = tableElement.querySelectorAll('tr');
        for (let tr of allTr) {
            if (tr.querySelector('th')) {
                headerRow = tr;
                break;
            }
        }
    }

    // Get actual cell count from tbody first - this is our source of truth
    const tbodySample = tableElement.querySelector('tbody tr');
    const actualCellCount = tbodySample ? tbodySample.querySelectorAll('td').length : 0;
    log(`Actual data cells per row: ${actualCellCount}`, 'info');

    // Get all th elements from thead
    const allTh = tableElement.querySelectorAll('thead th');
    log(`Total th elements in thead: ${allTh.length}`, 'info');

    // Build header mapping using colspan awareness
    // Map each cell index to its corresponding header
    const headerMap = new Array(actualCellCount).fill(null);
    let currentCellIndex = 0;

    for (let thIndex = 0; thIndex < allTh.length && currentCellIndex < actualCellCount; thIndex++) {
        const th = allTh[thIndex];
        const text = th.innerText.trim();
        const colspan = parseInt(th.getAttribute('colspan')) || 1;

        // Skip dropdown placeholders and empty headers
        if (!text || text === 'Silakan Pilih' || text.startsWith('Pilih')) {
            // This header doesn't represent actual data columns
            currentCellIndex += colspan;
            continue;
        }

        // This is a valid header - map it to cell positions
        for (let i = 0; i < colspan && currentCellIndex < actualCellCount; i++) {
            headerMap[currentCellIndex] = thIndex;
            currentCellIndex++;
        }
    }

    // Extract headers based on mapping
    headers = [];
    for (let i = 0; i < actualCellCount; i++) {
        if (headerMap[i] !== null && headerMap[i] !== undefined) {
            const th = allTh[headerMap[i]];
            headers.push(th.innerText.trim());
        } else {
            // No header found for this cell index - use placeholder
            headers.push(`Column_${i + 1}`);
        }
    }

    log(`Headers extracted (colspan-aware): ${headers.length}`, 'success');
    console.log('Headers:', headers);

    // Looping Halaman (async)
    while (isRunning && !stopRequested) {
        pageCount++;
        log(`Scraping page ${pageCount}...`);

        // Wait for data to load if cells are empty (API call takes time)
        const pageData = await waitAndExtractPageData(tableElement, headers, 5, 7000);

        if (pageData.length === 0) {
            log(`No data found on page ${pageCount}`, 'warning');
        } else {
            log(`Found ${pageData.length} rows on page ${pageCount}`, 'info');
        }

        // Yield ke event loop agar stop button responsive
        await sleep(0);
        if (pageData.length > 0 && lastPageData.length > 0 && isPageDataDuplicate(pageData, lastPageData, headers)) {
            log(`Duplicate page detected! Page ${pageCount} matches page ${pageCount - 1}`, "warning");
            duplicateRetryCount++;

            if (duplicateRetryCount > MAX_DUPLICATE_RETRY) {
                log(`Max retry (${MAX_DUPLICATE_RETRY}) exceeded. Stopping.`, "error");
                break;
            }

            // Cek apakah ada tombol Next untuk pagination
            const paginatorId = tableElement.id?.replace('-table', '') || 'pr_id_67';
            const prevPaginatorSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-prev`;
            const prevPaginator = document.querySelector(prevPaginatorSelector);
            const prevPaginatorFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
                ?.querySelector('.p-paginator-prev');
            const prevButton = prevPaginator || prevPaginatorFallback;

            if (prevButton && !prevButton.classList.contains("p-disabled")) {
                log("Going back to retry...", "info");
                prevButton.click();
                await sleep(1000);

                const nextPaginatorSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-next`;
                const nextPaginator = document.querySelector(nextPaginatorSelector);
                const nextPaginatorFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
                    ?.querySelector('.p-paginator-next');
                const nextButton = nextPaginator || nextPaginatorFallback;

                if (nextButton) {
                    nextButton.click();
                    await sleep(1000);

                    // Re-extract page data after navigation to verify page changed
                    const newPageData = await waitAndExtractPageData(tableElement, headers, 5, 7000);
                    log(`Re-check after navigation: ${newPageData.length} rows found`, "info");

                    // Verify the new page is NOT the same as the duplicate we just detected
                    if (newPageData.length > 0 && !isPageDataDuplicate(newPageData, pageData, headers)) {
                        // Page changed successfully - proceed with this new page
                        log(`Page data changed, continuing with this page`, "success");
                        duplicateRetryCount = 0;

                        // Update lastPageData to compare against next page
                        // We keep pageData (the NEW current page) as lastPageData
                        // Don't increment pageCount since we already manually navigated forward
                        // pageCount stays the same for this iteration, will be pageCount+1 on next loop

                        // Add new page data to allData
                        allData = allData.concat(newPageData);
                        log(`Current total rows: ${allData.length}`);

                        // Set lastPageData to newPageData so next iteration compares correctly
                        lastPageData = newPageData;

                        // Re-fetch next button to check for more pages
                        const morePagesSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-next`;
                        const morePages = document.querySelector(morePagesSelector);
                        const morePagesFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement?.querySelector('.p-paginator-next');
                        const morePagesBtn = morePages || morePagesFallback;

                        if (!morePagesBtn || morePagesBtn.classList.contains('p-disabled')) {
                            log('No more pages or last page reached', 'success');
                            break;
                        }

                        // Click Next to advance to next page manually
                        morePagesBtn.click();
                        await sleep(1000);
                        continue;
                    } else {
                        // Still same page - retry again
                        log(`Page still unchanged after navigation, retrying...`, "warning");
                        continue;
                    }
                }
            } else {
                log("Cannot go back. Stopping.", "error");
                break;
            }
        }

        // NOT A DUPLICATE - Add to allData
        if (pageData.length > 0) {
            duplicateRetryCount = 0;
            lastPageData = pageData;
            allData = allData.concat(pageData);
            log(`Current total rows: ${allData.length}`);
        }

        // Cek apakah ada tombol Next untuk pagination
        const paginatorId = tableElement.id?.replace('-table', '') || 'pr_id_67';
        const paginatorSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-next`;
        const paginator = document.querySelector(paginatorSelector);
        const paginatorFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
            ?.querySelector('.p-paginator-next');
        const nextButton = paginator || paginatorFallback;

        if (!nextButton || nextButton.classList.contains('p-disabled')) {
            log('No more pages or last page reached', 'success');
            break;
        }

        nextButton.click();
        await sleep(1000);
    }

    return { headers, data: allData, pageCount };
}

/**
 * Scrape a table element directly (used by semantic path finder)
 * @param {HTMLElement} tableElement - The table element to scrape
 * @param {Object} options - Optional settings
 * @param {boolean} options.skipDuplicateCheck - Skip duplicate page detection for this table
 */
async function scrapeSingleTableFromElement(tableElement, options = {}) {
    const skipDuplicateCheck = options.skipDuplicateCheck || false;
    if (!tableElement) {
        log('No table element provided', 'error');
        return { headers: [], data: [], pageCount: 0 };
    }

    log(`Scraping table element directly`, 'info');

    let allData = [];
    let headers = [];
    let pageCount = 0;
    let lastPageData = [];
    let duplicateRetryCount = 0;

    // Ambil Header dari elemen tabel yang dipilih
    let headerRow = tableElement.querySelector('thead > tr:first-child');

    // Fallback 1: Jika tidak ada thead, cari tr pertama dengan th
    if (!headerRow) {
        const allTr = tableElement.querySelectorAll('tr');
        for (let tr of allTr) {
            if (tr.querySelector('th')) {
                headerRow = tr;
                break;
            }
        }
    }

    // Get actual cell count from tbody first - this is our source of truth
    const tbodySample = tableElement.querySelector('tbody tr');
    const actualCellCount = tbodySample ? tbodySample.querySelectorAll('td').length : 0;
    log(`Actual data cells per row: ${actualCellCount}`, 'info');

    // Get all th elements from thead
    const allTh = tableElement.querySelectorAll('thead th');
    log(`Total th elements in thead: ${allTh.length}`, 'info');

    // Build header mapping using colspan awareness
    const headerMap = new Array(actualCellCount).fill(null);
    let currentCellIndex = 0;

    for (let thIndex = 0; thIndex < allTh.length && currentCellIndex < actualCellCount; thIndex++) {
        const th = allTh[thIndex];
        const text = th.innerText.trim();
        const colspan = parseInt(th.getAttribute('colspan')) || 1;

        if (!text || text === 'Silakan Pilih' || text.startsWith('Pilih')) {
            currentCellIndex += colspan;
            continue;
        }

        for (let i = 0; i < colspan && currentCellIndex < actualCellCount; i++) {
            headerMap[currentCellIndex] = thIndex;
            currentCellIndex++;
        }
    }

    // Extract headers based on mapping
    for (let i = 0; i < actualCellCount; i++) {
        if (headerMap[i] !== null && headerMap[i] !== undefined) {
            const th = allTh[headerMap[i]];
            headers.push(th.innerText.trim());
        } else {
            headers.push(`Column_${i + 1}`);
        }
    }

    log(`Headers extracted (colspan-aware): ${headers.length}`, 'success');

    // Looping Halaman (async)
    while (isRunning && !stopRequested) {
        pageCount++;
        log(`Scraping page ${pageCount}...`);

        // Wait for data to load if cells are empty (API call takes time)
        const pageData = await waitAndExtractPageData(tableElement, headers, 5, 7000);

        if (pageData.length === 0) {
            log(`No data found on page ${pageCount}`, 'warning');
        } else {
            log(`Found ${pageData.length} rows on page ${pageCount}`, 'info');
        }

        // Yield ke event loop agar stop button responsive
        await sleep(0);

        // Check for duplicate page (skip if this category doesn't need it)
        const shouldCheckDuplicate = !skipDuplicateCheck && pageData.length > 0 && lastPageData.length > 0 && isPageDataDuplicate(pageData, lastPageData, headers);

        if (shouldCheckDuplicate) {
            log(`Duplicate page detected! Page ${pageCount} matches page ${pageCount - 1}`, "warning");
            duplicateRetryCount++;

            if (duplicateRetryCount > MAX_DUPLICATE_RETRY) {
                log(`Max retry (${MAX_DUPLICATE_RETRY}) exceeded. Stopping.`, "error");
                break;
            }

            // Cek apakah ada tombol Next untuk pagination
            const paginatorId = tableElement.id?.replace('-table', '') || 'pr_id_67';
            const prevPaginatorSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-prev`;
            const prevPaginator = document.querySelector(prevPaginatorSelector);
            const prevPaginatorFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
                ?.querySelector('.p-paginator-prev');
            const prevButton = prevPaginator || prevPaginatorFallback;

            if (prevButton && !prevButton.classList.contains("p-disabled")) {
                log("Going back to retry...", "info");
                prevButton.click();
                await sleep(1000);

                const nextPaginatorSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-next`;
                const nextPaginator = document.querySelector(nextPaginatorSelector);
                const nextPaginatorFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
                    ?.querySelector('.p-paginator-next');
                const nextButton = nextPaginator || nextPaginatorFallback;

                if (nextButton) {
                    nextButton.click();
                    await sleep(1000);

                    // Re-extract page data after navigation to verify page changed
                    const newPageData = await waitAndExtractPageData(tableElement, headers, 5, 7000);
                    log(`Re-check after navigation: ${newPageData.length} rows found`, "info");

                    // Verify the new page is NOT the same as the duplicate we just detected
                    if (newPageData.length > 0 && !isPageDataDuplicate(newPageData, pageData, headers)) {
                        log(`Page data changed, continuing with this page`, "success");
                        duplicateRetryCount = 0;

                        // Set lastPageData to newPageData so next iteration compares correctly
                        lastPageData = newPageData;

                        // Add new page data to allData
                        allData = allData.concat(newPageData);
                        log(`Current total rows: ${allData.length}`);

                        // Re-fetch next button to check for more pages
                        const morePagesSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-next`;
                        const morePages = document.querySelector(morePagesSelector);
                        const morePagesFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement?.querySelector('.p-paginator-next');
                        const morePagesBtn = morePages || morePagesFallback;

                        if (!morePagesBtn || morePagesBtn.classList.contains('p-disabled')) {
                            log('No more pages or last page reached', 'success');
                            break;
                        }

                        // Click Next to advance to next page manually
                        morePagesBtn.click();
                        await sleep(1000);
                        continue;
                    } else {
                        // Still same page - retry again
                        log(`Page still unchanged after navigation, retrying...`, "warning");
                        continue;
                    }
                }
            } else {
                log("Cannot go back. Stopping.", "error");
                break;
            }
        }

        // NOT A DUPLICATE - Add to allData
        if (pageData.length > 0) {
            duplicateRetryCount = 0;
            lastPageData = pageData;
            allData = allData.concat(pageData);
            log(`Current total rows: ${allData.length}`);
        }

        // Cek apakah ada tombol Next untuk pagination
        const paginatorId = tableElement.id?.replace('-table', '') || 'pr_id_67';
        const paginatorSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-next`;
        const paginator = document.querySelector(paginatorSelector);
        const paginatorFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
            ?.querySelector('.p-paginator-next');
        const nextButton = paginator || paginatorFallback;

        if (!nextButton || nextButton.classList.contains('p-disabled')) {
            log('No more pages or last page reached', 'success');
            break;
        }

        nextButton.click();
        await sleep(1000);
    }

    return { headers, data: allData, pageCount };
}

// ============================================
// START SCRAPING - Main Entry Point
// ============================================

async function startScraping(configData = {}) {
    // Update config dengan nilai dari popup
    Object.assign(config, configData);

    isRunning = true;
    stopRequested = false;

    // Debug struktur table
    debugTableStructure();

    // Scan semua tabel di halaman
    const allTables = analyzeTables();
    log(`Found ${allTables.length} total tables on page`, 'info');

    try {
        // Check SPT type
        if (config.sptType === 'L9') {
            // L9 Mode: Scrape multiple tables
            const categories = config.selectedCategories || [];
            if (categories.length === 0) {
                throw new Error('No categories selected for L9');
            }

            log(`Starting L9 scraping for ${categories.length} categories...`, 'info');

            const categoryDataArray = [];
            let totalRows = 0;

            for (const catNum of categories) {
                if (stopRequested) break;

                const catInfo = L9_CATEGORY_MAP[catNum];
                if (!catInfo) {
                    log(`Unknown category number: ${catNum}`, 'warning');
                    continue;
                }

                log(`Scraping category ${catNum}: ${catInfo.name}`, 'info');

                // Categories that skip duplicate page check
                const skipDuplicateCategories = [5, 6, 7, 12]; // Kelompok Lainnya, Bangunan Permanen/Tidak Permanen, HTB Kelompok Lainnya
                const skipDuplicateCheck = skipDuplicateCategories.includes(catNum);

                // Get table element using semantic path
                const tableElement = getTableElementByCategoryL9(catNum);
                if (!tableElement) {
                    log(`Cannot find table for category ${catNum}: ${catInfo.name}`, 'error');
                    continue;
                }

                const result = await scrapeSingleTableFromElement(tableElement, { skipDuplicateCheck });
                const rowCount = result.data.length;
                totalRows += rowCount;

                if (rowCount > 0) {
                    categoryDataArray.push({
                        categoryName: catInfo.name,
                        headers: result.headers,
                        data: result.data
                    });
                    log(`Category ${catInfo.name}: ${rowCount} rows`, 'success');
                } else {
                    log(`Category ${catInfo.name}: No data found`, 'warning');
                }

                // Small delay between categories
                if (!stopRequested && categories.indexOf(catNum) < categories.length - 1) {
                    await sleep(config.delay || 500);
                }
            }

            // Export all L9 data
            if (!stopRequested && categoryDataArray.length > 0) {
                log(`Exporting L9 data for ${categoryDataArray.length} categories...`, 'info');
                if (config.autoExport) {
                    await exportL9ToExcel(categoryDataArray);
                }
                return {
                    success: true,
                    sptType: 'L9',
                    rowCount: totalRows,
                    pageCount: categoryDataArray.length,
                    message: `${categoryDataArray.length} categories, ${totalRows} total rows scraped`
                };
            } else if (stopRequested) {
                if (categoryDataArray.length > 0 && config.autoExport) {
                    await exportL9ToExcel(categoryDataArray);
                }
                return {
                    success: true,
                    sptType: 'L9',
                    rowCount: totalRows,
                    pageCount: categoryDataArray.length,
                    message: 'Stopped by user. Partial data exported.'
                };
            } else {
                throw new Error('No data found for selected L9 categories');
            }

        } else {
            // L3 Mode: Find L3 table using semantic path
            log('Starting L3 scraping...', 'info');

            const l3TableElement = getTableElementByCategoryL3();
            if (!l3TableElement) {
                throw new Error('L3 table not found');
            }

            const result = await scrapeSingleTableFromElement(l3TableElement);

            // Ekspor ke Excel jika ada data
            if (!stopRequested && result.data.length > 0) {
                log(`Exporting ${result.data.length} rows to Excel...`);
                if (config.autoExport) {
                    await exportToExcel(result.headers, result.data);
                }
                return {
                    success: true,
                    sptType: 'L3',
                    rowCount: result.data.length,
                    pageCount: result.pageCount,
                    message: `Scraped ${result.data.length} rows from ${result.pageCount} pages`
                };
            } else if (stopRequested) {
                log('Scraping stopped by user', 'warning');
                if (result.data.length > 0 && config.autoExport) {
                    await exportToExcel(result.headers, result.data);
                }
                return {
                    success: true,
                    sptType: 'L3',
                    rowCount: result.data.length,
                    pageCount: result.pageCount,
                    message: 'Stopped by user. Partial data exported.'
                };
            } else {
                log('No data found', 'error');
                throw new Error('No data found in table');
            }
        }

    } catch (err) {
        log(`Error: ${err.message}`, 'error');
        console.error(err);
        throw err;
    } finally {
        isRunning = false;
        stopRequested = false;
        log('Scraping process finished');
    }
}

function stopScraping() {
    log('Stop requested');
    stopRequested = true;
    return {
        stopped: true,
        rowCount: 0
    };
}

// --- 4. MESSAGE LISTENER (untuk komunikasi dari popup) ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_SCRAPING') {
        log('Message received: START_SCRAPING');
        
        // Jalankan scraping secara async
        startScraping(request.config)
            .then(result => {
                sendResponse({ success: true, ...result });
            })
            .catch(error => {
                sendResponse({ 
                    success: false, 
                    error: error.message 
                });
            });

        // Return true untuk menunjukkan bahwa response akan dikirim secara async
        return true;
    }
    
    if (request.action === 'STOP_SCRAPING') {
        log('Message received: STOP_SCRAPING');
        const result = stopScraping();
        sendResponse(result);
        return false;
    }
    
});

log('Content script loaded and ready', 'success');