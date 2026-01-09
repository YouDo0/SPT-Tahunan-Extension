// ============================================
// SPT Tahunan Scraper - Background Script
// Handle export XLSX dengan library lokal
// ============================================

// Listen untuk pesan dari content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXPORT_XLSX') {
        handleExportXLSX(request.headers, request.data)
            .then(result => {
                sendResponse({ success: true, message: 'File exported successfully' });
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });

        // Return true untuk menunjukkan response akan dikirim async
        return true;
    }
});

// Function untuk export XLSX menggunakan library lokal
async function handleExportXLSX(headers, data) {
    return new Promise((resolve, reject) => {
        try {
            // Cek apakah XLSX library tersedia
            if (typeof XLSX === 'undefined') {
                reject(new Error('XLSX library not available'));
                return;
            }

            // Buat workbook
            const wsData = [headers, ...data];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Set column width
            const wscols = headers.map(() => ({ wch: 25 }));
            ws['!cols'] = wscols;

            // Add sheet ke workbook
            XLSX.utils.book_append_sheet(wb, ws, "Scraped Data");

            // Generate filename dengan timestamp
            const dateStr = new Date().toISOString().slice(0, 10);
            const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
            const filename = `SPT_Tahunan_${dateStr}_${timeStr}.xlsx`;

            // Download file
            XLSX.writeFile(wb, filename);

            // Log success
            console.log(`[Background] File exported: ${filename}`);
            resolve({ filename });

        } catch (error) {
            console.error('[Background] Export error:', error);
            reject(error);
        }
    });
}

console.log('[Background] Script loaded and ready');
