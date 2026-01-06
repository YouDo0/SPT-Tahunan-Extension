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

// --- 1. LOAD LIBRARY EXCEL (SheetJS) ---
async function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// --- 2. UTILITY FUNCTIONS ---
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function log(message, type = 'info') {
    console.log(`[Scraper] ${type.toUpperCase()}: ${message}`);
}

// --- 3. CORE SCRAPING LOGIC ---

async function startScraping(configData = {}) {
    // Update config dengan nilai dari popup
    Object.assign(config, configData);

    // Cek apakah library XLSX sudah ada, jika belum load dulu
    if (typeof XLSX === 'undefined') {
        log('Loading Excel library...');
        try {
            await loadScript('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');
            log('Excel library loaded successfully', 'success');
        } catch (e) {
            log('Failed to load Excel library', 'error');
            throw new Error('Failed to load Excel library. Check internet connection.');
        }
    }

    isRunning = true;
    stopRequested = false;

    const tableId = '#pr_id_67-table';
    const nextButtonSelector = '#pr_id_67 > p-paginator > div > button.p-paginator-next';
    
    let allData = [];
    let headers = [];
    let pageCount = 0;

    try {
        log('Starting scraping process...');

        // Ambil Header (Table Head) sekali saja di awal
        const headerRow = document.querySelector(`${tableId} > thead > tr:nth-child(1)`);
        if (headerRow) {
            headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.innerText.trim());
            log(`Headers found: ${headers.length}`, 'success');
        } else {
            throw new Error("Table Header not found. Check selector.");
        }

        // Looping Halaman (async)
        while (isRunning && !stopRequested) {
            pageCount++;
            log(`Scraping page ${pageCount}...`);

            // Ambil Data di Halaman Saat Ini
            const rows = document.querySelectorAll(`${tableId} > tbody > tr.ng-star-inserted`);
            
            rows.forEach(row => {
                const rowData = [];
                const cells = row.querySelectorAll('td');
                
                cells.forEach(td => {
                    // Kita clone node agar tidak merusak tampilan asli web saat menghapus label sementara
                    const clone = td.cloneNode(true);
                    const labelSpan = clone.querySelector('.p-column-title');
                    
                    if (labelSpan) {
                        labelSpan.remove(); // Hapus span label dari clone
                    }
                    
                    // Ambil textContent bersih (trim whitespace)
                    rowData.push(clone.textContent.trim());
                });
                allData.push(rowData);
            });

            log(`Current total rows: ${allData.length}`);

            // Cek Tombol Next
            const nextBtn = document.querySelector(nextButtonSelector);
            
            // Jika tombol next tidak ditemukan ATAU memiliki class 'p-disabled', berarti sudah halaman terakhir
            if (!nextBtn || nextBtn.classList.contains('p-disabled')) {
                log('Last page reached', 'success');
                break;
            }

            // Klik Next
            log('Moving to next page...');
            nextBtn.click();

            // Jeda awal agar UI update
            await sleep(config.delay);
            
            // Loop menunggu sampai tombol next tidak lagi dalam keadaan loading
            let waitCount = 0;
            const maxWait = 50;
            while (nextBtn.classList.contains('p-disabled') && waitCount < maxWait) {
                await sleep(200);
                const currentNextBtn = document.querySelector(nextButtonSelector);
                if (!currentNextBtn) break;
                waitCount++;
            }
            
            // Tambah delay agar konten benar-benar ter-render
            await sleep(1000);
        }

        // Ekspor ke Excel jika ada data
        if (!stopRequested && allData.length > 0) {
            log(`Exporting ${allData.length} rows to Excel...`);
            if (config.autoExport) {
                exportToExcel(headers, allData);
                log('File downloaded', 'success');
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
                exportToExcel(headers, allData);
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

function exportToExcel(headers, data) {
    // Gabungkan Header dan Data
    const wsData = [headers, ...data];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Atur lebar kolom otomatis (opsional, agar rapi)
    const wscols = headers.map(() => ({ wch: 25 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, "Scraped Data");
    
    // Export file
    const dateStr = new Date().toISOString().slice(0,10);
    const timeStr = new Date().toTimeString().slice(0,8).replace(/:/g, '-');
    XLSX.writeFile(wb, `SPT_Tahunan_${dateStr}_${timeStr}.xlsx`);
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