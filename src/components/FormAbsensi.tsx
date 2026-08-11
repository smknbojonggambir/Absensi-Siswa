import React, { useState, useEffect, useRef } from 'react';
import { Language, Siswa } from '../types';
import {
  fetchKelas,
  fetchSiswa,
  fetchLaporan,
  postAbsensi,
  playVoice,
  cekApakahTerlambat,
  getTodayStudentReceipt,
  getLocalReceipts,
  AttendanceReceipt,
} from '../services/api';

interface FormAbsensiProps {
  lang: Language;
}

export const FormAbsensi: React.FC<FormAbsensiProps> = ({ lang }) => {
  const [kelasList, setKelasList] = useState<string[]>([]);
  const [loadingKelas, setLoadingKelas] = useState<boolean>(false);

  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [siswaList, setSiswaList] = useState<Siswa[]>([]);
  const [loadingSiswa, setLoadingSiswa] = useState<boolean>(false);

  const [selectedNama, setSelectedNama] = useState<string>('');
  const [selectedNis, setSelectedNis] = useState<string>('');
  const [status, setStatus] = useState<string>('Hadir');
  const [keterangan, setKeterangan] = useState<string>('');

  // Camera state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [fotoBase64, setFotoBase64] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Form submit & modal states
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [alreadySubmittedReceipt, setAlreadySubmittedReceipt] = useState<AttendanceReceipt | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<AttendanceReceipt | null>(null);
  const [errorScreen, setErrorScreen] = useState<{ type: 'network' | 'database'; message: string } | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  const isEn = lang === 'en';

  useEffect(() => {
    loadKelasData();
    return () => {
      stopCamera();
    };
  }, []);

  const getTodayIso = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const loadKelasData = async () => {
    setLoadingKelas(true);
    try {
      const data = await fetchKelas();
      setKelasList(data);
    } catch (e) {
      alert(isEn ? 'Failed to load class' : 'Gagal memuat data kelas');
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
    setAlreadySubmittedReceipt(null);
    setErrorScreen(null);

    if (!k) return;

    setLoadingSiswa(true);
    try {
      const data = await fetchSiswa(k);
      setSiswaList(data);
    } catch (e) {
      alert(isEn ? 'Failed to load student list' : 'Gagal memuat data siswa');
    } finally {
      setLoadingSiswa(false);
    }
  };

  const handleNamaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    setSelectedNama(v);
    setErrorScreen(null);

    const found = siswaList.find((s) => s.nama === v);
    if (found) {
      setSelectedNis(found.nis);
      // Check if student already submitted today locally or in server cache
      const todayIso = getTodayIso();
      const existingReceipt = getTodayStudentReceipt(found.nis, v, todayIso);
      setAlreadySubmittedReceipt(existingReceipt);
    } else {
      setSelectedNis('');
      setAlreadySubmittedReceipt(null);
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const s = e.target.value;
    setStatus(s);
    if (!['Hadir', 'Pulang'].includes(s)) {
      stopCamera();
      setCameraActive(false);
      setFotoBase64('');
    }
  };

  const bukaKamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err: any) {
      alert(isEn ? 'Failed to open camera: ' + err.message : 'Gagal membuka kamera: ' + err.message);
    }
  };

  const ambilFoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !streamRef.current || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.6);
      setFotoBase64(data);
      stopCamera();
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const resetKamera = () => {
    setFotoBase64('');
    bukaKamera();
  };

  const handleKirim = async () => {
    // 1. Validations
    if (!selectedKelas) {
      alert(isEn ? 'Please select class first!' : 'Pilih kelas dulu!');
      return;
    }
    if (!selectedNama || !selectedNis) {
      alert(isEn ? 'Please select student name!' : 'Pilih nama siswa dulu!');
      return;
    }
    if (['Hadir', 'Pulang'].includes(status) && !fotoBase64) {
      alert(isEn ? 'Selfie photo is mandatory!' : 'Wajib mengambil foto selfie!');
      return;
    }

    // Check internet connection explicitly
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorScreen({
        type: 'network',
        message: 'Periksa koneksi internet kamu lalu coba kembali.',
      });
      return;
    }

    setSubmitting(true);
    setErrorScreen(null);

    // 2. Check double attendance with server
    try {
      const todayIso = getTodayIso();
      const dataLaporan = await fetchLaporan(selectedKelas, todayIso, todayIso);
      const absenHariIni = dataLaporan.filter((d) => d.nama === selectedNama || d.nis === selectedNis);
      const sudahMasuk = absenHariIni.some((d) => ['Hadir', 'Sakit', 'Izin'].includes(d.status));
      const sudahPulang = absenHariIni.some((d) => d.status === 'Pulang');

      if (['Hadir', 'Sakit', 'Izin'].includes(status) && sudahMasuk) {
        setSubmitting(false);
        const existingRec = getTodayStudentReceipt(selectedNis, selectedNama, todayIso) || {
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
        setAlreadySubmittedReceipt(existingRec);
        return;
      }

      if (status === 'Pulang' && sudahPulang) {
        setSubmitting(false);
        alert(isEn ? `❌ REJECTED! ${selectedNama} has already checked out today.` : `❌ DITOLAK! ${selectedNama} sudah melakukan Absensi Kepulangan hari ini.`);
        return;
      }
    } catch (e) {
      console.warn('Network slow during duplicate check, proceeding with submission:', e);
    }

    // 3. Obtain location if available
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
      async (err) => {
        console.warn('GPS position unavailable:', err);
        await kirimKeServer({ lat: null, lng: null });
      },
      { enableHighAccuracy: false, timeout: 5000 }
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
      if (res.errorType === 'network') {
        setErrorScreen({
          type: 'network',
          message: res.message || 'Periksa koneksi internet kamu lalu coba kembali.',
        });
      } else {
        setErrorScreen({
          type: 'database',
          message: res.message || 'Data presensi belum berhasil disimpan. Silakan coba kembali.',
        });
      }
    }
  };

  const allHistory = getLocalReceipts();

  return (
    <div id="sectionForm">
      {/* 1. Error Screens */}
      {errorScreen && (
        <div style={{
          padding: '24px 20px',
          textAlign: 'center',
          backgroundColor: '#fef2f2',
          borderRadius: '20px',
          border: '2px solid #f87171',
          marginBottom: '20px',
          boxShadow: '0 10px 20px -5px rgba(239, 68, 68, 0.1)'
        }}>
          <div style={{ fontSize: '42px', marginBottom: '8px' }}>
            {errorScreen.type === 'network' ? '📡' : '❌'}
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#991b1b' }}>
            {errorScreen.type === 'network' ? 'Koneksi Internet Bermasalah' : 'PRESENSI GAGAL'}
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#7f1d1d', lineHeight: '1.5' }}>
            {errorScreen.message}
          </p>
          <button
            type="button"
            onClick={() => setErrorScreen(null)}
            style={{
              padding: '12px 28px',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              borderRadius: '12px',
              fontWeight: 'bold',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.25)'
            }}
          >
            🔄 Coba Lagi
          </button>
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

          <div style={{ display: 'flex', gap: '8px' }}>
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
                boxShadow: '0 4px 10px rgba(22, 163, 74, 0.2)'
              }}
            >
              📋 Lihat Bukti Presensi
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedNama('');
                setSelectedNis('');
                setAlreadySubmittedReceipt(null);
              }}
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: '#f1f5f9',
                color: '#475569',
                fontWeight: 600,
                border: '1px solid #cbd5e1',
                cursor: 'pointer',
                fontSize: '13px'
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
          <label>
            <span>{isEn ? 'Select Class' : 'Pilih Kelas'}</span>
            {loadingKelas && <span className="spinner" style={{ display: 'inline-block' }} />}
          </label>
          <select value={selectedKelas} onChange={handleKelasChange} disabled={submitting}>
            <option value="">{isEn ? '-- Select Class --' : '-- Pilih Kelas --'}</option>
            {kelasList.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>

          <label>
            <span>{isEn ? 'Student Name' : 'Nama Siswa'}</span>
            {loadingSiswa && <span className="spinner" style={{ display: 'inline-block' }} />}
          </label>
          <select value={selectedNama} onChange={handleNamaChange} disabled={!selectedKelas || loadingSiswa || submitting}>
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
                <button
                  id="btnJepret"
                  type="button"
                  className="btn-jepret"
                  onClick={ambilFoto}
                >
                  <span>{isEn ? '🔘 CAPTURE' : '🔘 AMBIL FOTO'}</span>
                </button>
              </div>

              {/* Photo Result */}
              {fotoBase64 && (
                <img
                  id="hasil-foto"
                  src={fotoBase64}
                  alt="Hasil Selfie"
                  style={{
                    width: '100%',
                    borderRadius: 'var(--radius-md)',
                    marginTop: '10px',
                    display: 'block',
                    border: '3px solid var(--primary)',
                    transform: 'scaleX(-1)',
                  }}
                />
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
              gap: '8px'
            }}
          >
            {submitting && <span className="spinner" style={{ display: 'inline-block', borderLeftColor: '#fff' }} />}
            <span>{submitting ? '⏳ Mengirim presensi...' : isEn ? '🚀 Submit Attendance' : '🚀 Kirim Absensi'}</span>
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
            {/* Success Icon */}
            <div style={{ fontSize: '48px', marginBottom: '4px' }}>🎉</div>

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
                    style={{
                      width: '100%',
                      maxHeight: '180px',
                      objectFit: 'cover',
                      borderRadius: '12px',
                      border: '2px solid #2563eb',
                      transform: 'scaleX(-1)',
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
