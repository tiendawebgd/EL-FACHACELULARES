import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import type { PaymentMethod, RepairOrder, RepairStatus } from '../types';
import {
  formatARS,
  formatARSCompact,
  getNextSequentialCode,
  getTodayISO,
} from '../utils/format';

interface ServiceTechViewProps {
  reparaciones: RepairOrder[];
  onSaveRepair: (order: RepairOrder, isNew: boolean, paymentMethod?: PaymentMethod) => void;
  onDeleteRepair: (id: number) => void;
  onPrintRepair: (order: RepairOrder) => void;
}

export function ServiceTechView({
  reparaciones,
  onSaveRepair,
  onDeleteRepair,
  onPrintRepair,
}: ServiceTechViewProps) {
  const [queryText, setQueryText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | RepairStatus>('TODOS');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<RepairOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RepairOrder | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<RepairOrder | null>(null);
  const [deliverMethod, setDeliverMethod] = useState<PaymentMethod>('Efectivo');

  // Form fields
  const [cliente, setCliente] = useState('');
  const [telefono, setTelefono] = useState('');
  const [equipo, setEquipo] = useState('');
  const [falla, setFalla] = useState('');
  const [costoRepuesto, setCostoRepuesto] = useState('0');
  const [estado, setEstado] = useState<RepairStatus>('En Reparación');
  const [presupuesto, setPresupuesto] = useState('0');
  const [senia, setSenia] = useState('0');
  const [modalPayMethod, setModalPayMethod] = useState<PaymentMethod>('Efectivo');
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = queryText.toLowerCase().trim();
    return [...reparaciones]
      .reverse()
      .filter((r) => {
        const matchesStatus = statusFilter === 'TODOS' || r.estado === statusFilter;
        const matchesText =
          !q ||
          [r.n_orden, r.cliente, r.telefono, r.equipo, r.falla].some((v) =>
            String(v || '')
              .toLowerCase()
              .includes(q)
          );
        return matchesStatus && matchesText;
      });
  }, [reparaciones, queryText, statusFilter]);

  const openNewModal = () => {
    setEditingOrder(null);
    setCliente('');
    setTelefono('');
    setEquipo('');
    setFalla('');
    setCostoRepuesto('0');
    setEstado('En Reparación');
    setPresupuesto('0');
    setSenia('0');
    setModalPayMethod('Efectivo');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (r: RepairOrder) => {
    setEditingOrder(r);
    setCliente(r.cliente);
    setTelefono(r.telefono);
    setEquipo(r.equipo);
    setFalla(r.falla);
    setCostoRepuesto(String(r.costo_repuesto));
    setEstado(r.estado);
    setPresupuesto(String(r.presupuesto));
    setSenia(String(r.senia));
    setModalPayMethod('Efectivo');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente.trim() || !equipo.trim()) {
      setFormError('Completá al menos los campos Cliente y Equipo.');
      return;
    }
    const presNum = Math.max(0, Number(presupuesto) || 0);
    let seniaNum = Math.max(0, Number(senia) || 0);
    if (estado === 'Retirado') seniaNum = presNum;

    const order: RepairOrder = editingOrder
      ? {
          ...editingOrder,
          cliente: cliente.trim(),
          telefono: telefono.trim(),
          equipo: equipo.trim(),
          falla: falla.trim(),
          estado,
          presupuesto: presNum,
          senia: seniaNum,
          costo_repuesto: Math.max(0, Number(costoRepuesto) || 0),
        }
      : {
          id: Date.now(),
          n_orden: getNextSequentialCode(
            reparaciones.map((r) => r.n_orden),
            'ORD',
            1000
          ),
          cliente: cliente.trim(),
          telefono: telefono.trim(),
          equipo: equipo.trim(),
          falla: falla.trim(),
          estado,
          presupuesto: presNum,
          senia: seniaNum,
          costo_repuesto: Math.max(0, Number(costoRepuesto) || 0),
          fecha: getTodayISO(),
        };

    onSaveRepair(order, !editingOrder, modalPayMethod);
    setModalOpen(false);
    if (!editingOrder && estado !== 'Retirado') {
      onPrintRepair(order);
    }
  };

  const handleConfirmDeliver = () => {
    if (!deliverTarget) return;
    const retiredOrder: RepairOrder = {
      ...deliverTarget,
      estado: 'Retirado',
      senia: deliverTarget.presupuesto,
    };
    onSaveRepair(retiredOrder, false, deliverMethod);
    setDeliverTarget(null);
  };

  const saldoRestante = Math.max(0, (Number(presupuesto) || 0) - (Number(senia) || 0));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
          Servicio Técnico
        </h1>
        <button
          type="button"
          onClick={openNewModal}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Ingresar Dispositivo</span>
        </button>
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
              placeholder="Buscar por orden, cliente, teléfono, equipo o falla..."
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 focus:outline-none"
            />
          </div>
          <div className="md:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'TODOS' | RepairStatus)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-800"
            >
              <option value="TODOS">Todos los Estados</option>
              <option value="En Reparación">En Reparación</option>
              <option value="Listo para Entregar">Listo para Entregar</option>
              <option value="Retirado">Retirado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-2.5 pr-3">Orden</th>
                <th className="py-2.5 pr-3">Ingreso</th>
                <th className="py-2.5 pr-3">Cliente</th>
                <th className="py-2.5 pr-3">Equipo</th>
                <th className="py-2.5 pr-3">Falla declarada</th>
                <th className="py-2.5 pr-3">Estado</th>
                <th className="py-2.5 pr-3 text-right">Presupuesto / Seña</th>
                <th className="py-2.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-500">
                    No hay órdenes de servicio técnico registradas.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const saldo = Math.max(0, r.presupuesto - r.senia);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70">
                      <td className="py-3 pr-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {r.n_orden}
                      </td>
                      <td className="py-3 pr-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {r.fecha}
                      </td>
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-slate-900">{r.cliente}</p>
                        <p className="text-xs text-slate-500">{r.telefono || '-'}</p>
                      </td>
                      <td className="py-3 pr-3 font-medium text-slate-900">{r.equipo}</td>
                      <td className="py-3 pr-3 text-xs text-slate-600 max-w-[200px] truncate">
                        {r.falla || '-'}
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
                      <td className="py-3 pr-3 text-right tabular-nums whitespace-nowrap">
                        <p className="font-bold text-slate-900">
                          {formatARSCompact(r.presupuesto)}
                        </p>
                        <p className="text-xs text-slate-500">
                          Seña: {formatARSCompact(r.senia)} · Resta: {formatARSCompact(saldo)}
                        </p>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {r.estado !== 'Retirado' && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeliverMethod('Efectivo');
                                setDeliverTarget(r);
                              }}
                              title="Registrar retiro y guardar en historial"
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Retirar</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onPrintRepair(r)}
                            title="Imprimir comprobante"
                            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(r)}
                            title="Editar orden"
                            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r)}
                            title="Eliminar orden"
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

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[80] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[92dvh] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 font-bold text-base">
                <Wrench className="w-4 h-4 text-amber-400" />
                <span>
                  {editingOrder ? `Editar ${editingOrder.n_orden}` : 'Ingresar Dispositivo'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-3.5">
              {formError && (
                <p className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cliente</label>
                <input
                  type="text"
                  required
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Equipo / Modelo
                  </label>
                  <input
                    type="text"
                    required
                    value={equipo}
                    onChange={(e) => setEquipo(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Falla Declarada
                </label>
                <textarea
                  rows={3}
                  value={falla}
                  onChange={(e) => setFalla(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-red-700 mb-1">
                    Costo Repuesto (Interno $)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={costoRepuesto}
                    onChange={(e) => setCostoRepuesto(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-red-300 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Estado</label>
                  <select
                    value={estado}
                    onChange={(e) => setEstado(e.target.value as RepairStatus)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                  >
                    <option value="En Reparación">En Reparación</option>
                    <option value="Listo para Entregar">Listo para Entregar</option>
                    <option value="Retirado">Retirado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Presupuesto ($)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={presupuesto}
                    onChange={(e) => setPresupuesto(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Seña ($)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={senia}
                    onChange={(e) => setSenia(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm font-mono tabular-nums"
                  />
                </div>
              </div>

              {estado === 'Retirado' && (!editingOrder || editingOrder.estado !== 'Retirado') && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 space-y-2">
                  <p className="text-xs font-semibold text-emerald-900">
                    Al guardar como Retirado, se registrará automáticamente en el Historial de Ventas.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Método de pago del retiro
                    </label>
                    <select
                      value={modalPayMethod}
                      onChange={(e) => setModalPayMethod(e.target.value as PaymentMethod)}
                      className="w-full px-3 py-2 rounded-lg border border-emerald-300 bg-white text-sm"
                    >
                      <option value="Efectivo">Efectivo</option>
                      <option value="Transferencia">Transferencia</option>
                      <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                      <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-center text-sm font-semibold text-sky-900 tabular-nums">
                Saldo Restante: {formatARS(saldoRestante)}
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
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

      {/* Quick Deliver / Retire Confirmation Modal */}
      {deliverTarget && (
        <div className="fixed inset-0 z-[85] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-2xl border border-slate-200 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Registrar retiro · {deliverTarget.n_orden}
              </h3>
              <button
                type="button"
                onClick={() => setDeliverTarget(null)}
                className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-slate-600 space-y-1">
              <p>
                Cliente: <strong className="text-slate-900">{deliverTarget.cliente}</strong>
              </p>
              <p>
                Equipo: <strong className="text-slate-900">{deliverTarget.equipo}</strong>
              </p>
              <p className="tabular-nums">
                Presupuesto: {formatARS(deliverTarget.presupuesto)} · Seña:{' '}
                {formatARS(deliverTarget.senia)}
              </p>
              <p className="text-base font-bold text-emerald-700 tabular-nums pt-1">
                Saldo a cobrar al retirar:{' '}
                {formatARS(Math.max(0, deliverTarget.presupuesto - deliverTarget.senia))}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Método de pago
              </label>
              <select
                value={deliverMethod}
                onChange={(e) => setDeliverMethod(e.target.value as PaymentMethod)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm"
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Tarjeta de Débito">Tarjeta de Débito</option>
                <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeliverTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-sm font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeliver}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmar retiro y guardar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[85] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm max-h-[92dvh] overflow-y-auto bg-white rounded-2xl border border-slate-200 p-5 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Eliminar orden</h3>
            <p className="text-sm text-slate-600 mb-5">
              ¿Eliminar la orden <span className="font-semibold">{deleteTarget.n_orden}</span> de{' '}
              <span className="font-semibold">{deleteTarget.cliente}</span>?
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
                  onDeleteRepair(deleteTarget.id);
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
