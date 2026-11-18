import { Cloud, HardDrive, Loader2 } from 'lucide-react';
import type { AppStateData } from '../types';

interface ConflictModalProps {
  open: boolean;
  resolving: boolean;
  localState: AppStateData;
  cloudState: AppStateData;
  userEmail: string;
  onUseCloud: () => void;
  onUploadLocal: () => void;
}

export function ConflictModal({
  open,
  resolving,
  localState,
  cloudState,
  userEmail,
  onUseCloud,
  onUploadLocal,
}: ConflictModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-1">
          Conflicto entre datos locales y de la nube
        </h2>
        <p className="text-sm text-slate-600 mb-5">
          La cuenta <span className="font-semibold text-slate-900">{userEmail}</span> ya tiene
          registros en la nube y también hay cambios guardados localmente en modo invitado.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
              <Cloud className="w-4 h-4 text-emerald-600" />
              <span>En la nube</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1 tabular-nums">
              <li>Productos: {cloudState.productos.length}</li>
              <li>Reparaciones: {cloudState.reparaciones.length}</li>
              <li>Ventas: {cloudState.historial.length}</li>
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
              <HardDrive className="w-4 h-4 text-slate-700" />
              <span>En este dispositivo</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-1 tabular-nums">
              <li>Productos: {localState.productos.length}</li>
              <li>Reparaciones: {localState.reparaciones.length}</li>
              <li>Ventas: {localState.historial.length}</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            disabled={resolving}
            onClick={onUseCloud}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
            <span>Usar datos de la nube</span>
          </button>

          <button
            type="button"
            disabled={resolving}
            onClick={onUploadLocal}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
          >
            {resolving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <HardDrive className="w-4 h-4" />
            )}
            <span>Subir datos locales a la nube</span>
          </button>
        </div>
      </div>
    </div>
  );
}
