import { useMemo } from 'react';
import { Package, TrendingUp, Wallet, Wrench } from 'lucide-react';
import type { Product, RepairOrder, SaleRecord } from '../types';
import { formatARS, formatARSCompact } from '../utils/format';

interface BalanceViewProps {
  productos: Product[];
  reparaciones: RepairOrder[];
  historial: SaleRecord[];
}

interface ProductSalesAgg {
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
}

export function BalanceView({ productos, reparaciones, historial }: BalanceViewProps) {
  const analytics = useMemo(() => {
    const productByCode = new Map<string, Product>();
    const productByName = new Map<string, Product>();
    for (const p of productos) {
      productByCode.set(p.codigo.trim(), p);
      productByName.set(p.nombre.trim().toLowerCase(), p);
    }

    // Capital in current inventory + repair parts cost
    const stockCapital = productos.reduce((sum, p) => sum + p.costo * p.stock, 0);
    const repairPartsCost = reparaciones.reduce(
      (sum, r) => sum + (Number(r.costo_repuesto) || 0),
      0
    );
    const totalInvested = stockCapital + repairPartsCost;

    // Product sales revenue, cost of goods sold, and net profit from actual sales history
    const soldByCode = new Map<string, ProductSalesAgg>();
    let productSalesRevenue = 0;
    let cogs = 0;
    let totalUnitsSold = 0;
    let unmatchedProductRevenue = 0;
    let unmatchedProductCost = 0;
    let unmatchedUnits = 0;

    const addSaleLine = (
      codeKey: string | undefined,
      qty: number,
      lineRevenue: number,
      unitCost: number
    ) => {
      const lineCost = unitCost * qty;
      const lineProfit = lineRevenue - lineCost;
      productSalesRevenue += lineRevenue;
      cogs += lineCost;
      totalUnitsSold += qty;

      if (codeKey && productByCode.has(codeKey)) {
        const prev = soldByCode.get(codeKey) || { qty: 0, revenue: 0, cost: 0, profit: 0 };
        prev.qty += qty;
        prev.revenue += lineRevenue;
        prev.cost += lineCost;
        prev.profit += lineProfit;
        soldByCode.set(codeKey, prev);
      } else {
        unmatchedUnits += qty;
        unmatchedProductRevenue += lineRevenue;
        unmatchedProductCost += lineCost;
      }
    };

    for (const sale of historial) {
      if (Array.isArray(sale.items) && sale.items.length > 0) {
        const discount = Number(sale.descuento) || 0;
        const rawSub = sale.items.reduce((s, it) => s + it.precio * it.cantidad, 0);
        const factor = rawSub > 0 ? Math.max(0, (rawSub - discount) / rawSub) : 1;

        for (const it of sale.items) {
          if (it.es_reparacion) {
            continue;
          }
          const matchedProd =
            (it.codigo ? productByCode.get(it.codigo.trim()) : undefined) ??
            productByName.get(it.nombre.trim().toLowerCase());
          const unitCost =
            typeof it.costo === 'number' && it.costo > 0 ? it.costo : matchedProd?.costo ?? 0;
          const lineRev = it.precio * it.cantidad * factor;
          addSaleLine(matchedProd?.codigo.trim(), it.cantidad, lineRev, unitCost);
        }
      } else {
        // Legacy sale without structured items array: skip pure repair entries to avoid double counting
        const detailLower = (sale.detalle || '').trim().toLowerCase();
        if (detailLower.startsWith('retiro reparación') || detailLower.startsWith('reparación ord-')) {
          continue;
        }

        const saleTotal = Number(sale.total) || 0;
        const segments = (sale.detalle || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        const parsedSegments: { prod?: Product; qty: number; rawTotal: number }[] = [];

        for (const seg of segments) {
          const m = /^(\d+)x\s+(.+)$/i.exec(seg);
          if (m) {
            const qty = Math.max(1, Number(m[1]) || 1);
            const nameKey = m[2].trim().toLowerCase();
            const prod = productByName.get(nameKey);
            parsedSegments.push({ prod, qty, rawTotal: (prod?.precio ?? 0) * qty });
          }
        }

        const sumKnown = parsedSegments.reduce((s, x) => s + x.rawTotal, 0);
        if (parsedSegments.length > 0 && sumKnown > 0) {
          for (const seg of parsedSegments) {
            const shareRev = (seg.rawTotal / sumKnown) * saleTotal;
            addSaleLine(seg.prod?.codigo.trim(), seg.qty, shareRev, seg.prod?.costo ?? 0);
          }
        } else {
          addSaleLine(undefined, 1, saleTotal, 0);
        }
      }
    }

    const productNetProfit = productSalesRevenue - cogs;

    // Technical service revenue & profit
    const repairRevenue = reparaciones.reduce((sum, r) => {
      const paid = r.estado === 'Retirado' ? r.presupuesto : r.senia;
      return sum + (Number(paid) || 0);
    }, 0);
    const repairNetProfit = repairRevenue - repairPartsCost;

    const totalRevenue = productSalesRevenue + repairRevenue;
    const netProfit = productNetProfit + repairNetProfit;

    return {
      stockCapital,
      repairPartsCost,
      totalInvested,
      totalRevenue,
      netProfit,
      productSalesRevenue,
      cogs,
      productNetProfit,
      totalUnitsSold,
      repairRevenue,
      repairNetProfit,
      soldByCode,
      unmatchedUnits,
      unmatchedProductRevenue,
      unmatchedProductProfit: unmatchedProductRevenue - unmatchedProductCost,
    };
  }, [productos, reparaciones, historial]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
        Balance y Ganancias
      </h1>

      {/* 3 Primary Financial KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">
              Total invertido (stock + repuestos)
            </p>
            <p className="text-2xl font-bold text-red-700 mt-1 tabular-nums truncate">
              {formatARS(analytics.totalInvested)}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              Stock: {formatARSCompact(analytics.stockCapital)} · Repuestos:{' '}
              {formatARSCompact(analytics.repairPartsCost)}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-red-50 text-red-600 shrink-0">
            <Wallet className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">
              Total ingresos (ventas + reparaciones)
            </p>
            <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums truncate">
              {formatARS(analytics.totalRevenue)}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              Productos: {formatARSCompact(analytics.productSalesRevenue)} · Serv. Técnico:{' '}
              {formatARSCompact(analytics.repairRevenue)}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-100 text-slate-700 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Ganancia neta real</p>
            <p
              className={`text-2xl font-bold mt-1 tabular-nums truncate ${
                analytics.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatARS(analytics.netProfit)}
            </p>
            <p className="text-xs text-slate-500 mt-1 tabular-nums">
              Productos: {formatARSCompact(analytics.productNetProfit)} · Serv. Técnico:{' '}
              {formatARSCompact(analytics.repairNetProfit)}
            </p>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Technical Service Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="w-4 h-4 text-amber-600" />
          <h2 className="text-base font-bold text-slate-900">Desglose de Servicio Técnico</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 pr-3">Orden</th>
                <th className="py-2.5 pr-3">Equipo</th>
                <th className="py-2.5 pr-3">Estado</th>
                <th className="py-2.5 pr-3 text-right">Ingresado</th>
                <th className="py-2.5 pr-3 text-right">Costo repuesto</th>
                <th className="py-2.5 text-right">Ganancia real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {reparaciones.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No hay reparaciones registradas.
                  </td>
                </tr>
              ) : (
                reparaciones.map((r) => {
                  const ingreso = r.estado === 'Retirado' ? r.presupuesto : r.senia;
                  const costoRep = Number(r.costo_repuesto) || 0;
                  const ganancia = ingreso - costoRep;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {r.n_orden}
                      </td>
                      <td className="py-3 pr-3 font-medium text-slate-900">{r.equipo}</td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <span
                          className={`text-xs font-semibold ${
                            r.estado === 'Retirado' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {r.estado}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {formatARS(ingreso)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono tabular-nums text-red-700 whitespace-nowrap">
                        {formatARS(costoRep)}
                      </td>
                      <td
                        className={`py-3 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                          ganancia >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {formatARS(ganancia)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {reparaciones.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-bold">
                  <td colSpan={3} className="py-3 pr-3 text-slate-900">
                    TOTAL SERVICIO TÉCNICO
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {formatARS(analytics.repairRevenue)}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums text-red-700 whitespace-nowrap">
                    {formatARS(analytics.repairPartsCost)}
                  </td>
                  <td
                    className={`py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                      analytics.repairNetProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {formatARS(analytics.repairNetProfit)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Inventory & Products Breakdown */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-4 h-4 text-slate-700" />
          <h2 className="text-base font-bold text-slate-900">
            Desglose de Inventario y Ventas por Producto
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 pr-3">Código</th>
                <th className="py-2.5 pr-3">Producto</th>
                <th className="py-2.5 pr-3 text-right">Stock</th>
                <th className="py-2.5 pr-3 text-right">Costo unit.</th>
                <th className="py-2.5 pr-3 text-right">Precio venta</th>
                <th className="py-2.5 pr-3 text-right">Inversión stock</th>
                <th className="py-2.5 pr-3 text-right">Vendido (real)</th>
                <th className="py-2.5 text-right">Ganancia neta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {productos.length === 0 && analytics.unmatchedProductRevenue === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No hay productos registrados.
                  </td>
                </tr>
              ) : (
                <>
                  {productos.map((p) => {
                    const inv = p.costo * p.stock;
                    const sold = analytics.soldByCode.get(p.codigo.trim());
                    const realProfit = sold ? sold.profit : 0;
                    const unitMargin = p.precio - p.costo;
                    return (
                      <tr key={p.codigo} className="hover:bg-slate-50/70">
                        <td className="py-3 pr-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {p.codigo}
                        </td>
                        <td className="py-3 pr-3 font-semibold text-slate-900">{p.nombre}</td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {p.stock} un.
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatARSCompact(p.costo)}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="text-slate-900">{formatARSCompact(p.precio)}</span>
                          <span className="block text-[11px] text-slate-400">
                            Margen: {formatARSCompact(unitMargin)}/u
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {formatARS(inv)}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {sold ? `${sold.qty} un. (${formatARSCompact(sold.revenue)})` : '-'}
                        </td>
                        <td
                          className={`py-3 text-right font-mono font-bold tabular-nums whitespace-nowrap ${
                            !sold
                              ? 'text-slate-400 font-normal'
                              : realProfit >= 0
                              ? 'text-emerald-700'
                              : 'text-red-700'
                          }`}
                        >
                          {formatARS(realProfit)}
                        </td>
                      </tr>
                    );
                  })}

                  {analytics.unmatchedProductRevenue > 0 && (
                    <tr className="bg-slate-50/50 text-slate-600">
                      <td className="py-3 pr-3 font-mono text-xs">-</td>
                      <td className="py-3 pr-3 font-medium">
                        Ventas sin producto activo en inventario
                      </td>
                      <td className="py-3 pr-3 text-right font-mono">-</td>
                      <td className="py-3 pr-3 text-right font-mono">-</td>
                      <td className="py-3 pr-3 text-right font-mono">-</td>
                      <td className="py-3 pr-3 text-right font-mono">{formatARS(0)}</td>
                      <td className="py-3 pr-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {analytics.unmatchedUnits} un. (
                        {formatARSCompact(analytics.unmatchedProductRevenue)})
                      </td>
                      <td className="py-3 text-right font-mono font-bold tabular-nums text-emerald-700 whitespace-nowrap">
                        {formatARS(analytics.unmatchedProductProfit)}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
            {(productos.length > 0 || analytics.unmatchedProductRevenue > 0) && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-bold">
                  <td colSpan={5} className="py-3 pr-3 text-slate-900">
                    TOTAL PRODUCTOS
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {formatARS(analytics.stockCapital)}
                  </td>
                  <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {analytics.totalUnitsSold} un. ({formatARSCompact(analytics.productSalesRevenue)})
                  </td>
                  <td
                    className={`py-3 text-right font-mono tabular-nums whitespace-nowrap ${
                      analytics.productNetProfit >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {formatARS(analytics.productNetProfit)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
