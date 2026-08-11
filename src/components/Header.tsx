import React from 'react';
import { Language } from '../types';

interface HeaderProps {
  lang: Language;
  onToggleLang: () => void;
}

export const Header: React.FC<HeaderProps> = ({ lang, onToggleLang }) => {
  const today = new Date();
  const dateStrID = today.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const dateStrEN = today.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      {/* Floating Animated Emojis */}
      <div className="deco book">📚</div>
      <div className="deco clock">⏰</div>
      <div className="deco bag">🎒</div>
      <div className="deco calc">🧮</div>

      <div className="app-header no-print">
        <div className="top-bar">
          <button className="lang-toggle" onClick={onToggleLang} type="button">
            🌐 {lang === 'id' ? 'ID' : 'EN'}
          </button>
          <div className="status-badge">
            <span>↓↑ Online</span>
          </div>
        </div>
        <div className="profile-info">
          <img
            src="/logo.png"
            alt="Logo SMKN Bojonggambir"
            className="logo-img"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://raw.githubusercontent.com/smknbojonggambir/Absensi-Siswa/main/public/logo.png';
            }}
          />
          <div>
            <h1 className="school-title">
              Absensi Siswa<br />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>SMKN Bojonggambir</span>
            </h1>
            <div className="school-subtitle">
              {lang === 'id' ? dateStrID : dateStrEN}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
