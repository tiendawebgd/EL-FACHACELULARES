import ExcelJS from 'exceljs';
import type { Product, SaleRecord } from '../types';
import { getLogoBase64ForExcel, LOGO_MASCOT_URL } from './logoProcessor';

const XL_COLOR_DARK = 'FF0F172A';
const XL_COLOR_DARK_SUB = 'FF1E293B';
const XL_COLOR_TEAL = 'FF0D9488';
const XL_COLOR_ZEBRA = 'FFF8FAFC';
const XL_BORDER = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } };
const XL_BORDERS = {
  top: XL_BORDER,
  left: XL_BORDER,
  bottom: XL_BORDER,
  right: XL_BORDER,
};
const XL_MONEDA = '"$" #,##0.00';

interface ExcelColumnDef {
  titulo: string;
  clave: string;
  ancho: number;
  tipo?: 'texto' | 'moneda' | 'entero' | 'fecha';
  alinear?: 'left' | 'center' | 'right';
  ajustar?: boolean;
  total?: 'suma' | 'texto';
  textoTotal?: string;
}

interface BuildSheetOptions {
  nombreHoja: string;
  titulo: string;
  subtitulo: string;
  resumenMeta: string;
  columnas: ExcelColumnDef[];
  filas: Record<string, unknown>[];
  logoId?: number;
  colorFila?: (row: Record<string, unknown>) => { fill?: string; font?: string } | null;
}

function buildStyledSheet(wb: ExcelJS.Workbook, opts: BuildSheetOptions): ExcelJS.Worksheet {
  const { nombreHoja, titulo, subtitulo, resumenMeta, columnas, filas, logoId, colorFila } = opts;
  const ws = wb.addWorksheet(nombreHoja, {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: `&L${titulo}&RPágina &P de &N`,
    },
  });

  const nCols = columnas.length;
  ws.columns = columnas.map((c) => ({ key: c.clave, width: c.ancho }));

  // Row 1-2: Corporate dark banner with embedded transparent logo
  ws.mergeCells(1, 1, 2, nCols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `EL FACHA CELULARES — ${titulo}`;
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLOR_DARK } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 22;

  if (typeof logoId === 'number') {
    ws.addImage(logoId, {
      tl: { col: 0.15, row: 0.15 },
      ext: { width: 46, height: 46 },
    });
  }

  // Row 3: Metadata / period summary bar
  ws.mergeCells(3, 1, 3, nCols);
  const metaCell = ws.getCell(3, 1);
  metaCell.value = subtitulo;
  metaCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFE2E8F0' } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLOR_DARK_SUB } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(3).height = 20;

  // Row 4: Store address & contact metadata
  ws.mergeCells(4, 1, 4, nCols);
  const dirCell = ws.getCell(4, 1);
  dirCell.value = resumenMeta;
  dirCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  dirCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(4).height = 18;

  // Row 6: Teal table headers
  const HEADER_ROW = 6;
  const headerRow = ws.getRow(HEADER_ROW);
  columnas.forEach((c, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = c.titulo;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLOR_TEAL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = XL_BORDERS;
  });
  headerRow.height = 25;

  // Data rows
  filas.forEach((rowData, rowIdx) => {
    const row = ws.getRow(HEADER_ROW + 1 + rowIdx);
    const customColor = colorFila ? colorFila(rowData) : null;
    columnas.forEach((c, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = rowData[c.clave] as ExcelJS.CellValue;
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: Boolean(customColor?.font),
        color: { argb: customColor?.font || 'FF1E293B' },
      };
      cell.border = XL_BORDERS;
      const bg = customColor?.fill || (rowIdx % 2 === 1 ? XL_COLOR_ZEBRA : undefined);
      if (bg) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      }
      if (c.tipo === 'moneda') cell.numFmt = XL_MONEDA;
      if (c.tipo === 'entero') cell.numFmt = '#,##0';
      if (c.tipo === 'fecha') cell.numFmt = 'dd/mm/yyyy hh:mm';
      cell.alignment = {
        vertical: 'middle',
        horizontal:
          c.alinear ||
          (c.tipo === 'moneda' || c.tipo === 'entero'
            ? 'right'
            : c.tipo === 'fecha'
            ? 'center'
            : 'left'),
        wrapText: Boolean(c.ajustar),
      };
    });
  });

  const lastDataRow = HEADER_ROW + filas.length;

  // Dynamic formula totals row
  if (filas.length > 0 && columnas.some((c) => c.total)) {
    const totRow = ws.getRow(lastDataRow + 1);
    columnas.forEach((c, idx) => {
      const cell = totRow.getCell(idx + 1);
      const colLetter = ws.getColumn(idx + 1).letter;
      if (c.total === 'suma') {
        const result = filas.reduce((sum, r) => sum + (Number(r[c.clave]) || 0), 0);
        cell.value = {
          formula: `SUBTOTAL(9,${colLetter}${HEADER_ROW + 1}:${colLetter}${lastDataRow})`,
          result,
        };
        cell.numFmt = c.tipo === 'moneda' ? XL_MONEDA : '#,##0';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (c.total === 'texto') {
        cell.value = c.textoTotal || 'TOTAL';
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XL_COLOR_DARK } };
      cell.border = XL_BORDERS;
    });
    totRow.height = 24;
  } else if (filas.length === 0) {
    ws.mergeCells(HEADER_ROW + 1, 1, HEADER_ROW + 1, nCols);
    const emptyCell = ws.getCell(HEADER_ROW + 1, 1);
    emptyCell.value = 'No hay registros para mostrar.';
    emptyCell.font = { italic: true, color: { argb: 'FF64748B' } };
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' };
    emptyCell.border = XL_BORDERS;
  }

  const lastColLetter = ws.getColumn(nCols).letter;
  if (filas.length > 0) {
    ws.autoFilter = `A${HEADER_ROW}:${lastColLetter}${lastDataRow}`;
  }
  ws.views = [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: false }];
  ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;
  return ws;
}

function parseLocalSaleDate(str: string): Date | string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str || '');
  if (!m) return str || '';
  return new Date(
    Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  );
}

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function todayFileSuffix(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function exportSalesExcel(
  ventas: SaleRecord[],
  fechaDesde: string,
  fechaHasta: string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'El Facha Celulares';
  wb.created = new Date();

  let logoId: number | undefined;
  try {
    const base64 = await getLogoBase64ForExcel(LOGO_MASCOT_URL);
    logoId = wb.addImage({ base64, extension: 'png' });
  } catch {
    logoId = undefined;
  }

  const fmt = (f: string) => f.split('-').reverse().join('/');
  const periodo =
    fechaDesde || fechaHasta
      ? `Período: ${fechaDesde ? fmt(fechaDesde) : 'inicio'} al ${fechaHasta ? fmt(fechaHasta) : 'hoy'}`
      : 'Período: todas las ventas registradas';
  const totalPeriodo = ventas.reduce((sum, v) => sum + (Number(v.total) || 0), 0);

  buildStyledSheet(wb, {
    nombreHoja: 'Ventas',
    titulo: 'HISTORIAL DE VENTAS',
    subtitulo: `${periodo}  |  ${ventas.length} operaciones  |  Facturado: $${totalPeriodo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
    resumenMeta: `Generado el ${new Date().toLocaleString('es-AR')}  |  Av. Alfonsina Storni 136  |  Tel: 3816325529 / 3814120916`,
    logoId,
    columnas: [
      { titulo: 'N° RECIBO', clave: 'n_recibo', ancho: 18, alinear: 'center', total: 'texto', textoTotal: 'TOTAL' },
      { titulo: 'FECHA Y HORA', clave: 'fecha', ancho: 20, tipo: 'fecha' },
      { titulo: 'DETALLE DE PRODUCTOS / SERVICIOS', clave: 'detalle', ancho: 58, ajustar: true },
      { titulo: 'MÉTODO DE PAGO', clave: 'metodo_pago', ancho: 20, alinear: 'center' },
      { titulo: 'DESCUENTO', clave: 'descuento', ancho: 15, tipo: 'moneda', total: 'suma' },
      { titulo: 'MONTO TOTAL', clave: 'total', ancho: 18, tipo: 'moneda', total: 'suma' },
    ],
    filas: ventas.map((v) => ({
      n_recibo: v.n_recibo,
      fecha: parseLocalSaleDate(v.fecha),
      detalle: (v.detalle || '').split(', ').join('\n'),
      metodo_pago: v.metodo_pago,
      descuento: Number(v.descuento) || 0,
      total: Number(v.total) || 0,
    })),
  });

  // Second sheet: summary by payment method
  const byMethod = new Map<string, { metodo: string; cantidad: number; total: number; ticketPromedio: number }>();
  for (const v of ventas) {
    const key = v.metodo_pago || 'Sin especificar';
    const curr = byMethod.get(key) || { metodo: key, cantidad: 0, total: 0, ticketPromedio: 0 };
    curr.cantidad += 1;
    curr.total += Number(v.total) || 0;
    curr.ticketPromedio = curr.total / curr.cantidad;
    byMethod.set(key, curr);
  }

  buildStyledSheet(wb, {
    nombreHoja: 'Resumen por pago',
    titulo: 'ANÁLISIS POR MÉTODO DE PAGO',
    subtitulo: `${periodo}  |  Distribución de ingresos por medio de cobro`,
    resumenMeta: `Generado el ${new Date().toLocaleString('es-AR')}  |  El Facha Celulares`,
    logoId,
    columnas: [
      { titulo: 'MÉTODO DE PAGO', clave: 'metodo', ancho: 28, total: 'texto', textoTotal: 'TOTAL' },
      { titulo: 'CANTIDAD DE VENTAS', clave: 'cantidad', ancho: 22, tipo: 'entero', total: 'suma' },
      { titulo: 'TICKET PROMEDIO', clave: 'ticketPromedio', ancho: 22, tipo: 'moneda' },
      { titulo: 'MONTO TOTAL', clave: 'total', ancho: 22, tipo: 'moneda', total: 'suma' },
    ],
    filas: Array.from(byMethod.values()).sort((a, b) => b.total - a.total),
  });

  await downloadWorkbook(wb, `ventas_facha_${todayFileSuffix()}.xlsx`);
}

export async function exportInventoryExcel(productos: Product[]): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'El Facha Celulares';
  wb.created = new Date();

  let logoId: number | undefined;
  try {
    const base64 = await getLogoBase64ForExcel(LOGO_MASCOT_URL);
    logoId = wb.addImage({ base64, extension: 'png' });
  } catch {
    logoId = undefined;
  }

  const sorted = [...productos].sort(
    (a, b) =>
      (a.categoria || '').localeCompare(b.categoria || '') ||
      (a.nombre || '').localeCompare(b.nombre || '')
  );

  const criticosCount = sorted.filter((p) => p.stock < 3).length;
  const valorCostoTotal = sorted.reduce((s, p) => s + p.costo * p.stock, 0);

  buildStyledSheet(wb, {
    nombreHoja: 'Inventario',
    titulo: 'INVENTARIO Y PRECIOS',
    subtitulo: `${sorted.length} productos  |  ${criticosCount} en nivel crítico (< 3 un.)  |  Capital en stock: $${valorCostoTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
    resumenMeta: `Generado el ${new Date().toLocaleString('es-AR')}  |  Av. Alfonsina Storni 136  |  Rojo: stock crítico (< 3 un.)`,
    logoId,
    columnas: [
      { titulo: 'CÓDIGO', clave: 'codigo', ancho: 18, alinear: 'center', total: 'texto', textoTotal: 'TOTALES' },
      { titulo: 'PRODUCTO / REPUESTO', clave: 'nombre', ancho: 40, ajustar: true },
      { titulo: 'CATEGORÍA', clave: 'categoria', ancho: 18, alinear: 'center' },
      { titulo: 'ESTADO', clave: 'estado', ancho: 14, alinear: 'center' },
      { titulo: 'STOCK', clave: 'stock', ancho: 10, tipo: 'entero', total: 'suma' },
      { titulo: 'COSTO UNIT.', clave: 'costo', ancho: 15, tipo: 'moneda' },
      { titulo: 'PRECIO VENTA', clave: 'precio', ancho: 15, tipo: 'moneda' },
      { titulo: 'GANANCIA UNIT.', clave: 'ganancia', ancho: 16, tipo: 'moneda' },
      { titulo: 'VALOR STOCK (COSTO)', clave: 'valorCosto', ancho: 20, tipo: 'moneda', total: 'suma' },
      { titulo: 'VALOR STOCK (VENTA)', clave: 'valorVenta', ancho: 20, tipo: 'moneda', total: 'suma' },
    ],
    filas: sorted.map((p) => {
      const stock = Number(p.stock) || 0;
      const costo = Number(p.costo) || 0;
      const precio = Number(p.precio) || 0;
      return {
        codigo: String(p.codigo),
        nombre: p.nombre,
        categoria: p.categoria,
        estado: stock === 0 ? 'AGOTADO' : stock < 3 ? 'CRÍTICO' : 'NORMAL',
        stock,
        costo,
        precio,
        ganancia: precio - costo,
        valorCosto: costo * stock,
        valorVenta: precio * stock,
      };
    }),
    colorFila: (row) => {
      const stock = Number(row.stock) || 0;
      if (stock === 0) return { fill: 'FFFEE2E2', font: 'FF991B1B' };
      if (stock < 3) return { fill: 'FFFEF3C7', font: 'FF92400E' };
      return null;
    },
  });

  // Second sheet: summary by category
  const byCategory = new Map<
    string,
    { categoria: string; productos: number; unidades: number; valorCosto: number; valorVenta: number }
  >();
  for (const p of sorted) {
    const cat = p.categoria || 'Sin categoría';
    const curr = byCategory.get(cat) || {
      categoria: cat,
      productos: 0,
      unidades: 0,
      valorCosto: 0,
      valorVenta: 0,
    };
    curr.productos += 1;
    curr.unidades += Number(p.stock) || 0;
    curr.valorCosto += (Number(p.costo) || 0) * (Number(p.stock) || 0);
    curr.valorVenta += (Number(p.precio) || 0) * (Number(p.stock) || 0);
    byCategory.set(cat, curr);
  }

  buildStyledSheet(wb, {
    nombreHoja: 'Resumen por categoría',
    titulo: 'RESUMEN DE INVENTARIO POR CATEGORÍA',
    subtitulo: `Valorización del inventario agrupada por categoría`,
    resumenMeta: `Generado el ${new Date().toLocaleString('es-AR')}  |  El Facha Celulares`,
    logoId,
    columnas: [
      { titulo: 'CATEGORÍA', clave: 'categoria', ancho: 28, total: 'texto', textoTotal: 'TOTALES' },
      { titulo: 'ARTÍCULOS', clave: 'productos', ancho: 16, tipo: 'entero', total: 'suma' },
      { titulo: 'UNIDADES', clave: 'unidades', ancho: 16, tipo: 'entero', total: 'suma' },
      { titulo: 'CAPITAL (COSTO)', clave: 'valorCosto', ancho: 22, tipo: 'moneda', total: 'suma' },
      { titulo: 'PROYECCIÓN (VENTA)', clave: 'valorVenta', ancho: 22, tipo: 'moneda', total: 'suma' },
    ],
    filas: Array.from(byCategory.values()).sort((a, b) => b.valorVenta - a.valorVenta),
  });

  await downloadWorkbook(wb, `inventario_facha_${todayFileSuffix()}.xlsx`);
}
