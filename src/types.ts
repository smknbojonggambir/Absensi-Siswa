export type Language = 'id' | 'en';

export type StatusAbsen = 'Hadir' | 'Pulang' | 'Izin' | 'Sakit' | 'Alpha';

export interface Siswa {
  nama: string;
  nis: string;
  kelas?: string;
}

export interface AbsenRecord {
  tanggal: string;
  waktu: string;
  nama: string;
  kelas: string;
  status: StatusAbsen;
  ket: string;
  nis?: string;
}

export interface RekapSiswa {
  nis: string;
  nama: string;
  kelas: string;
  hadir: number;
  pulang: number;
  sakit: number;
  izin: number;
  alpha: number;
  terlambat: number;
  totalHari: number;
  persentase: number;
}

export type JenisLaporan = 'harian' | 'range' | 'bulanan' | 'custom';
export type TampilanLaporan = 'rekap' | 'detail';

export interface LocationCoords {
  lat: number | null;
  lng: number | null;
}
