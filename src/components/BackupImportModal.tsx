import { AlertTriangle, CheckCircle2, CloudUpload, Loader2, Upload, X } from 'lucide-react';
import type { ParsedBackupResult } from '../utils/backupImport';

interface BackupImportModalProps {
  open: boolean;
  fileName: string;
  parsed: ParsedBackupResult | null;
  hasExistingData: boolean;
  isCloudConnected: boolean;
  importing: boolean;
  onReplace: () => void;
  onMerge: () => void;
  onClose: () => void;
}

export function BackupImportModal({
  open,
  fileName,
  parsed,
  hasExistingData,
  isCloudConnected,
  importing,
  onReplace,
  onMerge,
  onClose,
}: BackupImportModalProps) {
  if (!open || !parsed) return null;

  const { state, backupDate, backupSource } = parsed;
  const formattedDate = (() => {
    if (!backupDate) return null;
    const d = new Date(backupDate);
    if (Number.isNaN(d.getTime())) return backupDate;
    return d.toLocaleString('es-AR');
  })();

  return (
    <div className="fixed inset-0 z-[85] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md max-h-[92dvh] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Upload className="w-4 h-4 text-emerald-400 shrink-0" />
            <h2 className="font-bold text-base truncate">Subir copia de seguridad</h2>
          </div>
          <button
            type="button"
            disabled={importing}
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1">
            <p className="text-xs font-semibold text-slate-500">Archivo seleccionado</p>
            <p className="text-sm font-bold text-slate-900 break-all">{fileName}</p>
            {(formattedDate || backupSource) && (
              <p className="text-xs text-slate-600">
                {formattedDate ? `Fecha: ${formattedDate}` : ''}
                {formattedDate && backupSource ? ' · ' : ''}
                {backupSource ? `Origen: ${backupSource}` : ''}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xl font-bold text-slate-900 tabular-nums">
                {state.productos.length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Productos</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xl font-bold text-slate-900 tabular-nums">
                {state.reparaciones.length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Reparaciones</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xl font-bold text-slate-900 tabular-nums">
                {state.historial.length}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">Ventas</p>
            </div>
          </div>

          {isCloudConnected ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 flex items-center gap-2 text-xs text-emerald-900">
              <CloudUpload className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Los datos importados se guardarán automáticamente en tu cuenta de Google.</span>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-100 border border-slate-200 px-3.5 py-2.5 flex items-center gap-2 text-xs text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-slate-600 shrink-0" />
              <span>Se restaurarán en este dispositivo (luego podés subirlos iniciando sesión con Google).</span>
            </div>
          )}

          {hasExistingData && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 flex items-start gap-2 text-xs text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Ya tenés datos cargados. Podés combinarlos con la copia o reemplazarlos por completo.
              </span>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={importing}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold text-slate-700 cursor-pointer disabled:opacity-50"
          >
            Cancelar
          </button>

          {hasExistingData && (
            <button
              type="button"
              disabled={importing}
              onClick={onMerge}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Combinar datos</span>
            </button>
          )}

          <button
            type="button"
            disabled={importing}
            onClick={onReplace}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
          >
            {importing && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{hasExistingData ? 'Reemplazar actuales' : 'Restaurar copia'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
