import { useCallback, useEffect, useState } from 'react';
import { Camera, CheckCircle2, Minus, Plus, Receipt, Trash2, X } from 'lucide-react';
import type { PaymentMethod, Product, SaleLineItem } from '../types';
import { formatARS, playScanBeep } from '../utils/format';
import { BarcodeCamera } from './BarcodeCamera';

interface ScannerSaleModalProps {
  open: boolean;
  initialProduct: Product | null;
  productos: Product[];
  onClose: () => void;
  onConfirmSale: (payload: {
    items: SaleLineItem[];
    descuento: number;
    metodoPago: PaymentMethod;
    pagaCon: number;
  }) => void;
  onNotify: (type: 'success' | 'error' | 'warning', title: string, message?: string) => void;
  onRegisterScanHandler?: (fn: ((code: string) => void) | null) => void;
}

export function ScannerSaleModal({
  open,
  initialProduct,
  productos,
  onClose,
  onConfirmSale,
  onNotify,
  onRegisterScanHandler,
}: ScannerSaleModalProps) {
  const [items, setItems] = useState<SaleLineItem[]>([]);
  const [descuento, setDescuento] = useState<string>('0');
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('Efectivo');
  const [pagaCon, setPagaCon] = useState<string>('0');
  const [extraCode, setExtraCode] = useState<string>('');
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);

  useEffect(() => {
    if (open && initialProduct) {
      setItems([
        {
          codigo: initialProduct.codigo,
          nombre: initialProduct.nombre,
          precio: initialProduct.precio,
          costo: initialProduct.costo,
          cantidad: 1,
          es_reparacion: false,
        },
      ]);
      setDescuento('0');
      setMetodoPago('Efectivo');
      setPagaCon('0');
      setExtraCode('');
      setCameraOpen(false);
    }
  }, [open, initialProduct]);

  const addProductByCode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      const prod = productos.find((p) => String(p.codigo) === code);
      if (!prod) {
        playScanBeep('error');
        onNotify('error', 'Código no encontrado', `No existe el código ${code} en inventario.`);
        return;
      }
      if (prod.stock < 1) {
        playScanBeep('error');
        onNotify('error', 'Sin stock', `${prod.nombre} está agotado.`);
        return;
      }

      setItems((prev) => {
        const existing = prev.find((i) => i.codigo === prod.codigo);
        if (existing) {
          if (existing.cantidad + 1 > prod.stock) {
            playScanBeep('error');
            onNotify('warning', 'Stock insuficiente', `Disponible: ${prod.stock} un.`);
            return prev;
          }
          playScanBeep('success');
          return prev.map((i) =>
            i.codigo === prod.codigo ? { ...i, cantidad: i.cantidad + 1 } : i
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
    [productos, onNotify]
  );

  useEffect(() => {
    if (!open || !onRegisterScanHandler) return;
    onRegisterScanHandler(addProductByCode);
    return () => onRegisterScanHandler(null);
  }, [open, addProductByCode, onRegisterScanHandler]);

  if (!open) return null;

  const subtotal = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const descNum = Math.max(0, Number(descuento) || 0);
  const total = Math.max(0, subtotal - descNum);
  const pagaConNum = Math.max(0, Number(pagaCon) || 0);
  const vuelto = Math.max(0, pagaConNum - total);

  const updateQty = (codigo: string | undefined, nextQty: number) => {
    if (!codigo) return;
    const prod = productos.find((p) => p.codigo === codigo);
    const maxStock = prod?.stock ?? nextQty;
    const clamped = Math.max(1, Math.min(maxStock, Math.floor(nextQty) || 1));
    if (nextQty > maxStock) {
      onNotify('warning', 'Límite de stock', `Stock disponible: ${maxStock} un.`);
    }
    setItems((prev) =>
      prev.map((i) => (i.codigo === codigo ? { ...i, cantidad: clamped } : i))
    );
  };

  const removeItem = (codigo: string | undefined) => {
    setItems((prev) => prev.filter((i) => i.codigo !== codigo));
  };

  const handleConfirm = () => {
    if (items.length === 0) {
      onNotify('warning', 'Ticket vacío', 'Agregá al menos un producto.');
      return;
    }
    setCameraOpen(false);
    onConfirmSale({
      items,
      descuento: descNum,
      metodoPago,
      pagaCon: pagaConNum,
    });
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 font-bold text-base">
            <Receipt className="w-5 h-5 text-emerald-400" />
            <span>Confirmar venta (Escáner)</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setCameraOpen(false);
              onClose();
            }}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Add another product by code + continuous camera button */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
            <label
              htmlFor="scanner-modal-add-code"
              className="block text-xs font-semibold text-slate-700"
            >
              Agregar otro producto por código
            </label>
            <div className="flex flex-wrap sm:flex-nowrap gap-2">
              <input
                id="scanner-modal-add-code"
                data-barcode-input="true"
                type="text"
                value={extraCode}
                onChange={(e) => setExtraCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addProductByCode(extraCode);
                    setExtraCode('');
                  }
                }}
                placeholder="Ingresar o escanear código..."
                className="min-w-0 flex-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  addProductByCode(extraCode);
                  setExtraCode('');
                }}
                className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shrink-0 cursor-pointer"
              >
                Agregar
              </button>
              <button
                type="button"
                onClick={() => setCameraOpen((v) => !v)}
                className={`px-3.5 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  cameraOpen
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>{cameraOpen ? 'Detener' : 'Cámara'}</span>
              </button>
            </div>

            {cameraOpen && (
              <BarcodeCamera
                active={cameraOpen}
                continuous={true}
                cooldownMs={2000}
                compact={true}
                onScan={(code) => addProductByCode(code)}
                onClose={() => setCameraOpen(false)}
                onErrorMessage={(msg) => onNotify('error', 'Cámara', msg)}
              />
            )}
          </div>

          {/* Ticket items list */}
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
            {items.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">
                No hay productos en el ticket.
              </p>
            ) : (
              items.map((item) => {
                const stockMax =
                  productos.find((p) => p.codigo === item.codigo)?.stock ?? item.cantidad;
                return (
                  <div
                    key={item.codigo}
                    className="p-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {item.nombre}
                      </p>
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {item.codigo} · {formatARS(item.precio)} c/u · Disp: {stockMax} un.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateQty(item.codigo, item.cantidad - 1)}
                        aria-label="Restar cantidad"
                        className="w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={stockMax}
                        value={item.cantidad}
                        onChange={(e) => updateQty(item.codigo, Number(e.target.value))}
                        className="w-14 h-8 text-center rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => updateQty(item.codigo, item.cantidad + 1)}
                        aria-label="Sumar cantidad"
                        className="w-8 h-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-24 text-right text-sm font-bold text-slate-900 tabular-nums">
                        {formatARS(item.precio * item.cantidad)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(item.codigo)}
                        aria-label="Quitar ítem"
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Payment & Ticket summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="scan-modal-method"
                  className="block text-xs font-semibold text-slate-600 mb-1"
                >
                  Método de pago
                </label>
                <select
                  id="scan-modal-method"
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
                  <label
                    htmlFor="scan-modal-discount"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Descuento ($)
                  </label>
                  <input
                    id="scan-modal-discount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={descuento}
                    onChange={(e) => setDescuento(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label
                    htmlFor="scan-modal-paid"
                    className="block text-xs font-semibold text-slate-600 mb-1"
                  >
                    Paga con ($)
                  </label>
                  <input
                    id="scan-modal-paid"
                    type="number"
                    min={0}
                    step="0.01"
                    value={pagaCon}
                    onChange={(e) => setPagaCon(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Live ticket preview box */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-mono text-xs space-y-1.5">
              <p className="font-bold text-slate-900 text-center border-b border-dashed border-slate-300 pb-1.5">
                VISTA PREVIA DEL TICKET
              </p>
              <div className="flex justify-between text-slate-600">
                <span>Artículos</span>
                <span className="tabular-nums">
                  {items.reduce((s, i) => s + i.cantidad, 0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span className="tabular-nums">{formatARS(subtotal)}</span>
              </div>
              {descNum > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Descuento</span>
                  <span className="tabular-nums">-{formatARS(descNum)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-300 pt-1.5">
                <span>TOTAL</span>
                <span className="text-emerald-700 tabular-nums">{formatARS(total)}</span>
              </div>
              {pagaConNum > 0 && (
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Vuelto</span>
                  <span className="tabular-nums">{formatARS(vuelto)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setCameraOpen(false);
              onClose();
            }}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Confirmar venta</span>
          </button>
        </div>
      </div>
    </div>
  );
}
