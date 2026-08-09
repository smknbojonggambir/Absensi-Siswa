import { AbsenRecord, Siswa, StatusAbsen } from '../types';

export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyytS2HhYXJaFHx443XPKdgWBOH4izHQ4yPaCMStJBCLxie54djdjb1I6tb6ZgUI0QPLQ/exec';
export const SPREADSHEET_ID = '1ujQI5dMhPBr-d1H8w_r_btiBQfdZRSLKao52qXYUja0';
export const SPREADSHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv`;
export const BATAS_JAM_MASUK = '07:00';

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

export async function fetchDirectSpreadsheetData(): Promise<AbsenRecord[]> {
  try {
    const res = await fetch(SPREADSHEET_CSV_URL);
    if (!res.ok) throw new Error('Failed to fetch spreadsheet CSV');
    const text = await res.text();
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
            tanggal: cleanDate,
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
  } catch (err) {
    console.error('Error fetching direct spreadsheet data:', err);
    return [];
  }
}

export async function fetchKelas(): Promise<string[]> {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getKelas`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {
    console.warn('Google Apps Script fetchKelas failed, falling back to direct sheet:', err);
  }

  // Fallback to direct Spreadsheet CSV
  const directData = await fetchDirectSpreadsheetData();
  const kelasSet = new Set<string>();
  directData.forEach((rec) => {
    if (rec.kelas) kelasSet.add(rec.kelas);
  });
  return Array.from(kelasSet).sort();
}

export async function fetchSiswa(kelas: string): Promise<Siswa[]> {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getSiswa&kelas=${encodeURIComponent(kelas)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {
    console.warn('Google Apps Script fetchSiswa failed, falling back to direct sheet:', err);
  }

  // Fallback to direct Spreadsheet CSV
  const directData = await fetchDirectSpreadsheetData();
  const siswaMap = new Map<string, string>();
  directData.forEach((rec) => {
    if (rec.kelas.toLowerCase() === kelas.toLowerCase() && rec.nama) {
      if (!siswaMap.has(rec.nama)) {
        siswaMap.set(rec.nama, rec.nis || '-');
      }
    }
  });

  const siswaList: Siswa[] = Array.from(siswaMap.entries()).map(([nama, nis]) => ({
    nama,
    nis,
  }));

  siswaList.sort((a, b) => a.nama.localeCompare(b.nama));
  return siswaList;
}

export async function fetchLaporan(kelas: string, tglMulai: string, tglAkhir: string): Promise<AbsenRecord[]> {
  let scriptRecords: AbsenRecord[] = [];
  try {
    const url = `${SCRIPT_URL}?action=getLaporan&kelas=${encodeURIComponent(kelas)}&tglMulai=${tglMulai}&tglAkhir=${tglAkhir}`;
    const res = await fetch(url);
    if (res.ok) {
      scriptRecords = await res.json();
    }
  } catch (err) {
    console.warn('Google Apps Script fetchLaporan failed, falling back to direct sheet:', err);
  }

  // Also fetch direct spreadsheet records to guarantee full dataset accuracy from 1ujQI5dMhPBr-d1H8w_r_btiBQfdZRSLKao52qXYUja0
  const directRecords = await fetchDirectSpreadsheetData();

  // Filter direct records by date range and class
  const filteredDirect = directRecords.filter((rec) => {
    let matchKelas = true;
    if (kelas) {
      matchKelas = rec.kelas.toLowerCase() === kelas.toLowerCase();
    }

    let matchDate = true;
    if (tglMulai && tglAkhir) {
      matchDate = rec.tanggal >= tglMulai && rec.tanggal <= tglAkhir;
    } else if (tglMulai) {
      matchDate = rec.tanggal === tglMulai;
    }

    return matchKelas && matchDate;
  });

  // Combine and deduplicate records by (tanggal + nama + status)
  const combinedMap = new Map<string, AbsenRecord>();

  [...scriptRecords, ...filteredDirect].forEach((rec) => {
    const key = `${rec.tanggal}_${rec.nama.trim().toLowerCase()}_${rec.status}`;
    if (!combinedMap.has(key)) {
      combinedMap.set(key, rec);
    } else {
      // Enrich with NIS if existing didn't have it
      const existing = combinedMap.get(key)!;
      if ((!existing.nis || existing.nis === '-') && rec.nis && rec.nis !== '-') {
        existing.nis = rec.nis;
      }
    }
  });

  const result = Array.from(combinedMap.values());
  result.sort((a, b) => {
    if (a.tanggal === b.tanggal) {
      return a.nama.localeCompare(b.nama);
    }
    return a.tanggal.localeCompare(b.tanggal);
  });

  return result;
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
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return await res.json();
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
