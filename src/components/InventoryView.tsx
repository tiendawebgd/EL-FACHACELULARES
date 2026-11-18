import { useMemo, useState } from 'react';
import {
  FileSpreadsheet,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Product } from '../types';
import { exportInventoryExcel } from '../utils/excelExport';
import { formatARSCompact } from '../utils/format';

interface InventoryViewProps {
  productos: Product[];
  onSaveProduct: (product: Product, previousCode?: string) => void;
  onDeleteProduct: (codigo: string) => void;
  onReplenishProduct: (codigo: string) => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;
}

export function InventoryView({
  productos,
  onSaveProduct,
  onDeleteProduct,
  onReplenishProduct,
  onNotify,
}: InventoryViewProps) {
  const [queryText, setQueryText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('TODAS');
  const [exporting, setExporting] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPrevCode, setEditingPrevCode] = useState<string | undefined>(undefined);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('Accesorios');
  const [costo, setCosto] = useState('0');
  const [precio, setPrecio] = useState('0');
  const [stock, setStock] = useState('0');

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of productos) {
      if (p.categoria) set.add(p.categoria);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [productos]);

  const filtered = useMemo(() => {
    const q = queryText.toLowerCase().trim();
    return productos.filter((p) => {
      const catOk = categoryFilter === 'TODAS' || p.categoria === categoryFilter;
      const qOk =
        !q ||
        p.nombre.toLowerCase().includes(q) ||
        p.codigo.toLowerCase().includes(q) ||
        p.categoria.toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [productos, queryText, categoryFilter]);

  const openNewProduct = () => {
    setEditingPrevCode(undefined);
    setCodigo('');
    setNombre('');
    setCategoria('Accesorios');
    setCosto('0');
    setPrecio('0');
    setStock('1');
    setEditModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingPrevCode(p.codigo);
    setCodigo(p.codigo);
    setNombre(p.nombre);
    setCategoria(p.categoria);
    setCosto(String(p.costo));
    setPrecio(String(p.precio));
    setStock(String(p.stock));
    setEditModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = codigo.trim();
    const cleanName = nombre.trim();
    if (!cleanCode || !cleanName) {
      onNotify('warning', 'Campos obligatorios', 'Ingresá código y nombre del producto.');
      return;
    }
    onSaveProduct(
      {
        codigo: cleanCode,
        nombre: cleanName,
        categoria: categoria.trim() || 'Accesorios',
        costo: Math.max(0, Number(costo) || 0),
        precio: Math.max(0, Number(precio) || 0),
        stock: Math.max(0, Math.floor(Number(stock) || 0)),
      },
      editingPrevCode
    );
    setEditModalOpen(false);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportInventoryExcel(filtered);
      onNotify('success', 'Excel generado', 'Se descargó la planilla de inventario.');
    } catch {
      onNotify('error', 'Error al exportar', 'No se pudo generar el archivo de Excel.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Inventario y Precios
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openNewProduct}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuevo Producto</span>
          </button>
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
            <span>Exportar Inventario</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-8 flex items-center bg-slate-50 border border-slate-200 rounded-lg px-3 min-w-0">
            <Search className="w-4 h-4 text-slate-400 shrink-0 mr-2" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Buscar por código de barras o nombre..."
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 focus:outline-none"
            />
          </div>
          <div className="md:col-span-4">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800"
            >
              <option value="TODAS">Todas las Categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Inventory table */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[740px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 pr-3">Código</th>
                <th className="py-2.5 pr-3">Producto / Repuesto</th>
                <th className="py-2.5 pr-3">Categoría</th>
                <th className="py-2.5 pr-3 text-right">Stock</th>
                <th className="py-2.5 pr-3 text-right">Costo</th>
                <th className="py-2.5 pr-3 text-right">Precio Venta</th>
                <th className="py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    No hay productos en inventario.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isOut = p.stock <= 0;
                  const isCritical = p.stock > 0 && p.stock < 3;
                  return (
                    <tr
                      key={p.codigo}
                      className={
                        isOut
                          ? 'bg-red-50/50 hover:bg-red-50'
                          : isCritical
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-3 pr-3 font-mono text-xs text-slate-700 whitespace-nowrap">
                        {p.codigo}
                      </td>
                      <td className="py-3 pr-3 font-semibold text-slate-900">{p.nombre}</td>
                      <td className="py-3 pr-3 text-slate-600">{p.categoria}</td>
                      <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            isOut
                              ? 'text-red-700'
                              : isCritical
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {p.stock} un.
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                        {formatARSCompact(p.costo)}
                      </td>
                      <td className="py-3 pr-3 text-right font-mono font-bold tabular-nums text-slate-900 whitespace-nowrap">
                        {formatARSCompact(p.precio)}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onReplenishProduct(p.codigo)}
                            title="Reponer stock en escáner"
                            className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                          >
                            <PackagePlus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditProduct(p)}
                            title="Editar producto"
                            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(p)}
                            title="Eliminar producto"
                            className="p-2 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Product Modal */}
      {editModalOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[92dvh] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-base">
                {editingPrevCode ? 'Editar producto' : 'Nuevo producto'}
              </h3>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Código de barras
                </label>
                <input
                  type="text"
                  required
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre</label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Categoría
                </label>
                <input
                  type="text"
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Costo ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={costo}
                    onChange={(e) => setCosto(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Precio ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock</label>
                  <input
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[85] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm max-h-[92dvh] overflow-y-auto bg-white rounded-2xl border border-slate-200 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Eliminar producto</h3>
            <p className="text-sm text-slate-600 mb-5">
              ¿Eliminar <span className="font-semibold">{deleteTarget.nombre}</span> (
              <code className="font-mono text-xs">{deleteTarget.codigo}</code>)?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProduct(deleteTarget.codigo);
                  setDeleteTarget(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
