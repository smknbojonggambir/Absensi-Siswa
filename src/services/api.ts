import { AbsenRecord, Siswa, StatusAbsen } from '../types';

export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxc77xA8sZbYLpc8_IMJDiA3rh1RoseOlhseyh2GS-neWLXAW2gkOC5ajGja68N66YHxw/exec';
export const SPREADSHEET_ID = '1_Zts99iIgy3L7TKCtADv25P6pTeGLmD3rvRWQ7RMWIA';
export const SPREADSHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
export const SPREADSHEET_SISWA_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=DataSiswa`;
export const BATAS_JAM_MASUK = '07:00';

export class ApiError extends Error {
  isNetworkError: boolean;
  isTimeout: boolean;
  status?: number;
  userMessage: string;

  constructor(message: string, isNetworkError = false, isTimeout = false, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.isNetworkError = isNetworkError;
    this.isTimeout = isTimeout;
    this.status = status;
    this.userMessage = isTimeout
      ? 'Koneksi ke server presensi sedang sibuk. Silakan coba kembali.'
      : isNetworkError
      ? 'Koneksi internet terputus atau tidak stabil. Periksa koneksi kamu lalu coba lagi.'
      : 'Terjadi kendala saat memproses presensi. Silakan coba lagi.';
  }
}

/**
 * Global HTTP interceptor with automatic timeout, AbortController propagation, and user-friendly error wrapping
 */
export async function safeFetch(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 9000, signal, ...rest } = options;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);

  let effectiveSignal: AbortSignal = timeoutController.signal;

  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      throw new DOMException('Aborted', 'AbortError');
    }
    const combinedController = new AbortController();
    const handleAbort = () => combinedController.abort();
    signal.addEventListener('abort', handleAbort);
    timeoutController.signal.addEventListener('abort', handleAbort);
    effectiveSignal = combinedController.signal;
  }

  try {
    const res = await fetch(url, { ...rest, signal: effectiveSignal });
    clearTimeout(timer);
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      if (signal?.aborted) {
        throw err;
      }
      throw new ApiError('Request timed out', false, true);
    }
    throw new ApiError(err?.message || 'Network request failed', true, false);
  }
}

export function normalizeDateStr(rawDateStr: string): string {
  if (!rawDateStr) return '';
  let str = String(rawDateStr).trim();
  if (str.includes(' ')) {
    str = str.split(' ')[0];
  } else if (str.includes('T')) {
    str = str.split('T')[0];
  }

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

export async function fetchDirectSiswaCSV(signal?: AbortSignal): Promise<RawSiswaRow[]> {
  try {
    const res = await safeFetch(SPREADSHEET_SISWA_CSV_URL, { signal, timeoutMs: 6000 });
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

export async function fetchDirectSpreadsheetData(signal?: AbortSignal): Promise<AbsenRecord[]> {
  try {
    const res = await safeFetch(SCRIPT_URL, { signal, timeoutMs: 6000 });
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
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw err;
    }
  }

  if (signal?.aborted) return [];

  try {
    const res = await safeFetch(SPREADSHEET_CSV_URL, { signal, timeoutMs: 6000 });
    if (!res.ok) return [];
    const text = await res.text();
    if (!text || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
      return [];
    }
    const rows = parseCSV(text);
    const dataRows = rows.slice(1);
    const records: AbsenRecord[] = [];

    dataRows.forEach((cols) => {
      if (cols.length >= 5) {
        const dateCandidate1 = normalizeDateStr(cols[1] || '');
        const dateCandidate0 = normalizeDateStr(cols[0] || '');

        let cleanDate = '';
        let nisRaw = '-';
        let namaRaw = '';
        let kelasRaw = '';
        let statusRaw = 'Hadir';
        let ketRaw = '';
        let jamRaw = '-';

        let extractedTime = '-';
        for (let i = 0; i < cols.length; i++) {
          const val = cols[i] ? cols[i].trim() : '';
          if (isTimeStr(val)) {
            extractedTime = val;
            break;
          }
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate1)) {
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
          cleanDate = dateCandidate1 || dateCandidate0;
          nisRaw = cols[2] || '-';
          namaRaw = cols[3] || '';
          kelasRaw = cols[4] || '';
          statusRaw = cols[5] || 'Hadir';
          if (extractedTime !== '-') jamRaw = extractedTime;
          ketRaw = cols[6] && !isTimeStr(cols[6]) && !isCoordStr(cols[6]) ? cols[6] : '';
        }

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
  } catch (err: any) {
    if (err?.name === 'AbortError' || signal?.aborted) {
      throw err;
    }
    return [];
  }
}

export const DEFAULT_KELAS: string[] = [
  'X APHP',
  'X DKV 1',
  'X DKV 2',
  'XI APHP',
  'XI DKV 1',
  'XI DKV 2',
  'XII APHP',
  'XII DKV 1',
  'XII DKV 2',
  'XII DKV 3',
];

const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedKelas: { timestamp: number; data: string[] } | null = null;
const cachedSiswaByKelas = new Map<string, { timestamp: number; data: Siswa[] }>();

let isSubmittingLock = false;

// Active controllers for automatic cancellation on rapid interaction
let activeKelasController: AbortController | null = null;
let activeSiswaController: AbortController | null = null;
let activeLaporanController: AbortController | null = null;
let inFlightKelasPromise: Promise<string[]> | null = null;

export function cancelAllPendingRequests() {
  if (activeKelasController) {
    activeKelasController.abort();
    activeKelasController = null;
  }
  if (activeSiswaController) {
    activeSiswaController.abort();
    activeSiswaController = null;
  }
  if (activeLaporanController) {
    activeLaporanController.abort();
    activeLaporanController = null;
  }
  inFlightKelasPromise = null;
}

export function getImageSizeKb(base64Str: string): number {
  if (!base64Str) return 0;
  const commaIdx = base64Str.indexOf(',');
  const cleanStr = commaIdx !== -1 ? base64Str.slice(commaIdx + 1) : base64Str;
  const bytes = (cleanStr.length * 3) / 4;
  return Math.round(bytes / 1024);
}

export async function compressImageBase64(
  base64Str: string,
  maxDim: number = 420,
  quality: number = 0.58
): Promise<string> {
  if (!base64Str || !base64Str.startsWith('data:image')) return base64Str;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(base64Str);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.drawImage(img, 0, 0, width, height);

        let compressed = canvas.toDataURL('image/jpeg', quality);

        // Adaptive optimization: if payload is still larger than ~50KB, perform a second lightweight pass
        if (compressed.length > 70000) {
          try {
            const smCanvas = document.createElement('canvas');
            const scale = 0.85;
            smCanvas.width = Math.round(width * scale);
            smCanvas.height = Math.round(height * scale);
            const smCtx = smCanvas.getContext('2d');
            if (smCtx) {
              smCtx.imageSmoothingEnabled = true;
              smCtx.drawImage(canvas, 0, 0, smCanvas.width, smCanvas.height);
              compressed = smCanvas.toDataURL('image/jpeg', 0.50);
            }
          } catch {}
        }

        resolve(compressed);
      };
      img.onerror = () => resolve(base64Str);
      img.src = base64Str;
    } catch {
      resolve(base64Str);
    }
  });
}

export async function fetchKelas(callerSignal?: AbortSignal, forceRefresh = false): Promise<string[]> {
  const now = Date.now();
  if (!forceRefresh) {
    if (cachedKelas && now - cachedKelas.timestamp < CACHE_TTL_MS && Array.isArray(cachedKelas.data) && cachedKelas.data.length >= DEFAULT_KELAS.length) {
      return cachedKelas.data;
    }

    try {
      const sessionItem = sessionStorage.getItem('SIMAGU_KELAS_CACHE');
      if (sessionItem) {
        const parsed = JSON.parse(sessionItem);
        if (now - parsed.timestamp < CACHE_TTL_MS && Array.isArray(parsed.data) && parsed.data.length >= DEFAULT_KELAS.length) {
          cachedKelas = parsed;
          return parsed.data;
        } else {
          sessionStorage.removeItem('SIMAGU_KELAS_CACHE');
        }
      }
    } catch {}
  } else {
    cachedKelas = null;
    try {
      sessionStorage.removeItem('SIMAGU_KELAS_CACHE');
    } catch {}
  }

  // If already in flight, reuse promise to prevent duplicate conflicting requests
  if (inFlightKelasPromise) {
    return inFlightKelasPromise;
  }

  inFlightKelasPromise = (async () => {
    if (activeKelasController) {
      activeKelasController.abort();
    }
    const currentController = new AbortController();
    activeKelasController = currentController;

    const classesFound = new Set<string>();

    try {
      const res = await safeFetch(`${SCRIPT_URL}?action=getKelas`, {
        signal: callerSignal || currentController.signal,
        timeoutMs: 8000,
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          data.forEach((c) => {
            const str = typeof c === 'string' ? c.trim() : '';
            if (str && str.length > 1 && str !== 'X') {
              classesFound.add(str);
            }
          });
        }
      }
    } catch {}

    // If Apps Script returned fewer classes than standard, query spreadsheet
    if (classesFound.size < DEFAULT_KELAS.length) {
      try {
        const fallbackSignal = callerSignal && !callerSignal.aborted ? callerSignal : undefined;
        const directAbsen = await fetchDirectSpreadsheetData(fallbackSignal);
        directAbsen.forEach((rec) => {
          const str = rec.kelas ? rec.kelas.trim() : '';
          if (str && str.length > 1 && str !== 'X') {
            classesFound.add(str);
          }
        });
      } catch {}
    }

    // Always merge with official SMKN Bojonggambir DEFAULT_KELAS so all 10 classes are guaranteed to appear
    DEFAULT_KELAS.forEach((k) => classesFound.add(k));

    const finalClasses = Array.from(classesFound).sort();

    cachedKelas = { timestamp: now, data: finalClasses };
    try {
      sessionStorage.setItem('SIMAGU_KELAS_CACHE', JSON.stringify(cachedKelas));
    } catch {}

    return finalClasses;
  })().finally(() => {
    inFlightKelasPromise = null;
  });

  return inFlightKelasPromise;
}

export async function fetchSiswa(kelas: string, callerSignal?: AbortSignal): Promise<Siswa[]> {
  if (!kelas) return [];
  const now = Date.now();
  const cacheKey = kelas.trim().toLowerCase();

  const cached = cachedSiswaByKelas.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS && cached.data.length > 0) {
    return cached.data;
  }

  if (activeSiswaController) {
    activeSiswaController.abort();
  }
  const currentController = new AbortController();
  activeSiswaController = currentController;

  let siswaList: Siswa[] = [];
  try {
    const res = await safeFetch(`${SCRIPT_URL}?action=getSiswa&kelas=${encodeURIComponent(kelas)}`, {
      signal: callerSignal || currentController.signal,
      timeoutMs: 8000,
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        siswaList = data.map((s: { nama: string; nis: string; kelas?: string }) => ({
          nama: s.nama,
          nis: s.nis || '-',
          kelas: s.kelas || kelas,
        }));
        siswaList.sort((a, b) => a.nama.localeCompare(b.nama));
      }
    }
  } catch {}

  if (siswaList.length < 5) {
    try {
      const siswaMap = new Map<string, string>();
      siswaList.forEach((s) => {
        if (s.nama) siswaMap.set(s.nama, s.nis || '-');
      });

      const targetKelasNorm = kelas.replace(/\s+/g, ' ').trim().toLowerCase();
      const fallbackSignal = callerSignal && !callerSignal.aborted ? callerSignal : undefined;

      const directAbsen = await fetchDirectSpreadsheetData(fallbackSignal);
      directAbsen.forEach((rec) => {
        const recKelasNorm = rec.kelas ? rec.kelas.replace(/\s+/g, ' ').trim().toLowerCase() : '';
        if (recKelasNorm === targetKelasNorm && rec.nama) {
          if (!siswaMap.has(rec.nama)) {
            siswaMap.set(rec.nama, rec.nis || '-');
          }
        }
      });

      const directSiswa = await fetchDirectSiswaCSV(fallbackSignal);
      directSiswa.forEach((item) => {
        const itemKelasNorm = item.kelas ? item.kelas.replace(/\s+/g, ' ').trim().toLowerCase() : '';
        if (itemKelasNorm === targetKelasNorm && item.nama) {
          if (!siswaMap.has(item.nama)) {
            siswaMap.set(item.nama, item.nis || '-');
          }
        }
      });

      siswaList = Array.from(siswaMap.entries()).map(([nama, nis]) => ({
        nama,
        nis,
        kelas,
      }));
      siswaList.sort((a, b) => a.nama.localeCompare(b.nama));
    } catch {}
  }

  if (siswaList.length > 0) {
    cachedSiswaByKelas.set(cacheKey, { timestamp: now, data: siswaList });
  }

  return siswaList;
}

export async function fetchLaporan(
  kelas: string,
  tglMulai: string,
  tglAkhir: string,
  callerSignal?: AbortSignal
): Promise<AbsenRecord[]> {
  if (activeLaporanController) {
    activeLaporanController.abort();
  }
  activeLaporanController = new AbortController();

  let scriptRecords: AbsenRecord[] = [];
  const startNorm = normalizeDateStr(tglMulai);
  const endNorm = normalizeDateStr(tglAkhir);

  try {
    const url = `${SCRIPT_URL}?action=getLaporan&kelas=${encodeURIComponent(kelas)}&tglMulai=${startNorm || tglMulai}&tglAkhir=${endNorm || tglAkhir}`;
    const res = await safeFetch(url, {
      signal: callerSignal || activeLaporanController.signal,
      timeoutMs: 8000,
    });
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
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return [];
    }
  }

  const directRecords = await fetchDirectSpreadsheetData(callerSignal || activeLaporanController?.signal);

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
  errorType?: 'network' | 'validation' | 'database' | 'server' | 'timeout';
  statusCode?: number;
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
  } catch {}
}

export function getLocalReceipts(): AttendanceReceipt[] {
  try {
    const data = localStorage.getItem('SIMAGU_ATTENDANCE_RECEIPTS');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getTodayStudentReceipts(nis: string, nama: string, tanggalIso: string): AttendanceReceipt[] {
  const receipts = getLocalReceipts();
  return receipts.filter(
    (r) =>
      r.tanggalIso === tanggalIso &&
      ((nis && r.nis === nis) || (nama && r.nama.toLowerCase() === nama.toLowerCase()))
  );
}

export function getTodayStudentReceipt(nis: string, nama: string, tanggalIso: string, statusFilter?: string): AttendanceReceipt | null {
  const receipts = getLocalReceipts();
  const found = receipts.find(
    (r) =>
      r.tanggalIso === tanggalIso &&
      ((nis && r.nis === nis) || (nama && r.nama.toLowerCase() === nama.toLowerCase())) &&
      (!statusFilter || r.status.toUpperCase() === statusFilter.toUpperCase())
  );
  return found || null;
}

export async function postAbsensi(payload: KirimPayload): Promise<PostAbsensiResponse> {
  if (isSubmittingLock) {
    return {
      ok: false,
      errorType: 'validation',
      message: 'Presensi kamu sedang diproses. Mohon tunggu sebentar...',
    };
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      ok: false,
      errorType: 'network',
      message: 'Koneksi internet terputus. Pastikan perangkat terhubung ke internet lalu coba lagi.',
    };
  }

  isSubmittingLock = true;

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

    let lateStatusStr = 'TEPAT WAKTU';
    if (payload.status === 'Hadir' && `${hh}:${min}` > BATAS_JAM_MASUK) {
      lateStatusStr = 'TERLAMBAT';
    } else if (payload.status === 'Sakit' || payload.status === 'Izin') {
      lateStatusStr = payload.status.toUpperCase();
    }

    const randSuffix = Math.floor(100000 + Math.random() * 900000);
    const idPresensi = `PRS-${yyyy}${mm}${dd}-${payload.nis !== '-' ? payload.nis : randSuffix}`;

    let lokasiText = 'Tanpa GPS';
    if (payload.lat !== null && payload.lng !== null) {
      lokasiText = `Lokasi Terdeteksi (${payload.lat.toFixed(4)}, ${payload.lng.toFixed(4)})`;
    }

    let optimizedImage = payload.image || '';
    if (optimizedImage.startsWith('data:image')) {
      try {
        optimizedImage = await compressImageBase64(optimizedImage, 420, 0.58);
      } catch {}
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
      fotoBase64: optimizedImage,
      image: optimizedImage,
      foto: optimizedImage,
      tanggal: tanggalLocal,
      tgl: tanggalLocal,
    };

    let serverSuccess = false;
    let serverMessage = '';

    try {
      const res = await safeFetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(bodyData),
        timeoutMs: 14000,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok === true || data.status === 'success' || data.result === 'success') {
          serverSuccess = true;
          serverMessage = data.message || 'Presensi kamu telah berhasil dicatat.';
        } else {
          serverMessage = data.message || 'Data presensi belum dapat disimpan oleh server. Silakan coba kembali.';
        }
      } else {
        const statusMsg = res.status === 500
          ? 'Server presensi sedang mengalami beban tinggi (Error 500). Silakan ketuk tombol "Coba Lagi" di bawah.'
          : `Server presensi merespons dengan kendala (Kode ${res.status}). Silakan coba kembali.`;
        return {
          ok: false,
          errorType: 'server',
          statusCode: res.status,
          message: statusMsg,
        };
      }
    } catch (fetchErr: any) {
      if (fetchErr instanceof ApiError) {
        if (fetchErr.isTimeout) {
          return {
            ok: false,
            errorType: 'timeout',
            message: 'Koneksi ke server presensi melebihi batas waktu (Timeout). Silakan periksa koneksi lalu ketuk "Coba Lagi".',
          };
        }
        return {
          ok: false,
          errorType: 'network',
          message: fetchErr.userMessage,
        };
      }
      return {
        ok: false,
        errorType: 'network',
        message: 'Koneksi ke server presensi terputus atau melebihi batas waktu. Silakan klik tombol Coba Lagi.',
      };
    }

    if (!serverSuccess) {
      return {
        ok: false,
        errorType: 'database',
        message: serverMessage || 'Koneksi ke database sedang sibuk. Silakan klik tombol Coba Lagi.',
      };
    }

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
      fotoBase64: optimizedImage,
      lokasiStatus: lokasiText,
      lat: payload.lat,
      lng: payload.lng,
      createdAt: Date.now(),
    };

    saveLocalReceipt(receiptObj);

    return {
      ok: true,
      message: 'Presensi kamu telah berhasil dicatat.',
      receipt: receiptObj,
    };
  } catch {
    return {
      ok: false,
      errorType: 'database',
      message: 'Terjadi kendala saat menyimpan presensi. Silakan klik tombol Coba Lagi.',
    };
  } finally {
    isSubmittingLock = false;
  }
}

export function playVoice(text: string, isEn: boolean = false) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
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
    const res = await safeFetch('https://ipapi.co/json/', { timeoutMs: 4000 });
    const data = await res.json();
    if (data.country_code && data.country_code !== 'ID') return true;
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (data.timezone && systemTimezone && data.timezone !== systemTimezone) return true;
    return false;
  } catch {
    return false;
  }
}
