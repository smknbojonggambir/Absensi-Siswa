import React, { useState, useEffect, useRef } from 'react';
import { Language, Siswa } from '../types';
import {
  DEFAULT_KELAS,
  fetchKelas,
  fetchSiswa,
  fetchLaporan,
  postAbsensi,
  playVoice,
  cekApakahTerlambat,
  getTodayStudentReceipt,
  getTodayStudentReceipts,
  getLocalReceipts,
  AttendanceReceipt,
  getImageSizeKb,
} from '../services/api';

interface FormAbsensiProps {
  lang: Language;
}

export const FormAbsensi: React.FC<FormAbsensiProps> = ({ lang }) => {
  const [kelasList, setKelasList] = useState<string[]>(DEFAULT_KELAS);
  const [loadingKelas, setLoadingKelas] = useState<boolean>(false);
  const [kelasLoadError, setKelasLoadError] = useState<string | null>(null);

  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [loadingSiswa, setLoadingSiswa] = useState<boolean>(false);
  const [siswaLoadError, setSiswaLoadError] = useState<string | null>(null);

  const [selectedNama, setSelectedNama] = useState<string>('');
  const [selectedNis, setSelectedNis] = useState<string>('');
  const [status, setStatus] = useState<string>('Hadir');
  const [keterangan, setKeterangan] = useState<string>('');

  // Camera state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [fotoBase64, setFotoBase64] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Form submit & modal states
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [alreadySubmittedReceipt, setAlreadySubmittedReceipt] = useState<AttendanceReceipt | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<AttendanceReceipt | null>(null);
  const [errorScreen, setErrorScreen] = useState<{
    type: 'network' | 'timeout' | 'server' | 'database';
    statusCode?: number;
    message: string;
    detail?: string;
  } | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  const isEn = lang === 'en';

  useEffect(() => {
    try {
      const sessionItem = sessionStorage.getItem('SIMAGU_KELAS_CACHE');
      if (sessionItem) {
        const parsed = JSON.parse(sessionItem);
        if (!Array.isArray(parsed?.data) || parsed.data.length < DEFAULT_KELAS.length) {
          sessionStorage.removeItem('SIMAGU_KELAS_CACHE');
        }
      }
    } catch {}

    loadKelasData();
    return () => {
      stopCamera();
    };
  }, []);

  // Prevent user from leaving or closing application while processing attendance
  useEffect(() => {
    if (!submitting) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      const msg = isEn
        ? 'Processing your attendance. Please do not close this page or leave the application so that your attendance is recorded successfully today.'
        : 'Sedang memproses kehadiran Anda. Jangan menutup halaman atau meninggalkan aplikasi agar kehadiran Anda berhasil terekam hari ini.';
      e.returnValue = msg;
      return msg;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [submitting, isEn]);

  const getTodayIso = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const loadKelasData = async (forceRefresh = false) => {
    setLoadingKelas(true);
    setKelasLoadError(null);
    try {
      const data = await fetchKelas(undefined, forceRefresh);
      const uniqueClasses = Array.from(new Set([...DEFAULT_KELAS, ...(Array.isArray(data) ? data : [])])).sort();
      setKelasList(uniqueClasses);
    } catch (err) {
      console.warn('Gagal memuat data kelas dari server:', err);
      setKelasList([...DEFAULT_KELAS]);
      setKelasLoadError(
        isEn
          ? 'Network issue while updating class list. Standard classes loaded.'
          : 'Koneksi ke server lambat. Memuat daftar kelas standar SMKN Bojonggambir.'
      );
    } finally {
      setLoadingKelas(false);
    }
  };

  const handleKelasChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const k = e.target.value;
    setSelectedKelas(k);
    setSelectedNama('');
    setSelectedNis('');
    setSiswaList([]);
    setSiswaLoadError(null);
    setAlreadySubmittedReceipt(null);
    setErrorScreen(null);

    if (!k) return;

    setLoadingSiswa(true);
    try {
      const data = await fetchSiswa(k);
      setSiswaList(data);
      if (data.length === 0) {
        setSiswaLoadError(
          isEn
            ? `No student data found for class ${k}.`
            : `Belum ada data siswa untuk kelas ${k}.`
        );
      }
    } catch {
      setSiswaLoadError(
        isEn
          ? `Failed to load students for ${k}. Click retry to try again.`
          : `Gagal memuat daftar siswa kelas ${k}. Ketuk Coba Lagi untuk mengulang.`
      );
    } finally {
      setLoadingSiswa(false);
    }
  };

  const handleRetrySiswa = async () => {
    if (!selectedKelas) return;
    setLoadingSiswa(true);
    setSiswaLoadError(null);
    try {
      const data = await fetchSiswa(selectedKelas);
      setSiswaList(data);
    } catch {
      setSiswaLoadError(
        isEn
          ? `Failed to load students for ${selectedKelas}.`
          : `Gagal memuat data siswa kelas ${selectedKelas}.`
      );
    } finally {
      setLoadingSiswa(false);
    }
  };

  const handleNamaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setSelectedNama(v);
    setErrorScreen(null);
    setValidationError(null);

    const found = siswaList.find((s) => s.nama === v);
    if (found) {
      setSelectedNis(found.nis);
      // Check if student already submitted today locally or in server cache
      const todayIso = getTodayIso();
      const todayReceipts = getTodayStudentReceipts(found.nis, v, todayIso);
      const hadirRec = todayReceipts.find((r) => ['HADIR', 'SAKIT', 'IZIN'].includes(r.status));
      const pulangRec = todayReceipts.find((r) => r.status === 'PULANG');

      if (pulangRec) {
        // Already checked out, completely done for the day
        setAlreadySubmittedReceipt(pulangRec);
      } else if (hadirRec) {
        // Checked in earlier today; banner will offer option to proceed to Absen Pulang
        setAlreadySubmittedReceipt(hadirRec);
      } else {
        setAlreadySubmittedReceipt(null);
      }
    } else {
      setSelectedNis('');
      setAlreadySubmittedReceipt(null);
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const s = e.target.value;
    setStatus(s);
    setValidationError(null);
    if (!['Hadir', 'Pulang'].includes(s)) {
      stopCamera();
      setCameraActive(false);
      setFotoBase64('');
    }
  };

  const bukaKamera = async () => {
    setCameraError(null);
    setValidationError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        isEn
          ? 'Camera is not supported on this browser or requires a secure connection (HTTPS).'
          : 'Kamera tidak didukung di browser ini atau memerlukan koneksi aman (HTTPS).'
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        });
      } catch {
        // Fallback for laptop/desktop webcams that don't support facingMode constraint
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      streamRef.current = stream;
      setCameraActive(true);

      // Connect stream to video element once mounted
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (err: any) {
      setCameraError(
        isEn
          ? 'Failed to open camera: ' + (err.message || 'Permission denied')
          : 'Gagal membuka kamera: ' + (err.message || 'Izin kamera ditolak')
      );
    }
  };

  const ambilFoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    try {
      // Set optimized max dimension to 420px for lightweight mobile data uploads
      const maxDim = 420;
      let w = video.videoWidth || 640;
      let h = video.videoHeight || 480;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, w, h);
        // Compress to JPEG with 0.58 quality (~20KB - 35KB)
        const data = canvas.toDataURL('image/jpeg', 0.58);
        setFotoBase64(data);
      }
    } finally {
      // Immediately and unconditionally stop every MediaStream track after photo capture
      stopCamera();
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      const videoStream = videoRef.current.srcObject as MediaStream | null;
      if (videoStream && typeof videoStream.getTracks === 'function') {
        videoStream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch {}
        });
      }
      videoRef.current.srcObject = null;
    }
  };

  const resetKamera = () => {
    setFotoBase64('');
    bukaKamera();
  };

  const handleKirim = async () => {
    setValidationError(null);

    // 1. Validations
    if (!selectedKelas) {
      setValidationError(isEn ? 'Please select class first!' : 'Silakan pilih kelas terlebih dahulu!');
      return;
    }
    if (!selectedNama || !selectedNis) {
      setValidationError(isEn ? 'Please select student name!' : 'Silakan pilih nama siswa terlebih dahulu!');
      return;
    }
    if (['Hadir', 'Pulang'].includes(status) && !fotoBase64) {
      setValidationError(isEn ? 'Selfie photo is mandatory! Please open camera and take a photo.' : 'Foto selfie wajib diambil! Silakan buka kamera dan ambil foto selfie.');
      return;
    }

    // Check internet connection explicitly
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorScreen({
        type: 'network',
        message: 'Koneksi internet kamu tidak aktif. Periksa koneksi data atau Wi-Fi lalu coba kembali.',
      });
      return;
    }

    setSubmitting(true);
    setErrorScreen(null);

    // 2. Check double attendance locally first (instantaneous)
    const todayIso = getTodayIso();
    const todayReceipts = getTodayStudentReceipts(selectedNis, selectedNama, todayIso);
    const existingHadir = todayReceipts.find((r) => ['HADIR', 'SAKIT', 'IZIN'].includes(r.status));
    const existingPulang = todayReceipts.find((r) => r.status === 'PULANG');

    if (['Hadir', 'Sakit', 'Izin'].includes(status) && existingHadir) {
      setSubmitting(false);
      setAlreadySubmittedReceipt(existingHadir);
      setValidationError(
        isEn
          ? `Notice: ${selectedNama} has already checked in today (${existingHadir.waktuFormatted}). Select "School Check Out" to register departure.`
          : `Perhatian: ${selectedNama} sudah melakukan presensi masuk hari ini (${existingHadir.waktuFormatted}). Silakan pilih "Pulang Sekolah" jika ingin absen kepulangan.`
      );
      return;
    }
    if (status === 'Pulang' && existingPulang) {
      setSubmitting(false);
      setValidationError(
        isEn
          ? `Notice: ${selectedNama} has already checked out today (${existingPulang.waktuFormatted}).`
          : `Perhatian: ${selectedNama} sudah melakukan absensi kepulangan hari ini (${existingPulang.waktuFormatted}).`
      );
      return;
    }

    // Quick remote check with 2s timeout so network delay never hangs submission
    try {
      const checkPromise = fetchLaporan(selectedKelas, todayIso, todayIso);
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
      const dataLaporan = await Promise.race([checkPromise, timeoutPromise]);

      if (dataLaporan && Array.isArray(dataLaporan)) {
        const absenHariIni = dataLaporan.filter((d) => d.nama === selectedNama || d.nis === selectedNis);
        const sudahMasuk = absenHariIni.some((d) => ['Hadir', 'Sakit', 'Izin'].includes(d.status));
        const sudahPulang = absenHariIni.some((d) => d.status === 'Pulang');

        if (['Hadir', 'Sakit', 'Izin'].includes(status) && sudahMasuk) {
          setSubmitting(false);
          const fallbackRec = existingHadir || {
            idPresensi: `PRS-${todayIso.replace(/-/g, '')}-${selectedNis}`,
            nama: selectedNama,
            nis: selectedNis,
            kelas: selectedKelas,
            tanggalIso: todayIso,
            tanggalFormatted: todayIso,
            waktuFormatted: absenHariIni[0]?.waktu || '-',
            status: 'HADIR',
            keteranganStatus: 'TEPAT WAKTU',
            keteranganNotes: '',
            fotoBase64: fotoBase64,
            lokasiStatus: 'Terdeteksi',
            lat: null,
            lng: null,
            createdAt: Date.now(),
          };
          setAlreadySubmittedReceipt(fallbackRec);
          return;
        }

        if (status === 'Pulang' && sudahPulang) {
          setSubmitting(false);
          setValidationError(
            isEn
              ? `Notice: ${selectedNama} has already checked out today.`
              : `Perhatian: ${selectedNama} sudah melakukan absensi kepulangan hari ini.`
          );
          return;
        }
      }
    } catch {}

    // 3. Obtain location if available with short timeout
    if (status === 'Izin' || status === 'Sakit') {
      await kirimKeServer({ lat: null, lng: null });
      return;
    }

    if (!navigator.geolocation) {
      await kirimKeServer({ lat: null, lng: null });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await kirimKeServer({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      async () => {
        await kirimKeServer({ lat: null, lng: null });
      },
      { enableHighAccuracy: false, timeout: 3500, maximumAge: 60000 }
    );
  };

  const kirimKeServer = async (lokasi: { lat: number | null; lng: number | null }) => {
    let ket = keterangan;
    if (status === 'Hadir' && cekApakahTerlambat()) {
      ket = ket ? `${ket} [TERLAMBAT]` : '[TERLAMBAT]';
    }

    const payload = {
      nis: selectedNis,
      nama: selectedNama,
      kelas: selectedKelas,
      status: status,
      keterangan: ket,
      lat: lokasi.lat,
      lng: lokasi.lng,
      image: fotoBase64,
    };

    const res = await postAbsensi(payload);
    setSubmitting(false);

    if (res.ok && res.receipt) {
      // SUCCESS! Only show success receipt if server/database confirmed save.
      setActiveReceipt(res.receipt);
      setAlreadySubmittedReceipt(res.receipt);

      // Voice notification
      let textSuara = '';
      if (status === 'Hadir') {
        textSuara = res.receipt.keteranganStatus === 'TERLAMBAT'
          ? `Absen masuk berhasil, namun Anda terlambat, ${selectedNama}`
          : `Absen masuk berhasil. Selamat belajar, ${selectedNama}`;
      } else if (status === 'Pulang') {
        textSuara = `Absen pulang berhasil. Hati-hati di jalan, ${selectedNama}`;
      } else {
        textSuara = `Absensi berhasil, ${selectedNama}`;
      }
      playVoice(textSuara, isEn);

      // Reset camera
      stopCamera();
      setCameraActive(false);
    } else {
      // FAILURE - DO NOT SHOW SUCCESS!
      if (res.errorType === 'timeout') {
        setErrorScreen({
          type: 'timeout',
          message: res.message || (isEn ? 'Connection to attendance server timed out.' : 'Koneksi ke server presensi melebihi batas waktu tunggu (Timeout).'),
          detail: isEn ? 'Server took too long to respond. Your data is preserved in this form. Tap Retry below.' : 'Server presensi membutuhkan waktu respon lebih lama. Data Anda tersimpan aman, silakan ketuk Coba Lagi.',
        });
      } else if (res.errorType === 'server' || res.statusCode === 500) {
        setErrorScreen({
          type: 'server',
          statusCode: res.statusCode || 500,
          message: res.message || (isEn ? 'Server is processing high traffic (HTTP 500).' : 'Server presensi sedang memproses antrean data (Kode 500).'),
          detail: isEn ? 'Do not worry, your attendance data is safe. Tap Retry to resubmit.' : 'Jangan khawatir, data presensi Anda tidak hilang. Silakan ketuk tombol "Coba Lagi" di bawah.',
        });
      } else if (res.errorType === 'network') {
        setErrorScreen({
          type: 'network',
          message: res.message || (isEn ? 'Network connection interrupted.' : 'Koneksi internet terputus atau tidak stabil.'),
          detail: isEn ? 'Please check your Wi-Fi or cellular signal, then tap Retry.' : 'Pastikan sinyal seluler atau Wi-Fi aktif di perangkat Anda, lalu ketuk Coba Lagi.',
        });
      } else {
        setErrorScreen({
          type: 'database',
          message: res.message || (isEn ? 'Attendance data could not be stored.' : 'Data presensi belum dapat disimpan.'),
          detail: isEn ? 'Please review your submission and tap Retry.' : 'Silakan periksa kembali data presensi lalu ketuk Coba Lagi.',
        });
      }
    }
  };

  const allHistory = getLocalReceipts();

  return (
    <div id="sectionForm">
      {/* Loading Overlay Saat Memproses Kehadiran / Mengambil & Mengirim Data Presensi */}
      {submitting && (
        <div
          id="loading-kehadiran-overlay"
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.82)',
            backdropFilter: 'blur(6px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '32px 24px',
              maxWidth: '440px',
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
              border: '1.5px solid #e2e8f0',
            }}
          >
            {/* Spinning Hourglass Animation */}
            <div style={{ position: 'relative', width: '68px', height: '68px', margin: '0 auto 16px' }}>
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: '4px solid #dbeafe',
                  borderTopColor: '#2563eb',
                  borderRightColor: '#3b82f6',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                }}
              >
                ⏳
              </div>
            </div>

            <h3
              style={{
                margin: '0 0 10px',
                fontSize: '20px',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.01em',
              }}
            >
              {isEn ? '⏳ Please wait patiently...' : '⏳ Mohon bersabar...'}
            </h3>

            <div
              style={{
                fontSize: '15px',
                fontWeight: 700,
                color: '#1e293b',
                marginBottom: '14px',
                lineHeight: '1.5',
              }}
            >
              {isEn ? 'Processing your attendance.' : 'Sedang memproses kehadiran Anda.'}
            </div>

            <div
              style={{
                fontSize: '13px',
                color: '#475569',
                lineHeight: '1.6',
                backgroundColor: '#f8fafc',
                padding: '14px 16px',
                borderRadius: '14px',
                border: '1px solid #e2e8f0',
                textAlign: 'left',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '18px', flexShrink: 0 }}>🛡️</span>
              <span>
                {isEn
                  ? 'Please do not close this page or leave the application so that your attendance is recorded successfully today.'
                  : 'Jangan menutup halaman atau meninggalkan aplikasi agar kehadiran Anda berhasil terekam hari ini.'}
              </span>
            </div>

            {/* Syncing indicator footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '18px',
                fontSize: '12px',
                color: '#64748b',
                fontWeight: 600,
              }}
            >
              <span
                className="spinner"
                style={{ width: '13px', height: '13px', borderWidth: '2px', display: 'inline-block', margin: 0 }}
              />
              <span>{isEn ? 'Syncing to Google Spreadsheet...' : 'Menyimpan data presensi ke Google Spreadsheet...'}</span>
            </div>
          </div>
        </div>
      )}

      {/* 1. User-Friendly Error UI Banner (with active Coba Lagi action) */}
      {errorScreen && (
        <div
          id="errorBannerPresensi"
          role="alert"
          style={{
            padding: '22px 20px',
            textAlign: 'center',
            backgroundColor: errorScreen.type === 'timeout'
              ? '#fffbeb'
              : errorScreen.type === 'server'
              ? '#fef2f2'
              : errorScreen.type === 'network'
              ? '#f8fafc'
              : '#fff1f2',
            borderRadius: '18px',
            border: `2px solid ${
              errorScreen.type === 'timeout'
                ? '#fde68a'
                : errorScreen.type === 'server'
                ? '#fca5a5'
                : errorScreen.type === 'network'
                ? '#cbd5e1'
                : '#fecdd3'
            }`,
            marginBottom: '20px',
            boxShadow: '0 8px 24px -4px rgba(220, 38, 38, 0.12)',
            animation: 'fadeIn 0.25s ease-in-out'
          }}
        >
          <div style={{ fontSize: '42px', marginBottom: '8px' }}>
            {errorScreen.type === 'timeout' ? '⏳' : errorScreen.type === 'server' ? '🛠️' : errorScreen.type === 'network' ? '📡' : '⚠️'}
          </div>
          <h3 style={{
            margin: '0 0 6px',
            fontSize: '17px',
            fontWeight: 800,
            color: errorScreen.type === 'timeout' ? '#b45309' : '#991b1b'
          }}>
            {errorScreen.type === 'timeout'
              ? (isEn ? 'Server Timeout - Processing Delayed' : 'Koneksi Server Sedang Sibuk (Timeout)')
              : errorScreen.type === 'server'
              ? (isEn ? 'Attendance Server Busy (HTTP 500)' : 'Kendala Antrean Server Presensi (Kode 500)')
              : errorScreen.type === 'network'
              ? (isEn ? 'Internet Connection Interrupted' : 'Koneksi Internet Terputus')
              : (isEn ? 'Attendance Submission Pending' : 'Presensi Belum Berhasil Terkirim')}
          </h3>
          <p style={{
            margin: '0 auto 6px',
            fontSize: '13.5px',
            color: errorScreen.type === 'timeout' ? '#78350f' : '#7f1d1d',
            lineHeight: '1.55',
            maxWidth: '480px',
            fontWeight: 500
          }}>
            {errorScreen.message}
          </p>
          {errorScreen.detail && (
            <p style={{
              margin: '0 auto 18px',
              fontSize: '12px',
              color: '#64748b',
              lineHeight: '1.5',
              maxWidth: '440px'
            }}>
              💡 {errorScreen.detail}
            </p>
          )}

          {/* Tombol 'Coba Lagi' yang hanya aktif saat error */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              id="btnCobaLagiPresensi"
              onClick={handleKirim}
              disabled={submitting || !errorScreen}
              style={{
                padding: '12px 28px',
                backgroundColor: submitting ? '#9ca3af' : '#dc2626',
                color: '#ffffff',
                borderRadius: '12px',
                fontWeight: 'bold',
                border: 'none',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                boxShadow: submitting ? 'none' : '0 4px 14px rgba(220, 38, 38, 0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ display: 'inline-block', transform: submitting ? 'rotate(180deg)' : 'none' }}>
                🔄
              </span>
              <span>
                {submitting
                  ? (isEn ? '⏳ Please wait... Processing attendance' : '⏳ Mohon bersabar... Sedang memproses kehadiran Anda')
                  : (isEn ? 'Retry Submission' : 'Coba Lagi')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setErrorScreen(null)}
              disabled={submitting}
              style={{
                padding: '12px 18px',
                backgroundColor: '#ffffff',
                color: '#475569',
                borderRadius: '12px',
                fontWeight: 600,
                border: '1px solid #cbd5e1',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: '13.5px',
              }}
            >
              {isEn ? 'Dismiss' : 'Tutup Pesan'}
            </button>
          </div>
        </div>
      )}

      {/* 2. Banner if student already submitted today */}
      {alreadySubmittedReceipt && !submitting && !errorScreen && (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          backgroundColor: '#f0fdf4',
          borderRadius: '20px',
          border: '2px solid #4ade80',
          marginBottom: '20px',
          boxShadow: '0 10px 20px -5px rgba(34, 197, 94, 0.15)'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '6px' }}>🟢</div>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800, color: '#166534' }}>
            SUDAH PRESENSI HARI INI
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#15803d' }}>
            Presensi kamu sudah tercatat dalam sistem.
          </p>

          <div style={{
            background: '#ffffff',
            padding: '12px 16px',
            borderRadius: '14px',
            border: '1px solid #bbf7d0',
            textAlign: 'left',
            marginBottom: '16px',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            color: '#1e293b'
          }}>
            <div><strong>👤 Nama:</strong> {alreadySubmittedReceipt.nama}</div>
            <div><strong>⏰ Jam Presensi:</strong> {alreadySubmittedReceipt.waktuFormatted}</div>
            <div><strong>🟢 Status:</strong> {alreadySubmittedReceipt.status} ({alreadySubmittedReceipt.keteranganStatus})</div>
            <div>
              <strong>🔖 ID Presensi:</strong>{' '}
              <span style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 'bold' }}>
                {alreadySubmittedReceipt.idPresensi}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveReceipt(alreadySubmittedReceipt)}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: '#16a34a',
                color: '#ffffff',
                fontWeight: 'bold',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                boxShadow: '0 4px 10px rgba(22, 163, 74, 0.2)',
                minWidth: '130px',
              }}
            >
              📋 Lihat Bukti Presensi
            </button>

            {/* Option to proceed to Absen Pulang if student only checked in */}
            {alreadySubmittedReceipt.status !== 'PULANG' && (
              <button
                type="button"
                onClick={() => {
                  setStatus('Pulang');
                  setAlreadySubmittedReceipt(null);
                  setFotoBase64('');
                  setKeterangan('');
                  setValidationError(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '12px',
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  boxShadow: '0 4px 10px rgba(234, 88, 12, 0.2)',
                  minWidth: '130px',
                }}
              >
                🟧 {isEn ? 'Proceed to Check Out' : 'Isi Absen Pulang'}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSelectedNama('');
                setSelectedNis('');
                setAlreadySubmittedReceipt(null);
                setValidationError(null);
              }}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                fontWeight: 600,
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Ganti Siswa
            </button>
          </div>
        </div>
      )}

      {/* 3. Main Form (Hidden if student already submitted today unless explicitly reset) */}
      {!alreadySubmittedReceipt && (
        <form onSubmit={(e) => e.preventDefault()}>
          {/* Dropdown Pilihan Kelas (Audit & Fix Reaktif) */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label htmlFor="pilihKelasSelect" style={{ margin: 0, fontWeight: 700, color: '#1e293b', fontSize: '13.5px' }}>
                <span>{isEn ? 'Select Class' : 'Pilih Kelas'}</span>
                <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {loadingKelas && (
                  <span style={{ fontSize: '11.5px', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <span className="spinner" style={{ width: '12px', height: '12px', display: 'inline-block' }} />
                    {isEn ? 'Syncing...' : 'Sinkronisasi...'}
                  </span>
                )}
                <button
                  type="button"
                  id="btnRefreshKelas"
                  onClick={() => loadKelasData(true)}
                  disabled={loadingKelas || submitting}
                  title={isEn ? 'Reload class list from server' : 'Segarkan daftar kelas dari server'}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    padding: '3px 8px',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: '#475569',
                    cursor: loadingKelas || submitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span>🔄</span>
                  <span>{isEn ? 'Reload' : 'Segarkan'}</span>
                </button>
              </div>
            </div>

            <select
              id="pilihKelasSelect"
              value={selectedKelas}
              onChange={handleKelasChange}
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                fontSize: '14px',
                backgroundColor: '#ffffff',
                color: '#1e293b',
                outline: 'none',
              }}
            >
              <option value="">{isEn ? '-- Select Class --' : '-- Pilih Kelas --'}</option>
              {kelasList.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>

            {kelasLoadError && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: '#92400e', backgroundColor: '#fef3c7', padding: '6px 10px', borderRadius: '8px', border: '1px solid #fde68a' }}>
                <span>ℹ️ {kelasLoadError}</span>
                <button
                  type="button"
                  onClick={() => loadKelasData(true)}
                  disabled={loadingKelas}
                  style={{ background: 'none', border: 'none', color: '#78350f', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {isEn ? 'Retry' : 'Coba Lagi'}
                </button>
              </div>
            )}
          </div>

          {/* Dropdown Pilihan Nama Siswa */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label htmlFor="pilihNamaSelect" style={{ margin: 0, fontWeight: 700, color: '#1e293b', fontSize: '13.5px' }}>
                <span>{isEn ? 'Student Name' : 'Nama Siswa'}</span>
                <span style={{ color: '#dc2626', marginLeft: '4px' }}>*</span>
              </label>
              {loadingSiswa && (
                <span style={{ fontSize: '11.5px', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span className="spinner" style={{ width: '12px', height: '12px', display: 'inline-block' }} />
                  {isEn ? 'Loading students...' : 'Memuat data siswa...'}
                </span>
              )}
            </div>

            <select
              id="pilihNamaSelect"
              value={selectedNama}
              onChange={handleNamaChange}
              disabled={!selectedKelas || loadingSiswa || submitting}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: '12px',
                border: '1.5px solid #cbd5e1',
                fontSize: '14px',
                backgroundColor: !selectedKelas ? '#f8fafc' : '#ffffff',
                color: '#1e293b',
                outline: 'none',
              }}
            >
              <option value="">
                {!selectedKelas
                  ? isEn
                    ? '-- Select Class First --'
                    : '-- Pilih Kelas Dulu --'
                  : isEn
                  ? '-- Select Student Name --'
                  : '-- Pilih Nama --'}
              </option>
              {siswaList.map((s) => (
                <option key={s.nis + s.nama} value={s.nama}>
                  {s.nama}
                </option>
              ))}
            </select>

            {siswaLoadError && selectedKelas && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px', color: '#991b1b', backgroundColor: '#fee2e2', padding: '6px 10px', borderRadius: '8px', border: '1px solid #fca5a5' }}>
                <span>⚠️ {siswaLoadError}</span>
                <button
                  type="button"
                  onClick={handleRetrySiswa}
                  disabled={loadingSiswa}
                  style={{ background: 'none', border: 'none', color: '#7f1d1d', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {isEn ? 'Retry' : 'Coba Lagi'}
                </button>
              </div>
            )}
          </div>

          {/* Kartu Profil Siswa dengan Lazy Loading Image */}
          {selectedNama && (
            <div
              id="card-profil-siswa"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 14px',
                backgroundColor: '#f8fafc',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                marginBottom: '14px',
              }}
            >
              <div style={{ position: 'relative', width: '44px', height: '44px', flexShrink: 0 }}>
                <img
                  src={`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedNama)}&background=2563eb&color=ffffff&bold=true&size=96`}
                  alt={`Profil ${selectedNama}`}
                  loading="lazy"
                  decoding="async"
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    objectFit: 'cover',
                    border: '2px solid #3b82f6',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="%232563eb"/><text x="50%" y="54%" font-size="34" font-weight="bold" fill="%23ffffff" text-anchor="middle" dominant-baseline="middle">${encodeURIComponent((selectedNama || 'S').slice(0, 2).toUpperCase())}</text></svg>`;
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedNama}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span>🆔 NIS: <strong style={{ color: '#334155' }}>{selectedNis || '-'}</strong></span>
                  <span>•</span>
                  <span>🏫 <strong style={{ color: '#334155' }}>{selectedKelas}</strong></span>
                </div>
              </div>
            </div>
          )}

          <label>
            <span>{isEn ? 'Student ID (NIS)' : 'NIS / Nomor Induk'}</span>
          </label>
          <input
            type="text"
            value={selectedNis}
            placeholder={isEn ? 'Auto-filled' : 'Otomatis terisi'}
            readOnly
            style={{ background: '#e2e8f0', cursor: 'default', color: '#64748b' }}
          />

          <label>
            <span>{isEn ? "Today's Attendance" : 'Kehadiran Hari Ini'}</span>
          </label>
          <select value={status} onChange={handleStatusChange} disabled={submitting}>
            <option value="Hadir">🟩 {isEn ? 'School Check In' : 'Masuk Sekolah (School Check In)'}</option>
            <option value="Pulang">🟧 {isEn ? 'School Check Out' : 'Pulang Sekolah (School Check Out)'}</option>
            <option value="Izin">📩 {isEn ? 'Excused Absence' : 'Izin (Excused Absence)'}</option>
            <option value="Sakit">🤒 {isEn ? 'Sick Leave' : 'Sakit (Sick Leave)'}</option>
          </select>

          <label>
            <span>{isEn ? 'Notes (Optional)' : 'Keterangan (Opsional)'}</span>
          </label>
          <textarea
            rows={2}
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            disabled={submitting}
            placeholder={isEn ? 'E.g., Flat tire, Fever...' : 'Contoh: Ban bocor, Sakit Demam...'}
          />

          {['Hadir', 'Pulang'].includes(status) && (
            <div id="wrapper-foto">
              <label style={{ marginTop: 0, justifyContent: 'center', fontSize: '13px', color: 'var(--text)' }}>
                <span>{isEn ? '📸 Mandatory Selfie' : '📸 Foto Selfie Wajib'}</span>
              </label>

              {cameraError && (
                <div
                  role="alert"
                  style={{
                    marginTop: '8px',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    backgroundColor: '#fee2e2',
                    border: '1px solid #fca5a5',
                    color: '#991b1b',
                    fontSize: '12.5px',
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {cameraError}
                </div>
              )}

              {!cameraActive && !fotoBase64 && (
                <button
                  id="btnBukaKamera"
                  type="button"
                  className="btn-cam"
                  onClick={bukaKamera}
                  disabled={submitting}
                  style={{ width: '100%', marginTop: '6px' }}
                >
                  <span>{isEn ? '📷 Open Camera' : '📷 Buka Kamera'}</span>
                </button>
              )}

              {/* Camera Area */}
              <div
                id="camera-area"
                style={{
                  display: cameraActive ? 'block' : 'none',
                  marginTop: '10px',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  position: 'relative',
                  background: '#000',
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  autoPlay
                  muted
                  style={{ width: '100%', height: 'auto', display: 'block', transform: 'scaleX(-1)', objectFit: 'cover' }}
                />
                <canvas ref={canvasRef} style={{ display: 'none' }} />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    id="btnJepret"
                    type="button"
                    className="btn-jepret"
                    onClick={ambilFoto}
                    style={{ flex: 1 }}
                  >
                    <span>{isEn ? '🔘 CAPTURE' : '🔘 AMBIL FOTO'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setCameraActive(false);
                      setCameraError(null);
                    }}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#334155',
                      color: '#ffffff',
                      borderRadius: '12px',
                      border: 'none',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {isEn ? 'Cancel' : 'Tutup'}
                  </button>
                </div>
              </div>

              {/* Photo Result (display normal since canvas was already mirrored during capture) */}
              {fotoBase64 && (
                <div>
                  <img
                    id="hasil-foto"
                    src={fotoBase64}
                    alt="Hasil Selfie"
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: '100%',
                      borderRadius: 'var(--radius-md)',
                      marginTop: '10px',
                      display: 'block',
                      border: '3px solid var(--primary)',
                    }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: '6px',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      backgroundColor: '#f0fdf4',
                      border: '1px solid #bbf7d0',
                      fontSize: '11.5px',
                      color: '#166534',
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span>⚡</span>
                      <span>{isEn ? 'Optimized for lightweight upload' : 'Kompresi hemat kuota aktif'}</span>
                    </span>
                    <span
                      style={{
                        backgroundColor: '#dcfce7',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: 700,
                      }}
                    >
                      ~{getImageSizeKb(fotoBase64)} KB
                    </span>
                  </div>
                </div>
              )}

              {fotoBase64 && !submitting && (
                <button
                  id="btnUlang"
                  type="button"
                  className="btn-retake"
                  onClick={resetKamera}
                  style={{ display: 'block', marginTop: '10px' }}
                >
                  <span>{isEn ? '🔄 Retake Photo' : '🔄 Foto Ulang'}</span>
                </button>
              )}
            </div>
          )}

          {validationError && (
            <div
              role="alert"
              style={{
                marginTop: '14px',
                marginBottom: '10px',
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: '#fef2f2',
                border: '1.5px solid #fca5a5',
                color: '#991b1b',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span>{validationError}</span>
            </div>
          )}

          <button
            id="btnKirim"
            type="button"
            onClick={handleKirim}
            disabled={submitting}
            style={{
              opacity: submitting ? 0.75 : 1,
              cursor: submitting ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: errorScreen ? '#dc2626' : undefined,
            }}
          >
            {submitting && <span className="spinner" style={{ display: 'inline-block', borderLeftColor: '#fff' }} />}
            <span>
              {submitting
                ? (isEn ? '⏳ Please wait... Processing attendance' : '⏳ Mohon bersabar... Sedang memproses kehadiran Anda.')
                : errorScreen
                ? (isEn ? '🔄 Retry Submission' : '🔄 Coba Lagi Kirim Presensi')
                : (isEn ? '🚀 Submit Attendance' : '🚀 Kirim Absensi')}
            </span>
          </button>
        </form>
      )}

      {/* 4. SUCCESS RECEIPT CARD MODAL VIEW (🎉 ABSENSI BERHASIL!) */}
      {activeReceipt && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            overflowY: 'auto',
          }}
          onClick={() => setActiveReceipt(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '24px',
              maxWidth: '400px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* School Logo & Success Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
              <img
                src="/logo.png"
                alt="Logo SMKN Bojonggambir"
                loading="lazy"
                decoding="async"
                style={{ width: '42px', height: '42px', objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgz1tbb8TSawO2lHGi_GXN3Il5CtrN_K125hSy7D8NxvBFL6bywiebvkalj_6oRIBVxEm_zj84j6ZAlhKmaEOqjIeGHXe9SWw0HQipKs3aL8iy7K1Dc_Pd9SHMVZsOQrb99qTK78Wmee7StIKKzzfST5YU_CkGSAz3MuMJsrSL_nHt37c5AzIe8B7HodnQ/s320/LOGO%20SMKN%20BOJONGGAMBIR.png';
                }}
              />
              <span style={{ fontSize: '28px' }}>🎉</span>
            </div>

            <h2 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 800, color: '#166534' }}>
              ABSENSI BERHASIL!
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#475569' }}>
              Presensi kamu telah berhasil dicatat ke dalam sistem.
            </p>

            {/* Receipt Card Container */}
            <div
              style={{
                background: '#f8fafc',
                border: '2px dashed #cbd5e1',
                borderRadius: '16px',
                padding: '16px',
                textAlign: 'left',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>👤 Nama:</span>
                <strong style={{ color: '#0f172a' }}>{activeReceipt.nama}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>🆔 NIS:</span>
                <strong style={{ color: '#0f172a' }}>{activeReceipt.nis}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>🏫 Kelas:</span>
                <strong style={{ color: '#0f172a' }}>{activeReceipt.kelas}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>📅 Tanggal:</span>
                <strong style={{ color: '#0f172a' }}>{activeReceipt.tanggalFormatted}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                <span style={{ color: '#64748b' }}>⏰ Waktu:</span>
                <strong style={{ color: '#0f172a' }}>{activeReceipt.waktuFormatted}</strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>🟢 Status:</span>
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    backgroundColor: activeReceipt.status === 'HADIR' ? '#dcfce7' : '#fef3c7',
                    color: activeReceipt.status === 'HADIR' ? '#15803d' : '#b45309',
                  }}
                >
                  {activeReceipt.status}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', alignItems: 'center' }}>
                <span style={{ color: '#64748b' }}>⏱️ Keterangan:</span>
                <span
                  style={{
                    fontWeight: 'bold',
                    color: activeReceipt.keteranganStatus === 'TERLAMBAT' ? '#dc2626' : '#16a34a',
                  }}
                >
                  {activeReceipt.keteranganStatus}
                </span>
              </div>

              {activeReceipt.fotoBase64 && (
                <div style={{ marginTop: '6px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>
                    📸 Foto Selfie:
                  </div>
                  <img
                    src={activeReceipt.fotoBase64}
                    alt="Bukti Selfie Presensi"
                    loading="lazy"
                    decoding="async"
                    style={{
                      width: '100%',
                      maxHeight: '180px',
                      objectFit: 'cover',
                      borderRadius: '12px',
                      border: '2px solid #2563eb',
                    }}
                  />
                </div>
              )}

              {activeReceipt.lokasiStatus && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  📍 {activeReceipt.lokasiStatus}
                </div>
              )}

              <div
                style={{
                  marginTop: '6px',
                  paddingTop: '8px',
                  borderTop: '1px dashed #cbd5e1',
                  fontSize: '12px',
                  color: '#475569',
                  textAlign: 'center',
                }}
              >
                🔖 ID: <strong style={{ fontFamily: 'monospace', color: '#2563eb' }}>{activeReceipt.idPresensi}</strong>
              </div>
            </div>

            {/* Receipt Modal Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setActiveReceipt(null);
                  setSelectedNama('');
                  setSelectedNis('');
                  setFotoBase64('');
                  setKeterangan('');
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                }}
              >
                🏠 Kembali ke Beranda
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveReceipt(null);
                  setShowHistoryModal(true);
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '12px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  fontWeight: 600,
                  border: '1px solid #cbd5e1',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                📋 Lihat Riwayat Presensi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. HISTORY MODAL (Lihat Riwayat Presensi) */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
                📋 Riwayat Bukti Presensi
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#64748b',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {allHistory.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', padding: '24px 0' }}>
                  Belum ada riwayat presensi tersimpan di perangkat ini.
                </p>
              ) : (
                allHistory.map((item) => (
                  <div
                    key={item.idPresensi + item.createdAt}
                    onClick={() => {
                      setShowHistoryModal(false);
                      setActiveReceipt(item);
                    }}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '14px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{item.nama}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {item.kelas} • {item.tanggalFormatted} ({item.waktuFormatted})
                      </div>
                      <div style={{ fontSize: '10px', fontFamily: 'monospace', color: '#2563eb', marginTop: '4px' }}>
                        ID: {item.idPresensi}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: item.status === 'HADIR' ? '#dcfce7' : '#fef3c7',
                          color: item.status === 'HADIR' ? '#15803d' : '#b45309',
                        }}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowHistoryModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                marginTop: '16px',
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                fontWeight: 600,
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
