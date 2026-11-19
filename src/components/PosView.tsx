import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Minus,
  Plus,
  QrCode,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import type { PaymentMethod, Product, RepairOrder, SaleLineItem } from '../types';
import { formatARS, formatARSCompact, playScanBeep } from '../utils/format';
import { BarcodeCamera } from './BarcodeCamera';

interface PosViewProps {
  productos: Product[];
  reparaciones: RepairOrder[];
  gunDetected?: boolean;
  onCheckout: (payload: {
    items: SaleLineItem[];
    descuento: number;
    metodoPago: PaymentMethod;
    pagaCon: number;
  }) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
  onRegisterScanHandler?: (fn: ((code: string) => void) | null) => void;
}

export function PosView({
  productos,
  reparaciones,
  gunDetected = false,
  onCheckout,
  onNotify,
  onRegisterScanHandler,
}: PosViewProps) {
  const [tab, setTab] = useState<'productos' | 'reparaciones'>('productos');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  const [cart, setCart] = useState<SaleLineItem[]>([]);
  const [descuento, setDescuento] = useState('0');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('Efectivo');
  const [pagaCon, setPagaCon] = useState('0');

  const addProductToCart = useCallback(
    (prod: Product) => {
      if (prod.stock < 1) {
        playScanBeep('error');
        onNotify('error', 'Sin stock', `${prod.nombre} está agotado.`);
        return;
      }

      setCart((prev) => {
        const existing = prev.find((i) => !i.es_reparacion && i.codigo === prod.codigo);
        if (existing) {
          if (existing.cantidad + 1 > prod.stock) {
            playScanBeep('error');
            onNotify('warning', 'Stock insuficiente', `Disponible: ${prod.stock} un.`);
            return prev;
          }
          playScanBeep('success');
          return prev.map((i) =>
            !i.es_reparacion && i.codigo === prod.codigo
              ? { ...i, cantidad: i.cantidad + 1 }
              : i
          );
        }
        playScanBeep('success');
        return [
          ...prev,
          {
            codigo: prod.codigo,
            nombre: prod.nombre,
            precio: prod.precio,
            costo: prod.costo,
            cantidad: 1,
            es_reparacion: false,
          },
        ];
      });
    },
    [onNotify]
  );

  const handleBarcodeLookup = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      const prod = productos.find((p) => String(p.codigo) === code);
      if (prod) {
        addProductToCart(prod);
        return;
      }
      const rep = reparaciones.find(
        (r) => r.estado !== 'Retirado' && r.n_orden.toLowerCase() === code.toLowerCase()
      );
      if (rep) {
        setCart((prev) => {
          if (prev.some((i) => i.es_reparacion && i.id === rep.id)) {
            onNotify('warning', 'Ya agregada', `${rep.n_orden} ya está en el carrito.`);
            return prev;
          }
          playScanBeep('success');
          return [
            ...prev,
            {
              id: rep.id,
              n_orden: rep.n_orden,
              nombre: `Reparación ${rep.n_orden} (${rep.equipo})`,
              precio: Math.max(0, rep.presupuesto - rep.senia),
              cantidad: 1,
              es_reparacion: true,
            },
          ];
        });
        return;
      }

      playScanBeep('error');
      onNotify('error', 'Código no encontrado', `No existe ningún producto con código ${code}.`);
    },
    [productos, reparaciones, addProductToCart, onNotify]
  );

  // Register POS barcode lookup with the app-wide automatic barcode gun detector
  useEffect(() => {
    if (!onRegisterScanHandler) return;
    onRegisterScanHandler(handleBarcodeLookup);
    return () => onRegisterScanHandler(null);
  }, [onRegisterScanHandler, handleBarcodeLookup]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return productos.filter(
      (p) =>
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q)
    );
  }, [productos, searchQuery]);

  const filteredRepairs = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return reparaciones
      .filter((r) => r.estado !== 'Retirado')
      .filter(
        (r) =>
          !q ||
          r.n_orden.toLowerCase().includes(q) ||
          r.cliente.toLowerCase().includes(q) ||
          r.equipo.toLowerCase().includes(q)
      );
  }, [reparaciones, searchQuery]);

  const addRepairToCart = (r: RepairOrder) => {
    if (cart.some((i) => i.es_reparacion && i.id === r.id)) {
      onNotify('warning', 'Ya agregada', `La orden ${r.n_orden} ya está en el carrito.`);
      return;
    }
    const saldo = Math.max(0, r.presupuesto - r.senia);
    setCart((prev) => [
      ...prev,
      {
        id: r.id,
        n_orden: r.n_orden,
        nombre: `Reparación ${r.n_orden} (${r.equipo})`,
        precio: saldo,
        cantidad: 1,
        es_reparacion: true,
      },
    ]);
  };

  const updateCartQty = (idx: number, nextQty: number) => {
    const target = cart[idx];
    if (!target || target.es_reparacion) return;
    const prod = productos.find((p) => p.codigo === target.codigo);
    const maxStock = prod?.stock ?? nextQty;
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((_, i) => i !== idx));
      return;
    }
    if (nextQty > maxStock) {
      onNotify('warning', 'Stock insuficiente', `Disponible: ${maxStock} un.`);
      return;
    }
    setCart((prev) => prev.map((it, i) => (i === idx ? { ...it, cantidad: nextQty } : it)));
  };

  const subtotal = cart.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const descNum = Math.max(0, Number(descuento) || 0);
  const total = Math.max(0, subtotal - descNum);
  const pagaConNum = Math.max(0, Number(pagaCon) || 0);
  const vuelto = Math.max(0, pagaConNum - total);

  const handleFinalize = () => {
    if (cart.length === 0) {
      onNotify('warning', 'Carrito vacío', 'Agregá productos o reparaciones antes de cobrar.');
      return;
    }
    onCheckout({
      items: cart,
      descuento: descNum,
      metodoPago,
      pagaCon: pagaConNum,
    });
    setCart([]);
    setDescuento('0');
    setPagaCon('0');
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Punto de Venta
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Catalog & Scanner */}
        <div className="lg:col-span-8 space-y-4 min-w-0">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-white border border-slate-200 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('productos')}
              className={`py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                tab === 'productos'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Productos / Accesorios
            </button>
            <button
              type="button"
              onClick={() => setTab('reparaciones')}
              className={`py-2.5 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                tab === 'reparaciones'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              Cobrar Reparación
            </button>
          </div>

          {/* Search & Barcode bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap sm:flex-nowrap items-stretch gap-2">
              <div className="flex items-center flex-1 min-w-0 border-2 border-teal-600 rounded-xl bg-white px-3">
                <QrCode className="w-4 h-4 text-teal-600 shrink-0 mr-2" />
                <input
                  type="text"
                  data-barcode-input="true"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = barcodeInput.trim();
                      setBarcodeInput('');
                      handleBarcodeLookup(val);
                    }
                  }}
                  placeholder="Escanear código con pistola o Enter..."
                  className="min-w-0 flex-1 py-2 text-sm font-mono focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setCameraActive((v) => !v)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer ${
                  cameraActive
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-teal-600 hover:bg-teal-700 text-white'
                }`}
              >
                {cameraActive ? (
                  <>
                    <CameraOff className="w-4 h-4" />
                    <span>Detener</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Escanear</span>
                  </>
                )}
              </button>
            </div>

            {cameraActive && (
              <BarcodeCamera
                active={cameraActive}
                continuous={true}
                cooldownMs={2000}
                compact={true}
                onScan={(code) => handleBarcodeLookup(code)}
                onClose={() => setCameraActive(false)}
                onErrorMessage={(msg) => onNotify('error', 'Cámara', msg)}
              />
            )}

            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 min-w-0">
              <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, código o N° de orden..."
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <ScanBarcode
                className={`w-3.5 h-3.5 shrink-0 ${
                  gunDetected ? 'text-emerald-600' : 'text-slate-400'
                }`}
              />
              <span className={gunDetected ? 'font-semibold text-emerald-700' : 'text-slate-500'}>
                {gunDetected
                  ? 'Pistola lectora detectada · Escaneá directamente para sumar al carrito'
                  : 'Pistola USB/Bluetooth lista (escaneá sin hacer clic en ningún campo)'}
              </span>
            </div>
          </div>

          {/* Catalog Grid */}
          {tab === 'productos' ? (
            filteredProducts.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
                No se encontraron productos.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredProducts.map((p) => (
                  <button
                    key={p.codigo}
                    type="button"
                    disabled={p.stock <= 0}
                    onClick={() => addProductToCart(p)}
                    className={`text-left bg-white border border-slate-200 rounded-xl p-4 transition-colors flex flex-col justify-between gap-2 ${
                      p.stock <= 0
                        ? 'opacity-55 cursor-not-allowed'
                        : 'hover:border-emerald-500 hover:bg-emerald-50/20 cursor-pointer'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-slate-500 truncate">{p.categoria}</p>
                      <p className="text-sm font-bold text-slate-900 mt-0.5 line-clamp-2">
                        {p.nombre}
                      </p>
                    </div>
                    <div className="flex items-end justify-between gap-2 pt-2 border-t border-slate-100">
                      <span
                        className={`text-xs font-mono tabular-nums ${
                          p.stock < 3 ? 'text-red-700 font-bold' : 'text-slate-500'
                        }`}
                      >
                        Stock: {p.stock}
                      </span>
                      <span className="text-base font-bold text-emerald-700 tabular-nums">
                        {formatARSCompact(p.precio)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : filteredRepairs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              No hay reparaciones pendientes para cobrar.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredRepairs.map((r) => {
                const saldo = Math.max(0, r.presupuesto - r.senia);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => addRepairToCart(r)}
                    className="text-left bg-white border border-slate-200 hover:border-emerald-500 rounded-xl p-4 transition-colors space-y-2 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-slate-900">{r.n_orden}</span>
                      <span className="font-semibold text-amber-700">{r.estado}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{r.cliente}</p>
                      <p className="text-xs text-slate-600 truncate">
                        {r.equipo} · {r.falla || 'Revisión'}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-slate-500 tabular-nums">
                        Total: {formatARSCompact(r.presupuesto)} · Seña: {formatARSCompact(r.senia)}
                      </span>
                      <span className="text-sm font-bold text-emerald-700 tabular-nums">
                        {formatARSCompact(saldo)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Cart */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 lg:sticky lg:top-6 space-y-4 min-w-0">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <ShoppingCart className="w-5 h-5 text-emerald-600" />
              <span>Carrito de Venta</span>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={() => setCart([])}
                className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer"
              >
                Vaciar
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">El carrito está vacío.</p>
            ) : (
              cart.map((item, idx) => (
                <div key={`${item.codigo || item.id}-${idx}`} className="py-2.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.nombre}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {formatARSCompact(item.precio)} c/u
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label="Quitar"
                      className="p-1 text-red-500 hover:bg-red-50 rounded cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {!item.es_reparacion ? (
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateCartQty(idx, item.cantidad - 1)}
                          className="w-7 h-7 rounded-md border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-xs font-mono font-bold tabular-nums">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(idx, item.cantidad + 1)}
                          className="w-7 h-7 rounded-md border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">1 servicio</span>
                    )}
                    <span className="text-sm font-bold text-slate-900 tabular-nums">
                      {formatARSCompact(item.precio * item.cantidad)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-2.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums font-medium">{formatARS(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-slate-600">
              <span>Descuento ($)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
                className="w-28 px-2.5 py-1 text-right rounded-lg border border-slate-300 font-mono text-sm tabular-nums"
              />
            </div>
            <div className="flex justify-between items-center text-base font-bold text-slate-900 pt-1">
              <span>Total</span>
              <span className="text-emerald-700 tabular-nums text-lg">{formatARS(total)}</span>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Método de Pago
              </label>
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Paga con ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={pagaCon}
                  onChange={(e) => setPagaCon(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono text-sm tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Vuelto ($)
                </label>
                <input
                  type="text"
                  readOnly
                  value={formatARS(vuelto)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold text-emerald-700 text-sm tabular-nums"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinalize}
              className="w-full min-h-[46px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finalizar y Cobrar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
