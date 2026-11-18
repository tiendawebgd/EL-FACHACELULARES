import { Loader2, User } from 'lucide-react';
import type { RememberedGoogleUser } from '../types';
import { BrandLogo } from './BrandLogo';

interface WelcomeModalProps {
  open: boolean;
  loading: boolean;
  error: string | null;
  rememberedUser: RememberedGoogleUser | null;
  onGoogleLogin: (forceSelectAccount?: boolean) => void;
  onGuestEnter: () => void;
}

export function WelcomeModal({
  open,
  loading,
  error,
  rememberedUser,
  onGoogleLogin,
  onGuestEnter,
}: WelcomeModalProps) {
  if (!open) return null;

  const firstName = rememberedUser?.displayName?.split(' ')[0] || rememberedUser?.email || 'Usuario';

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 sm:p-8 text-center">
        <div className="mx-auto mb-4 flex justify-center">
          <BrandLogo variant="mascot" className="w-20 h-20 object-contain" />
        </div>

        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mb-6">
          ¡Bienvenido a El Facha Celulares!
        </h1>

        <div className="flex flex-col gap-3">
          {rememberedUser ? (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => onGoogleLogin(false)}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 font-semibold text-sm flex items-center justify-center gap-3 shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                ) : rememberedUser.photoURL ? (
                  <img
                    src={rememberedUser.photoURL}
                    alt={rememberedUser.displayName}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                ) : (
                  <GoogleIcon />
                )}
                <span className="truncate">Continuar como {firstName}</span>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => onGoogleLogin(true)}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <GoogleIcon />
                <span>Usar otra cuenta</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={loading}
              onClick={() => onGoogleLogin(true)}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-900 font-semibold text-sm flex items-center justify-center gap-3 shadow-xs transition-colors disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
              ) : (
                <GoogleIcon />
              )}
              <span>Iniciar sesión con Google</span>
            </button>
          )}

          {error && (
            <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={onGuestEnter}
            className="w-full min-h-[44px] mt-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
          >
            <User className="w-4 h-4" />
            <span>Entrar como Invitado</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}
