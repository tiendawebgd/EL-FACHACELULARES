import type {
  AppStateData,
  Product,
  RepairOrder,
  RepairStatus,
  SaleLineItem,
  SaleRecord,
} from '../types';
import { getNowTimestampStr, getTodayISO, toSafeFirestoreId } from './format';

export interface ParsedBackupResult {
  state: AppStateData;
  backupDate?: string;
  backupSource?: string;
}

function toSafeText(value: unknown, maxLen: number, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const trimmed = String(value).trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/\$/g, '').replace(/\s+/g, '');
    // Handle Argentine comma decimal if there is no dot or dot is thousands separator
    const normalized =
      cleaned.includes(',') && !cleaned.includes('.')
        ? cleaned.replace(',', '.')
        : cleaned.includes(',') && cleaned.includes('.')
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }
  const coerced = Number(value);
  return Number.isFinite(coerced) && coerced >= 0 ? coerced : fallback;
}

function tryParseArrayField(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeRepairStatus(rawStatus: unknown): RepairStatus {
  const s = String(rawStatus ?? '').trim().toLowerCase();
  if (s.includes('retirado') || s.includes('pagado') || s.includes('entregado')) {
    return 'Retirado';
  }
  if (s.includes('listo')) {
    return 'Listo para Entregar';
  }
  return 'En Reparación';
}

function normalizeLineItem(raw: unknown): SaleLineItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const nombre = toSafeText(obj.nombre, 200, 'Ítem');
  const precio = toSafeNumber(obj.precio, 0);
  const costo = toSafeNumber(obj.costo, 0);
  const cantidad = Math.max(1, Math.floor(toSafeNumber(obj.cantidad, 1)));
  const es_reparacion = Boolean(obj.es_reparacion);
  const codigo = toSafeText(obj.codigo, 64, '');
  const n_orden = toSafeText(obj.n_orden, 40, '');
  const numId = Math.floor(toSafeNumber(obj.id, 0));

  return {
    ...(codigo ? { codigo } : {}),
    ...(numId > 0 ? { id: numId } : {}),
    ...(n_orden ? { n_orden } : {}),
    nombre,
    precio,
    costo,
    cantidad,
    es_reparacion,
  };
}

/**
 * Parses and normalizes backups from:
 * - Current app export ({ auth, fecha_backup, productos, reparaciones, historial })
 * - Legacy Netlify local export ({ auth, fecha_backup, productos, reparaciones, historial })
 * - Legacy Netlify cloud /api/backups payload ({ data: { productos, reparaciones, historial } })
 * - Raw localStorage dump ({ facha_productos, facha_reparaciones, facha_historial })
 */
export function parseAndNormalizeBackupJson(rawText: string): ParsedBackupResult {
  const parsedRaw = JSON.parse(rawText) as unknown;
  if (!parsedRaw || typeof parsedRaw !== 'object' || Array.isArray(parsedRaw)) {
    throw new Error('El archivo no contiene un objeto JSON válido.');
  }

  const root = parsedRaw as Record<string, unknown>;
  const nestedData =
    root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root.backup && typeof root.backup === 'object' && !Array.isArray(root.backup)
      ? (root.backup as Record<string, unknown>)
      : root;

  const rawProductos = tryParseArrayField(
    nestedData.productos ?? nestedData.facha_productos ?? nestedData.products
  );
  const rawReparaciones = tryParseArrayField(
    nestedData.reparaciones ?? nestedData.facha_reparaciones ?? nestedData.repairs
  );
  const rawHistorial = tryParseArrayField(
    nestedData.historial ??
      nestedData.historialVentas ??
      nestedData.facha_historial ??
      nestedData.sales
  );

  const hasRecognizedKeys =
    'productos' in nestedData ||
    'facha_productos' in nestedData ||
    'products' in nestedData ||
    'reparaciones' in nestedData ||
    'facha_reparaciones' in nestedData ||
    'repairs' in nestedData ||
    'historial' in nestedData ||
    'historialVentas' in nestedData ||
    'facha_historial' in nestedData ||
    'sales' in nestedData;

  if (!hasRecognizedKeys) {
    throw new Error(
      'El JSON no tiene el formato de respaldo esperado (productos, reparaciones o historial).'
    );
  }

  // Normalize products & guarantee unique Firestore doc IDs
  const productMap = new Map<string, Product>();
  rawProductos.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;
    const codigo = toSafeText(obj.codigo, 64, `PROD-${idx + 1}`);
    const docId = toSafeFirestoreId('p', codigo);
    productMap.set(docId, {
      codigo,
      nombre: toSafeText(obj.nombre, 200, `Producto ${codigo}`),
      categoria: toSafeText(obj.categoria, 80, 'Accesorios'),
      costo: toSafeNumber(obj.costo, 0),
      precio: toSafeNumber(obj.precio, 0),
      stock: Math.max(0, Math.floor(toSafeNumber(obj.stock, 0))),
    });
  });

  // Normalize repairs & guarantee unique numeric IDs
  const usedRepairIds = new Set<number>();
  const reparaciones: RepairOrder[] = [];
  let fallbackIdSeed = Date.now();
  rawReparaciones.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;
    let numericId = Math.floor(toSafeNumber(obj.id, 0));
    if (numericId <= 0 || usedRepairIds.has(numericId)) {
      fallbackIdSeed += 1;
      numericId = fallbackIdSeed + idx;
    }
    usedRepairIds.add(numericId);

    const n_orden = toSafeText(obj.n_orden, 40, `ORD-${1000 + idx + 1}`);
    reparaciones.push({
      id: numericId,
      n_orden,
      cliente: toSafeText(obj.cliente, 120, 'Cliente'),
      telefono: toSafeText(obj.telefono, 50, ''),
      equipo: toSafeText(obj.equipo, 120, 'Equipo'),
      falla: toSafeText(obj.falla, 1000, ''),
      estado: normalizeRepairStatus(obj.estado),
      presupuesto: toSafeNumber(obj.presupuesto, 0),
      senia: toSafeNumber(obj.senia, 0),
      costo_repuesto: toSafeNumber(obj.costo_repuesto, 0),
      fecha: toSafeText(obj.fecha, 30, getTodayISO()),
    });
  });

  // Normalize sales & guarantee unique Firestore doc IDs even for legacy Netlify sales without `id`
  const usedSaleDocIds = new Set<string>();
  const historial: SaleRecord[] = [];
  rawHistorial.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;
    const n_recibo = toSafeText(obj.n_recibo, 40, `REC-${1000 + idx + 1}`);
    const baseKey = toSafeText(obj.id, 80, '') || `${n_recibo}-${idx + 1}`;
    let candidateId = toSafeFirestoreId('s', baseKey);
    let suffix = 1;
    while (usedSaleDocIds.has(candidateId)) {
      candidateId = toSafeFirestoreId('s', `${baseKey}-${suffix}`);
      suffix += 1;
    }
    usedSaleDocIds.add(candidateId);

    const rawItems = Array.isArray(obj.items) ? obj.items : [];
    const items = rawItems
      .slice(0, 100)
      .map(normalizeLineItem)
      .filter((x): x is SaleLineItem => x !== null);

    historial.push({
      id: candidateId,
      n_recibo,
      fecha: toSafeText(obj.fecha, 40, getNowTimestampStr()),
      detalle: toSafeText(obj.detalle, 2000, `Venta ${n_recibo}`),
      metodo_pago: toSafeText(obj.metodo_pago, 50, 'Efectivo'),
      total: toSafeNumber(obj.total, 0),
      descuento: toSafeNumber(obj.descuento, 0),
      paga_con: toSafeNumber(obj.paga_con, 0),
      items,
    });
  });

  const backupDate =
    toSafeText(root.fecha_backup ?? root.createdAt ?? root.updatedAt, 60, '') || undefined;
  const backupSource = toSafeText(root.auth ?? root.source, 120, '') || undefined;

  return {
    state: {
      productos: Array.from(productMap.values()),
      reparaciones,
      historial,
    },
    backupDate,
    backupSource,
  };
}

/**
 * Merges incoming backup state into current state without losing existing records.
 * - Products with the same code are updated from the backup; new codes are added.
 * - Repairs with the same id or n_orden are skipped/kept; new ones are added.
 * - Sales with the same n_recibo + fecha + total are deduplicated; new ones are appended.
 */
export function mergeBackupState(current: AppStateData, incoming: AppStateData): AppStateData {
  const productByDocId = new Map<string, Product>();
  for (const p of current.productos) {
    productByDocId.set(toSafeFirestoreId('p', p.codigo), p);
  }
  for (const p of incoming.productos) {
    productByDocId.set(toSafeFirestoreId('p', p.codigo), p);
  }

  const repairIds = new Set(current.reparaciones.map((r) => r.id));
  const repairOrders = new Set(current.reparaciones.map((r) => r.n_orden.trim().toLowerCase()));
  const mergedRepairs = [...current.reparaciones];
  for (const r of incoming.reparaciones) {
    if (repairIds.has(r.id) || repairOrders.has(r.n_orden.trim().toLowerCase())) {
      continue;
    }
    repairIds.add(r.id);
    repairOrders.add(r.n_orden.trim().toLowerCase());
    mergedRepairs.push(r);
  }

  const saleFingerprints = new Set(
    current.historial.map(
      (s) => `${s.n_recibo.trim()}|${s.fecha.trim()}|${Number(s.total) || 0}`
    )
  );
  const usedSaleIds = new Set(
    current.historial.map((s) => toSafeFirestoreId('s', s.id || s.n_recibo))
  );
  const mergedSales = [...current.historial];
  for (const s of incoming.historial) {
    const fp = `${s.n_recibo.trim()}|${s.fecha.trim()}|${Number(s.total) || 0}`;
    if (saleFingerprints.has(fp)) continue;
    saleFingerprints.add(fp);

    let saleId = s.id || toSafeFirestoreId('s', `${s.n_recibo}-${Date.now()}`);
    let counter = 1;
    while (usedSaleIds.has(toSafeFirestoreId('s', saleId))) {
      saleId = toSafeFirestoreId('s', `${s.n_recibo}-${counter}-${Date.now()}`);
      counter += 1;
    }
    usedSaleIds.add(toSafeFirestoreId('s', saleId));
    mergedSales.push({ ...s, id: saleId });
  }

  return {
    productos: Array.from(productByDocId.values()),
    reparaciones: mergedRepairs,
    historial: mergedSales,
  };
}
