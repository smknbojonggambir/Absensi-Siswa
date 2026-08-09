/**
 * =========================================================================
 * CODE GOOGLE APPS SCRIPT (LENGKAP & OTOMATIS SIMPAN FOTO KE GOOGLE DRIVE)
 * Aplikasi Sistem Absensi Siswa SMKN Bojonggambir
 * =========================================================================
 * 
 * FITUR UTAMA CODE INI:
 * 1. Otomatis membuat Sheet "DataAbsensi" jika belum ada.
 * 2. Otomatis membuat Folder Google Drive "FotoAbsensi_SMKN_Bojonggambir" untuk menyimpan foto.
 * 3. Mengubah foto Kamera (Base64) menjadi file gambar (.jpg) di Google Drive.
 * 4. Foto yang disimpan dibuat Publik (Akses Siapa saja dengan link) agar bisa tampil di web/pencetakan.
 * 5. Menyimpan Link Foto Google Drive dan Data Absensi ke dalam Google Sheets.
 * 6. Menerima request GET untuk menampilkan seluruh riwayat data absensi.
 * 
 * LANGKAH PENERAPAN DI GOOGLE APPS SCRIPT:
 * 1. Buka Google Sheets Anda.
 * 2. Klik menu "Ekstensi" (Extensions) -> "Apps Script".
 * 3. Hapus semua isi kode default yang ada.
 * 4. Salin (copy) seluruh kode di bawah ini dan tempel (paste) di Apps Script.
 * 5. Klik ikon "Simpan" (Ctrl + S).
 * 6. Klik tombol "Terapkan" (Deploy) -> "Terapkan sebagai Aplikasi Web" (New Deployment).
 * 7. Isi Konfigurasi:
 *    - Deskripsi: Absensi V1
 *    - Jalankan sebagai (Execute as): Saya (Me / email google anda)
 *    - Yang memiliki akses (Who has access): Siapa saja (Anyone)
 * 8. Klik "Terapkan" (Deploy) -> Klik "Berikan Akses" (Allow access).
 * 9. Salin "URL Aplikasi Web" (https://script.google.com/macros/s/.../exec) untuk dimasukkan ke file src/services/api.ts
 */

const SHEET_NAME = 'DataAbsensi';
const FOLDER_ID = '1pL0Xms2OrTJ0b5lRTaKpsQUNtuCub5QT'; // ID Folder Google Drive khusus foto

/**
 * Mengambil atau membuat Spreadsheet Sheet "DataAbsensi"
 */
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Buat Header jika sheet baru
    sheet.appendRow([
      'ID', 
      'Tanggal', 
      'NISN', 
      'Nama Siswa', 
      'Kelas', 
      'Status', 
      'Keterangan', 
      'Guru / Petugas', 
      'Mata Pelajaran', 
      'Jam Input', 
      'Latitude', 
      'Longitude', 
      'Alamat Lokasi', 
      'Link Foto Drive'
    ]);
    sheet.getRange(1, 1, 1, 14).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Mengambil Folder Google Drive berdasarkan ID folder spesifik
 */
function getOrCreateFolder() {
  try {
    if (FOLDER_ID) {
      return DriveApp.getFolderById(FOLDER_ID);
    }
  } catch (e) {
    Logger.log('Gagal mengambil folder berdasarkan ID, mencoba buat folder baru: ' + e.toString());
  }

  const FOLDER_NAME = 'FotoAbsensi_SMKN_Bojonggambir';
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  } else {
    const folder = DriveApp.createFolder(FOLDER_NAME);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return folder;
  }
}

/**
 * Fungsi Konversi Base64 menjadi File Gambar di Google Drive
 */
function saveImageToDrive(base64Data, filename) {
  if (!base64Data || !base64Data.startsWith('data:image')) {
    return base64Data || ''; // Jika bukan base64, kembalikan data asli
  }

  try {
    const folder = getOrCreateFolder();
    const splitData = base64Data.split(',');
    const contentType = splitData[0].split(':')[1].split(';')[0];
    const byteData = Utilities.base64Decode(splitData[1]);
    const blob = Utilities.newBlob(byteData, contentType, filename);
    
    // Simpan file ke Drive
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Kembalikan URL direct view file drive
    return file.getUrl();
  } catch (e) {
    Logger.log('Gagal menyimpan foto ke Drive: ' + e.toString());
    return ''; // Fallback
  }
}

/**
 * Handler GET Request - Mengambil Data Absensi dari Google Sheets
 */
function doGet(e) {
  try {
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return responseJSON([]);
    }

    const rows = data.slice(1); // Lewati baris header

    const result = rows.map(row => {
      return {
        id: String(row[0] || ''),
        tanggal: formatDate(row[1]),
        nisn: String(row[2] || ''),
        nama: String(row[3] || ''),
        kelas: String(row[4] || ''),
        status: String(row[5] || 'Hadir'),
        keterangan: String(row[6] || ''),
        guru: String(row[7] || ''),
        mapel: String(row[8] || ''),
        jam: String(row[9] || ''),
        lat: row[10] ? Number(row[10]) : null,
        lng: row[11] ? Number(row[11]) : null,
        alamat: String(row[12] || ''),
        fotoBase64: String(row[13] || '') // Berisi Link Google Drive atau Base64
      };
    });

    return responseJSON(result);
  } catch (err) {
    return responseJSON({ status: 'error', message: err.toString() });
  }
}

/**
 * Handler POST Request - Menyimpan Data Absensi Baru
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return responseJSON({ status: 'error', message: 'No post data received' });
    }

    const contents = JSON.parse(e.postData.contents);
    const action = contents.action;

    if (action === 'simpanAbsen' || action === 'add' || action === 'create') {
      const rec = contents.record || contents.data || contents;
      const sheet = getOrCreateSheet();

      const recordId = rec.id || 'ABS-' + Date.now();
      const namaSiswa = rec.nama || 'Siswa';
      const fileName = `FOTO_${recordId}_${namaSiswa.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;

      // Simpan Foto ke Google Drive jika ada fotoBase64
      let fotoDriveUrl = rec.fotoBase64 || '';
      if (rec.fotoBase64 && rec.fotoBase64.startsWith('data:image')) {
        fotoDriveUrl = saveImageToDrive(rec.fotoBase64, fileName);
      }

      // Masukkan Baris Baru ke Google Sheets
      sheet.appendRow([
        recordId,
        rec.tanggal || formatDate(new Date()),
        rec.nisn || '',
        rec.nama || '',
        rec.kelas || '',
        rec.status || 'Hadir',
        rec.keterangan || '',
        rec.guru || '',
        rec.mapel || '',
        rec.jam || new Date().toLocaleTimeString('id-ID'),
        rec.lat || '',
        rec.lng || '',
        rec.alamat || '',
        fotoDriveUrl
      ]);

      return responseJSON({ 
        status: 'success', 
        message: 'Data absensi & foto berhasil disimpan ke Google Sheets & Google Drive!',
        fotoUrl: fotoDriveUrl
      });
    }

    return responseJSON({ status: 'error', message: 'Action tidak dikenal' });
  } catch (err) {
    return responseJSON({ status: 'error', message: err.toString() });
  }
}

/**
 * Format Response JSON
 */
function responseJSON(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Utility Format Tanggal YYYY-MM-DD
 */
function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    const yyyy = val.getFullYear();
    const mm = String(val.getMonth() + 1).padStart(2, '0');
    const dd = String(val.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(val);
}
