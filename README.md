# SPT Tahunan Scraper Extension

Otomasi pengambilan data dari tabel ke-5 (index 4) pada halaman web dengan kontrol melalui popup extension.

## 📋 Fitur Utama

✅ **Simple & Direct** - Ambil data langsung dari tabel index 4 tanpa matching header  
✅ **Async/Await Processing** - Operasi non-blocking untuk scraping yang efisien  
✅ **Popup Control** - Mulai dan hentikan scraping dari popup extension  
✅ **Auto-Export** - Eksport otomatis ke file Excel dengan format XLSX  
✅ **Real-time Status** - Monitor progress scraping secara real-time  
✅ **Settings Management** - Pengaturan delay dan opsi auto-export  
✅ **Page Pagination** - Otomatis looping ke halaman berikutnya  
✅ **Data Cleaning** - Pembersihan label dan whitespace otomatis

## 🏗️ Struktur Extension

```
SPT-Tahunan-Extension/
├── manifest.json      # Konfigurasi extension
├── popup.html         # UI popup extension
├── popup.js           # Logic kontrol dari popup (async)
├── content.js         # Script yang berjalan di halaman web
├── style.css          # Styling untuk komponen
├── background.js      # Background service worker untuk export
├── xlsx.full.min.js   # Local XLSX library
└── README.md          # File dokumentasi ini
```

## 🚀 Cara Kerja

### 1. **Inisialisasi Extension**
- Content script (`content.js`) berjalan di setiap halaman
- Mendengarkan pesan dari popup extension

### 2. **User Klik "Start Scraping"**
```
1. User klik tombol "Start Scraping" di popup
2. Popup mengirim pesan START_SCRAPING ke content script
3. Content script scan semua tabel di halaman
4. Validasi: pastikan ada minimal 5 tabel
5. Otomatis select tabel ke-5 (index 4)
6. Ekstrak headers + semua data dari tabel tersebut
7. Export ke Excel
```

### 3. **Proses Scraping**
```javascript
// Workflow utama
const allTables = analyzeTables();     // Scan semua tabel
if (allTables.length < 5) error();     // Validasi minimal 5 tabel
const table = allTables[4];            // Select tabel index 4
const headers = extract(table.thead);  // Ambil headers
const data = extract(table.tbody);     // Ambil semua data
exportToExcel(headers, data);          // Export hasil
```

### 4. **Pagination Handling**
- Script otomatis klik tombol "Next" untuk halaman berikutnya
- Tunggu data ter-load dengan delay configurable
- Lanjutkan scrape sampai semua data terkumpul

### 5. **Stop Scraping**
- User dapat menghentikan kapan saja
- Data yang sudah terkumpul tetap di-export

## ⚙️ Pengaturan

### Dalam Popup:
- **Auto Export** - Checkbox untuk auto-export ke Excel (default: ON)
- **Delay (ms)** - Jeda antar aksi scraping (default: 500ms, range: 200-2000ms)

Settings disimpan di `chrome.storage.local`.

## 🔑 Poin Penting

### Syarat Halaman:
- Halaman harus memiliki **minimal 5 tabel**
- Tabel index 4 (tabel ke-5) adalah tabel target
- Setiap tabel harus memiliki `<thead>` untuk headers dan `<tbody>` untuk data

### Proses Simplifikasi:
- ❌ TIDAK ada matching header kolom
- ❌ TIDAK ada hardcoded selectors
- ✅ Cukup ambil tabel di posisi ke-5
- ✅ Extract semua headers + rows dari tabel tersebut
- ✅ Bersihkan whitespace dan label otomatis

### Error Handling:
- Jika halaman punya < 5 tabel → Error: "Need at least 5 tables..."
- Jika tabel tidak punya tbody → Warning dan skip
- Jika export gagal → Fallback ke export binary

## 🔧 Teknologi

- **Chrome Extension Manifest v3** - Latest standard
- **Async/Await** - Modern JavaScript async processing
- **Chrome Storage API** - Persistent settings
- **SheetJS (XLSX)** - Export ke Excel format
- **Chrome Messaging API** - Komunikasi antar scripts

## 📝 Log Console

Content script mengirim log ke browser console:
```
[Scraper] INFO: Found 8 total tables on page
[Scraper] INFO: Selected table index 4 (5th table): Product Details → ...
[Scraper] INFO: Processing 50 rows on page 1
[Scraper] SUCCESS: Scraping completed!
```

## ✅ Checklist Fitur

- [x] Auto-select tabel index 4 (tidak perlu manual selection)
- [x] Simplifikasi: lepas header matching complexity
- [x] Popup UI minimal dengan Start/Stop buttons
- [x] Settings untuk delay dan auto-export
- [x] Pagination handling otomatis
- [x] Data cleaning (whitespace, labels)
- [x] Auto-export ke XLSX dengan timestamp
- [x] Real-time status display
- [x] Error handling yang robust
- [x] Console logging untuk debugging

## 🐛 Troubleshooting

### Extension tidak berjalan
1. Buka browser console: `F12 → Console`
2. Cari log `[Scraper]` untuk melihat status
3. Pastikan halaman punya minimal 5 tabel

### "Need at least 5 tables" error
- Halaman harus memiliki minimal 5 elemen `<table>`
- Check page dengan F12 → Elements dan cari `<table>` tags

### Scraping hanya ambil data kosong
- Pastikan tabel index 4 punya data di `<tbody>`
- Cek format tabel: harus punya `<thead>` dan `<tbody>`

### Export tidak trigger
- Pastikan "Auto Export" checkbox enabled
- Cek download folder browser
- Pastikan browser izin download

## 📦 Output File

Excel file diberi nama dengan format:
```
SPT_Tahunan_YYYY-MM-DD_HH-mm-ss.xlsx
```

Contoh: `SPT_Tahunan_2024-01-09_14-30-45.xlsx`

## 📄 Dokumentasi Lengkap

Untuk dokumentasi teknis detail, baca [ARCHITECTURE.md](ARCHITECTURE.md).

---

**Version:** 2.0  
**Last Updated:** January 2026  
**Status:** Production Ready
