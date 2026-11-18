import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  FileSpreadsheet,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import type { PaymentMethod, SaleRecord } from '../types';
import { exportSalesExcel } from '../utils/excelExport';
import { formatARS } from '../utils/format';

interface SalesHistoryViewProps {
  historial: SaleRecord[];
  onUpdateSale: (index: number, updated: SaleRecord) => void;
  onDeleteSale: (index: number, restoreStock: boolean) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

function parseSaleTimestampMs(fechaStr: string): number {
  const normalized = (fechaStr || '').replace(' ', 'T');
  const ms = Date.parse(normalized);
  return Number.isNaN(ms) ? 0 : ms;
}

export function SalesHistoryView({
  historial,
  onUpdateSale,
  onDeleteSale,
  onNotify,
}: SalesHistoryViewProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Edit / Delete modal state
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editFecha, setEditFecha] = useState('');
  const [editDetalle, setEditDetalle] = useState('');
  const [editMetodo, setEditMetodo] = useState<PaymentMethod>('Efectivo');
  const [editDescuento, setEditDescuento] = useState('0');
  const [editTotal, setEditTotal] = useState('0');
  const [restoreStockOnDelete, setRestoreStockOnDelete] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Detect potential duplicate sales (same total + detail within 5 minutes)
  const duplicateIndices = useMemo(() => {
    const dupSet = new Set<number>();
    for (let i = 0; i < historial.length; i++) {
      const a = historial[i];
      const tA = parseSaleTimestampMs(a.fecha);
      for (let j = i + 1; j < historial.length; j++) {
        const b = historial[j];
        if (
          Math.abs((Number(a.total) || 0) - (Number(b.total) || 0)) < 0.01 &&
          (a.detalle || '').trim() === (b.detalle || '').trim()
        ) {
          const tB = parseSaleTimestampMs(b.fecha);
          if (tA > 0 && tB > 0 && Math.abs(tA - tB) <= 5 * 60 * 1000) {
            dupSet.add(i);
            dupSet.add(j);
          }
        }
      }
    }
    return dupSet;
  }, [historial]);

  const filteredEntries = useMemo(() => {
    const entries = historial.map((sale, originalIdx) => ({ sale, originalIdx }));
    return entries
      .filter(({ sale, originalIdx }) => {
        const day = (sale.fecha || '').slice(0, 10);
        const dateOk = (!dateFrom || day >= dateFrom) && (!dateTo || day <= dateTo);
        const dupOk = !onlyDuplicates || duplicateIndices.has(originalIdx);
        return dateOk && dupOk;
      })
      .reverse();
  }, [historial, dateFrom, dateTo, onlyDuplicates, duplicateIndices]);

  const openManageModal = (originalIdx: number) => {
    const sale = historial[originalIdx];
    if (!sale) return;
    setSelectedIndex(originalIdx);
    setEditFecha(sale.fecha);
    setEditDetalle(sale.detalle);
    setEditMetodo((sale.metodo_pago as PaymentMethod) || 'Efectivo');
    setEditDescuento(String(sale.descuento ?? 0));
    setEditTotal(String(sale.total ?? 0));
    setRestoreStockOnDelete(true);
    setConfirmingDelete(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIndex === null) return;
    const original = historial[selectedIndex];
    if (!original) return;

    onUpdateSale(selectedIndex, {
      ...original,
      fecha: editFecha.trim() || original.fecha,
      detalle: editDetalle.trim() || original.detalle,
      metodo_pago: editMetodo,
      descuento: Math.max(0, Number(editDescuento) || 0),
      total: Math.max(0, Number(editTotal) || 0),
    });
    setSelectedIndex(null);
  };

  const handleDelete = () => {
    if (selectedIndex === null) return;
    onDeleteSale(selectedIndex, restoreStockOnDelete);
    setSelectedIndex(null);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportSalesExcel(
        filteredEntries.map((e) => e.sale),
        dateFrom,
        dateTo
      );
      onNotify('success', 'Excel generado', 'Se descargó el historial de ventas.');
    } catch {
      onNotify('error', 'Error al exportar', 'No se pudo generar el archivo de Excel.');
    } finally {
      setExporting(false);
    }
  };

  const selectedSale = selectedIndex !== null ? historial[selectedIndex] : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Historial de Ventas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {filteredEntries.length} ventas mostradas
          </p>
        </div>

        <button
          type="button"
          disabled={exporting}
          onClick={() => void handleExport()}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="w-4 h-4" />
          )}
          <span>Exportar Excel</span>
        </button>
      </div>

      {/* Duplicate alert */}
      {duplicateIndices.size > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-sm text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Se detectaron <strong className="tabular-nums">{duplicateIndices.size}</strong>{' '}
              ventas con posible duplicación (mismo importe y detalle en menos de 5 min).
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOnlyDuplicates((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              onlyDuplicates
                ? 'bg-amber-600 text-white'
                : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/70'
            }`}
          >
            {onlyDuplicates ? 'Ver todas las ventas' : 'Revisar duplicados'}
          </button>
        </div>
      )}

      {/* Date Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
            />
          </div>
          {(dateFrom || dateTo || onlyDuplicates) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setOnlyDuplicates(false);
              }}
              className="px-3 py-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[740px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 pr-3">N° Recibo</th>
                <th className="py-2.5 pr-3">Fecha y hora</th>
                <th className="py-2.5 pr-3">Detalle</th>
                <th className="py-2.5 pr-3">Método de pago</th>
                <th className="py-2.5 pr-3 text-right">Monto total</th>
                <th className="py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No hay ventas registradas para el criterio seleccionado.
                  </td>
                </tr>
              ) : (
                filteredEntries.map(({ sale, originalIdx }) => {
                  const isDup = duplicateIndices.has(originalIdx);
                  return (
                    <tr
                      key={`${sale.id || sale.n_recibo}-${originalIdx}`}
                      className={
                        isDup ? 'bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-3 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {sale.n_recibo}
                        {isDup && (
                          <span className="block text-[11px] font-sans font-semibold text-amber-700">
                            Posible duplicado
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {sale.fecha}
                      </td>
                      <td className="py-3 pr-3 text-slate-800 max-w-[320px]">
                        <p className="line-clamp-2 break-words">{sale.detalle}</p>
                      </td>
                      <td className="py-3 pr-3 text-slate-700 whitespace-nowrap">
                        {sale.metodo_pago}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatARS(sale.total)}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openManageModal(originalIdx)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Editar / Eliminar</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Delete Sale Modal */}
      {selectedSale && selectedIndex !== null && (
        <div className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[92dvh] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-base">
                Gestionar venta {selectedSale.n_recibo}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedIndex(null)}
                className="p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha y hora
                  </label>
                  <input
                    type="text"
                    value={editFecha}
                    onChange={(e) => setEditFecha(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Método de pago
                  </label>
                  <select
                    value={editMetodo}
                    onChange={(e) => setEditMetodo(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                    <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Detalle
                </label>
                <textarea
                  rows={3}
                  value={editDetalle}
                  onChange={(e) => setEditDetalle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Descuento ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editDescuento}
                    onChange={(e) => setEditDescuento(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Monto total ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editTotal}
                    onChange={(e) => setEditTotal(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm tabular-nums"
                  />
                </div>
              </div>

              {/* Delete box */}
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-3.5 space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restoreStockOnDelete}
                    onChange={(e) => setRestoreStockOnDelete(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600 rounded"
                  />
                  <span>Devolver stock al inventario al eliminar esta venta</span>
                </label>

                {!confirmingDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-red-300 hover:bg-red-100 text-red-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar venta</span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-red-800">
                      ¿Confirmás eliminar este recibo?
                    </span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      Sí, eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIndex(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
