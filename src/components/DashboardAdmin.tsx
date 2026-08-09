import React, { useState, useEffect, useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { AbsenRecord, Language } from '../types';
import { fetchDirectSpreadsheetData, fetchKelas } from '../services/api';

interface DashboardAdminProps {
  lang: Language;
}

export const DashboardAdmin: React.FC<DashboardAdminProps> = ({ lang }) => {
  const isEn = lang === 'en';

  const [records, setRecords] = useState<AbsenRecord[]>([]);
  const [kelasList, setKelasList] = useState<string[]>([]);
  const [selectedKelas, setSelectedKelas] = useState<string>('');
  const [periodFilter, setPeriodFilter] = useState<'today' | '7days' | '30days' | 'all'>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [allData, classes] = await Promise.all([
        fetchDirectSpreadsheetData(),
        fetchKelas(),
      ]);
      setRecords(allData);
      setKelasList(classes);
      setLastRefreshed(new Date().toLocaleTimeString(isEn ? 'en-US' : 'id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Filter records based on selected class and period
  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (selectedKelas) {
      result = result.filter(
        (r) => r.kelas.toLowerCase() === selectedKelas.toLowerCase()
      );
    }

    if (periodFilter !== 'all' && result.length > 0) {
      const dates = Array.from(new Set(result.map((r) => r.tanggal))).sort();
      if (dates.length > 0) {
        if (periodFilter === 'today') {
          const latestDate = dates[dates.length - 1];
          result = result.filter((r) => r.tanggal === latestDate);
        } else if (periodFilter === '7days') {
          const cutoffIdx = Math.max(0, dates.length - 7);
          const validDates = dates.slice(cutoffIdx);
          result = result.filter((r) => validDates.includes(r.tanggal));
        } else if (periodFilter === '30days') {
          const cutoffIdx = Math.max(0, dates.length - 30);
          const validDates = dates.slice(cutoffIdx);
          result = result.filter((r) => validDates.includes(r.tanggal));
        }
      }
    }

    return result;
  }, [records, selectedKelas, periodFilter]);

  // Overall Statistics
  const stats = useMemo(() => {
    const total = filteredRecords.length;
    let hadir = 0;
    let sakit = 0;
    let izin = 0;
    let alpha = 0;
    let terlambat = 0;
    let tepatWaktu = 0;

    filteredRecords.forEach((r) => {
      const st = r.status.toLowerCase();
      const ket = (r.ket || '').toLowerCase();

      if (st.includes('hadir')) {
        hadir++;
        if (ket.includes('terlambat')) {
          terlambat++;
        } else {
          tepatWaktu++;
        }
      } else if (st.includes('sakit')) {
        sakit++;
      } else if (st.includes('izin')) {
        izin++;
      } else if (st.includes('alpha') || st.includes('alpa')) {
        alpha++;
      }
    });

    const attendanceRate = total > 0 ? Math.round((hadir / total) * 100) : 0;
    const punctualityRate = hadir > 0 ? Math.round((tepatWaktu / hadir) * 100) : 0;

    return {
      total,
      hadir,
      sakit,
      izin,
      alpha,
      terlambat,
      tepatWaktu,
      attendanceRate,
      punctualityRate,
    };
  }, [filteredRecords]);

  // Status Distribution Data for Pie Chart
  const pieData = useMemo(() => {
    return [
      { name: isEn ? 'Present (Hadir)' : 'Hadir', value: stats.hadir, color: '#10b981' },
      { name: isEn ? 'Sick (Sakit)' : 'Sakit', value: stats.sakit, color: '#f59e0b' },
      { name: isEn ? 'Permit (Izin)' : 'Izin', value: stats.izin, color: '#3b82f6' },
      { name: isEn ? 'Absent (Alpha)' : 'Alpha', value: stats.alpha, color: '#ef4444' },
    ].filter((item) => item.value > 0);
  }, [stats, isEn]);

  // Punctuality Pie Chart
  const punctualityData = useMemo(() => {
    return [
      { name: isEn ? 'On Time' : 'Tepat Waktu', value: stats.tepatWaktu, color: '#10b981' },
      { name: isEn ? 'Late' : 'Terlambat', value: stats.terlambat, color: '#8b5cf6' },
    ].filter((item) => item.value > 0);
  }, [stats, isEn]);

  // Daily Trend Data
  const dailyTrendData = useMemo(() => {
    const map = new Map<string, { tanggal: string; Hadir: number; Sakit: number; Izin: number; Alpha: number; Terlambat: number }>();

    filteredRecords.forEach((r) => {
      const dateKey = r.tanggal || 'N/A';
      if (!map.has(dateKey)) {
        map.set(dateKey, { tanggal: dateKey, Hadir: 0, Sakit: 0, Izin: 0, Alpha: 0, Terlambat: 0 });
      }
      const entry = map.get(dateKey)!;
      const st = r.status.toLowerCase();
      const ket = (r.ket || '').toLowerCase();

      if (st.includes('hadir')) {
        entry.Hadir++;
        if (ket.includes('terlambat')) {
          entry.Terlambat++;
        }
      } else if (st.includes('sakit')) {
        entry.Sakit++;
      } else if (st.includes('izin')) {
        entry.Izin++;
      } else if (st.includes('alpha') || st.includes('alpa')) {
        entry.Alpha++;
      }
    });

    const result = Array.from(map.values()).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    // Limit to last 15 days if too many dates
    return result.length > 20 ? result.slice(-20) : result;
  }, [filteredRecords]);

  // Class Comparison Data
  const classComparisonData = useMemo(() => {
    const map = new Map<string, { kelas: string; Hadir: number; Sakit: number; Izin: number; Alpha: number; Total: number; Rate: number }>();

    records.forEach((r) => {
      const k = r.kelas || 'Lainnya';
      if (!map.has(k)) {
        map.set(k, { kelas: k, Hadir: 0, Sakit: 0, Izin: 0, Alpha: 0, Total: 0, Rate: 0 });
      }
      const entry = map.get(k)!;
      entry.Total++;
      const st = r.status.toLowerCase();
      if (st.includes('hadir')) entry.Hadir++;
      else if (st.includes('sakit')) entry.Sakit++;
      else if (st.includes('izin')) entry.Izin++;
      else if (st.includes('alpha') || st.includes('alpa')) entry.Alpha++;
    });

    const result = Array.from(map.values()).map((e) => {
      e.Rate = e.Total > 0 ? Math.round((e.Hadir / e.Total) * 100) : 0;
      return e;
    });

    return result.sort((a, b) => b.Rate - a.Rate);
  }, [records]);

  // Top Performing Class
  const topClass = useMemo(() => {
    if (classComparisonData.length === 0) return null;
    return classComparisonData[0];
  }, [classComparisonData]);

  return (
    <div style={{ padding: '8px 0' }} className="no-print">
      {/* Dashboard Top Header & Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '20px',
          backgroundColor: '#f8fafc',
          padding: '16px 20px',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📊</span> {isEn ? 'Executive Attendance Dashboard' : 'Dashboard Statistik Absensi Siswa'}
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
            {isEn ? 'Real-time attendance metrics & graphical analysis' : 'Analisis visual & ringkasan kehadiran siswa SMKN Bojonggambir'}
            {lastRefreshed && (
              <span style={{ marginLeft: '8px', color: '#10b981', fontWeight: 600 }}>
                • {isEn ? 'Updated:' : 'Diperbarui:'} {lastRefreshed}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {/* Class Filter */}
          <select
            value={selectedKelas}
            onChange={(e) => setSelectedKelas(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: '#ffffff',
              color: '#1e293b',
              cursor: 'pointer',
            }}
          >
            <option value="">{isEn ? 'All Classes' : 'Semua Kelas'}</option>
            {kelasList.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>

          {/* Period Filter */}
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as any)}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: '#ffffff',
              color: '#1e293b',
              cursor: 'pointer',
            }}
          >
            <option value="all">{isEn ? 'All Time Data' : 'Semua Periode'}</option>
            <option value="today">{isEn ? 'Latest Day' : 'Hari Terakhir'}</option>
            <option value="7days">{isEn ? 'Last 7 Days' : '7 Hari Terakhir'}</option>
            <option value="30days">{isEn ? 'Last 30 Days' : '30 Hari Terakhir'}</option>
          </select>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={loadDashboardData}
            disabled={loading}
            style={{
              marginTop: 0,
              padding: '8px 14px',
              fontSize: '13px',
              fontWeight: 700,
              background: '#0284c7',
              color: '#ffffff',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span style={{ display: 'inline-block', transform: loading ? 'rotate(360deg)' : 'none', transition: 'transform 1s' }}>
              🔄
            </span>
            <span>{loading ? (isEn ? 'Syncing...' : 'Memuat...') : (isEn ? 'Refresh Data' : 'Sinkronkan')}</span>
          </button>
        </div>
      </div>

      {loading && records.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#f8fafc', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>⏳</div>
          <p style={{ margin: 0, fontWeight: 700, color: '#334155', fontSize: '15px' }}>
            {isEn ? 'Fetching live attendance statistics...' : 'Mengambil statistik absensi terbaru dari spreadsheet...'}
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
              marginBottom: '24px',
            }}
          >
            {/* Metric 1: Total Records */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                  {isEn ? 'Total Attendance Records' : 'Total Data Presensi'}
                </p>
                <h3 style={{ margin: '6px 0 0', fontSize: '26px', fontWeight: 900, color: '#0f172a' }}>
                  {stats.total.toLocaleString()}
                </h3>
              </div>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#f0f9ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                }}
              >
                📋
              </div>
            </div>

            {/* Metric 2: Attendance Rate */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                  {isEn ? 'Attendance Rate' : 'Tingkat Kehadiran'}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <h3 style={{ margin: '6px 0 0', fontSize: '26px', fontWeight: 900, color: '#10b981' }}>
                    {stats.attendanceRate}%
                  </h3>
                  <span style={{ fontSize: '12px', color: '#059669', fontWeight: 700 }}>
                    ({stats.hadir} {isEn ? 'Present' : 'Hadir'})
                  </span>
                </div>
              </div>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#ecfdf5',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                }}
              >
                ✅
              </div>
            </div>

            {/* Metric 3: Punctuality */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                  {isEn ? 'On Time vs Terlambat' : 'Ketepatan Waktu'}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <h3 style={{ margin: '6px 0 0', fontSize: '26px', fontWeight: 900, color: '#8b5cf6' }}>
                    {stats.terlambat}
                  </h3>
                  <span style={{ fontSize: '12px', color: '#6d28d9', fontWeight: 700 }}>
                    {isEn ? 'Late' : 'Siswa Terlambat'}
                  </span>
                </div>
              </div>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#f5f3ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                }}
              >
                ⏰
              </div>
            </div>

            {/* Metric 4: Total Non-Attendance (Sakit/Izin/Alpha) */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: '#64748b' }}>
                  {isEn ? 'Absences (Sakit/Izin/Alpha)' : 'Total Tidak Hadir (S/I/A)'}
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <h3 style={{ margin: '6px 0 0', fontSize: '26px', fontWeight: 900, color: '#ef4444' }}>
                    {stats.sakit + stats.izin + stats.alpha}
                  </h3>
                  <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700 }}>
                    (S:{stats.sakit} I:{stats.izin} A:{stats.alpha})
                  </span>
                </div>
              </div>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#fef2f2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px',
                }}
              >
                ⚠️
              </div>
            </div>
          </div>

          {/* Charts Row 1: Pie Charts Distribution */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px',
              marginBottom: '24px',
            }}
          >
            {/* Chart 1: Status Distribution Pie Chart */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🧩</span> {isEn ? 'Status Distribution' : 'Persentase Status Kehadiran'}
              </h3>
              {pieData.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  {isEn ? 'No data for pie chart' : 'Tidak ada data untuk grafik pie'}
                </div>
              ) : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value} Siswa`, 'Jumlah']} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart 2: Punctuality Breakdown Donut Chart */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '20px',
                padding: '20px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏱️</span> {isEn ? 'Punctuality (On Time vs Late)' : 'Rasio Ketepatan Waktu Siswa'}
              </h3>
              {punctualityData.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  {isEn ? 'No attendance records' : 'Belum ada data kedatangan'}
                </div>
              ) : (
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={punctualityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {punctualityData.map((entry, index) => (
                          <Cell key={`cell-punc-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value} Siswa`, 'Jumlah']} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Charts Row 2: Daily Attendance Trend Over Time */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '20px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📈</span> {isEn ? 'Daily Attendance Trend' : 'Tren Kehadiran Harian'}
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                {isEn ? 'Bar chart per date' : 'Statistik harian'}
              </span>
            </div>

            {dailyTrendData.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                {isEn ? 'No trend data available' : 'Data tren tidak ditemukan'}
              </div>
            ) : (
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="tanggal" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Bar dataKey="Hadir" name={isEn ? 'Present' : 'Hadir'} fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Terlambat" name={isEn ? 'Late' : 'Terlambat'} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Sakit" name={isEn ? 'Sick' : 'Sakit'} fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Izin" name={isEn ? 'Permit' : 'Izin'} fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Alpha" name={isEn ? 'Absent' : 'Alpha'} fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Charts Row 3: Class Comparison */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '20px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
              marginBottom: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🏫</span> {isEn ? 'Class Attendance Rate Comparison (%)' : 'Perbandingan Persentase Kehadiran Per Kelas (%)'}
              </h3>
              {topClass && (
                <span style={{ fontSize: '12px', background: '#dcfce7', color: '#15803d', padding: '4px 10px', borderRadius: '20px', fontWeight: 700 }}>
                  🏆 {isEn ? 'Highest:' : 'Terbaik:'} {topClass.kelas} ({topClass.Rate}%)
                </span>
              )}
            </div>

            {classComparisonData.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                {isEn ? 'No class comparison data' : 'Data perbandingan kelas belum ada'}
              </div>
            ) : (
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classComparisonData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis dataKey="kelas" type="category" tick={{ fontSize: 12, fontWeight: 600, fill: '#334155' }} />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, isEn ? 'Attendance Rate' : 'Tingkat Kehadiran']}
                      contentStyle={{ borderRadius: '12px', borderColor: '#e2e8f0' }}
                    />
                    <Bar dataKey="Rate" name={isEn ? 'Attendance Rate (%)' : 'Persentase Kehadiran (%)'} fill="#0284c7" radius={[0, 8, 8, 0]}>
                      {classComparisonData.map((entry, index) => (
                        <Cell
                          key={`cell-class-${index}`}
                          fill={entry.Rate >= 90 ? '#10b981' : entry.Rate >= 75 ? '#0284c7' : '#f59e0b'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Quick Insights Summary Box */}
          <div
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              borderRadius: '20px',
              padding: '24px',
              color: '#ffffff',
              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.3)',
            }}
          >
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💡</span> {isEn ? 'Administrative Insights & Highlights' : 'Catatan Ringkas Administrator Sekolah'}
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                fontSize: '13px',
              }}
            >
              <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                  🎯 {isEn ? 'Punctuality Status' : 'Tingkat Kedisiplinan'}
                </div>
                <div>
                  {stats.terlambat > 0
                    ? isEn
                      ? `There are ${stats.terlambat} late arrivals recorded. Recommended follow-up by homeroom teachers.`
                      : `Terdapat ${stats.terlambat} catatan siswa terlambat. Disarankan koordinasi dengan Wali Kelas.`
                    : isEn
                      ? 'Excellent! All attending students arrived on time before 07:00 AM.'
                      : 'Sangat baik! Semua siswa yang hadir datang tepat waktu sebelum jam 07.00 WIB.'}
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: '4px' }}>
                  🏆 {isEn ? 'Best Class' : 'Kelas Kehadiran Tertinggi'}
                </div>
                <div>
                  {topClass
                    ? `${topClass.kelas} ${isEn ? 'leads with' : 'memimpin dengan persentase'} ${topClass.Rate}% ${isEn ? 'attendance rate.' : 'kehadiran.'}`
                    : '-'}
                </div>
              </div>

              <div style={{ backgroundColor: 'rgba(255,255,255,0.08)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ fontWeight: 700, color: '#facc15', marginBottom: '4px' }}>
                  📁 {isEn ? 'Data Source' : 'Sumber Data Utama'}
                </div>
                <div>
                  {isEn
                    ? 'Connected live to SMKN Bojonggambir Google Spreadsheet.'
                    : 'Terhubung langsung secara otomatis ke Google Spreadsheet Database SMKN Bojonggambir.'}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
