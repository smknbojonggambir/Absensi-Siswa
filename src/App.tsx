import React, { useState } from 'react';
import { Header } from './components/Header';
import { FormAbsensi } from './components/FormAbsensi';
import { LaporanAbsensi } from './components/LaporanAbsensi';
import { DashboardAdmin } from './components/DashboardAdmin';
import { Language } from './types';

export default function App() {
  const [lang, setLang] = useState<Language>('id');
  const [activeTab, setActiveTab] = useState<'form' | 'dashboard' | 'laporan'>('form');
  const [isAdminUnlocked, setIsAdminUnlocked] = useState<boolean>(false);
  const [targetTabAfterUnlock, setTargetTabAfterUnlock] = useState<'dashboard' | 'laporan'>('dashboard');
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [inputPassword, setInputPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');

  const toggleLang = () => {
    setLang((prev) => (prev === 'id' ? 'en' : 'id'));
  };

  const handleTabSwitch = (tab: 'form' | 'dashboard' | 'laporan') => {
    if (tab === 'dashboard' || tab === 'laporan') {
      if (isAdminUnlocked) {
        setActiveTab(tab);
      } else {
        setTargetTabAfterUnlock(tab);
        setShowPasswordModal(true);
        setInputPassword('');
        setPasswordError('');
      }
    } else {
      setActiveTab('form');
    }
  };

  const handleVerifyPassword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputPassword === '123456') {
      setIsAdminUnlocked(true);
      setShowPasswordModal(false);
      setActiveTab(targetTabAfterUnlock);
      setPasswordError('');
    } else {
      setPasswordError(
        lang === 'en'
          ? '❌ Incorrect Password! Please contact Administrator.'
          : '❌ Password Salah! Khusus Guru & Tenaga Administrasi.'
      );
    }
  };

  const isEn = lang === 'en';

  return (
    <div className={`container ${lang === 'id' ? 'lang-id' : 'lang-en'} ${activeTab === 'form' ? 'mode-siswa' : 'mode-laporan'}`}>
      <Header lang={lang} onToggleLang={toggleLang} />

      <div className="main-content">
        <div className="card">
          {/* Navigation Tabs */}
          <div className="nav-tabs no-print">
            <button
              type="button"
              className={`nav-btn ${activeTab === 'form' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('form')}
            >
              <span>{isEn ? '📝 Check In/Out' : '📝 Isi Absen'}</span>
            </button>
            <button
              type="button"
              className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('dashboard')}
            >
              <span>{isEn ? '📊 Dashboard' : '📊 Dashboard'}</span>
            </button>
            <button
              type="button"
              className={`nav-btn ${activeTab === 'laporan' ? 'active' : ''}`}
              onClick={() => handleTabSwitch('laporan')}
            >
              <span>{isEn ? '🖨️ Report' : '🖨️ Laporan'}</span>
            </button>
          </div>

          {/* Announcement Box for Form Tab */}
          {activeTab === 'form' && (
            <div className="announcement-box no-print">
              <div style={{ fontSize: '20px' }}>📢</div>
              <div className="announcement-text">
                {isEn ? (
                  <>
                    <strong>Attention:</strong> Enable Location and Camera. Check-in deadline is{' '}
                    <strong>07:00 AM</strong>.
                  </>
                ) : (
                  <>
                    <strong>Perhatian!</strong>
                    <br />
                    Pastikan <strong>Lokasi (GPS)</strong> dan <strong>Kamera</strong> telah diaktifkan sebelum melakukan
                    absensi. Batas waktu absensi masuk adalah <strong>pukul 07.00 WIB</strong>.
                  </>
                )}
              </div>
            </div>
          )}

          {/* Main Tab Views */}
          {activeTab === 'form' ? (
            <FormAbsensi lang={lang} />
          ) : activeTab === 'dashboard' ? (
            <DashboardAdmin lang={lang} />
          ) : (
            <LaporanAbsensi lang={lang} />
          )}
        </div>
      </div>

      {/* Admin / Teacher Password Modal */}
      {showPasswordModal && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowPasswordModal(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '380px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🔐</div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
                {isEn ? 'Authorized Access Only' : 'Akses Khusus Guru & Staf'}
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#64748b' }}>
                {isEn
                  ? 'Please enter password to view reports.'
                  : 'Masukkan password otorisasi untuk mengakses data laporan.'}
              </p>
            </div>

            <form onSubmit={handleVerifyPassword}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px', display: 'block' }}>
                  {isEn ? 'Password' : 'Password Akses'}
                </label>
                <input
                  type="password"
                  autoFocus
                  value={inputPassword}
                  onChange={(e) => setInputPassword(e.target.value)}
                  placeholder={isEn ? 'Enter password' : 'Masukkan password'}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
                {passwordError && (
                  <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '6px', fontWeight: 600 }}>
                    {passwordError}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  style={{
                    marginTop: 0,
                    padding: '12px',
                    background: '#f1f5f9',
                    color: '#475569',
                    boxShadow: 'none',
                    borderRadius: '12px',
                    flex: 1,
                  }}
                >
                  {isEn ? 'Cancel' : 'Batal'}
                </button>
                <button
                  type="submit"
                  style={{
                    marginTop: 0,
                    padding: '12px',
                    background: 'var(--primary)',
                    color: '#ffffff',
                    borderRadius: '12px',
                    flex: 1,
                  }}
                >
                  {isEn ? 'Unlock' : 'Masuk'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

