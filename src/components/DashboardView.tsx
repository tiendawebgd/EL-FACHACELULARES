import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Eye,
  EyeOff,
  PackagePlus,
  Plus,
  ShoppingCart,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import type { Product, RepairOrder, SaleRecord } from '../types';
import { formatARS, formatARSCompact, getTodayISO } from '../utils/format';

interface DashboardViewProps {
  productos: Product[];
  reparaciones: RepairOrder[];
  historial: SaleRecord[];
  onOpenScannerMode: (mode: 'ENTRADA' | 'VENTA', preloadedCode?: string) => void;
}

const DISMISSED_SIG_KEY = 'facha_critical_dismissed_sig';

function readDismissedSignature(): string {
  try {
    return localStorage.getItem(DISMISSED_SIG_KEY) || '';
  } catch {
    return '';
  }
}

function writeDismissedSignature(sig: string): void {
  try {
    if (sig) {
      localStorage.setItem(DISMISSED_SIG_KEY, sig);
    } else {
      localStorage.removeItem(DISMISSED_SIG_KEY);
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

function parseSignature(sig: string): Map<string, number> {
  const map = new Map<string, number>();
  if (!sig) return map;
  for (const part of sig.split('|')) {
    if (!part) continue;
    const idx = part.lastIndexOf(':');
    if (idx > 0) {
      map.set(part.slice(0, idx), Number(part.slice(idx + 1)));
    }
  }
  return map;
}

export function DashboardView({
  productos,
  reparaciones,
  historial,
  onOpenScannerMode,
}: DashboardViewProps) {
  const todayISO = getTodayISO();
  const currentMonth = todayISO.slice(0, 7);

  const ventasHoy = useMemo(
    () =>
      historial
        .filter((h) => (h.fecha || '').startsWith(todayISO))
        .reduce((sum, h) => sum + (Number(h.total) || 0), 0),
    [historial, todayISO]
  );

  const repPendientes = useMemo(
    () => reparaciones.filter((r) => r.estado !== 'Retirado').length,
    [reparaciones]
  );

  const ingresosMes = useMemo(
    () =>
      historial
        .filter((h) => (h.fecha || '').startsWith(currentMonth))
        .reduce((sum, h) => sum + (Number(h.total) || 0), 0),
    [historial, currentMonth]
  );

  const criticalProducts = useMemo(
    () =>
      productos
        .filter((p) => p.stock < 3)
        .sort((a, b) => a.stock - b.stock || a.nombre.localeCompare(b.nombre)),
    [productos]
  );

  const agotados = useMemo(
    () => criticalProducts.filter((p) => p.stock <= 0),
    [criticalProducts]
  );

  const bajos = useMemo(
    () => criticalProducts.filter((p) => p.stock > 0 && p.stock < 3),
    [criticalProducts]
  );

  const [bannerExpanded, setBannerExpanded] = useState(false);
  const [dismissedSig, setDismissedSig] = useState<string>(() => readDismissedSignature());

  const currentSignature = useMemo(
    () =>
      [...criticalProducts]
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
        .map((p) => `${p.codigo}:${p.stock}`)
        .join('|'),
    [criticalProducts]
  );

  // Automatically re-open banner if a new product enters < 3 or an existing one drops further
  const hasNewOrWorsened = useMemo(() => {
    if (!dismissedSig || criticalProducts.length === 0) return false;
    const prevPairs = parseSignature(dismissedSig);
    return criticalProducts.some((p) => {
      const prevStock = prevPairs.get(p.codigo);
      return prevStock === undefined || p.stock < prevStock;
    });
  }, [criticalProducts, dismissedSig]);

  useEffect(() => {
    if (criticalProducts.length === 0 && dismissedSig) {
      setDismissedSig('');
      writeDismissedSignature('');
      return;
    }
    if (hasNewOrWorsened) {
      setDismissedSig('');
      writeDismissedSignature('');
    }
  }, [criticalProducts.length, dismissedSig, hasNewOrWorsened]);

  const isBannerDismissed = Boolean(dismissedSig) && !hasNewOrWorsened && criticalProducts.length > 0;
  const showBanner = criticalProducts.length > 0 && !isBannerDismissed;
  const visibleCriticalItems = bannerExpanded ? criticalProducts : criticalProducts.slice(0, 4);

  const handleDismissBanner = () => {
    setDismissedSig(currentSignature);
    writeDismissedSignature(currentSignature);
  };

  const handleReopenBanner = () => {
    setDismissedSig('');
    writeDismissedSignature('');
  };

  const ultimasReparaciones = useMemo(() => reparaciones.slice(-5).reverse(), [reparaciones]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Panel Principal
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenScannerMode('ENTRADA')}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Ingreso de Stock</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenScannerMode('VENTA')}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Egreso / Venta</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Ventas de hoy</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums truncate">
              {formatARS(ventasHoy)}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Reparaciones pendientes</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">
              {repPendientes}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 text-amber-700 shrink-0">
            <Wrench className="w-5 h-5" />
          </div>
        </div>

        <div
          className={`rounded-xl p-4 flex items-start justify-between gap-3 border ${
            criticalProducts.length > 0
              ? 'bg-red-50/70 border-red-300'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="min-w-0 flex-1">
            <p
              className={`text-xs font-semibold ${
                criticalProducts.length > 0 ? 'text-red-800' : 'text-slate-500'
              }`}
            >
              Aviso stock crítico
            </p>
            <p
              className={`text-2xl font-bold mt-1 tabular-nums ${
                criticalProducts.length > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {criticalProducts.length}
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs tabular-nums">
              <span className={criticalProducts.length > 0 ? 'text-red-800' : 'text-slate-500'}>
                {criticalProducts.length > 0
                  ? `${agotados.length} agot. · ${bajos.length} crít.`
                  : 'Stock en nivel óptimo'}
              </span>
              {isBannerDismissed && (
                <button
                  type="button"
                  onClick={handleReopenBanner}
                  className="inline-flex items-center gap-1 font-semibold text-red-700 hover:text-red-900 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Ver alerta</span>
                </button>
              )}
            </div>
          </div>
          <div
            className={`p-2.5 rounded-lg shrink-0 ${
              criticalProducts.length > 0
                ? 'bg-red-600 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Ingresos del mes</p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums truncate">
              {formatARS(ingresosMes)}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div
          className={`${
            isBannerDismissed ? 'lg:col-span-12' : 'lg:col-span-8'
          } bg-white border border-slate-200 rounded-xl p-5 min-w-0`}
        >
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Últimas Reparaciones Registradas
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[540px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-2.5 pr-3">Orden</th>
                  <th className="py-2.5 pr-3">Cliente</th>
                  <th className="py-2.5 pr-3">Equipo / Falla</th>
                  <th className="py-2.5 pr-3">Estado</th>
                  <th className="py-2.5 text-right">Presupuesto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {ultimasReparaciones.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500">
                      No hay reparaciones registradas.
                    </td>
                  </tr>
                ) : (
                  ultimasReparaciones.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {r.n_orden}
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-900">{r.cliente}</p>
                        <p className="text-xs text-slate-500">{r.telefono || '-'}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <p className="text-slate-900">{r.equipo}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[220px]">
                          {r.falla || '-'}
                        </p>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold ${
                            r.estado === 'Retirado'
                              ? 'text-emerald-700'
                              : r.estado === 'Listo para Entregar'
                              ? 'text-sky-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {r.estado}
                        </span>
                      </td>
                      <td className="py-3 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatARSCompact(r.presupuesto)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Critical Stock Alert Panel (< 3 units) in place of Repuestos con Poco Stock */}
        {!isBannerDismissed && (
          <section
            role={showBanner ? 'alert' : undefined}
            aria-live="polite"
            className={`lg:col-span-4 rounded-xl overflow-hidden min-w-0 border ${
              showBanner
                ? 'bg-white border-red-300'
                : 'bg-white border-slate-200'
            }`}
          >
            {showBanner ? (
              <>
                <div className="bg-red-50 px-4 py-3.5 border-b border-red-200 space-y-2.5">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 rounded-lg bg-red-600 text-white shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-bold text-red-950 truncate">
                          Alerta de stock crítico ({criticalProducts.length})
                        </h2>
                        <p className="text-xs text-red-800 tabular-nums">
                          Agotado (0 un.): {agotados.length} · Crítico (1–2 un.): {bajos.length}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleDismissBanner}
                      title="Ocultar alerta temporalmente"
                      className="px-2.5 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-100/70 text-xs font-semibold text-red-800 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      <span>Ocultar</span>
                    </button>
                  </div>

                  {criticalProducts.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setBannerExpanded((v) => !v)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-red-200 hover:bg-red-100/70 text-xs font-semibold text-red-900 inline-flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      {bannerExpanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Ver menos</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>Ver todos ({criticalProducts.length})</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-100">
                  {visibleCriticalItems.map((item) => {
                    const isOut = item.stock <= 0;
                    return (
                      <div
                        key={item.codigo}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {item.nombre}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs mt-0.5 tabular-nums">
                            <span className="font-mono text-slate-500">{item.codigo}</span>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span
                              className={
                                isOut ? 'text-red-700 font-bold' : 'text-amber-700 font-bold'
                              }
                            >
                              {isOut ? 'Agotado (0 un.)' : `Crítico (${item.stock} un.)`}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenScannerMode('ENTRADA', item.codigo)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer transition-colors"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                          <span>+ Reponer</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="text-base font-bold text-slate-900">Alerta de stock crítico</h2>
                  <span className="text-xs font-mono font-semibold text-emerald-700 tabular-nums">
                    0
                  </span>
                </div>
                <p className="py-6 text-center text-sm text-slate-500">
                  Todo en niveles óptimos.
                </p>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

