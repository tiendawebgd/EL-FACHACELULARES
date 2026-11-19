import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Camera, CameraOff, Check, QrCode, ScanBarcode, ShoppingBag } from 'lucide-react';
import type { PaymentMethod, Product, SaleLineItem, ScannerMode } from '../types';
import { playScanBeep } from '../utils/format';
import { BarcodeCamera } from './BarcodeCamera';
import { ScannerSaleModal } from './ScannerSaleModal';

interface ScannerViewProps {
  mode: ScannerMode;
  preloadedCode: string | null;
  productos: Product[];
  gunDetected?: boolean;
  onChangeMode: (mode: ScannerMode) => void;
  onClearPreloadedCode: () => void;
  onSaveStockEntry: (product: Product, addedQty: number) => void;
  onCompleteScannerSale: (payload: {
    items: SaleLineItem[];
    descuento: number;
    metodoPago: PaymentMethod;
    pagaCon: number;
  }) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
  onRegisterScanHandler?: (fn: ((code: string) => void) | null) => void;
}

export function ScannerView({
  mode,
  preloadedCode,
  productos,
  gunDetected = false,
  onChangeMode,
  onClearPreloadedCode,
  onSaveStockEntry,
  onCompleteScannerSale,
  onNotify,
  onRegisterScanHandler,
}: ScannerViewProps) {
  const [gunInput, setGunInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  // Entry form state
  const [activeCode, setActiveCode] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Accesorios');
  const [costo, setCosto] = useState('0');
  const [precio, setPrecio] = useState('0');
  const [cantidad, setCantidad] = useState('1');

  // Sale modal state
  const [saleModalProduct, setSaleModalProduct] = useState<Product | null>(null);

  const gunInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const processScannedCode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      const existing = productos.find((p) => String(p.codigo) === code);

      if (mode === 'VENTA') {
        if (!existing) {
          playScanBeep('error');
          onNotify('error', 'Producto no encontrado', `No existe ningún producto con código ${code}.`);
          return;
        }
        if (existing.stock < 1) {
          playScanBeep('error');
          onNotify('error', 'Sin stock disponible', `${existing.nombre} tiene 0 unidades.`);
          return;
        }
        playScanBeep('success');
        setCameraActive(false);
        setSaleModalProduct(existing);
        return;
      }

      // ENTRADA mode
      playScanBeep('success');
      setActiveCode(code);
      if (existing) {
        setNombre(existing.nombre);
        setCategoria(existing.categoria);
        setCosto(String(existing.costo));
        setPrecio(String(existing.precio));
        setCantidad('1');
        setTimeout(() => qtyInputRef.current?.focus(), 40);
      } else {
        setNombre('');
        setCategoria('Accesorios');
        setCosto('0');
        setPrecio('0');
        setCantidad('1');
        setTimeout(() => nameInputRef.current?.focus(), 40);
      }
    },
    [productos, mode, onNotify]
  );

  useEffect(() => {
    if (!onRegisterScanHandler || saleModalProduct) return;
    onRegisterScanHandler(processScannedCode);
    return () => onRegisterScanHandler(null);
  }, [onRegisterScanHandler, saleModalProduct, processScannedCode]);

  useEffect(() => {
    if (!preloadedCode) return;
    processScannedCode(preloadedCode);
    onClearPreloadedCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preloadedCode]);

  const handleConfirmEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = activeCode.trim();
    const cleanName = nombre.trim();
    const qty = Math.floor(Number(cantidad) || 0);
    if (!cleanCode) {
      onNotify('warning', 'Código requerido', 'Escaneá o ingresá un código.');
      return;
    }
    if (!cleanName) {
      onNotify('warning', 'Nombre requerido', 'Ingresá el nombre del producto.');
      return;
    }
    if (qty < 1) {
      onNotify('warning', 'Cantidad inválida', 'Ingresá al menos 1 unidad.');
      return;
    }

    onSaveStockEntry(
      {
        codigo: cleanCode,
        nombre: cleanName,
        categoria: categoria.trim() || 'Accesorios',
        costo: Math.max(0, Number(costo) || 0),
        precio: Math.max(0, Number(precio) || 0),
        stock: qty,
      },
      qty
    );

    setActiveCode('');
    setNombre('');
    setCosto('0');
    setPrecio('0');
    setCantidad('1');
    setTimeout(() => gunInputRef.current?.focus(), 40);
  };

  const isVenta = mode === 'VENTA';

  return (
    <div className="space-y-5">
      {/* Mode selector */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => {
            onChangeMode('ENTRADA');
            setSaleModalProduct(null);
            setTimeout(() => gunInputRef.current?.focus(), 40);
          }}
          className={`min-h-[48px] px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            !isVenta
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ArrowDownToLine className="w-4 h-4 shrink-0" />
          <span>MODO INGRESO (Stockear)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onChangeMode('VENTA');
            setActiveCode('');
            setTimeout(() => gunInputRef.current?.focus(), 40);
          }}
          className={`min-h-[48px] px-4 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer ${
            isVenta
              ? 'bg-red-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ShoppingBag className="w-4 h-4 shrink-0" />
          <span>MODO EGRESO (Venta / Salida)</span>
        </button>
      </div>

      {/* Dark scanner console */}
      <div className="rounded-2xl bg-slate-900 text-white p-5 sm:p-7 border border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <span
            className={`inline-block px-3 py-1 rounded-md text-xs font-bold tracking-wide ${
              isVenta ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
            }`}
          >
            {isVenta ? 'MÓDULO DE EGRESO / VENTA' : 'MÓDULO DE INGRESO RÁPIDO'}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              gunDetected ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <ScanBarcode className="w-3.5 h-3.5 shrink-0" />
            <span>
              {gunDetected
                ? 'Pistola lectora detectada'
                : 'Pistola USB / Bluetooth lista'}
            </span>
          </span>
        </div>

        <h2 className="text-lg sm:text-xl font-bold text-white mb-4">
          {isVenta
            ? 'Venta o Salida de Stock con Código de Barras'
            : 'Carga Directa de Stock con Código de Barras'}
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 space-y-4 min-w-0">
            <div>
              <label
                htmlFor="scanner-gun-input"
                className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                  isVenta ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                Código de barras
              </label>
              <div
                className={`flex items-center rounded-xl bg-slate-950 border-2 px-3 ${
                  isVenta ? 'border-red-500/80' : 'border-emerald-500/80'
                }`}
              >
                <QrCode
                  className={`w-5 h-5 shrink-0 mr-2.5 ${
                    isVenta ? 'text-red-400' : 'text-emerald-400'
                  }`}
                />
                <input
                  ref={gunInputRef}
                  id="scanner-gun-input"
                  data-barcode-input="true"
                  type="text"
                  value={gunInput}
                  onChange={(e) => setGunInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = gunInput.trim();
                      setGunInput('');
                      processScannedCode(val);
                    }
                  }}
                  placeholder="Escanear con pistola o escribir código..."
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent py-3 text-base font-mono text-emerald-200 placeholder:text-slate-500 focus:outline-none"
                />
                {gunInput.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      const val = gunInput.trim();
                      setGunInput('');
                      processScannedCode(val);
                    }}
                    className="ml-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white shrink-0 cursor-pointer"
                  >
                    Buscar
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCameraActive((v) => !v)}
                className={`px-4 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer ${
                  cameraActive
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                {cameraActive ? (
                  <>
                    <CameraOff className="w-4 h-4" />
                    <span>Detener cámara</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Escanear con la cámara</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="lg:col-span-5">
            {cameraActive && (
              <BarcodeCamera
                active={cameraActive}
                continuous={false}
                onScan={(code) => {
                  setCameraActive(false);
                  processScannedCode(code);
                }}
                onClose={() => setCameraActive(false)}
                onErrorMessage={(msg) => onNotify('error', 'Cámara', msg)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Entry details form */}
      {!isVenta && activeCode && (
        <form
          onSubmit={handleConfirmEntry}
          className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-bold text-slate-900">
              Ingreso de mercadería
            </h3>
            <button
              type="button"
              onClick={() => setActiveCode('')}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Código</label>
              <input
                type="text"
                value={activeCode}
                readOnly
                className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-100 text-sm font-mono text-slate-700"
              />
            </div>

            <div className="lg:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
              <input
                ref={nameInputRef}
                type="text"
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Categoría</label>
              <input
                type="text"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Costo ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={costo}
                onChange={(e) => setCosto(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Precio ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="lg:col-span-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">Cant.</label>
              <input
                ref={qtyInputRef}
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Confirmar ingreso</span>
            </button>
          </div>
        </form>
      )}

      <ScannerSaleModal
        open={Boolean(saleModalProduct)}
        initialProduct={saleModalProduct}
        productos={productos}
        onClose={() => {
          setSaleModalProduct(null);
          setTimeout(() => gunInputRef.current?.focus(), 40);
        }}
        onConfirmSale={(payload) => {
          setSaleModalProduct(null);
          onCompleteScannerSale(payload);
        }}
        onNotify={(t, title, msg) => onNotify(t, title, msg)}
        onRegisterScanHandler={onRegisterScanHandler}
      />
    </div>
  );
}
