import React, { useState, useEffect, useRef } from 'react';
import { Language, Siswa } from '../types';
import {
  fetchKelas,
  fetchSiswa,
  fetchLaporan,
  postAbsensi,
  playVoice,
  cekApakahTerlambat,
  isFakeGPS,
  checkVPN,
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

  // Form submit state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitBtnText, setSubmitBtnText] = useState<string>('');
  const [msgInfo, setMsgInfo] = useState<{ type: 'success' | 'error' | 'warning'; html: string } | null>(null);

  const isEn = lang === 'en';

  useEffect(() => {
    loadKelasData();
    return () => {
      stopCamera();
    };
  }, []);

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
    const found = siswaList.find((s) => s.nama === v);
    if (found) {
      setSelectedNis(found.nis);
    } else {
      setSelectedNis('');
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setFotoBase64(reader.result);
          stopCamera();
          setCameraActive(false);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleKirim = async () => {
    if (!selectedNis) {
      alert(isEn ? 'Please select student first!' : 'Pilih siswa dulu!');
      return;
    }
    if (['Hadir', 'Pulang'].includes(status) && !fotoBase64) {
      alert(isEn ? 'Selfie photo is mandatory!' : 'Wajib mengambil foto selfie atau upload foto!');
      return;
    }

    setSubmitting(true);
    setSubmitBtnText(isEn ? '🔍 Checking Data...' : '🔍 Memeriksa Data...');
    setMsgInfo(null);

    // 1. Check double attendance
    try {
      const now = new Date();
      const yyyymmdd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const dataLaporan = await fetchLaporan(selectedKelas, yyyymmdd, yyyymmdd);

      const absenHariIni = dataLaporan.filter((d) => d.nama === selectedNama);
      const sudahMasuk = absenHariIni.some((d) => ['Hadir', 'Sakit', 'Izin'].includes(d.status));
      const sudahPulang = absenHariIni.some((d) => d.status === 'Pulang');

      if (['Hadir', 'Sakit', 'Izin'].includes(status) && sudahMasuk) {
        setSubmitting(false);
        alert(isEn ? `❌ REJECTED! ${selectedNama} has already checked in/submitted status today.` : `❌ DITOLAK! ${selectedNama} sudah melakukan Absensi Kedatangan (Hadir/Sakit/Izin) hari ini.`);
        return;
      }
      if (status === 'Pulang' && sudahPulang) {
        setSubmitting(false);
        alert(isEn ? `❌ REJECTED! ${selectedNama} has already checked out today.` : `❌ DITOLAK! ${selectedNama} sudah melakukan Absensi Kepulangan hari ini.`);
        return;
      }
    } catch (e) {
      console.warn('Pengecekan absen ganda dilewati (jaringan lambat).', e);
    }

    // 2. If Sakit / Izin, no GPS required
    if (status === 'Izin' || status === 'Sakit') {
      await kirimKeServer({ lat: null, lng: null });
      return;
    }

    // 3. Location check with graceful fallback
    setSubmitBtnText(isEn ? '📍 Getting Location...' : '📍 Mengambil Lokasi...');
    if (!navigator.geolocation) {
      await kirimKeServer({ lat: null, lng: null });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await kirimKeServer({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      async (err) => {
        console.warn('GPS location unavailable, sending without coordinates:', err);
        await kirimKeServer({ lat: null, lng: null });
      },
      { enableHighAccuracy: false, timeout: 5000 }
    );
  };

  const kirimKeServer = async (lokasi: { lat: number | null; lng: number | null }) => {
    let ket = keterangan;
    let isLate = false;
    let lateUIMessage = '';

    if (status === 'Hadir') {
      isLate = cekApakahTerlambat();
      if (isLate) {
        ket = ket ? `${ket} [TERLAMBAT]` : '[TERLAMBAT]';
        lateUIMessage = isEn ? '<br><br>⚠️ <b>ATTENTION: You are LATE.</b>' : '<br><br>⚠️ <b>PERHATIAN: Anda TERLAMBAT.</b>';
      } else {
        lateUIMessage = isEn ? '<br><br>✅ <b>Great! On time.</b>' : '<br><br>✅ <b>Bagus! Anda Tepat Waktu.</b>';
      }
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

    setSubmitBtnText(isEn ? '📤 Sending Data...' : '📤 Mengirim Data...');

    const res = await postAbsensi(payload);
    setSubmitting(false);

    if (res.ok) {
      const msgType = isLate && status === 'Hadir' ? 'warning' : 'success';
      setMsgInfo({
        type: msgType,
        html: res.message + lateUIMessage,
      });

      let textSuara = '';
      if (status === 'Hadir') {
        textSuara = isLate
          ? `Absen masuk berhasil, namun Anda terlambat, ${selectedNama}`
          : `Absen masuk berhasil. Selamat belajar, ${selectedNama}`;
      } else if (status === 'Pulang') {
        textSuara = `Absen pulang berhasil. Hati-hati di jalan, ${selectedNama}`;
      } else {
        textSuara = `Absensi berhasil, ${selectedNama}`;
      }
      playVoice(textSuara, isEn);

      // Reset fields
      setSelectedNama('');
      setSelectedNis('');
      setKeterangan('');
      setStatus('Hadir');
      setFotoBase64('');
    } else {
      setMsgInfo({ type: 'error', html: res.message });
    }
  };

  return (
    <div id="sectionForm">
      <form onSubmit={(e) => e.preventDefault()}>
        <label>
          <span>{isEn ? 'Select Class' : 'Pilih Kelas'}</span>
          {loadingKelas && <span className="spinner" style={{ display: 'inline-block' }} />}
        </label>
        <select value={selectedKelas} onChange={handleKelasChange}>
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
        <select value={selectedNama} onChange={handleNamaChange} disabled={!selectedKelas || loadingSiswa}>
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
        <select value={status} onChange={handleStatusChange}>
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
          placeholder={isEn ? 'E.g., Flat tire, Fever...' : 'Contoh: Ban bocor, Sakit Demam...'}
        />

        {['Hadir', 'Pulang'].includes(status) && (
          <div id="wrapper-foto">
            <label style={{ marginTop: 0, justifyContent: 'center', fontSize: '13px', color: 'var(--text)' }}>
              <span>{isEn ? '📸 Mandatory Selfie' : '📸 Foto Selfie Wajib'}</span>
            </label>

            {!cameraActive && !fotoBase64 && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button id="btnBukaKamera" type="button" className="btn-cam" onClick={bukaKamera} style={{ flex: 1 }}>
                  <span>{isEn ? '📷 Open Camera' : '📷 Buka Kamera'}</span>
                </button>
                <label className="btn-cam" style={{ flex: 1, textAlign: 'center', cursor: 'pointer', background: '#475569', margin: 0, justifyContent: 'center' }}>
                  <span>{isEn ? '📁 Upload File' : '📁 Upload Foto'}</span>
                  <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
              </div>
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

            {fotoBase64 && (
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

        <button id="btnKirim" type="button" onClick={handleKirim} disabled={submitting}>
          <span>{submitting ? submitBtnText : isEn ? '🚀 Submit Attendance' : '🚀 Kirim Absensi'}</span>
        </button>
      </form>

      {msgInfo && (
        <div
          id="msg"
          className={msgInfo.type}
          style={{ display: 'block' }}
          dangerouslySetInnerHTML={{ __html: msgInfo.html }}
        />
      )}
    </div>
  );
};
