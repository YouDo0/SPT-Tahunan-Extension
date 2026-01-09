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
// DYNAMIC TABLE DETECTION SYSTEM
// ============================================

/**
 * HARDCODED REFERENCE HEADERS
 * Header ini diambil dari tabel PPH Potong/Dipungut
 * Tidak bergantung pada ID tabel yang berubah-ubah
 */
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

/**
 * Bandingkan dua array headers - harus persis sama
 */
function headersMatch(headers1, headers2) {
    if (!headers1 || !headers2) return false;
    if (headers1.length !== headers2.length) return false;
    
    // Perbandingan case-sensitive dan exact match
    return headers1.every((header, i) => header === headers2[i]);
}

/**
 * Analisis semua tabel di halaman
 * Filter hanya tabel yang memiliki header yang SAMA PERSIS dengan REFERENCE_HEADERS (hardcoded)
 * Tidak bergantung pada ID tabel apapun
 */
function analyzeTables() {
    const tableList = [];
    const allTables = document.querySelectorAll('table');
    
    log(`Scanning ${allTables.length} tables for matching headers...`, 'info');
    
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
            
            // FILTER: Hanya include jika header SAMA PERSIS dengan REFERENCE_HEADERS
            if (headersMatch(headers, REFERENCE_HEADERS)) {
                // Ambil jumlah rows
                const tbody = table.querySelector('tbody');
                const rowCount = tbody ? tbody.querySelectorAll('tr').length : 0;
                
                // Generate nama tabel dari header pertama
                const tableName = headers.slice(0, 3).join(' → ');
                
                tableList.push({
                    index: tableList.length,
                    domIndex: index,
                    id: table.id || `table-${index}`,
                    selector: `table:nth-of-type(${index + 1})`,
                    headers: headers,
                    headerPreview: tableName,
                    rowCount: rowCount,
                    hasData: rowCount > 0,
                    element: table
                });
            }
        } catch (e) {
            console.error('Error analyzing table:', e);
        }
    });
    
    return tableList;
}

// --- 1. EXPORT FUNCTIONS (Tanpa Library Online) ---

// Metode 1: Export menggunakan Background Script + XLSX Library
async function exportViaBackground(headers, data) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                action: 'EXPORT_XLSX',
                headers: headers,
                data: data
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(true);
                } else {
                    reject(new Error(response?.error || 'Export failed'));
                }
            }
        );
    });
}

// Metode 2: Export Pure CSV ke XLSX Binary (tanpa library)
function exportToXLSXBinary(headers, data) {
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

    // Gunakan BOM untuk UTF-8 Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8;' 
    });
    
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
    const filename = `SPT_Tahunan_${dateStr}_${timeStr}.xlsx`;

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    log(`File downloaded: ${filename}`, 'success');
    return true;
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

    // AUTOMATIC TABLE DETECTION AND SELECTION
    // Scan halaman untuk tabel yang match REFERENCE_HEADERS
    const allTables = analyzeTables();
    log(`Found ${allTables.length} tables matching reference headers`, 'info');
    
    // Validasi: minimal harus ada 5 tabel
    if (allTables.length < 5) {
        const errorMsg = `Insufficient matching tables found. Need at least 5 tables, but only found ${allTables.length} table(s).`;
        log(errorMsg, 'error');
        throw new Error(errorMsg);
    }
    
    // Auto-select tabel index 4 (5th table, 0-based indexing)
    const selectedTable = allTables[4];
    const tableElement = selectedTable.element;
    const tableSelector = selectedTable.selector;
    
    log(`Auto-selected table index 4 (5th table): ${selectedTable.headerPreview}`, 'info');
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
            log('No proper header found, using reference headers...', 'warning');
            headers = selectedTable.headers;
            log(`Using reference headers: ${headers.length}`, 'warning');
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
            // PrimeNG biasanya punya paginator di setelah tabel
            const paginator = tableElement.closest('.p-datatable-wrapper, .p-datatable')?.parentElement
                ?.querySelector('.p-paginator-next');
            
            if (!paginator || paginator.classList.contains('p-disabled')) {
                log('No more pages or last page reached', 'success');
                break;
            }

            // Klik tombol Next
            log('Moving to next page...');
            paginator.click();

            // Jeda agar UI update
            await sleep(config.delay);
            
            // Loop menunggu sampai halaman benar-benar ter-load
            let waitCount = 0;
            const maxWait = 50;
            while (paginator.classList.contains('p-disabled') === false && waitCount < maxWait) {
                await sleep(200);
                waitCount++;
            }
            
            // Tambah delay agar konten benar-benar ter-render
            await sleep(config.delay);
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

async function exportToExcel(headers, data) {
    try {
        // Coba gunakan Background Script + Library XLSX dulu
        log('Attempting to export via background script...', 'info');
        await exportViaBackground(headers, data);
        log('File exported successfully via XLSX library', 'success');
    } catch (error) {
        // Fallback ke metode binary tanpa library
        log('Background script unavailable, using binary CSV method...', 'warning');
        try {
            exportToXLSXBinary(headers, data);
            log('File exported as CSV (binary method)', 'success');
        } catch (fallbackError) {
            log(`Export failed: ${fallbackError.message}`, 'error');
            throw fallbackError;
        }
    }
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