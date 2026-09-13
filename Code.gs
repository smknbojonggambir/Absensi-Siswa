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
      'Jam Masuk',
      'Jam Keluar',
      'Keterangan', 
      'Guru / Petugas', 
      'Mata Pelajaran', 
      'Jam Input', 
      'Latitude', 
      'Longitude', 
      'Alamat Lokasi', 
      'Link Foto Drive'
    ]);
    sheet.getRange(1, 1, 1, 16).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Mengambil Folder Google Drive berdasarkan ID folder spesifik atau membuat folder baru
 */
function getOrCreateFolder() {
  if (FOLDER_ID && FOLDER_ID.trim() !== '') {
    try {
      return DriveApp.getFolderById(FOLDER_ID.trim());
    } catch (e) {
      Logger.log('Gagal mengambil folder berdasarkan FOLDER_ID: ' + e.toString());
    }
  }

  try {
    const FOLDER_NAME = 'FotoAbsensi_SMKN_Bojonggambir';
    const folders = DriveApp.getFoldersByName(FOLDER_NAME);
    if (folders.hasNext()) {
      return folders.next();
    } else {
      const folder = DriveApp.createFolder(FOLDER_NAME);
      try {
        folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (shareErr) {
        Logger.log('Gagal set sharing folder: ' + shareErr.toString());
      }
      return folder;
    }
  } catch (e) {
    Logger.log('Gagal membuat/mengambil folder Drive: ' + e.toString());
    return null;
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
    if (!folder) {
      return '[Foto tidak tersimpan: Akses DriveApp Ditolak]';
    }

    const splitData = base64Data.split(',');
    const contentType = splitData[0].split(':')[1].split(';')[0];
    const byteData = Utilities.base64Decode(splitData[1]);
    const blob = Utilities.newBlob(byteData, contentType, filename);
    
    // Simpan file ke Drive
    const file = folder.createFile(blob);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log('Gagal set sharing file: ' + shareErr.toString());
    }
    
    // Kembalikan URL direct view file drive
    return file.getUrl();
  } catch (e) {
    Logger.log('Gagal menyimpan foto ke Drive: ' + e.toString());
    return '[Gagal Simpan Foto: ' + e.toString() + ']'; // Fallback aman agar absensi tetap tersimpan
  }
}

function getSheetByNameFlexible(ss, name) {
  if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
  var target = String(name || '').replace(/\s+/g, '').toLowerCase();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var sName = String(sheets[i].getName() || '').replace(/\s+/g, '').toLowerCase();
    if (sName === target) {
      return sheets[i];
    }
  }
  return null;
}

function normStr(str) {
  return String(str || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Handler GET Request - Mengambil Data Absensi, Kelas, atau Siswa dari Google Sheets
 */
function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : '';
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ACTION: getKelas -> Mengambil Daftar Kelas dari Sheet DataSiswa (atau DataAbsensi)
    if (action === 'getKelas') {
      const sheetSiswa = getSheetByNameFlexible(ss, 'DataSiswa') || ss.getSheetByName('DataSiswa');
      if (sheetSiswa) {
        const data = sheetSiswa.getDataRange().getValues();
        if (data.length > 1) {
          const kelasSet = {};
          for (let i = 1; i < data.length; i++) {
            const k = String(data[i][2] || '').trim(); // Kolom C = Kelas
            if (k) kelasSet[k] = true;
          }
          const listKelas = Object.keys(kelasSet).sort();
          if (listKelas.length > 0) {
            return responseJSON(listKelas);
          }
        }
      }
      
      // Fallback ke Sheet DataAbsensi
      const sheetAbsen = getOrCreateSheet();
      const dataAbsen = sheetAbsen.getDataRange().getValues();
      const kelasSet = {};
      for (let i = 1; i < dataAbsen.length; i++) {
        const k = String(dataAbsen[i][4] || '').trim(); // Kolom E = Kelas
        if (k) kelasSet[k] = true;
      }
      return responseJSON(Object.keys(kelasSet).sort());
    }

    // ACTION: getSiswa -> Mengambil Daftar Siswa Berdasarkan Kelas dari Sheet DataSiswa
    if (action === 'getSiswa') {
      const targetKelas = normStr(e.parameter ? e.parameter.kelas : '');
      const sheetSiswa = getSheetByNameFlexible(ss, 'DataSiswa') || ss.getSheetByName('DataSiswa');
      if (sheetSiswa) {
        const data = sheetSiswa.getDataRange().getValues();
        const listSiswa = [];
        for (let i = 1; i < data.length; i++) {
          const nis = String(data[i][0] || '').trim(); // Kolom A = NIS/NISN
          const nama = String(data[i][1] || '').trim(); // Kolom B = Nama
          const kelas = String(data[i][2] || '').trim(); // Kolom C = Kelas
          if (nama && (targetKelas === '' || normStr(kelas) === targetKelas)) {
            listSiswa.push({ nis: nis || '-', nama: nama, kelas: kelas });
          }
        }
        if (listSiswa.length > 0 || targetKelas !== '') {
          return responseJSON(listSiswa);
        }
      }
      
      // Fallback ke Sheet DataAbsensi
      const sheetAbsen = getOrCreateSheet();
      const dataAbsen = sheetAbsen.getDataRange().getValues();
      const siswaMap = {};
      for (let i = 1; i < dataAbsen.length; i++) {
        const nis = String(dataAbsen[i][2] || '').trim();
        const nama = String(dataAbsen[i][3] || '').trim();
        const kelas = String(dataAbsen[i][4] || '').trim();
        if (nama && (targetKelas === '' || normStr(kelas) === targetKelas) && !siswaMap[nama]) {
          siswaMap[nama] = nis || '-';
        }
      }
      const result = Object.keys(siswaMap).map(nama => ({ nis: siswaMap[nama], nama: nama, kelas: e.parameter ? e.parameter.kelas : '' }));
      return responseJSON(result);
    }

    // ACTION: getLaporan -> Mengambil Data Absensi Berdasarkan Kelas & Rentang Tanggal
    if (action === 'getLaporan') {
      const targetKelas = normStr(e.parameter ? e.parameter.kelas : '');
      const tglMulai = e.parameter ? e.parameter.tglMulai : '';
      const tglAkhir = e.parameter ? e.parameter.tglAkhir : '';

      const sheet = getOrCreateSheet();
      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) {
        return responseJSON([]);
      }

      const rows = data.slice(1);
      const result = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const isNewLayout = row.length >= 16;
        const rowKelas = String(row[4] || '').trim();
        const rowTanggal = formatDate(row[1]);

        let matchKelas = true;
        if (targetKelas !== '') {
          matchKelas = normStr(rowKelas) === targetKelas;
        }

        let matchDate = true;
        if (tglMulai && tglAkhir) {
          matchDate = rowTanggal >= tglMulai && rowTanggal <= tglAkhir;
        } else if (tglMulai) {
          matchDate = rowTanggal === tglMulai;
        }

        if (matchKelas && matchDate) {
          const statusVal = String(row[5] || 'Hadir');
          const jamVal = isNewLayout ? String(row[11] || '') : String(row[9] || '');

          result.push({
            id: String(row[0] || ''),
            tanggal: rowTanggal,
            nisn: String(row[2] || ''),
            nis: String(row[2] || ''),
            nama: String(row[3] || ''),
            kelas: rowKelas,
            status: statusVal,
            jamMasuk: isNewLayout ? String(row[6] || '') : (statusVal === 'Hadir' ? jamVal : ''),
            jamKeluar: isNewLayout ? String(row[7] || '') : (statusVal === 'Pulang' ? jamVal : ''),
            keterangan: isNewLayout ? String(row[8] || '') : String(row[6] || ''),
            ket: isNewLayout ? String(row[8] || '') : String(row[6] || ''),
            guru: isNewLayout ? String(row[9] || '') : String(row[7] || ''),
            mapel: isNewLayout ? String(row[10] || '') : String(row[8] || ''),
            jam: jamVal,
            waktu: jamVal,
            lat: isNewLayout ? (row[12] ? Number(row[12]) : null) : (row[10] ? Number(row[10]) : null),
            lng: isNewLayout ? (row[13] ? Number(row[13]) : null) : (row[11] ? Number(row[11]) : null),
            alamat: isNewLayout ? String(row[14] || '') : String(row[12] || ''),
            fotoBase64: isNewLayout ? String(row[15] || '') : String(row[13] || '')
          });
        }
      }

      return responseJSON(result);
    }

    // DEFAULT ACTION: Mengambil Seluruh Data Absensi
    const sheet = getOrCreateSheet();
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return responseJSON([]);
    }

    const rows = data.slice(1); // Lewati baris header

    const result = rows.map(row => {
      // Support standard 16-column layout and legacy 14-column layout
      const isNewLayout = row.length >= 16;
      const statusVal = String(row[5] || 'Hadir');
      const jamVal = isNewLayout ? String(row[11] || '') : String(row[9] || '');

      return {
        id: String(row[0] || ''),
        tanggal: formatDate(row[1]),
        nisn: String(row[2] || ''),
        nama: String(row[3] || ''),
        kelas: String(row[4] || ''),
        status: statusVal,
        jamMasuk: isNewLayout ? String(row[6] || '') : (statusVal === 'Hadir' ? jamVal : ''),
        jamKeluar: isNewLayout ? String(row[7] || '') : (statusVal === 'Pulang' ? jamVal : ''),
        keterangan: isNewLayout ? String(row[8] || '') : String(row[6] || ''),
        guru: isNewLayout ? String(row[9] || '') : String(row[7] || ''),
        mapel: isNewLayout ? String(row[10] || '') : String(row[8] || ''),
        jam: jamVal,
        lat: isNewLayout ? (row[12] ? Number(row[12]) : null) : (row[10] ? Number(row[10]) : null),
        lng: isNewLayout ? (row[13] ? Number(row[13]) : null) : (row[11] ? Number(row[11]) : null),
        alamat: isNewLayout ? String(row[14] || '') : String(row[12] || ''),
        fotoBase64: isNewLayout ? String(row[15] || '') : String(row[13] || '')
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

    if (!action || action === 'simpanAbsen' || action === 'add' || action === 'create') {
      const rec = contents.record || contents.data || contents;
      const sheet = getOrCreateSheet();

      const recordId = rec.id || 'ABS-' + Date.now();
      const namaSiswa = rec.nama || 'Siswa';
      const fileName = `FOTO_${recordId}_${namaSiswa.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;

      // Simpan Foto ke Google Drive jika ada fotoBase64 atau image
      const photoData = rec.fotoBase64 || rec.image || '';
      let fotoDriveUrl = photoData;
      if (photoData && photoData.startsWith('data:image')) {
        fotoDriveUrl = saveImageToDrive(photoData, fileName);
      }

      const status = rec.status || 'Hadir';
      const jamInput = rec.jam || new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const jamMasuk = (status === 'Hadir' || status === 'Masuk') ? jamInput : (rec.jamMasuk || '');
      const jamKeluar = (status === 'Pulang') ? jamInput : (rec.jamKeluar || '');

      // Masukkan Baris Baru ke Google Sheets
      sheet.appendRow([
        recordId,
        rec.tanggal || formatDate(new Date()),
        rec.nisn || rec.nis || '',
        rec.nama || '',
        rec.kelas || '',
        status,
        jamMasuk,
        jamKeluar,
        rec.keterangan || '',
        rec.guru || '',
        rec.mapel || '',
        jamInput,
        rec.lat || '',
        rec.lng || '',
        rec.alamat || '',
        fotoDriveUrl
      ]);

      return responseJSON({ 
        ok: true,
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
