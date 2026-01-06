# SPT Tahunan Scraper Extension

Otomasi pengambilan data dari tabel PrimeNG dengan kontrol melalui popup extension.

## 📋 Fitur Utama

✅ **Async/Await Processing** - Operasi non-blocking untuk scraping yang efisien  
✅ **Popup Control** - Mulai dan hentikan scraping dari popup extension  
✅ **Auto-Export** - Eksport otomatis ke file Excel dengan format XLSX  
✅ **Real-time Status** - Monitor progress scraping secara real-time  
✅ **Settings Management** - Pengaturan delay dan opsi auto-export  
✅ **Page Pagination** - Otomatis looping ke halaman berikutnya  
✅ **Data Cleaning** - Pembersihan label dan whitespace otomatis

## 🏗️ Struktur Extension

```
SPT Tahunan/
├── manifest.json      # Konfigurasi extension
├── popup.html        # UI popup extension
├── popup.js          # Logic kontrol dari popup (async)
├── content.js        # Script yang berjalan di halaman web
├── style.css         # Styling untuk komponen di halaman
└── README.md         # File dokumentasi ini
```

## 🚀 Cara Kerja

### 1. **Inisialisasi Extension**
- Content script (`content.js`) berjalan di setiap halaman
- Mendengarkan pesan dari popup extension melalui `chrome.runtime.onMessage`

### 2. **Mulai Scraping dari Popup**
```javascript
1. User klik tombol "Start Scraping" di popup
2. Popup mengirim pesan START_SCRAPING ke content script
3. Content script menjalankan async function startScraping()
4. Popup menerima response dan update status
```

### 3. **Proses Scraping Async**
```javascript
// Menggunakan async/await untuk kontrol flow
await loadScript(url)           // Load library Excel
await sleep(delay)              // Wait dengan settimeout
while (!stopRequested) {        // Loop async
    // Scrape data halaman saat ini
    // Tunggu loading selesai
    // Klik tombol next halaman
}
exportToExcel(headers, data)    // Export hasil
```

### 4. **Stop Scraping**
- User dapat menghentikan scraping kapan saja
- Data yang sudah terkumpul tetap di-export

## ⚙️ Pengaturan

### Dalam Popup:
- **Auto Export** - Checkbox untuk mengaktifkan/nonaktifkan auto-export ke Excel
- **Delay (ms)** - Jeda waktu antar aksi scraping (default: 500ms)

Settings disimpan di `chrome.storage.local` dan otomatis di-load saat popup dibuka.

## 🔧 Teknologi

- **Chrome Extension Manifest v3** - Latest Chrome extension API
- **Async/Await** - Modern JavaScript async processing
- **Chrome Storage API** - Persistent settings storage
- **SheetJS (XLSX)** - Export ke format Excel
- **Chrome Messaging API** - Komunikasi popup ↔ content script

## 📝 Log Console

Content script mengirim log ke browser console dengan format:
```
[Scraper] INFO: Loading Excel library...
[Scraper] SUCCESS: Excel library loaded successfully
[Scraper] ERROR: Failed to load Excel library
```

## 🔍 Selector Reference

Selectors yang digunakan untuk scraping (dapat disesuaikan di content.js):

```javascript
const tableId = '#pr_id_67-table';              // ID table PrimeNG
const nextButtonSelector = '#pr_id_67 > p-paginator > div > button.p-paginator-next';
```

## ✅ Checklist Implementasi

- [x] Popup UI dengan styling modern
- [x] Async/await untuk semua operasi
- [x] Message passing popup ↔ content script
- [x] Auto-export ke Excel dengan timestamp
- [x] Settings persistence dengan Chrome Storage
- [x] Real-time status updates
- [x] Error handling yang baik
- [x] Console logging untuk debugging
- [x] Kompatibel dengan Manifest v3

## 🐛 Troubleshooting

### Extension tidak muncul di popup
- Pastikan manifest.json memiliki action config dengan default_popup
- Reload extension di `chrome://extensions`

### Scraping tidak berjalan
- Buka browser console (F12)
- Lihat log dari content script
- Pastikan Anda berada di halaman dengan tabel PrimeNG
- Update selector tableId dan nextButtonSelector jika diperlukan

### Data tidak ter-export
- Pastikan checkbox "Auto Export" diaktifkan
- Cek setting delay tidak terlalu kecil
- Pastikan browser mengizinkan download file

## 📦 Download File

File Excel yang di-export memiliki format nama:
```
SPT_Tahunan_YYYY-MM-DD_HH-mm-ss.xlsx
```

Contoh: `SPT_Tahunan_2024-01-06_14-30-45.xlsx`

## 🎨 Komponen UI

### Popup UI:
- Header dengan judul dan deskripsi
- Status Box dengan indikator loading/success/error
- Info Text untuk pesan detail
- Button Group untuk kontrol Start/Stop
- Counter untuk menampilkan jumlah rows
- Settings untuk konfigurasi
- Footer dengan versi

### Color Scheme:
- Primary: `#667eea` - `#764ba2` (gradient)
- Success: `#4CAF50`
- Error: `#f44336`
- Info: `#2196F3`

## 📞 Support

Untuk support lebih lanjut, cek console browser untuk debug messages.

---

**Version:** 1.0  
**Last Updated:** January 2025  
**Status:** Production Ready
