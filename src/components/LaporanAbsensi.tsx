import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Language, Siswa, AbsenRecord, RekapSiswa, JenisLaporan, TampilanLaporan } from '../types';
import { fetchKelas, fetchSiswa, fetchLaporan } from '../services/api';

interface LaporanAbsensiProps {
  lang: Language;
}

export const LaporanAbsensi: React.FC<LaporanAbsensiProps> = ({ lang }) => {
  const [kelasList, setKelasList] = useState<string[]>([]);
  const [siswaFilterList, setSiswaFilterList] = useState<Siswa[]>([]);

  const [lapPeriode, setLapPeriode] = useState<JenisLaporan>('harian');
  const [tampilanMode, setTampilanMode] = useState<TampilanLaporan>('rekap'); // 'rekap' matrix or 'detail'
  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [selectedSiswa, setSelectedSiswa] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<string>('Ganjil 2026/2027');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const todayStr = new Date().toISOString().split('T')[0];
  const [tglHarian, setTglHarian] = useState<string>(todayStr);
  const [tglMulai, setTglMulai] = useState<string>(todayStr);
  const [tglSelesai, setTglSelesai] = useState<string>(todayStr);

  const [loading, setLoading] = useState<boolean>(false);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);

  const [rawRecords, setRawRecords] = useState<AbsenRecord[]>([]);
  const [rekapSiswaList, setRekapSiswaList] = useState<RekapSiswa[]>([]);
  const [uniqueDays, setUniqueDays] = useState<string[]>([]);

  const [printTimestamp, setPrintTimestamp] = useState<string>('');

  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [csvCopyText, setCsvCopyText] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const isEn = lang === 'en';

  useEffect(() => {
    loadKelasOptions();
  }, []);

  const loadKelasOptions = async () => {
    try {
      const data = await fetchKelas();
      setKelasList(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleKelasFilterChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const k = e.target.value;
    setSelectedKelas(k);
    setSelectedSiswa('');
    setSiswaFilterList([]);

    if (!k) return;
    try {
      const data = await fetchSiswa(k);
      setSiswaFilterList(data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadLaporan = async () => {
    let m = tglMulai;
    let s = tglSelesai;

    if (lapPeriode === 'harian') {
      if (!tglHarian) {
        alert(isEn ? 'Please select date!' : 'Pilih tanggal!');
        return;
      }
      m = tglHarian;
      s = tglHarian;
    } else {
      if (!m || !s) {
        alert(isEn ? 'Please select date range!' : 'Pilih rentang tanggal!');
        return;
      }
    }

    setLoading(true);
    setHasLoaded(false);

    try {
      const data = await fetchLaporan(selectedKelas, m, s);
      const days = Array.from(new Set(data.map((d) => d.tanggal)));
      if (days.length === 0 && m) days.push(m);
      setUniqueDays(days);

      // Identify targets
      let targetSiswa: { nama: string; nis: string; kelas: string }[] = [];
      if (selectedKelas && siswaFilterList.length > 0) {
        targetSiswa = siswaFilterList.map((st) => ({
          nama: st.nama,
          nis: st.nis || '-',
          kelas: selectedKelas,
        }));
      } else {
        const uniqueMap = new Map<string, { nis: string; kelas: string }>();
        data.forEach((d) => {
          if (!uniqueMap.has(d.nama)) {
            uniqueMap.set(d.nama, { nis: d.nis || '-', kelas: d.kelas });
          } else if ((!uniqueMap.get(d.nama)?.nis || uniqueMap.get(d.nama)?.nis === '-') && d.nis && d.nis !== '-') {
            uniqueMap.get(d.nama)!.nis = d.nis;
          }
        });
        uniqueMap.forEach((val, key) => {
          targetSiswa.push({ nama: key, nis: val.nis, kelas: val.kelas });
        });
      }

      if (selectedSiswa) {
        targetSiswa = targetSiswa.filter((st) => st.nama === selectedSiswa);
      }

      // Enrich missing days as Alpha
      const enriched: AbsenRecord[] = [...data];
      targetSiswa.forEach((siswa) => {
        days.forEach((day) => {
          const hasRecord = data.find(
            (d) =>
              d.nama.trim().toLowerCase() === siswa.nama.trim().toLowerCase() &&
              d.tanggal === day &&
              d.status !== 'Pulang'
          );

          if (!hasRecord) {
            enriched.push({
              tanggal: day,
              waktu: '-',
              nis: siswa.nis || '-',
              nama: siswa.nama,
              kelas: siswa.kelas,
              status: 'Alpha',
              ket: 'Tanpa Keterangan',
            });
          }
        });
      });

      // Filter by selected student if specified
      let finalRecords = enriched;
      if (selectedSiswa) {
        finalRecords = finalRecords.filter((d) => d.nama === selectedSiswa);
      }

      // Sort records
      finalRecords.sort((a, b) => {
        if (a.tanggal === b.tanggal) {
          return a.nama.trim().toLowerCase().localeCompare(b.nama.trim().toLowerCase());
        }
        return a.tanggal.localeCompare(b.tanggal);
      });

      setRawRecords(finalRecords);

      // Build Rekap Per Siswa matrix
      const totalHariEfektif = days.length || 1;
      const rekapMap = new Map<string, RekapSiswa>();

      targetSiswa.forEach((st) => {
        rekapMap.set(st.nama.trim().toLowerCase(), {
          nis: st.nis,
          nama: st.nama,
          kelas: st.kelas,
          hadir: 0,
          pulang: 0,
          sakit: 0,
          izin: 0,
          alpha: 0,
          terlambat: 0,
          totalHari: totalHariEfektif,
          persentase: 0,
        });
      });

      finalRecords.forEach((rec) => {
        const key = rec.nama.trim().toLowerCase();
        let item = rekapMap.get(key);
        if (!item) {
          item = {
            nis: rec.nis || '-',
            nama: rec.nama,
            kelas: rec.kelas,
            hadir: 0,
            pulang: 0,
            sakit: 0,
            izin: 0,
            alpha: 0,
            terlambat: 0,
            totalHari: totalHariEfektif,
            persentase: 0,
          };
          rekapMap.set(key, item);
        } else if ((!item.nis || item.nis === '-') && rec.nis && rec.nis !== '-') {
          item.nis = rec.nis;
        }

        if (rec.status === 'Hadir') item.hadir++;
        if (rec.status === 'Pulang') item.pulang++;
        if (rec.status === 'Sakit') item.sakit++;
        if (rec.status === 'Izin') item.izin++;
        if (rec.status === 'Alpha') item.alpha++;
        if (rec.ket && rec.ket.includes('[TERLAMBAT]')) item.terlambat++;
      });

      const rekapList: RekapSiswa[] = Array.from(rekapMap.values()).map((item) => {
        const pct = totalHariEfektif > 0 ? (item.hadir / totalHariEfektif) * 100 : 0;
        return {
          ...item,
          persentase: Math.min(100, parseFloat(pct.toFixed(1))),
        };
      });

      rekapList.sort((a, b) => a.nama.localeCompare(b.nama));
      setRekapSiswaList(rekapList);

      const now = new Date();
      setPrintTimestamp(`Dicetak pada: ${now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} pukul ${now.toLocaleTimeString('id-ID')}`);
      setHasLoaded(true);
    } catch (e) {
      alert(isEn ? 'Failed to load report.' : 'Gagal memuat laporan.');
    } finally {
      setLoading(false);
    }
  };

  const getAutoFilename = (ext: 'csv' | 'pdf') => {
    const kls = selectedKelas ? selectedKelas.replace(/[^a-zA-Z0-9]/g, '_') : 'Semua_Kelas';
    let periodeLabel = 'Harian';
    if (lapPeriode === 'range') periodeLabel = 'Mingguan';
    if (lapPeriode === 'bulanan') {
      const now = new Date();
      const monthName = now.toLocaleDateString('id-ID', { month: 'long' });
      periodeLabel = `Bulanan_${monthName}`;
    }
    if (lapPeriode === 'custom') periodeLabel = 'Custom';

    let dateStr = tglHarian;
    if (lapPeriode !== 'harian') {
      dateStr = `${tglMulai}_s_d_${tglSelesai}`;
    }
    return `Rekap_Presensi_${kls}_${periodeLabel}_${dateStr}.${ext}`;
  };

  const generateCSVText = () => {
    if (tampilanMode === 'rekap') {
      const headers = ['No', 'NIS', 'Nama Siswa', 'Kelas', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', 'Terlambat (T)', 'Total Hari', 'Persentase Kehadiran (%)'];
      const rows = filteredRekapList.map((st, idx) => [
        idx + 1,
        `"${(st.nis || '-').replace(/"/g, '""')}"`,
        `"${st.nama.replace(/"/g, '""')}"`,
        `"${st.kelas.replace(/"/g, '""')}"`,
        st.hadir,
        st.sakit,
        st.izin,
        st.alpha,
        st.terlambat,
        st.totalHari,
        `"${st.persentase}%"`,
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    } else {
      const headers = ['No', 'NIS', 'Tanggal', 'Jam', 'Nama Siswa', 'Kelas', 'Status', 'Keterangan'];
      const rows = filteredRawList.map((d, i) => [
        i + 1,
        `"${(d.nis || '-').replace(/"/g, '""')}"`,
        `"${(d.tanggal || '').replace(/"/g, '""')}"`,
        `"${(d.waktu || '').replace(/"/g, '""')}"`,
        `"${(d.nama || '').replace(/"/g, '""')}"`,
        `"${(d.kelas || '').replace(/"/g, '""')}"`,
        `"${(d.status || '').replace(/"/g, '""')}"`,
        `"${(d.ket || '').replace(/"/g, '""')}"`,
      ]);
      return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    }
  };

  const handleDownloadCSV = () => {
    const csvContent = generateCSVText();
    setCsvCopyText(csvContent);
    const filename = getAutoFilename('csv');

    try {
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.warn('Direct CSV download trigger failed:', e);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      const marginX = 12;
      const logoUrl = '/logo.png';

      // Load logo image as base64 for reliable PDF embedding
      const getLogoBase64 = (url: string): Promise<string | null> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || 320;
              canvas.height = img.naturalHeight || 320;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
                return;
              }
            } catch (e) {
              console.warn('Canvas export failed:', e);
            }
            resolve(null);
          };
          img.onerror = () => {
            fetch(url)
              .then((res) => res.blob())
              .then(
                (blob) =>
                  new Promise<string | null>((res) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result as string);
                    reader.onerror = () => res(null);
                    reader.readAsDataURL(blob);
                  })
              )
              .then((dataUrl) => resolve(dataUrl))
              .catch(() => resolve(null));
          };
          img.src = url;
        });
      };

      const logoData = await getLogoBase64(logoUrl);
      if (logoData) {
        try {
          doc.addImage(logoData, 'PNG', marginX + 2, 8, 20, 20);
        } catch (err) {
          console.warn('Could not add logo to PDF:', err);
        }
      }

      // Header Kop Sekolah
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('PEMERINTAH PROVINSI JAWA BARAT', 148.5, 12, { align: 'center' });
      doc.text('DINAS PENDIDIKAN', 148.5, 17, { align: 'center' });
      doc.setFontSize(13);
      doc.text('SMK NEGERI BOJONGGAMBIR', 148.5, 23, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('NPSN 69989796 | Jl. Bojonggambir Kp. Mandalawangi RT 005/005, Desa Ciroyom, Kec. Bojonggambir, Kab. Tasikmalaya, Prov. Jawa Barat', 148.5, 28, { align: 'center' });

      // Double line rule
      doc.setLineWidth(0.8);
      doc.line(marginX, 31, 297 - marginX, 31);
      doc.setLineWidth(0.2);
      doc.line(marginX, 32, 297 - marginX, 32);

      // Document Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(getJudulLaporan().toUpperCase(), 148.5, 39, { align: 'center' });

      // Metadata block
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const metaY = 46;
      doc.text(`Satuan Pendidikan : SMKN Bojonggambir`, marginX, metaY);
      doc.text(`Kelas / Jurusan : ${selectedKelas || 'Semua Kelas'}`, marginX, metaY + 5);
      doc.text(`Periode Laporan  : ${getPeriodeVal()}`, marginX, metaY + 10);

      doc.text(`Semester          : ${selectedSemester || 'Ganjil 2026/2027'}`, 200, metaY);
      doc.text(`Tahun Pelajaran   : 2026/2027`, 200, metaY + 5);
      doc.text(`Total Siswa       : ${totalSiswa} Siswa`, 200, metaY + 10);

      // Data Table Setup
      let tableHeaders: string[][] = [];
      let tableData: (string | number)[][] = [];

      if (tampilanMode === 'rekap') {
        tableHeaders = [['No', 'NIS', 'Nama Siswa', 'Kelas', 'Hadir (H)', 'Sakit (S)', 'Izin (I)', 'Alpha (A)', 'Terlambat', 'Total Hari', '% Kehadiran']];
        tableData = filteredRekapList.map((st, idx) => [
          idx + 1,
          st.nis || '-',
          st.nama,
          st.kelas,
          st.hadir,
          st.sakit,
          st.izin,
          st.alpha,
          st.terlambat,
          st.totalHari,
          `${st.persentase}%`
        ]);
      } else {
        tableHeaders = lapPeriode === 'harian'
          ? [['No', 'NIS', 'Tanggal', 'Jam', 'Nama Siswa', 'Kelas', 'Status', 'Keterangan']]
          : [['No', 'NIS', 'Tanggal & Jam', 'Nama Siswa', 'Kelas', 'Status', 'Keterangan']];
        tableData = filteredRawList.map((d, i) => lapPeriode === 'harian'
          ? [i + 1, d.nis || '-', d.tanggal, d.waktu, d.nama, d.kelas, d.status, d.ket || '-']
          : [i + 1, d.nis || '-', `${d.tanggal} (${d.waktu})`, d.nama, d.kelas, d.status, d.ket || '-']
        );
      }

      autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: 62,
        margin: { left: marginX, right: marginX },
        styles: { fontSize: 8, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.1 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          1: { halign: 'center', cellWidth: 24 },
        },
      });

      let finalY = (doc as any).lastAutoTable?.finalY || 120;

      // Summary block
      if (finalY + 25 > 185) {
        doc.addPage();
        finalY = 20;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('REKAPITULASI TOTAL KEHADIRAN:', marginX, finalY + 8);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(
        `Total Siswa: ${totalSiswa} Siswa | Hari Efektif: ${uniqueDays.length} Hari | Hadir (H): ${totHadir} | Sakit (S): ${totSakit} | Izin (I): ${totIzin} | Alpha (A): ${totAlpha} | Terlambat: ${totTerlambat} | Rata-rata Kehadiran: ${avgKehadiran}`,
        marginX,
        finalY + 14
      );

      // Signature Block
      let sigY = finalY + 26;
      if (sigY + 35 > 190) {
        doc.addPage();
        sigY = 20;
      }

      const todayFormatted = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Diverifikasi oleh,', 30, sigY);
      doc.text('Wali Kelas', 30, sigY + 5);
      doc.setFont('helvetica', 'normal');
      doc.text('( .................................................... )', 30, sigY + 26);
      doc.text('NIP. ................................................', 30, sigY + 31);

      doc.setFont('helvetica', 'bold');
      doc.text(`Bojonggambir, ${todayFormatted}`, 200, sigY);
      doc.text('Tenaga Administrasi / Pengelola', 200, sigY + 5);
      doc.setFont('helvetica', 'normal');
      doc.text('( .................................................... )', 200, sigY + 26);
      doc.text('NIP. ................................................', 200, sigY + 31);

      // Footer page numbers
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`Dokumen Laporan Resmi Absensi SMKN Bojonggambir | ${printTimestamp}`, marginX, 203);
        doc.text(`Halaman ${i} dari ${pageCount}`, 297 - marginX, 203, { align: 'right' });
      }

      doc.save(getAutoFilename('pdf'));
    } catch (err) {
      console.error('PDF Generation failed:', err);
      alert(isEn ? 'Failed to generate PDF.' : 'Gagal membuat file PDF. Silakan coba lagi.');
    }
  };

  const handleOpenInNewTab = () => {
    try {
      window.open(window.location.href, '_blank');
    } catch (e) {
      alert(isEn ? 'Please allow popups to open app in new tab.' : 'Silakan izinkan popup untuk membuka aplikasi di tab baru.');
    }
  };

  const handleCopyCSV = () => {
    const text = csvCopyText || generateCSVText();
    navigator.clipboard.writeText(text).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(() => {
      alert(isEn ? 'Failed to copy to clipboard.' : 'Gagal menyalin teks CSV.');
    });
  };

  const handlePrintDokumen = () => {
    try {
      window.print();
    } catch (err) {
      console.warn('Direct window.print() failed:', err);
    }
  };

  // Helper title strings
  const getJudulLaporan = () => {
    if (lapPeriode === 'harian') return isEn ? 'DAILY ATTENDANCE RECAP REPORT' : 'LAPORAN REKAPITULASI ABSENSI HARIAN SISWA';
    if (lapPeriode === 'range') return isEn ? 'WEEKLY ATTENDANCE RECAP REPORT' : 'LAPORAN REKAPITULASI ABSENSI MINGGUAN SISWA';
    if (lapPeriode === 'bulanan') return isEn ? 'MONTHLY ATTENDANCE RECAP REPORT' : 'LAPORAN REKAPITULASI ABSENSI BULANAN SISWA';
    return isEn ? 'CUSTOM DATE RANGE ATTENDANCE RECAP REPORT' : 'LAPORAN REKAPITULASI ABSENSI RENTANG TANGGAL CUSTOM';
  };

  const getPeriodeVal = () => {
    if (lapPeriode === 'harian') return tglHarian;
    return tglMulai === tglSelesai ? tglMulai : `${tglMulai} s/d ${tglSelesai}`;
  };

  // Memoized search filtering for instant table lookup
  const filteredRekapList = useMemo(() => {
    if (!searchTerm.trim()) return rekapSiswaList;
    const term = searchTerm.toLowerCase();
    return rekapSiswaList.filter(
      (st) =>
        st.nama.toLowerCase().includes(term) ||
        (st.nis && st.nis.toLowerCase().includes(term)) ||
        st.kelas.toLowerCase().includes(term)
    );
  }, [rekapSiswaList, searchTerm]);

  const filteredRawList = useMemo(() => {
    if (!searchTerm.trim()) return rawRecords;
    const term = searchTerm.toLowerCase();
    return rawRecords.filter(
      (r) =>
        r.nama.toLowerCase().includes(term) ||
        (r.nis && r.nis.toLowerCase().includes(term)) ||
        r.kelas.toLowerCase().includes(term)
    );
  }, [rawRecords, searchTerm]);

  // Calculated totals across all records
  let totHadir = 0;
  let totSakit = 0;
  let totIzin = 0;
  let totAlpha = 0;
  let totTerlambat = 0;

  rekapSiswaList.forEach((s) => {
    totHadir += s.hadir;
    totSakit += s.sakit;
    totIzin += s.izin;
    totAlpha += s.alpha;
    totTerlambat += s.terlambat;
  });

  const totalSiswa = rekapSiswaList.length;
  const avgKehadiran =
    totalSiswa > 0
      ? (rekapSiswaList.reduce((acc, curr) => acc + curr.persentase, 0) / totalSiswa).toFixed(1) + '%'
      : '0%';

  const handleResetFilters = () => {
    setLapPeriode('harian');
    setSelectedKelas('');
    setSelectedSiswa('');
    setSearchTerm('');
    setTglHarian(todayStr);
    setTglMulai(todayStr);
    setTglSelesai(todayStr);
  };

  return (
    <div id="sectionLaporan">
      {/* Desktop Professional Filter Card */}
      <div className="laporan-filter-card no-print">
        <div className="laporan-filter-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '20px' }}>📊</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                {isEn ? 'Attendance Report Filter Panel' : 'Panel Pengaturan & Filter Laporan Presensi'}
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                {isEn ? 'Select criteria then click Show Data to compile report' : 'Pilih parameter periode, kelas, dan rentang tanggal untuk menyusun laporan administrasi.'}
              </p>
            </div>
          </div>
          <div
            style={{
              background: '#eff6ff',
              padding: '6px 12px',
              borderRadius: '20px',
              border: '1px solid rgba(37,99,235,0.2)',
              color: '#2563eb',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            📊 {isEn ? 'Report Mode Active' : 'Mode Laporan Aktif'}
          </div>
        </div>

        <div className="laporan-filter-grid">
          {/* Field 1: Jenis Laporan */}
          <div className="laporan-field-group">
            <label>{isEn ? 'Report Type:' : 'Jenis Laporan:'}</label>
            <select
              value={lapPeriode}
              onChange={(e) => {
                const val = e.target.value as JenisLaporan;
                setLapPeriode(val);
                if (val === 'harian') {
                  setTampilanMode('detail');
                } else {
                  setTampilanMode('rekap');
                }

                const now = new Date();
                if (val === 'range') {
                  const dStart = new Date(now);
                  dStart.setDate(now.getDate() - 6);
                  setTglMulai(dStart.toISOString().split('T')[0]);
                  setTglSelesai(now.toISOString().split('T')[0]);
                } else if (val === 'bulanan') {
                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                  setTglMulai(firstDay.toISOString().split('T')[0]);
                  setTglSelesai(now.toISOString().split('T')[0]);
                }
              }}
            >
              <option value="harian">{isEn ? 'Daily Report (Harian)' : 'Laporan Harian'}</option>
              <option value="range">{isEn ? 'Weekly Preset (Mingguan - 7 Hari)' : 'Laporan Mingguan (7 Hari)'}</option>
              <option value="bulanan">{isEn ? 'Monthly Preset (Bulanan - Bulan Ini)' : 'Laporan Bulanan (Bulan Ini)'}</option>
              <option value="custom">{isEn ? 'Custom Date Range' : 'Laporan Rentang Tanggal Custom'}</option>
            </select>
          </div>

          {/* Field 2: Filter Kelas */}
          <div className="laporan-field-group">
            <label>{isEn ? 'Filter Class:' : 'Filter Kelas:'}</label>
            <select value={selectedKelas} onChange={handleKelasFilterChange}>
              <option value="">{isEn ? '-- All Classes --' : '-- Semua Kelas --'}</option>
              {kelasList.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          {/* Field 3: Filter Siswa */}
          <div className="laporan-field-group">
            <label>{isEn ? 'Student (Optional):' : 'Siswa (Opsional):'}</label>
            <select value={selectedSiswa} onChange={(e) => setSelectedSiswa(e.target.value)}>
              <option value="">{isEn ? '-- All Students --' : '-- Semua Siswa --'}</option>
              {siswaFilterList.map((s) => (
                <option key={s.nis + s.nama} value={s.nama}>
                  {s.nama}
                </option>
              ))}
            </select>
          </div>

          {/* Field 4: Semester */}
          <div className="laporan-field-group">
            <label>{isEn ? 'Semester / Academic Year:' : 'Semester / Tahun:'}</label>
            <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)}>
              <option value="">{isEn ? '-- Select Semester --' : '-- Pilih Semester --'}</option>
              <option value="Ganjil 2026/2027">Ganjil 2026/2027</option>
              <option value="Genap 2026/2027">Genap 2026/2027</option>
              <option value="Ganjil 2027/2028">Ganjil 2027/2028</option>
              <option value="Genap 2027/2028">Genap 2027/2028</option>
            </select>
          </div>
        </div>

        {/* Date Row */}
        <div style={{ marginTop: '14px' }}>
          {lapPeriode === 'harian' ? (
            <div className="laporan-field-group" style={{ maxWidth: '280px' }}>
              <label>{isEn ? 'Select Date:' : 'Pilih Tanggal Laporan:'}</label>
              <input type="date" value={tglHarian} onChange={(e) => setTglHarian(e.target.value)} />
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <div className="laporan-field-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>{isEn ? 'From Date:' : 'Dari Tanggal:'}</label>
                <input type="date" value={tglMulai} onChange={(e) => setTglMulai(e.target.value)} />
              </div>
              <div className="laporan-field-group" style={{ flex: 1, minWidth: '180px' }}>
                <label>{isEn ? 'To Date:' : 'Sampai Tanggal:'}</label>
                <input type="date" value={tglSelesai} onChange={(e) => setTglSelesai(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Actions Row */}
        <div className="laporan-actions-row">
          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              marginTop: 0,
              width: 'auto',
              padding: '10px 18px',
              fontSize: '12px',
              background: '#f1f5f9',
              color: '#475569',
              boxShadow: 'none',
              borderRadius: '10px',
            }}
          >
            🔄 {isEn ? 'Reset Filters' : 'Reset Filter'}
          </button>
          <button
            id="btnLoadLaporan"
            type="button"
            onClick={handleLoadLaporan}
            disabled={loading}
            style={{
              marginTop: 0,
              width: 'auto',
              padding: '10px 24px',
              fontSize: '13px',
              fontWeight: 800,
              background: 'var(--primary)',
              color: '#ffffff',
              borderRadius: '10px',
              boxShadow: '0 4px 14px rgba(37,99,235,0.25)',
            }}
          >
            {loading ? (isEn ? '⏳ Compiling Data...' : '⏳ Menyusun Data...') : isEn ? '🔍 Compile Report' : '🔍 Tampilkan Data Laporan'}
          </button>
        </div>
      </div>

      {/* Area Laporan (Interactive & Printable Output) */}
      {hasLoaded && (
        <div id="areaLaporan" style={{ display: 'block', marginTop: '20px' }}>
          
          {/* Official Print Kop Header */}
          <div id="official-print-header">
            <div className="print-logo-box">
              <img
                src="/logo.png"
                alt="Logo SMKN Bojonggambir"
              />
            </div>
            <div className="print-title-box">
              <h3>PEMERINTAH PROVINSI JAWA BARAT</h3>
              <h3>DINAS PENDIDIKAN</h3>
              <h2>SMK NEGERI BOJONGGAMBIR</h2>
              <p className="school-npsn">NPSN 69989796</p>
              <p className="school-addr">Jl. Bojonggambir Kp. Mandalawangi RT 005/005, Desa Ciroyom, Kecamatan Bojonggambir, Kabupaten Tasikmalaya, Provinsi Jawa Barat</p>
              <p className="report-main-heading">{getJudulLaporan()}</p>
            </div>
            <div className="print-logo-box-spacer" />
          </div>

          {/* On-Screen Interactive KPI Cards Block */}
          <div className="kpi-stats-grid no-print">
            <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <span className="kpi-label">Total Siswa</span>
              <span className="kpi-value">{totalSiswa}</span>
              <span className="kpi-sub">Siswa terdaftar</span>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #64748b' }}>
              <span className="kpi-label">Hari Efektif</span>
              <span className="kpi-value">{uniqueDays.length}</span>
              <span className="kpi-sub">Hari KBM</span>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #16a34a' }}>
              <span className="kpi-label">Hadir (H)</span>
              <span className="kpi-value" style={{ color: '#16a34a' }}>{totHadir}</span>
              <span className="kpi-sub">Total kedatangan</span>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #2563eb' }}>
              <span className="kpi-label">Sakit (S)</span>
              <span className="kpi-value" style={{ color: '#2563eb' }}>{totSakit}</span>
              <span className="kpi-sub">Surat dokter</span>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #0284c7' }}>
              <span className="kpi-label">Izin (I)</span>
              <span className="kpi-value" style={{ color: '#0284c7' }}>{totIzin}</span>
              <span className="kpi-sub">Izin resmi</span>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #dc2626' }}>
              <span className="kpi-label">Alpha (A)</span>
              <span className="kpi-value" style={{ color: '#dc2626' }}>{totAlpha}</span>
              <span className="kpi-sub">Tanpa keterangan</span>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #d97706' }}>
              <span className="kpi-label">Terlambat</span>
              <span className="kpi-value" style={{ color: '#d97706' }}>{totTerlambat}</span>
              <span className="kpi-sub">&gt;07.00 WIB</span>
            </div>
            <div className="kpi-card" style={{ borderLeft: '4px solid #15803d', background: '#f0fdf4' }}>
              <span className="kpi-label">Rata-rata %</span>
              <span className="kpi-value" style={{ color: '#15803d' }}>{avgKehadiran}</span>
              <span className="kpi-sub">Persentase kelas</span>
            </div>
          </div>

          {/* Report Metadata Identity for Print & Onscreen */}
          <div className="report-identity">
            <table>
              <tbody>
                <tr>
                  <td style={{ width: '18%', fontWeight: 'bold' }}>
                    {isEn ? 'Report Period' : 'Periode Laporan'}
                  </td>
                  <td>: {getPeriodeVal()}</td>
                  <td style={{ width: '18%', fontWeight: 'bold' }}>
                    {isEn ? 'Class' : 'Kelas'}
                  </td>
                  <td>: {selectedKelas || (isEn ? 'All Classes' : 'Semua Kelas')}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>{isEn ? 'Student' : 'Nama Siswa'}</td>
                  <td>: {selectedSiswa || (isEn ? 'All Students' : 'Semua Siswa')}</td>
                  <td style={{ fontWeight: 'bold' }}>
                    {isEn ? 'Semester / Year' : 'Semester / Tahun'}
                  </td>
                  <td>: {selectedSemester || '-'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>{isEn ? 'Effective Days' : 'Hari Efektif'}</td>
                  <td>: {uniqueDays.length} {isEn ? 'Days' : 'Hari'}</td>
                  <td style={{ fontWeight: 'bold' }}>{isEn ? 'Total Students' : 'Total Siswa'}</td>
                  <td>: {totalSiswa} {isEn ? 'Students' : 'Siswa'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold' }}>{isEn ? 'Database Source' : 'Sumber Database'}</td>
                  <td colSpan={3}>
                    : Live Google Spreadsheet (1ujQI5dMhPBr-d1H8w_r_btiBQfdZRSLKao52qXYUja0)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Desktop Toolbar: Format Selector + Live Search Input + Export Actions */}
          <div className="laporan-toolbar no-print">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                {isEn ? 'Format:' : 'Format Tampilan:'}
              </span>
              <button
                type="button"
                style={{
                  marginTop: 0,
                  padding: '7px 14px',
                  width: 'auto',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  background: tampilanMode === 'rekap' ? 'var(--primary)' : '#e2e8f0',
                  color: tampilanMode === 'rekap' ? '#ffffff' : '#475569',
                  boxShadow: tampilanMode === 'rekap' ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                }}
                onClick={() => setTampilanMode('rekap')}
              >
                📊 {isEn ? 'Summary Matrix' : 'Rekapitulasi Per Siswa'}
              </button>
              <button
                type="button"
                style={{
                  marginTop: 0,
                  padding: '7px 14px',
                  width: 'auto',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  background: tampilanMode === 'detail' ? 'var(--primary)' : '#e2e8f0',
                  color: tampilanMode === 'detail' ? '#ffffff' : '#475569',
                  boxShadow: tampilanMode === 'detail' ? '0 2px 8px rgba(37,99,235,0.25)' : 'none',
                }}
                onClick={() => setTampilanMode('detail')}
              >
                📋 {isEn ? 'Detailed Activity Log' : 'Rincian Transaksi Detail'}
              </button>
            </div>

            {/* Instant Search Bar */}
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={isEn ? 'Instant search name/NIS...' : 'Cari nama / NIS / kelas...'}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: 0,
                    margin: 0,
                    width: 'auto',
                    boxShadow: 'none',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Print & Export Buttons */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleDownloadCSV}
                style={{
                  marginTop: 0,
                  padding: '7px 14px',
                  width: 'auto',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  background: '#0284c7',
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
                }}
              >
                📥 <span>{isEn ? 'CSV' : 'Unduh CSV'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPDF}
                style={{
                  marginTop: 0,
                  padding: '7px 14px',
                  width: 'auto',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  background: '#ea580c',
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
                }}
              >
                📄 <span>{isEn ? 'PDF' : 'Unduh PDF'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrintDokumen}
                style={{
                  marginTop: 0,
                  padding: '7px 16px',
                  width: 'auto',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  background: 'var(--secondary-green)',
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.25)',
                }}
              >
                🖨️ <span>{isEn ? 'Print' : 'Cetak Dokumen'}</span>
              </button>
            </div>
          </div>

          {/* MAIN DATA TABLES */}

          {/* MODE 1: REKAPITULASI PER SISWA (SUMMARY MATRIX) */}
          {tampilanMode === 'rekap' && (
            <div className="table-responsive print-table-wrapper" style={{ marginBottom: '20px' }}>
              <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 4px 12px' }}>
                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                  📊 {isEn ? 'Summary Matrix per Student' : 'Tabel Rekapitulasi Kehadiran Siswa'}
                </h4>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {isEn ? `Showing ${filteredRekapList.length} of ${rekapSiswaList.length} students` : `Menampilkan ${filteredRekapList.length} dari ${rekapSiswaList.length} siswa`}
                </span>
              </div>
              <table id="tabelRekapMatrix" className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '4%' }}>No</th>
                    <th style={{ width: '12%' }}>NIS</th>
                    <th>{isEn ? 'Student Name' : 'Nama Siswa'}</th>
                    <th style={{ width: '10%' }}>{isEn ? 'Class' : 'Kelas'}</th>
                    <th style={{ width: '7%', textAlign: 'center' }}>Hadir (H)</th>
                    <th style={{ width: '7%', textAlign: 'center' }}>Sakit (S)</th>
                    <th style={{ width: '7%', textAlign: 'center' }}>Izin (I)</th>
                    <th style={{ width: '7%', textAlign: 'center' }}>Alpha (A)</th>
                    <th style={{ width: '9%', textAlign: 'center' }}>Terlambat (T)</th>
                    <th style={{ width: '9%', textAlign: 'center' }}>{isEn ? 'Eff. Days' : 'Total Hari'}</th>
                    <th style={{ width: '11%', textAlign: 'center' }}>% Kehadiran</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRekapList.length === 0 ? (
                    <tr>
                      <td colSpan={11} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                        {searchTerm
                          ? (isEn ? 'No students matched search criteria.' : `Tidak ada siswa yang cocok dengan pencarian "${searchTerm}".`)
                          : (isEn ? 'No attendance records found.' : 'Belum ada data absensi pada periode ini.')}
                      </td>
                    </tr>
                  ) : (
                    filteredRekapList.map((st, idx) => (
                      <tr key={st.nama + idx}>
                        <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                        <td>{st.nis || '-'}</td>
                        <td style={{ fontWeight: 600 }}>{st.nama}</td>
                        <td>{st.kelas}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#166534' }}>{st.hadir}</td>
                        <td style={{ textAlign: 'center', color: '#991b1b' }}>{st.sakit}</td>
                        <td style={{ textAlign: 'center', color: '#0369a1' }}>{st.izin}</td>
                        <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 'bold' }}>{st.alpha}</td>
                        <td style={{ textAlign: 'center', color: '#d97706' }}>{st.terlambat}</td>
                        <td style={{ textAlign: 'center' }}>{st.totalHari}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                          <span
                            className="badge"
                            style={{
                              backgroundColor: st.persentase >= 85 ? '#dcfce7' : st.persentase >= 70 ? '#fefce8' : '#fee2e2',
                              color: st.persentase >= 85 ? '#166534' : st.persentase >= 70 ? '#a16207' : '#991b1b',
                            }}
                          >
                            {st.persentase}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* MODE 2: RINCIAN DETAIL TRANSAKSI (DETAILED LOGS) */}
          {tampilanMode === 'detail' && (
            <div className="table-responsive print-table-wrapper">
              <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 4px 12px' }}>
                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                  📋 {isEn ? 'Detailed Activity Logs' : 'Tabel Rincian Detail Transaksi Absensi'}
                </h4>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  {isEn ? `Showing ${filteredRawList.length} of ${rawRecords.length} records` : `Menampilkan ${filteredRawList.length} dari ${rawRecords.length} transaksi`}
                </span>
              </div>
              <table id="tabelLaporanDetail" className="data-table">
                <thead>
                  {lapPeriode === 'harian' ? (
                    <tr>
                      <th style={{ width: '4%' }}>No</th>
                      <th style={{ width: '10%' }}>NIS</th>
                      <th style={{ width: '12%' }}>Tanggal</th>
                      <th style={{ width: '10%' }}>Jam</th>
                      <th>{isEn ? 'Name' : 'Nama Siswa'}</th>
                      <th style={{ width: '10%' }}>{isEn ? 'Class' : 'Kelas'}</th>
                      <th style={{ width: '10%' }}>Status</th>
                      <th>{isEn ? 'Notes' : 'Keterangan'}</th>
                    </tr>
                  ) : (
                    <tr>
                      <th style={{ width: '4%' }}>No</th>
                      <th style={{ width: '10%' }}>NIS</th>
                      <th style={{ width: '14%' }}>Tanggal & Jam</th>
                      <th>{isEn ? 'Name' : 'Nama Siswa'}</th>
                      <th style={{ width: '10%' }}>{isEn ? 'Class' : 'Kelas'}</th>
                      <th style={{ width: '10%' }}>Status</th>
                      <th>{isEn ? 'Notes' : 'Keterangan'}</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {filteredRawList.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                        {searchTerm
                          ? (isEn ? 'No records matched search criteria.' : `Tidak ada transaksi yang cocok dengan pencarian "${searchTerm}".`)
                          : (isEn ? 'No attendance records found.' : 'Belum ada data absensi pada periode ini.')}
                      </td>
                    </tr>
                  ) : (
                    filteredRawList.map((d, i) => {
                      let badgeColor = 'bg-Hadir';
                      if (d.status === 'Pulang') badgeColor = 'bg-Pulang';
                      if (d.status === 'Sakit') badgeColor = 'bg-Sakit';
                      if (d.status === 'Izin') badgeColor = 'bg-Izin';
                      if (d.status === 'Alpha') badgeColor = 'bg-Alpha';

                      const isLate = d.ket && d.ket.includes('[TERLAMBAT]');
                      const cleanKet = d.ket ? d.ket.replace('[TERLAMBAT]', '').trim() : '';

                      return lapPeriode === 'harian' ? (
                        <tr key={i}>
                          <td style={{ textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ textAlign: 'center' }}>{d.nis || '-'}</td>
                          <td>{d.tanggal}</td>
                          <td>{d.waktu}</td>
                          <td style={{ fontWeight: 600 }}>{d.nama}</td>
                          <td>{d.kelas}</td>
                          <td>
                            <span className={`badge ${badgeColor}`}>{d.status}</span>
                          </td>
                          <td style={{ fontSize: '11px' }}>
                            {isLate && (
                              <span style={{ color: '#dc2626', fontWeight: 'bold', marginRight: '4px' }}>
                                [TERLAMBAT]{' '}
                              </span>
                            )}
                            {cleanKet}
                          </td>
                        </tr>
                      ) : (
                        <tr key={i}>
                          <td style={{ textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ textAlign: 'center' }}>{d.nis || '-'}</td>
                          <td>
                            {d.tanggal} <small style={{ color: '#64748b' }}>({d.waktu})</small>
                          </td>
                          <td style={{ fontWeight: 600 }}>{d.nama}</td>
                          <td>{d.kelas}</td>
                          <td>
                            <span className={`badge ${badgeColor}`}>{d.status}</span>
                          </td>
                          <td style={{ fontSize: '11px' }}>
                            {isLate && (
                              <span style={{ color: '#dc2626', fontWeight: 'bold', marginRight: '4px' }}>
                                [TERLAMBAT]{' '}
                              </span>
                            )}
                            {cleanKet}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* OFFICIAL SUMMARY STATS BLOCK */}
          <div className="print-stats" id="printStatsBlock">
            <div className="stat-card">
              <span className="stat-label">Total Siswa:</span>
              <span className="stat-val">{totalSiswa} Siswa</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total Hari Efektif:</span>
              <span className="stat-val">{uniqueDays.length} Hari</span>
            </div>
            <div className="stat-card text-green">
              <span className="stat-label">Total Hadir (H):</span>
              <span className="stat-val">{totHadir}</span>
            </div>
            <div className="stat-card text-blue">
              <span className="stat-label">Total Sakit (S):</span>
              <span className="stat-val">{totSakit}</span>
            </div>
            <div className="stat-card text-cyan">
              <span className="stat-label">Total Izin (I):</span>
              <span className="stat-val">{totIzin}</span>
            </div>
            <div className="stat-card text-red">
              <span className="stat-label">Total Alpha (A):</span>
              <span className="stat-val">{totAlpha}</span>
            </div>
            <div className="stat-card text-orange">
              <span className="stat-label">Total Terlambat (T):</span>
              <span className="stat-val">{totTerlambat}</span>
            </div>
            <div className="stat-card text-green-dark">
              <span className="stat-label">Rata-rata Kehadiran:</span>
              <span className="stat-val">{avgKehadiran}</span>
            </div>
          </div>

          {/* OFFICIAL SIGNATURE BLOCK FOR PRINT */}
          <div className="print-footer print-only">
            <div className="signature-box">
              <p className="sig-title">Diverifikasi oleh,<br />Wali Kelas</p>
              <div className="signature-space"></div>
              <p className="signature-name">( ........................................ )</p>
              <p className="sig-nip">NIP. ....................................</p>
            </div>
            <div className="signature-box">
              <p className="sig-title">Bojonggambir, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br />Tenaga Administrasi / Pengelola</p>
              <div className="signature-space"></div>
              <p className="signature-name">( ........................................ )</p>
              <p className="sig-nip">NIP. ....................................</p>
            </div>
          </div>

          {/* PAGE FOOTER INFO */}
          <div className="page-footer-info print-only">
            <span>{printTimestamp}</span>
            <span>Halaman Laporan Resmi — Absensi SMKN Bojonggambir</span>
          </div>

        </div>
      )}

      {/* EXPORT & PRINT CENTER MODAL */}
      {showExportModal && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowExportModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '28px' }}>🖨️</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    {isEn ? 'Print & Export Center' : 'Pusat Cetak & Unduh Laporan'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                    {isEn ? 'Choose download or print option' : 'Pilih opsi cetak & unduh dokumen resmi di bawah'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{
                  marginTop: 0,
                  background: '#f1f5f9',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* Option 1: Buka di Tab Baru */}
              <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '4px' }}>
                  🌐 {isEn ? '1. Open App in New Browser Tab (Recommended)' : '1. Buka Aplikasi di Tab Baru (Disarankan)'}
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>
                  {isEn
                    ? 'Bypasses iFrame restrictions. Opens full tab where browser print dialogs & downloads work 100% natively.'
                    : 'Solusi paling ampuh jika pratinjau iFrame memblokir tombol cetak. Buka tab baru lalu tekan Cetak / Unduh.'}
                </p>
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  style={{
                    marginTop: 0,
                    width: '100%',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: '#2563eb',
                    color: '#ffffff',
                    borderRadius: '8px',
                  }}
                >
                  ↗️ {isEn ? 'Open in New Tab to Print / PDF' : 'Buka di Tab Baru untuk Cetak / PDF'}
                </button>
              </div>

              {/* Option 2: Unduh Dokumen PDF */}
              <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '4px' }}>
                  📄 {isEn ? '2. Download PDF Document (A4 Landscape)' : '2. Unduh Dokumen PDF (A4 Landscape)'}
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 10px 0' }}>
                  {isEn
                    ? 'Downloads official PDF report containing headers, tables & signatures.'
                    : 'Mengunduh file PDF resmi A4 Landscape dengan Kop Sekolah, tabel presensi, dan lembar verifikasi.'}
                </p>
                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  style={{
                    marginTop: 0,
                    width: '100%',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: '#ea580c',
                    color: '#ffffff',
                    borderRadius: '8px',
                  }}
                >
                  📄 {isEn ? 'Download PDF Document' : 'Unduh Dokumen PDF (.pdf)'}
                </button>
              </div>

              {/* Option 3: Unduh & Salin Teks CSV */}
              <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '4px' }}>
                  📥 {isEn ? '3. Download or Copy CSV Data' : '3. Unduh atau Salin Data CSV (Excel)'}
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 8px 0' }}>
                  {isEn ? 'Export raw or summary data for Microsoft Excel / Google Sheets.' : 'Data format CSV untuk rekapitulasi di Excel / Google Sheets.'}
                </p>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <button
                    type="button"
                    onClick={handleDownloadCSV}
                    style={{
                      marginTop: 0,
                      flex: 1,
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: '#0284c7',
                      color: '#ffffff',
                      borderRadius: '8px',
                    }}
                  >
                    💾 {isEn ? 'Re-Download CSV File' : 'Unduh Ulang File .CSV'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyCSV}
                    style={{
                      marginTop: 0,
                      flex: 1,
                      padding: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      background: copySuccess ? '#16a34a' : '#475569',
                      color: '#ffffff',
                      borderRadius: '8px',
                    }}
                  >
                    {copySuccess ? '✅ Tersalin!' : '📋 Salin Teks CSV'}
                  </button>
                </div>
                <textarea
                  readOnly
                  rows={3}
                  value={csvCopyText || generateCSVText()}
                  style={{
                    width: '100%',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                  }}
                />
              </div>

              {/* Option 4: Direct Print Attempt */}
              <div style={{ padding: '14px', borderRadius: '12px', border: '1px solid #cbd5e1', background: '#f8fafc' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: '#1e293b', marginBottom: '4px' }}>
                  🖨️ {isEn ? '4. Try Direct Browser Print' : '4. Coba Cetak Langsung Browser'}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      window.print();
                    } catch (e) {
                      alert(isEn ? 'Direct print blocked by iframe.' : 'Cetak langsung terhalang iFrame, silakan gunakan tombol "Buka di Tab Baru" di atas.');
                    }
                  }}
                  style={{
                    marginTop: '6px',
                    width: '100%',
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: 'var(--secondary-green)',
                    color: '#ffffff',
                    borderRadius: '8px',
                  }}
                >
                  🖨️ {isEn ? 'Trigger Print Dialog' : 'Jalankan Cetak Langsung (window.print)'}
                </button>
              </div>

            </div>

            <div style={{ marginTop: '16px', textAlign: 'right' }}>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{
                  marginTop: 0,
                  padding: '8px 20px',
                  background: '#f1f5f9',
                  color: '#475569',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                {isEn ? 'Close' : 'Tutup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
