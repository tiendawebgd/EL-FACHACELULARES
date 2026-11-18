export type RepairStatus = 'En Reparación' | 'Listo para Entregar' | 'Retirado';

export type PaymentMethod =
  | 'Efectivo'
  | 'Transferencia'
  | 'Tarjeta de Débito'
  | 'Tarjeta de Crédito';

export interface Product {
  codigo: string;
  nombre: string;
  categoria: string;
  costo: number;
  precio: number;
  stock: number;
}

export interface RepairOrder {
  id: number;
  n_orden: string;
  cliente: string;
  telefono: string;
  equipo: string;
  falla: string;
  estado: RepairStatus;
  presupuesto: number;
  senia: number;
  costo_repuesto: number;
  fecha: string;
}

export interface SaleLineItem {
  codigo?: string;
  id?: number;
  n_orden?: string;
  nombre: string;
  precio: number;
  costo?: number;
  cantidad: number;
  es_reparacion?: boolean;
}

export interface SaleRecord {
  id?: string;
  n_recibo: string;
  fecha: string;
  detalle: string;
  metodo_pago: string;
  total: number;
  descuento?: number;
  paga_con?: number;
  items?: SaleLineItem[];
}

export interface AppStateData {
  productos: Product[];
  reparaciones: RepairOrder[];
  historial: SaleRecord[];
}

export type AppSection =
  | 'panel'
  | 'escaner'
  | 'tecnico'
  | 'inventario'
  | 'pos'
  | 'balance'
  | 'excel';

export type ScannerMode = 'ENTRADA' | 'VENTA';

export type PaperSize = '80' | '58' | 'A4';

export type AuthMode = 'pending' | 'google' | 'guest';

export interface RememberedGoogleUser {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}
