import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 right-4 z-[90] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm max-h-[85dvh] overflow-y-auto pointer-events-none"
    >
      {toasts.map((toast) => {
        const icon =
          toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          ) : toast.type === 'warning' ? (
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          ) : (
            <Info className="w-5 h-5 text-slate-600 shrink-0" />
          );

        const borderClass =
          toast.type === 'success'
            ? 'border-emerald-200'
            : toast.type === 'error'
            ? 'border-red-200'
            : toast.type === 'warning'
            ? 'border-amber-200'
            : 'border-slate-200';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 bg-white border ${borderClass} rounded-xl p-3.5 shadow-lg`}
          >
            {icon}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 leading-snug break-words">
                {toast.title}
              </p>
              {toast.message && (
                <p className="text-xs text-slate-600 mt-0.5 break-words">{toast.message}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar notificación"
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
