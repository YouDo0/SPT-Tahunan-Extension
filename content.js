// ============================================
// SPT Tahunan Scraper - Content Script
// Menggunakan async/await untuk kontrol penuh
// ============================================

let isRunning = false;
let stopRequested = false;
let config = {
    autoExport: true,
    delay: 500,
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

async function exportToExcel(headers, data) {
    try {
        // Validasi XLSX library
        if (typeof XLSX === 'undefined') {
            log('XLSX library not found, using fallback CSV export', 'warning');
            return exportToXLSXBinary(headers, data);
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

        // Add sheet ke workbook
        XLSX.utils.book_append_sheet(wb, ws, "SPT Tahunan Data");

        // Generate filename dengan timestamp
        const dateStr = new Date().toISOString().slice(0, 10);
        const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
        const filename = `SPT_Tahunan_${dateStr}_${timeStr}.xlsx`;

        // Download file
        XLSX.writeFile(wb, filename);

        log(`File downloaded successfully: ${filename}`, 'success');
        return true;

    } catch (error) {
        log(`Export error: ${error.message}`, 'error');
        console.error('Full export error:', error);
        
        // Fallback ke CSV binary jika XLSX gagal
        log('Attempting fallback CSV export...', 'warning');
        return exportToXLSXBinary(headers, data);
    }
}

// Metode 2: Export Pure CSV ke file (Fallback jika XLSX tidak tersedia)
function exportToXLSXBinary(headers, data) {
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
        const filename = `SPT_Tahunan_${dateStr}_${timeStr}.csv`;

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
// --- 3. CORE SCRAPING LOGIC ---

async function startScraping(configData = {}) {
    // Update config dengan nilai dari popup
    Object.assign(config, configData);

    isRunning = true;
    stopRequested = false;
    // Duplicate detection variables
    let lastPageBuktiPotongValues = [];  // Store values from last page
    let duplicateRetryCount = 0;         // Track retry attempts
    const MAX_DUPLICATE_RETRY = 10;      // Max retry before stopping


    // Debug struktur table
    debugTableStructure();

    // SIMPLE TABLE SELECTION BY INDEX
    // Scan semua tabel di halaman
    const allTables = analyzeTables();
    log(`Found ${allTables.length} total tables on page`, 'info');
    
    // Validasi: cek apakah table index 4 (5th table) tersedia
    if (allTables.length < 5) {
        const errorMsg = `Need at least 5 tables on page, but only found ${allTables.length} table(s).`;
        log(errorMsg, 'error');
        throw new Error(errorMsg);
    }
    
    // Select table pada index 4 (5th table, 0-based indexing)
    const selectedTable = allTables[4];
    const tableElement = selectedTable.element;
    const tableSelector = selectedTable.selector;
    
    log(`Selected table index 4 (5th table): ${selectedTable.headerPreview}`, 'info');
    log(`Table has ${selectedTable.rowCount} rows`, 'info');
    
    let allData = [];
    let headers = [];
    let pageCount = 0;

    try {
        log('Starting scraping process...');

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
                .filter(text => text.length > 0 && text !== 'Silakan Pilih'); // Filter header kosong
            log(`Headers found: ${headers.length}`, 'success');
            console.log('Headers extracted:', headers);
        } else {
            log('No proper header found, using empty headers...', 'warning');
            headers = [];
            log(`Using empty headers`, 'warning');
        }

        // Looping Halaman (async)
        while (isRunning && !stopRequested) {
            pageCount++;
            log(`Scraping page ${pageCount}...`);

            // Ambil Data di Halaman Saat Ini dari tbody
            const tbody = tableElement.querySelector('tbody');
            let rows = [];
            
            if (tbody) {
                rows = tbody.querySelectorAll('tr');
                log(`Found ${rows.length} rows in tbody`, 'info');
            } else {
                log('No tbody found in selected table', 'warning');
                break;
            }
            
            log(`Processing ${rows.length} rows on page ${pageCount}`);
            
            // Yield ke event loop agar stop button responsive
            await sleep(0);
            
            // Cek apakah user menekan stop button
            if (stopRequested) {
                log('Stop requested, breaking loop', 'warning');
                break;
            }
            
            // Loop setiap row dan ekstrak data
            rows.forEach(row => {
                const rowData = [];
                const cells = row.querySelectorAll('td');

                cells.forEach((td, index) => {
                    // Clone node agar tidak merusak tampilan asli halaman
                    const clone = td.cloneNode(true);

                    // Hapus span label jika ada (PrimeNG column title)
                    const labelSpan = clone.querySelector('.p-column-title');
                    if (labelSpan) {
                        labelSpan.remove();
                    }

                    // Ambil textContent bersih (trim whitespace)
                    let cellText = clone.textContent.trim()
                        .replace(/\s+/g, ' '); // Replace multiple spaces dengan single space

                    // Convert currency columns to number
                    const headerName = headers[index] || '';
                    if (isCurrencyColumn(headerName)) {
                        cellText = parseCurrency(cellText);
                    }

                    rowData.push(cellText);
                });

                // Hanya tambah row jika punya data (filter row kosong)
                if (rowData.some(cell => cell && cell.length > 0)) {
                    allData.push(rowData);
                }
            });

            log(`Current total rows: ${allData.length}`);

            // Tunggu sampai semua rows terisi sebelum next page
            const pageComplete = await waitForPageComplete(
                tableElement,
                headers,
                30000,  // max 30 detik per page
                500     // cek setiap 500ms
            );

            // Cek apakah user menekan stop button
            if (stopRequested) {
                log('Stop requested, breaking loop', 'warning');
                break;
            }

            // Cek apakah ada tombol Next untuk pagination
            // Gunakan selector yang lebih specific untuk PrimeNG paginator
            const paginatorId = tableElement.id?.replace('-table', '') || 'pr_id_67';
            const paginatorSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-next`;
            const paginator = document.querySelector(paginatorSelector);

            // Fallback ke selector umum jika specific tidak ditemukan
            const paginatorFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
                ?.querySelector('.p-paginator-next');

            const nextButton = paginator || paginatorFallback;

            if (!nextButton || nextButton.classList.contains('p-disabled')) {
                log('No more pages or last page reached', 'success');
                break;
            }

            // DUPLICATE CHECK: Check for duplicate content before proceeding
            log("Checking for duplicate content on next page...", "info");
            nextButton.click();
            await sleep(500); // Wait for page to load

            // Find Previous button for retry logic - using same robust approach as Next button
            const prevPaginatorSelector = `#${paginatorId} > p-paginator > div > button.p-paginator-prev`;
            const prevPaginator = document.querySelector(prevPaginatorSelector);

            // Fallback ke selector umum jika specific tidak ditemukan
            const prevPaginatorFallback = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
                ?.querySelector('.p-paginator-prev');

            const prevButton = prevPaginator || prevPaginatorFallback;

            // Extract values from the new page (which might be duplicate)
            const currentPageValues = extractBuktiPotongValues(tableElement, headers);

            // Check if this page is duplicate of the previous page
            if (isDuplicatePage(currentPageValues, lastPageBuktiPotongValues)) {
                const retryMsg = "Duplicate page detected! (Attempt " + (duplicateRetryCount + 1) + "/" + MAX_DUPLICATE_RETRY + ")";
                log(retryMsg, "warning");

                duplicateRetryCount++;

                if (duplicateRetryCount > MAX_DUPLICATE_RETRY) {
                    const maxRetryMsg = "Maximum duplicate retry count (" + MAX_DUPLICATE_RETRY + ") exceeded. Stopping and saving data.";
                    log(maxRetryMsg, "error");
                    break;
                }

                // Go back to previous page and retry
                if (prevButton && !prevButton.classList.contains("p-disabled")) {
                    log("Going back to previous page to retry...", "info");
                    prevButton.click();
                    await sleep(500);

                    // Click Next again to retry
                    log("Retrying next page...", "info");
                    nextButton.click();
                    await sleep(500);

                    // Continue to next iteration to check again
                    continue;
                } else {
                    log("Cannot go back (no previous button). Stopping.", "error");
                    break;
                }
            } else {
                // Not a duplicate, reset retry counter and update stored values
                duplicateRetryCount = 0;
                lastPageBuktiPotongValues = currentPageValues;
                const successMsg = "Page " + pageCount + " is unique. Continuing...";
                log(successMsg, "success");
            }
        }

        // Ekspor ke Excel jika ada data
        if (!stopRequested && allData.length > 0) {
            log(`Exporting ${allData.length} rows to Excel...`);
            if (config.autoExport) {
                await exportToExcel(headers, allData);
            }
            return {
                success: true,
                rowCount: allData.length,
                pageCount: pageCount,
                message: `Scraped ${allData.length} rows from ${pageCount} pages`
            };
        } else if (stopRequested) {
            log('Scraping stopped by user', 'warning');
            if (allData.length > 0 && config.autoExport) {
                await exportToExcel(headers, allData);
            }
            return {
                success: true,
                rowCount: allData.length,
                pageCount: pageCount,
                message: 'Stopped by user. Partial data exported.'
            };
        } else {
            log('No data found', 'error');
            throw new Error('No data found in table');
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