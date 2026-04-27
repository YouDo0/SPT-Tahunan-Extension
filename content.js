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

// L9 Category mapping (1-based index to table index)
const L9_CATEGORY_MAP = {
    1: { tableIndex: 8, name: 'Harta Berwujud - Kelompok 1' },
    2: { tableIndex: 9, name: 'Harta Berwujud - Kelompok 2' },
    3: { tableIndex: 10, name: 'Harta Berwujud - Kelompok 3' },
    4: { tableIndex: 11, name: 'Harta Berwujud - Kelompok 4' },
    5: { tableIndex: 12, name: 'Harta Berwujud - Kelompok Lainnya' },
    6: { tableIndex: 13, name: 'Bangunan - Permanen' },
    7: { tableIndex: 14, name: 'Bangunan - Tidak Permanen' },
    8: { tableIndex: 15, name: 'Harta Tidak Berwujud - Kelompok 1' },
    9: { tableIndex: 16, name: 'Harta Tidak Berwujud - Kelompok 2' },
    10: { tableIndex: 17, name: 'Harta Tidak Berwujud - Kelompok 3' },
    11: { tableIndex: 18, name: 'Harta Tidak Berwujud - Kelompok 4' },
    12: { tableIndex: 19, name: 'Harta Tidak Berwujud - Kelompok Lainnya' },
};

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
        const sheetName = categoryName
            ? categoryName.substring(0, 25).replace(/[\\/?*\[\]]/g, '_')
            : "SPT Tahunan Data";
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

            const sheetName = catData.categoryName
                ? catData.categoryName.substring(0, 25).replace(/[\\/?*\[\]]/g, '_')
                : "Data";
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
 * Cek apakah row sudah lengkap (semua kolom terisi kecuali TINDAKAN)
 * @param {HTMLTableRowElement} row - Row element yang dicek
 * @param {Array} headers - Array header names
 * @returns {boolean} - True jika row lengkap, false jika masih ada kolom kosong
 */
function isRowComplete(row, headers) {
    const cells = row.querySelectorAll('td');

    for (let i = 0; i < cells.length; i++) {
        const headerName = headers[i] || '';
        const cellText = cells[i].textContent.trim();

        // Skip cek untuk kolom TINDAKAN
        if (headerName === 'TINDAKAN') {
            continue;
        }

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
 * Tunggu sampai semua rows di halaman terisi (kecuali kolom TINDAKAN)
 * @param {HTMLTableElement} tableElement - Element tabel
 * @param {Array} headers - Array header names
 * @param {number} maxWaitTime - Maksimum waktu tunggu dalam ms (default 30000ms = 30 detik)
 * @param {number} checkInterval - Interval cek dalam ms (default 500ms)
 * @returns {Promise<boolean>} - True jika semua row lengkap, false jika timeout
 */
async function waitForPageComplete(tableElement, headers, maxWaitTime = 30000, checkInterval = 500) {
    const startTime = Date.now();
    let lastIncompleteCount = -1;

    log('Waiting for all rows to be filled (except TINDAKAN column)...', 'info');

    while (isRunning && !stopRequested) {
        const tbody = tableElement.querySelector('tbody');

        if (!tbody) {
            log('No tbody found while waiting for completion', 'warning');
            return false;
        }

        const completeness = checkPageCompleteness(tbody, headers);

        // Log progress hanya jika ada perubahan
        if (completeness.incompleteRows !== lastIncompleteCount) {
            log(`Row completion: ${completeness.totalRows - completeness.incompleteRows}/${completeness.totalRows} rows complete (${completeness.incompleteRows} remaining)`, 'info');
            lastIncompleteCount = completeness.incompleteRows;
        }

        // Cek jika sudah lengkap
        if (completeness.isComplete) {
            log('All rows on this page are complete!', 'success');
            return true;
        }

        // Cek timeout
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxWaitTime) {
            log(`Timeout waiting for page completion. ${completeness.incompleteRows} rows still incomplete.`, 'warning');
            return false;
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
            const clone = cells[columnIndex].cloneNode(true);
            const labelSpan = clone.querySelector(".p-column-title");
            if (labelSpan) {
                labelSpan.remove();
            }
            const value = clone.textContent.trim().replace(/\s+/g, " ");
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
            const clone = td.cloneNode(true);
            const labelSpan = clone.querySelector('.p-column-title');
            if (labelSpan) {
                labelSpan.remove();
            }

            let cellText = clone.textContent.trim().replace(/\s+/g, ' ');
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

    // Find index of BUKTI POTONG/SSP/SSPCP - NOMOR column
    const columnIndex = headers ? headers.findIndex(h => h === "BUKTI POTONG/SSP/SSPCP - NOMOR") : -1;
    const checkIndex = columnIndex !== -1 ? columnIndex : 8; // Fallback to index 8

    // Compare only the specific column
    for (let i = 0; i < currentPageData.length; i++) {
        const currentRow = currentPageData[i];
        const previousRow = previousPageData[i];

        if (!currentRow[checkIndex] || !previousRow[checkIndex]) {
            return false;
        }

        if (currentRow[checkIndex] !== previousRow[checkIndex]) {
            return false;
        }
    }

    return true; // All values in the key column match - is a duplicate
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

    if (headerRow) {
        headers = Array.from(headerRow.querySelectorAll('th'))
            .map(th => th.innerText.trim())
            .filter(text => text.length > 0 && text !== 'Silakan Pilih');
        log(`Headers found: ${headers.length}`, 'success');
        console.log('Headers extracted:', headers);
    } else {
        log('No proper header found, using empty headers...', 'warning');
        headers = [];
    }

    // Looping Halaman (async)
    while (isRunning && !stopRequested) {
        pageCount++;
        log(`Scraping page ${pageCount}...`);

        // EXTRACT page data to temporary variable FIRST
        const pageData = extractPageData(tableElement, headers);

        if (pageData.length === 0) {
            log(`No data found on page ${pageCount}`, 'warning');
        } else {
            log(`Found ${pageData.length} rows on page ${pageCount}`, 'info');
        }

        // Yield ke event loop agar stop button responsive
        await sleep(0);

        // Cek apakah user menekan stop button
        if (stopRequested) {
            log('Stop requested, breaking loop', 'warning');
            break;
        }

        // Tunggu sampai semua rows terisi sebelum check duplikasi
        const pageComplete = await waitForPageComplete(
            tableElement,
            headers,
            30000,
            500
        );

        // Cek apakah user menekan stop button
        if (stopRequested) {
            log('Stop requested, breaking loop', 'warning');
            break;
        }

        // CHECK FOR DUPLICATES BEFORE ADDING TO allData
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
                    continue;
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

async function startScraping(configData = {}) {
    // Update config dengan nilai dari popup
    Object.assign(config, configData);

    isRunning = true;
    stopRequested = false;

    // Debug struktur table
    debugTableStructure();

    // SIMPLE TABLE SELECTION BY INDEX
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

                log(`Scraping category ${catNum}: ${catInfo.name} (table index ${catInfo.tableIndex})`, 'info');

                const result = scrapeSingleTable(catInfo.tableIndex, allTables);
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
            // L3 Mode: Original flow - scrape table index 4 only
            if (allTables.length < 5) {
                const errorMsg = `Need at least 5 tables on page, but only found ${allTables.length} table(s).`;
                log(errorMsg, 'error');
                throw new Error(errorMsg);
            }

            log('Starting L3 scraping...', 'info');
            const result = scrapeSingleTable(4, allTables);

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