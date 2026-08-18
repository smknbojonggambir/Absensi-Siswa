import { AbsenRecord, Siswa, StatusAbsen } from '../types';

export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwk8D5aCBZ2ZaHkqc9u2TKu5GaeRO9qJJ9yXPF020qEFpA5U0jpvFPUF09c4KeYfMFJMA/exec';
export const SPREADSHEET_ID = '1_Zts99iIgy3L7TKCtADv25P6pTeGLmD3rvRWQ7RMWIA';
export const SPREADSHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
export const SPREADSHEET_SISWA_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=DataSiswa`;
export const BATAS_JAM_MASUK = '07:00';

export function normalizeDateStr(rawDateStr: string): string {
  if (!rawDateStr) return '';
  let str = String(rawDateStr).trim();
  if (str.includes(' ')) {
    str = str.split(' ')[0];
  } else if (str.includes('T')) {
    str = str.split('T')[0];
  }

  // Check YYYY-MM-DD or YYYY-M-D or DD-MM-YYYY
  if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
      } else if (parts[2].length === 4) {
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const y = parts[2];
        return `${y}-${m}-${d}`;
      }
    }
  }

  // Check DD/MM/YYYY or D/M/YYYY or YYYY/MM/DD
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${y}-${m}-${d}`;
      } else if (parts[2].length === 4 || parts[2].length === 2) {
        const d = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        let y = parts[2];
        if (y.length === 2) y = '20' + y;
        return `${y}-${m}-${d}`;
      }
    }
  }

  // Fallback if valid JS date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return str;
}

export function isTimeStr(str: string | undefined | null): boolean {
  if (!str) return false;
  const s = String(str).trim();
  if (!s || s === '-') return false;
  if (s.startsWith('-') || s.startsWith('107.') || s.startsWith('108.') || s.startsWith('106.')) return false;
  if (/^-?\d+\.\d{3,}$/.test(s)) return false;
  return /^([0-1]?\d|2[0-3])[\.:][0-5]?\d([\.:][0-5]?\d)?$/.test(s);
}

export function isCoordStr(str: string | undefined | null): boolean {
  if (!str) return false;
  const s = String(str).trim();
  if (s.startsWith('-') || s.startsWith('107.') || s.startsWith('108.') || s.startsWith('106.')) return true;
  if (/^-?\d+\.\d{3,}$/.test(s)) return true;
  return false;
}

export function parseCSV(csvText: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(currentVal.trim());
      if (row.some((cell) => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    if (row.some((cell) => cell.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}

export interface RawSiswaRow {
  nis: string;
  nama: string;
  kelas: string;
  jurusan?: string;
}

export async function fetchDirectSiswaCSV(): Promise<RawSiswaRow[]> {
  try {
    const res = await fetch(SPREADSHEET_SISWA_CSV_URL);
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      return [];
    }
    const rows = parseCSV(text);
    const dataRows = rows.slice(1);
    const result: RawSiswaRow[] = [];

    dataRows.forEach((cols) => {
      if (cols.length >= 3) {
        const nis = cols[0] || '-';
        const nama = cols[1] || '';
        const kelas = cols[2] || '';
        const jurusan = cols[3] || '';

        if (nama && kelas) {
          result.push({ nis, nama, kelas, jurusan });
        }
      }
    });
    return result;
  } catch {
    return [];
  }
}

export async function fetchDirectSpreadsheetData(): Promise<AbsenRecord[]> {
  try {
    const res = await fetch(SCRIPT_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((d: any) => ({
          tanggal: normalizeDateStr(d.tanggal || d.tgl || ''),
          waktu: d.jam || d.waktu || d.jamInput || '-',
          nis: d.nisn || d.nis || '-',
          nama: d.nama || '',
          kelas: d.kelas || '',
          status: d.status || 'Hadir',
          ket: d.keterangan || d.ket || '',
        }));
      }
    }
  } catch {
    // Ignore script fetch error, try CSV fallback next
  }

  try {
    const res = await fetch(SPREADSHEET_CSV_URL);
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      return [];
    }
    const rows = parseCSV(text);

    // Skip header row
    const dataRows = rows.slice(1);
    const records: AbsenRecord[] = [];

    dataRows.forEach((cols) => {
      if (cols.length >= 5) {
        let dateCandidate1 = normalizeDateStr(cols[1] || '');
        let dateCandidate0 = normalizeDateStr(cols[0] || '');

        let cleanDate = '';
        let nisRaw = '-';
        let namaRaw = '';
        let kelasRaw = '';
        let statusRaw = 'Hadir';
        let ketRaw = '';
        let jamRaw = '-';

        // Extract time across columns avoiding coordinates and URLs
        let extractedTime = '-';
        for (let i = 0; i < cols.length; i++) {
          const val = cols[i] ? cols[i].trim() : '';
          if (isTimeStr(val)) {
            extractedTime = val;
            break;
          }
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate1)) {
          // Standard layout (Col 0=ID, Col 1=Tanggal, Col 2=NISN, Col 3=Nama, Col 4=Kelas, Col 5=Status)
          cleanDate = dateCandidate1;
          nisRaw = cols[2] || '-';
          namaRaw = cols[3] || '';
          kelasRaw = cols[4] || '';
          statusRaw = cols[5] || 'Hadir';
          
          if (extractedTime !== '-') {
            jamRaw = extractedTime;
          } else if (cols[9] && isTimeStr(cols[9])) {
            jamRaw = cols[9].trim();
          }

          // Extract keterangan from remaining columns excluding status, time, coords, urls
          const ketParts = cols.slice(6).filter((c) => {
            if (!c || !c.trim()) return false;
            const s = c.trim();
            if (s === statusRaw || isTimeStr(s) || isCoordStr(s)) return false;
            if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('Gagal simpan')) return false;
            return true;
          });
          if (ketParts.length > 0) {
            ketRaw = ketParts.join(' ');
          } else if (cols[6] && !isTimeStr(cols[6]) && !isCoordStr(cols[6])) {
            ketRaw = cols[6].trim();
          }
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate0)) {
          cleanDate = dateCandidate0;
          nisRaw = cols[1] || '-';
          namaRaw = cols[2] || '';
          kelasRaw = cols[3] || '';
          statusRaw = cols[4] || 'Hadir';

          if (extractedTime !== '-') {
            jamRaw = extractedTime;
          }

          const ketParts = cols.slice(5).filter((c) => {
            if (!c || !c.trim()) return false;
            const s = c.trim();
            if (s === statusRaw || isTimeStr(s) || isCoordStr(s)) return false;
            if (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('Gagal simpan')) return false;
            return true;
          });
          if (ketParts.length > 0) {
            ketRaw = ketParts.join(' ');
          }
        } else {
          // Fallback
          cleanDate = dateCandidate1 || dateCandidate0;
          nisRaw = cols[2] || '-';
          namaRaw = cols[3] || '';
          kelasRaw = cols[4] || '';
          statusRaw = cols[5] || 'Hadir';
          if (extractedTime !== '-') jamRaw = extractedTime;
          ketRaw = cols[6] && !isTimeStr(cols[6]) && !isCoordStr(cols[6]) ? cols[6] : '';
        }

        // Check if [TERLAMBAT] is anywhere in the row (e.g. Col 6, Col 8, etc.)
        const fullRowText = cols.join(' ');
        if (fullRowText.includes('[TERLAMBAT]') && !ketRaw.includes('[TERLAMBAT]')) {
          ketRaw = ketRaw ? `${ketRaw} [TERLAMBAT]` : '[TERLAMBAT]';
        }

        if (namaRaw && kelasRaw) {
          records.push({
            tanggal: cleanDate,
            waktu: jamRaw,
            nis: nisRaw,
            nama: namaRaw,
            kelas: kelasRaw,
            status: statusRaw as StatusAbsen,
            ket: ketRaw,
          });
        }
      }
    });

    return records;
  } catch {
    return [];
  }
}

export async function fetchKelas(): Promise<string[]> {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getKelas`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.filter(Boolean).sort();
      }
    }
  } catch (err) {
    console.warn('Google Apps Script fetchKelas failed, fallback to direct sheet:', err);
  }

  // Fallback to direct CSV if Apps Script unavailable
  try {
    const kelasSet = new Set<string>();
    const directSiswa = await fetchDirectSiswaCSV();
    directSiswa.forEach((item) => {
      if (item.kelas) kelasSet.add(item.kelas);
    });

    if (kelasSet.size === 0) {
      const directAbsen = await fetchDirectSpreadsheetData();
      directAbsen.forEach((rec) => {
        if (rec.kelas) kelasSet.add(rec.kelas);
      });
    }

    return Array.from(kelasSet).sort();
  } catch (err) {
    console.error('Fallback fetchKelas failed:', err);
    return [];
  }
}

export async function fetchSiswa(kelas: string): Promise<Siswa[]> {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getSiswa&kelas=${encodeURIComponent(kelas)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const list = data.map((s: { nama: string; nis: string; kelas?: string }) => ({
          nama: s.nama,
          nis: s.nis || '-',
          kelas: s.kelas || kelas,
        }));
        list.sort((a, b) => a.nama.localeCompare(b.nama));
        return list;
      }
    }
  } catch (err) {
    console.warn('Google Apps Script fetchSiswa failed, fallback to direct sheet:', err);
  }

  // Fallback to direct CSV if Apps Script unavailable
  try {
    const siswaMap = new Map<string, string>();
    const targetKelasNorm = kelas.replace(/\s+/g, ' ').trim().toLowerCase();

    const directSiswa = await fetchDirectSiswaCSV();
    directSiswa.forEach((item) => {
      const itemKelasNorm = item.kelas.replace(/\s+/g, ' ').trim().toLowerCase();
      if (itemKelasNorm === targetKelasNorm && item.nama) {
        if (!siswaMap.has(item.nama)) {
          siswaMap.set(item.nama, item.nis || '-');
        }
      }
    });

    if (siswaMap.size === 0) {
      const directAbsen = await fetchDirectSpreadsheetData();
      directAbsen.forEach((rec) => {
        const recKelasNorm = rec.kelas.replace(/\s+/g, ' ').trim().toLowerCase();
        if (recKelasNorm === targetKelasNorm && rec.nama) {
          if (!siswaMap.has(rec.nama)) {
            siswaMap.set(rec.nama, rec.nis || '-');
          }
        }
      });
    }

    const siswaList: Siswa[] = Array.from(siswaMap.entries()).map(([nama, nis]) => ({
      nama,
      nis,
      kelas,
    }));

    siswaList.sort((a, b) => a.nama.localeCompare(b.nama));
    return siswaList;
  } catch (err) {
    console.error('Fallback fetchSiswa failed:', err);
    return [];
  }
}

export async function fetchLaporan(kelas: string, tglMulai: string, tglAkhir: string): Promise<AbsenRecord[]> {
  let scriptRecords: AbsenRecord[] = [];
  const startNorm = normalizeDateStr(tglMulai);
  const endNorm = normalizeDateStr(tglAkhir);

  try {
    const url = `${SCRIPT_URL}?action=getLaporan&kelas=${encodeURIComponent(kelas)}&tglMulai=${startNorm || tglMulai}&tglAkhir=${endNorm || tglAkhir}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        scriptRecords = data.map((d: any) => {
          const rawTime = d.jam || d.waktu || d.jamInput || '';
          const validTime = isTimeStr(rawTime) ? rawTime : '-';
          return {
            tanggal: normalizeDateStr(d.tanggal || d.tgl || ''),
            waktu: validTime,
            nis: d.nisn || d.nis || '-',
            nama: d.nama || '',
            kelas: d.kelas || '',
            status: d.status || 'Hadir',
            ket: d.keterangan || d.ket || '',
          };
        });
      }
    }
  } catch (err) {
    console.warn('Google Apps Script fetchLaporan failed:', err);
  }

  // Always fetch direct spreadsheet data to capture real-time entries
  const directRecords = await fetchDirectSpreadsheetData();

  // Combine and deduplicate records
  const allRecordsMap = new Map<string, AbsenRecord>();

  const addRec = (rec: AbsenRecord) => {
    const tgl = normalizeDateStr(rec.tanggal);
    if (!tgl) return;
    const nis = rec.nis ? rec.nis.trim().replace(/^0+/, '') : '';
    const nama = rec.nama ? rec.nama.replace(/\s+/g, ' ').trim().toLowerCase() : '';
    const st = rec.status ? rec.status.trim().toLowerCase() : '';
    const key = `${tgl}_${nis}_${nama}_${st}`;
    if (!allRecordsMap.has(key)) {
      allRecordsMap.set(key, { ...rec, tanggal: tgl });
    }
  };

  scriptRecords.forEach(addRec);
  directRecords.forEach(addRec);

  const recordsToFilter = Array.from(allRecordsMap.values());
  const targetKelasNorm = kelas ? kelas.replace(/\s+/g, ' ').trim().toLowerCase() : '';

  // Filter records strictly by date range and class
  return recordsToFilter.filter((rec) => {
    let matchKelas = true;
    if (targetKelasNorm) {
      const recKelasNorm = (rec.kelas || '').replace(/\s+/g, ' ').trim().toLowerCase();
      matchKelas = recKelasNorm === targetKelasNorm;
    }

    let matchDate = true;
    const normRecDate = normalizeDateStr(rec.tanggal);
    if (startNorm && endNorm) {
      matchDate = normRecDate >= startNorm && normRecDate <= endNorm;
    } else if (startNorm) {
      matchDate = normRecDate === startNorm;
    }

    return matchKelas && matchDate;
  });
}

export interface KirimPayload {
  nis: string;
  nama: string;
  kelas: string;
  status: string;
  keterangan: string;
  lat: number | null;
  lng: number | null;
  image: string;
}

export interface AttendanceReceipt {
  idPresensi: string;
  nama: string;
  nis: string;
  kelas: string;
  tanggalIso: string;
  tanggalFormatted: string;
  waktuFormatted: string;
  status: string;
  keteranganStatus: string;
  keteranganNotes: string;
  fotoBase64: string;
  lokasiStatus: string;
  lat: number | null;
  lng: number | null;
  createdAt: number;
}

export interface PostAbsensiResponse {
  ok: boolean;
  message: string;
  errorType?: 'network' | 'validation' | 'database';
  receipt?: AttendanceReceipt;
}

export function formatTanggalIndo(dateObj: Date): string {
  const bulanIndo = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const d = dateObj.getDate();
  const m = bulanIndo[dateObj.getMonth()];
  const y = dateObj.getFullYear();
  return `${d} ${m} ${y}`;
}

export function saveLocalReceipt(receipt: AttendanceReceipt) {
  try {
    const existing = getLocalReceipts();
    const filtered = existing.filter(
      (r) => !(r.nis === receipt.nis && r.tanggalIso === receipt.tanggalIso && r.status === receipt.status)
    );
    filtered.unshift(receipt);
    localStorage.setItem('SIMAGU_ATTENDANCE_RECEIPTS', JSON.stringify(filtered.slice(0, 100)));
  } catch (e) {
    console.error('Error saving local receipt:', e);
  }
}

export function getLocalReceipts(): AttendanceReceipt[] {
  try {
    const data = localStorage.getItem('SIMAGU_ATTENDANCE_RECEIPTS');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

export function getTodayStudentReceipt(nis: string, nama: string, tanggalIso: string): AttendanceReceipt | null {
  const receipts = getLocalReceipts();
  const found = receipts.find(
    (r) =>
      r.tanggalIso === tanggalIso &&
      ((nis && r.nis === nis) || (nama && r.nama.toLowerCase() === nama.toLowerCase()))
  );
  return found || null;
}

export async function postAbsensi(payload: KirimPayload): Promise<PostAbsensiResponse> {
  // Check online status first
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      errorType: 'network',
      message: 'Periksa koneksi internet kamu lalu coba kembali.',
    };
  }

  try {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const tanggalLocal = `${yyyy}-${mm}-${dd}`;

    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const jamLocal = `${hh}.${min}.${ss}`;
    const waktuWibFormatted = `${hh}:${min} WIB`;
    const tglIndoFormatted = formatTanggalIndo(now);

    const cleanKet = (payload.keterangan || '').trim();

    // Check lateness
    let lateStatusStr = 'TEPAT WAKTU';
    if (payload.status === 'Hadir' && `${hh}:${min}` > BATAS_JAM_MASUK) {
      lateStatusStr = 'TERLAMBAT';
    } else if (payload.status === 'Sakit' || payload.status === 'Izin') {
      lateStatusStr = payload.status.toUpperCase();
    }

    // Format ID Presensi: PRS-YYYYMMDD-RandomHex or NIS
    const randSuffix = Math.floor(100000 + Math.random() * 900000);
    const idPresensi = `PRS-${yyyy}${mm}${dd}-${payload.nis !== '-' ? payload.nis : randSuffix}`;

    // Format location text
    let lokasiText = 'Tanpa GPS';
    if (payload.lat !== null && payload.lng !== null) {
      lokasiText = `Lokasi Terdeteksi (${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)})`;
    }

    const bodyData = {
      action: 'simpanAbsen',
      id: idPresensi,
      nis: payload.nis,
      nisn: payload.nis,
      nama: payload.nama,
      kelas: payload.kelas,
      status: payload.status,
      keterangan: cleanKet,
      ket: cleanKet,
      guru: '',
      mataPelajaran: '',
      mapel: '',
      jam: jamLocal,
      jamInput: jamLocal,
      waktu: jamLocal,
      lat: payload.lat ?? '',
      latitude: payload.lat ?? '',
      lng: payload.lng ?? '',
      longitude: payload.lng ?? '',
      alamat: '',
      fotoBase64: payload.image || '',
      image: payload.image || '',
      foto: payload.image || '',
      tanggal: tanggalLocal,
      tgl: tanggalLocal,
    };

    let serverSuccess = false;
    let serverMessage = '';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(bodyData),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.ok === true || data.status === 'success' || data.result === 'success') {
          serverSuccess = true;
          serverMessage = data.message || 'Presensi kamu telah berhasil dicatat.';
        } else {
          serverMessage = data.message || 'Data presensi belum berhasil disimpan. Silakan coba kembali.';
        }
      } else {
        serverMessage = 'Data presensi belum berhasil disimpan. Silakan coba kembali.';
      }
    } catch (fetchErr: any) {
      console.warn('Network / Server fetch error:', fetchErr);
      if (fetchErr.name === 'AbortError') {
        return {
          ok: false,
          errorType: 'network',
          message: 'Koneksi ke server lambat atau terputus. Silakan coba kembali.',
        };
      }
      return {
        ok: false,
        errorType: 'network',
        message: 'Periksa koneksi internet kamu lalu coba kembali.',
      };
    }

    if (!serverSuccess) {
      return {
        ok: false,
        errorType: 'database',
        message: serverMessage || 'Data presensi belum berhasil disimpan. Silakan coba kembali.',
      };
    }

    // Build Receipt Object
    const receiptObj: AttendanceReceipt = {
      idPresensi,
      nama: payload.nama,
      nis: payload.nis,
      kelas: payload.kelas,
      tanggalIso: tanggalLocal,
      tanggalFormatted: tglIndoFormatted,
      waktuFormatted: waktuWibFormatted,
      status: payload.status.toUpperCase(),
      keteranganStatus: lateStatusStr,
      keteranganNotes: cleanKet,
      fotoBase64: payload.image || '',
      lokasiStatus: lokasiText,
      lat: payload.lat,
      lng: payload.lng,
      createdAt: Date.now(),
    };

    // Save to local storage cache so student can view receipt & prevent duplicates
    saveLocalReceipt(receiptObj);

    return {
      ok: true,
      message: 'Presensi kamu telah berhasil dicatat.',
      receipt: receiptObj,
    };
  } catch (err) {
    console.error('Error posting absensi:', err);
    return {
      ok: false,
      errorType: 'database',
      message: 'Data presensi belum berhasil disimpan. Silakan coba kembali.',
    };
  }
}

export function playVoice(text: string, isEn: boolean = false) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // cancel previous speaking
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isEn ? 'en-US' : 'id-ID';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
}

export function cekApakahTerlambat(): boolean {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}` > BATAS_JAM_MASUK;
}

export function isFakeGPS(pos: GeolocationPosition): boolean {
  const rawPos = pos as unknown as { isFromMockProvider?: boolean; mocked?: boolean };
  if (rawPos.isFromMockProvider || rawPos.mocked) return true;
  if (pos.coords && pos.coords.accuracy !== undefined) {
    if (pos.coords.accuracy <= 0.1) return true;
  }
  return false;
}

export async function checkVPN(): Promise<boolean> {
  try {
    const res = await fetch('https://ipapi.co/json/', { cache: 'no-cache' });
    const data = await res.json();
    if (data.country_code && data.country_code !== 'ID') return true;
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (data.timezone && systemTimezone && data.timezone !== systemTimezone) return true;
    return false;
  } catch (err) {
    return false;
  }
}
