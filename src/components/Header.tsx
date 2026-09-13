import React, { useState, useEffect } from 'react';
import { Language } from '../types';

interface HeaderProps {
  lang: Language;
  onToggleLang: () => void;
}

export const Header: React.FC<HeaderProps> = ({ lang, onToggleLang }) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
    <header className="app-header no-print" id="main-app-header">
      <div className="top-bar">
        <div className="flex items-center gap-2">
          <span className="npsn-badge">NPSN: 69989796</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="lang-toggle text-xs font-semibold py-1 px-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            onClick={onToggleLang}
            type="button"
            title="Ganti Bahasa"
            id="btn-lang-toggle"
          >
            🌐 {lang === 'id' ? 'ID' : 'EN'}
          </button>
          <div
            className={`status-badge flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-all ${
              isOnline
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
            }`}
            id="network-status-indicator"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
              }`}
            />
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>
      </div>

      <div className="profile-info mt-2">
        <div className="relative">
          <img
            src="/logo.png"
            alt="Logo SMKN Bojonggambir"
            loading="lazy"
            decoding="async"
            className="logo-img w-14 h-14 object-contain filter drop-shadow-md"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgz1tbb8TSawO2lHGi_GXN3Il5CtrN_K125hSy7D8NxvBFL6bywiebvkalj_6oRIBVxEm_zj84j6ZAlhKmaEOqjIeGHXe9SWw0HQipKs3aL8iy7K1Dc_Pd9SHMVZsOQrb99qTK78Wmee7StIKKzzfST5YU_CkGSAz3MuMJsrSL_nHt37c5AzIe8B7HodnQ/s320/LOGO%20SMKN%20BOJONGGAMBIR.png';
            }}
          />
        </div>
        <div>
          <h1 className="school-title text-lg font-bold text-white tracking-tight leading-tight">
            SIMAGU Presensi<br />
            <span className="text-sm font-medium text-blue-200">SMK NEGERI BOJONGGAMBIR</span>
          </h1>
          <div className="school-subtitle text-xs text-blue-100/80 font-normal mt-0.5">
            {lang === 'id' ? dateStrID : dateStrEN}
          </div>
        </div>
      </div>
    </header>
  );
};

