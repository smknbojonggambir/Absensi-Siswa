import { AbsenRecord, Siswa, StatusAbsen } from '../types';

export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxc77xA8sZbYLpc8_IMJDiA3rh1RoseOlhseyh2GS-neWLXAW2gkOC5ajGja68N66YHxw/exec';
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
          waktu: d.jam || d.waktu || '-',
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
      if (cols.length >= 6) {
        const timestampRaw = cols[0] || '';
        const tanggalRaw = cols[1] || '';
        const nisRaw = cols[2] || '-';
        const namaRaw = cols[3] || '';
        const kelasRaw = cols[4] || '';
        const statusRaw = cols[5] || 'Hadir';
        const ketRaw = cols[6] || '';

        let waktu = '-';
        if (timestampRaw) {
          const parts = timestampRaw.split(' ');
          if (parts.length > 1) {
            waktu = parts[1];
          }
        }

        let cleanDate = tanggalRaw;
        if (!cleanDate && timestampRaw) {
          const parts = timestampRaw.split(' ');
          cleanDate = parts[0];
        }

        if (namaRaw && kelasRaw) {
          records.push({
            tanggal: normalizeDateStr(cleanDate),
            waktu: waktu,
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
  let recordsToFilter: AbsenRecord[] = [];
  const startNorm = normalizeDateStr(tglMulai);
  const endNorm = normalizeDateStr(tglAkhir);

  try {
    const url = `${SCRIPT_URL}?action=getLaporan&kelas=${encodeURIComponent(kelas)}&tglMulai=${startNorm || tglMulai}&tglAkhir=${endNorm || tglAkhir}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        recordsToFilter = data.map((d: any) => ({
          tanggal: normalizeDateStr(d.tanggal || d.tgl || ''),
          waktu: d.jam || d.waktu || '-',
          nis: d.nisn || d.nis || '-',
          nama: d.nama || '',
          kelas: d.kelas || '',
          status: d.status || 'Hadir',
          ket: d.keterangan || d.ket || '',
        }));
      }
    }
  } catch (err) {
    console.warn('Google Apps Script fetchLaporan failed, falling back to direct sheet:', err);
  }

  if (recordsToFilter.length === 0) {
    recordsToFilter = await fetchDirectSpreadsheetData();
  }

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

export async function postAbsensi(payload: KirimPayload): Promise<{ ok: boolean; message: string }> {
  try {
    const bodyData = {
      action: 'simpanAbsen',
      nis: payload.nis,
      nisn: payload.nis,
      nama: payload.nama,
      kelas: payload.kelas,
      status: payload.status,
      keterangan: payload.keterangan,
      lat: payload.lat,
      lng: payload.lng,
      fotoBase64: payload.image,
      image: payload.image,
      jam: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      tanggal: new Date().toISOString().split('T')[0],
    };

    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(bodyData),
    });

    const data = await res.json();
    if (data.ok === true || data.status === 'success') {
      return { ok: true, message: data.message || 'Absensi berhasil disimpan!' };
    }
    return { ok: false, message: data.message || 'Gagal menyimpan absensi.' };
  } catch (err) {
    console.error('Error posting absensi:', err);
    return { ok: false, message: 'Gagal Konek Server.' };
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
