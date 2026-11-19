import { useEffect, useRef, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  CloudDownload,
  CloudUpload,
  Download,
  Loader2,
  LogOut,
  RefreshCw,
  Upload,
  User as UserIcon,
} from 'lucide-react';
import type { AuthMode } from '../types';

interface UserProfileMenuProps {
  authMode: AuthMode;
  firebaseUser: FirebaseUser | null;
  syncingCloud: boolean;
  restoringCloud?: boolean;
  lastCloudBackupAt?: string | null;
  onSaveToCloud: () => void;
  onRestoreFromCloud: () => void;
  onDownloadJson: () => void;
  onRestoreJson: (file: File) => void;
  onSwitchAccount: () => void;
  onSignOut: () => void;
}

export function UserProfileMenu({
  authMode,
  firebaseUser,
  syncingCloud,
  restoringCloud = false,
  lastCloudBackupAt = null,
  onSaveToCloud,
  onRestoreFromCloud,
  onDownloadJson,
  onRestoreJson,
  onSwitchAccount,
  onSignOut,
}: UserProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const [imgError, setImgError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCloudConnected = authMode === 'google' && Boolean(firebaseUser);
  const resolvedEmail =
    firebaseUser?.email || firebaseUser?.providerData?.[0]?.email || '';
  const resolvedName =
    firebaseUser?.displayName || firebaseUser?.providerData?.[0]?.displayName || '';
  const resolvedPhoto =
    firebaseUser?.photoURL || firebaseUser?.providerData?.[0]?.photoURL || '';
  const displayName = isCloudConnected
    ? resolvedName || resolvedEmail.split('@')[0] || 'Usuario'
    : 'Invitado';
  const email = isCloudConnected ? resolvedEmail : '';
  const photoURL = isCloudConnected && !imgError ? resolvedPhoto : '';

  useEffect(() => {
    setImgError(false);
  }, [firebaseUser?.photoURL]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="fixed bottom-4 left-4 z-[60]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onRestoreJson(file);
            setOpen(false);
          }
          e.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Configuración de usuario (${displayName})`}
        title={displayName}
        className="w-12 h-12 rounded-full overflow-hidden bg-slate-900 text-slate-200 flex items-center justify-center shadow-xl ring-2 ring-white/90 border border-slate-700 hover:scale-105 active:scale-95 transition-transform cursor-pointer focus:outline-none focus-visible:ring-emerald-400"
      >
        {photoURL ? (
          <img
            src={photoURL}
            alt={displayName}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <UserIcon className="w-5 h-5" />
        )}
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-3 z-[75] w-72 max-w-[calc(100vw-2rem)] max-h-[80dvh] overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 text-slate-900">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            {photoURL ? (
              <img
                src={photoURL}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-11 h-11 rounded-full object-cover border border-slate-200 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200 shrink-0">
                <UserIcon className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
              {email && <p className="text-xs text-slate-500 truncate">{email}</p>}
              <p
                className={`text-xs font-medium mt-0.5 ${
                  isCloudConnected ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                {isCloudConnected ? 'Conectado a la nube' : 'No conectado a la nube'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 py-3">
            <button
              type="button"
              disabled={syncingCloud || restoringCloud}
              onClick={() => {
                onSaveToCloud();
                if (!isCloudConnected) setOpen(false);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {syncingCloud ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CloudUpload className="w-4 h-4" />
              )}
              <span>Guardar en la nube</span>
            </button>

            <button
              type="button"
              disabled={syncingCloud || restoringCloud}
              onClick={() => {
                onRestoreFromCloud();
                setOpen(false);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {restoringCloud ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <CloudDownload className="w-4 h-4 text-emerald-600" />
              )}
              <span>Restablecer copia en la nube</span>
            </button>

            {isCloudConnected && lastCloudBackupAt && (
              <p className="text-[11px] text-slate-500 text-center tabular-nums">
                Última copia:{' '}
                {(() => {
                  const d = new Date(lastCloudBackupAt);
                  return Number.isNaN(d.getTime())
                    ? lastCloudBackupAt
                    : d.toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                })()}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                onDownloadJson();
                setOpen(false);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Descargar JSON</span>
            </button>
          </div>

          <div className="pt-2 border-t border-slate-100 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-2.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Subir copia JSON (Netlify / Local)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSwitchAccount();
              }}
              className="w-full px-2.5 py-2 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Cambiar de cuenta</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="w-full px-2.5 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
