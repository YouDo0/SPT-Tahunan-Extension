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

// --- 3. CORE SCRAPING LOGIC ---

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
                
                cells.forEach(td => {
                    // Clone node agar tidak merusak tampilan asli halaman
                    const clone = td.cloneNode(true);
                    
                    // Hapus span label jika ada (PrimeNG column title)
                    const labelSpan = clone.querySelector('.p-column-title');
                    if (labelSpan) {
                        labelSpan.remove();
                    }
                    
                    // Ambil textContent bersih (trim whitespace)
                    const cellText = clone.textContent.trim()
                        .replace(/\s+/g, ' '); // Replace multiple spaces dengan single space
                    rowData.push(cellText);
                });
                
                // Hanya tambah row jika punya data (filter row kosong)
                if (rowData.some(cell => cell.length > 0)) {
                    allData.push(rowData);
                }
            });

            log(`Current total rows: ${allData.length}`);

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

            // Klik tombol Next
            log('Moving to next page...');
            nextButton.click();

            // Delay setelah klik agar halaman load (dikurangi dari 500ms default)
            // Gunakan 300ms default atau sesuai setting user
            const pageLoadDelay = Math.min(config.delay, 300);
            await sleep(pageLoadDelay);
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