import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import type { AppStateData, Product, RepairOrder, RepairStatus, SaleLineItem, SaleRecord } from '../types';
import { toSafeFirestoreId } from '../utils/format';
import { db, handleFirestoreError, OperationType } from './firebase';

const VALID_REPAIR_STATUSES: RepairStatus[] = [
  'En Reparación',
  'Listo para Entregar',
  'Retirado',
];

function clampString(val: unknown, maxLen: number, fallback = ''): string {
  const raw = typeof val === 'string' ? val : val == null ? '' : String(val);
  const trimmed = raw.trim();
  const resolved = trimmed || fallback;
  return resolved.slice(0, maxLen);
}

function clampNonNegNumber(val: unknown, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export function sanitizeProduct(p: Product, uid: string) {
  const codigo = clampString(p.codigo, 64, 'SIN-COD');
  const nombre = clampString(p.nombre, 200, 'Producto');
  const categoria = clampString(p.categoria, 80, 'Accesorios');
  return {
    uid,
    codigo,
    nombre,
    categoria,
    costo: clampNonNegNumber(p.costo, 0),
    precio: clampNonNegNumber(p.precio, 0),
    stock: Math.floor(clampNonNegNumber(p.stock, 0)),
  };
}

export function sanitizeRepairOrder(r: RepairOrder, uid: string) {
  const estado: RepairStatus = VALID_REPAIR_STATUSES.includes(r.estado)
    ? r.estado
    : 'En Reparación';
  return {
    uid,
    id: Math.max(1, Math.floor(clampNonNegNumber(r.id, Date.now()))),
    n_orden: clampString(r.n_orden, 40, `ORD-${Date.now()}`),
    cliente: clampString(r.cliente, 120, 'Cliente'),
    telefono: clampString(r.telefono, 50, ''),
    equipo: clampString(r.equipo, 120, 'Equipo'),
    falla: clampString(r.falla, 1000, ''),
    estado,
    presupuesto: clampNonNegNumber(r.presupuesto, 0),
    senia: clampNonNegNumber(r.senia, 0),
    costo_repuesto: clampNonNegNumber(r.costo_repuesto, 0),
    fecha: clampString(r.fecha, 30, new Date().toISOString().split('T')[0]),
  };
}

function sanitizeLineItem(item: SaleLineItem): Record<string, unknown> {
  return {
    codigo: clampString(item.codigo, 64, ''),
    id: typeof item.id === 'number' ? item.id : 0,
    n_orden: clampString(item.n_orden, 40, ''),
    nombre: clampString(item.nombre, 200, 'Ítem'),
    precio: clampNonNegNumber(item.precio, 0),
    costo: clampNonNegNumber(item.costo, 0),
    cantidad: Math.max(1, Math.floor(clampNonNegNumber(item.cantidad, 1))),
    es_reparacion: Boolean(item.es_reparacion),
  };
}

export function sanitizeSaleRecord(s: SaleRecord, uid: string) {
  const items = Array.isArray(s.items)
    ? s.items.slice(0, 100).map(sanitizeLineItem)
    : [];
  return {
    uid,
    n_recibo: clampString(s.n_recibo, 40, `REC-${Date.now()}`),
    fecha: clampString(
      s.fecha,
      40,
      new Date().toISOString().replace('T', ' ').slice(0, 19)
    ),
    detalle: clampString(s.detalle, 2000, 'Venta'),
    metodo_pago: clampString(s.metodo_pago, 50, 'Efectivo'),
    total: clampNonNegNumber(s.total, 0),
    descuento: clampNonNegNumber(s.descuento, 0),
    paga_con: clampNonNegNumber(s.paga_con, 0),
    items,
  };
}

export function getProductDocId(p: Product): string {
  return toSafeFirestoreId('p', p.codigo);
}

export function getRepairDocId(r: RepairOrder): string {
  return toSafeFirestoreId('r', String(r.id));
}

export function getSaleDocId(s: SaleRecord): string {
  return toSafeFirestoreId('s', s.id || s.n_recibo);
}

function fromDocProduct(data: DocumentData): Product {
  return {
    codigo: String(data.codigo ?? ''),
    nombre: String(data.nombre ?? ''),
    categoria: String(data.categoria ?? 'Accesorios'),
    costo: Number(data.costo ?? 0),
    precio: Number(data.precio ?? 0),
    stock: Number(data.stock ?? 0),
  };
}

function fromDocRepair(data: DocumentData): RepairOrder {
  const estado: RepairStatus = VALID_REPAIR_STATUSES.includes(data.estado as RepairStatus)
    ? (data.estado as RepairStatus)
    : 'En Reparación';
  return {
    id: Number(data.id ?? Date.now()),
    n_orden: String(data.n_orden ?? ''),
    cliente: String(data.cliente ?? ''),
    telefono: String(data.telefono ?? ''),
    equipo: String(data.equipo ?? ''),
    falla: String(data.falla ?? ''),
    estado,
    presupuesto: Number(data.presupuesto ?? 0),
    senia: Number(data.senia ?? 0),
    costo_repuesto: Number(data.costo_repuesto ?? 0),
    fecha: String(data.fecha ?? ''),
  };
}

function fromDocSale(docId: string, data: DocumentData): SaleRecord {
  const rawItems = Array.isArray(data.items) ? data.items : [];
  const items: SaleLineItem[] = rawItems.map((it) => ({
    codigo: it.codigo ? String(it.codigo) : undefined,
    id: typeof it.id === 'number' && it.id > 0 ? it.id : undefined,
    n_orden: it.n_orden ? String(it.n_orden) : undefined,
    nombre: String(it.nombre ?? ''),
    precio: Number(it.precio ?? 0),
    costo: Number(it.costo ?? 0),
    cantidad: Number(it.cantidad ?? 1),
    es_reparacion: Boolean(it.es_reparacion),
  }));
  return {
    id: docId,
    n_recibo: String(data.n_recibo ?? ''),
    fecha: String(data.fecha ?? ''),
    detalle: String(data.detalle ?? ''),
    metodo_pago: String(data.metodo_pago ?? 'Efectivo'),
    total: Number(data.total ?? 0),
    descuento: Number(data.descuento ?? 0),
    paga_con: Number(data.paga_con ?? 0),
    items,
  };
}

export interface CloudSnapshotCache {
  userRootExists: boolean;
  products: Map<string, Record<string, unknown>>;
  repairs: Map<string, Record<string, unknown>>;
  sales: Map<string, Record<string, unknown>>;
}

export function createEmptyCloudCache(): CloudSnapshotCache {
  return {
    userRootExists: false,
    products: new Map(),
    repairs: new Map(),
    sales: new Map(),
  };
}

export async function fetchCloudStateSnapshot(uid: string): Promise<{
  state: AppStateData;
  cache: CloudSnapshotCache;
}> {
  const cache = createEmptyCloudCache();

  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    cache.userRootExists = userSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }

  let productos: Product[] = [];
  let reparaciones: RepairOrder[] = [];
  let historial: SaleRecord[] = [];

  try {
    const pSnap = await getDocs(
      query(collection(db, 'users', uid, 'products'), where('uid', '==', uid))
    );
    productos = pSnap.docs.map((d) => {
      const data = d.data();
      const p = fromDocProduct(data);
      cache.products.set(d.id, sanitizeProduct(p, uid));
      return p;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/products`);
  }

  try {
    const rSnap = await getDocs(
      query(collection(db, 'users', uid, 'repairs'), where('uid', '==', uid))
    );
    reparaciones = rSnap.docs.map((d) => {
      const data = d.data();
      const r = fromDocRepair(data);
      cache.repairs.set(d.id, sanitizeRepairOrder(r, uid));
      return r;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/repairs`);
  }

  try {
    const sSnap = await getDocs(
      query(collection(db, 'users', uid, 'sales'), where('uid', '==', uid))
    );
    historial = sSnap.docs.map((d) => {
      const data = d.data();
      const s = fromDocSale(d.id, data);
      cache.sales.set(d.id, sanitizeSaleRecord(s, uid));
      return s;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/sales`);
  }

  return {
    state: { productos, reparaciones, historial },
    cache,
  };
}

export function subscribeUserCollections(
  uid: string,
  cache: CloudSnapshotCache,
  callbacks: {
    onProducts: (items: Product[]) => void;
    onRepairs: (items: RepairOrder[]) => void;
    onSales: (items: SaleRecord[]) => void;
    onError: (err: Error) => void;
  }
): Unsubscribe {
  const unsubProducts = onSnapshot(
    query(collection(db, 'users', uid, 'products'), where('uid', '==', uid)),
    (snap) => {
      const nextMap = new Map<string, Record<string, unknown>>();
      const list = snap.docs.map((d) => {
        const p = fromDocProduct(d.data());
        nextMap.set(d.id, sanitizeProduct(p, uid));
        return p;
      });
      cache.products = nextMap;
      callbacks.onProducts(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/products`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubRepairs = onSnapshot(
    query(collection(db, 'users', uid, 'repairs'), where('uid', '==', uid)),
    (snap) => {
      const nextMap = new Map<string, Record<string, unknown>>();
      const list = snap.docs.map((d) => {
        const r = fromDocRepair(d.data());
        nextMap.set(d.id, sanitizeRepairOrder(r, uid));
        return r;
      });
      cache.repairs = nextMap;
      callbacks.onRepairs(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/repairs`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const unsubSales = onSnapshot(
    query(collection(db, 'users', uid, 'sales'), where('uid', '==', uid)),
    (snap) => {
      const nextMap = new Map<string, Record<string, unknown>>();
      const list = snap.docs.map((d) => {
        const s = fromDocSale(d.id, d.data());
        nextMap.set(d.id, sanitizeSaleRecord(s, uid));
        return s;
      });
      cache.sales = nextMap;
      callbacks.onSales(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, `users/${uid}/sales`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubProducts();
    unsubRepairs();
    unsubSales();
  };
}

function stableJson(obj: unknown): string {
  return JSON.stringify(obj);
}

interface BatchOp {
  run: (batch: ReturnType<typeof writeBatch>) => void;
}

/**
 * Computes minimal diff between desired AppStateData and cached Firestore maps,
 * then executes atomic WriteBatch commits (chunked <= 450 ops per batch).
 */
export async function syncStateToFirestore(
  user: User,
  nextState: AppStateData,
  cache: CloudSnapshotCache,
  forceUserRootCheck = false
): Promise<{ opsCount: number }> {
  const uid = user.uid;
  const ops: BatchOp[] = [];

  if (!cache.userRootExists || forceUserRootCheck) {
    const userRef = doc(db, 'users', uid);
    if (!cache.userRootExists) {
      const snap = await getDoc(userRef);
      cache.userRootExists = snap.exists();
    }
    const profilePayload = {
      email: clampString(user.email ?? '', 254),
      displayName: clampString(user.displayName ?? '', 120),
      photoURL: clampString(user.photoURL ?? '', 1024),
    };
    if (!cache.userRootExists) {
      ops.push({
        run: (batch) =>
          batch.set(userRef, {
            uid,
            ...profilePayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
      });
    } else if (forceUserRootCheck) {
      ops.push({
        run: (batch) =>
          batch.update(userRef, {
            ...profilePayload,
            updatedAt: serverTimestamp(),
          }),
      });
    }
  }

  // Products diff
  const desiredProducts = new Map<string, Record<string, unknown>>();
  for (const p of nextState.productos) {
    const docId = getProductDocId(p);
    desiredProducts.set(docId, sanitizeProduct(p, uid));
  }
  for (const [docId, data] of desiredProducts.entries()) {
    const prev = cache.products.get(docId);
    const ref = doc(db, 'users', uid, 'products', docId);
    if (!prev) {
      ops.push({
        run: (batch) =>
          batch.set(ref, {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
      });
    } else if (stableJson(prev) !== stableJson(data)) {
      const { uid: _omitUid, ...updatable } = data;
      ops.push({
        run: (batch) =>
          batch.update(ref, {
            ...updatable,
            updatedAt: serverTimestamp(),
          }),
      });
    }
  }
  for (const docId of cache.products.keys()) {
    if (!desiredProducts.has(docId)) {
      const ref = doc(db, 'users', uid, 'products', docId);
      ops.push({ run: (batch) => batch.delete(ref) });
    }
  }

  // Repairs diff
  const desiredRepairs = new Map<string, Record<string, unknown>>();
  for (const r of nextState.reparaciones) {
    const docId = getRepairDocId(r);
    desiredRepairs.set(docId, sanitizeRepairOrder(r, uid));
  }
  for (const [docId, data] of desiredRepairs.entries()) {
    const prev = cache.repairs.get(docId);
    const ref = doc(db, 'users', uid, 'repairs', docId);
    if (!prev) {
      ops.push({
        run: (batch) =>
          batch.set(ref, {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
      });
    } else if (stableJson(prev) !== stableJson(data)) {
      const { uid: _omitUid, ...updatable } = data;
      ops.push({
        run: (batch) =>
          batch.update(ref, {
            ...updatable,
            updatedAt: serverTimestamp(),
          }),
      });
    }
  }
  for (const docId of cache.repairs.keys()) {
    if (!desiredRepairs.has(docId)) {
      const ref = doc(db, 'users', uid, 'repairs', docId);
      ops.push({ run: (batch) => batch.delete(ref) });
    }
  }

  // Sales diff
  const desiredSales = new Map<string, Record<string, unknown>>();
  for (const s of nextState.historial) {
    const docId = getSaleDocId(s);
    desiredSales.set(docId, sanitizeSaleRecord(s, uid));
  }
  for (const [docId, data] of desiredSales.entries()) {
    const prev = cache.sales.get(docId);
    const ref = doc(db, 'users', uid, 'sales', docId);
    if (!prev) {
      ops.push({
        run: (batch) =>
          batch.set(ref, {
            ...data,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
      });
    } else if (stableJson(prev) !== stableJson(data)) {
      const { uid: _omitUid, ...updatable } = data;
      ops.push({
        run: (batch) =>
          batch.update(ref, {
            ...updatable,
            updatedAt: serverTimestamp(),
          }),
      });
    }
  }
  for (const docId of cache.sales.keys()) {
    if (!desiredSales.has(docId)) {
      const ref = doc(db, 'users', uid, 'sales', docId);
      ops.push({ run: (batch) => batch.delete(ref) });
    }
  }

  if (ops.length === 0) return { opsCount: 0 };

  const CHUNK_SIZE = 450;
  try {
    for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
      const chunk = ops.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const op of chunk) {
        op.run(batch);
      }
      await batch.commit();
    }
    cache.userRootExists = true;
    cache.products = desiredProducts;
    cache.repairs = desiredRepairs;
    cache.sales = desiredSales;
    return { opsCount: ops.length };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}
