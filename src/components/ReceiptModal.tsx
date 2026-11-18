import { useEffect, useState } from 'react';
import { Printer, Receipt, X } from 'lucide-react';
import type { PaperSize, RepairOrder, SaleLineItem } from '../types';
import { escapeHtml, formatARS, formatTicketDate } from '../utils/format';
import {
  getThermalBWLogoDataUrl,
  getTransparentLogoDataUrl,
  LOGO_BANNER_URL,
  LOGO_MASCOT_URL,
} from '../utils/logoProcessor';

export type ReceiptPayload =
  | {
      kind: 'sale';
      n_recibo: string;
      fecha: string;
      metodo_pago: string;
      items: SaleLineItem[];
      subtotal: number;
      descuento: number;
      total: number;
      paga_con: number;
    }
  | {
      kind: 'repair';
      repair: RepairOrder;
    };

interface ReceiptModalProps {
  receipt: ReceiptPayload | null;
  onClose: () => void;
}

export function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
  const [paperSize, setPaperSize] = useState<PaperSize>(() => {
    const saved = localStorage.getItem('facha_papel_ticket');
    return saved === '58' || saved === 'A4' ? saved : '80';
  });
  const [bwLogoSrc, setBwLogoSrc] = useState<string>(LOGO_MASCOT_URL);
  const [watermarkSrc, setWatermarkSrc] = useState<string>(LOGO_BANNER_URL);

  useEffect(() => {
    getThermalBWLogoDataUrl(LOGO_MASCOT_URL)
      .then(setBwLogoSrc)
      .catch(() => {});
    getTransparentLogoDataUrl(LOGO_BANNER_URL, { removeEdgeBlack: true, blackThreshold: 24 })
      .then(setWatermarkSrc)
      .catch(() => {});
  }, []);

  if (!receipt) return null;

  const handlePaperChange = (val: PaperSize) => {
    setPaperSize(val);
    localStorage.setItem('facha_papel_ticket', val);
  };

  const handlePrint = () => {
    const pageCss =
      paperSize === '58'
        ? '@page { size: 58mm auto; margin: 2.5mm; }'
        : paperSize === 'A4'
        ? '@page { size: A4 portrait; margin: 14mm; }'
        : '@page { size: 80mm auto; margin: 3mm; }';

    const widthCss =
      paperSize === '58' ? '53mm' : paperSize === 'A4' ? '180mm' : '74mm';

    const fontCss =
      paperSize === '58'
        ? '11px'
        : paperSize === 'A4'
        ? '13px'
        : '12.5px';

    const bodyHtml = buildPrintableHtml(receipt, bwLogoSrc);

    const oldFrame = document.getElementById('facha-print-iframe');
    if (oldFrame) oldFrame.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'facha-print-iframe';
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc || !iframe.contentWindow) return;

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Comprobante - El Facha Celulares</title>
<style>
  ${pageCss}
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; background: #fff; color: #111; font-family: 'Courier New', Courier, monospace; font-size: ${fontCss}; line-height: 1.38; }
  .sheet { position: relative; width: 100%; max-width: ${widthCss}; margin: 0 auto; padding: ${paperSize === 'A4' ? '16px 20px' : '4px'}; overflow: hidden; }
  .wm { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 82%; max-width: ${paperSize === 'A4' ? '340px' : '210px'}; opacity: 0.10; pointer-events: none; z-index: 0; }
  .content { position: relative; z-index: 1; }
  .tk-logo { display: block; margin: 0 auto 6px; max-width: ${paperSize === '58' ? '74px' : paperSize === 'A4' ? '120px' : '96px'}; max-height: ${paperSize === '58' ? '74px' : paperSize === 'A4' ? '120px' : '96px'}; object-fit: contain; }
  .tk-name { text-align: center; font-weight: 700; font-size: ${paperSize === '58' ? '14px' : paperSize === 'A4' ? '20px' : '16px'}; letter-spacing: 2px; margin: 0; }
  .tk-sub { text-align: center; font-size: 11px; margin: 2px 0 8px; }
  .tk-title { display: table; margin: 0 auto 8px; border: 1.5px solid #111; padding: 2px 8px; font-weight: 700; font-size: 11px; letter-spacing: 1px; }
  .sep { border: 0; border-top: 1px dashed #666; margin: 7px 0; }
  .sep-solid { border: 0; border-top: 2px solid #111; margin: 7px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .row > span:last-child { text-align: right; white-space: nowrap; }
  .bold { font-weight: 700; }
  .item { margin: 5px 0; }
  .item-name { font-weight: 700; word-break: break-word; }
  .item-det { padding-left: 8px; }
  .total { font-weight: 700; font-size: ${paperSize === '58' ? '14px' : paperSize === 'A4' ? '18px' : '15.5px'}; margin: 2px 0; }
  .foot { text-align: center; font-size: 11px; margin-top: 8px; }
  .foot p { margin: 2px 0; }
</style>
</head>
<body>
  <div class="sheet">
    <img class="wm" src="${watermarkSrc}" alt="" />
    <div class="content">${bodyHtml}</div>
  </div>
</body>
</html>`);
    doc.close();

    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.print();
      }
    };
    iframe.onload = () => setTimeout(triggerPrint, 180);
    setTimeout(triggerPrint, 1200);
  };

  const previewWidthClass =
    paperSize === '58'
      ? 'max-w-[252px] text-[11px] p-3.5'
      : paperSize === 'A4'
      ? 'max-w-[540px] text-[13px] p-7'
      : 'max-w-[340px] text-[12.5px] p-5';

  return (
    <div className="fixed inset-0 z-[85] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        <div className="bg-emerald-600 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 font-bold text-base">
            <Receipt className="w-5 h-5" />
            <span>
              {receipt.kind === 'sale' ? 'Comprobante de Venta' : 'Comprobante de Servicio Técnico'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg hover:bg-emerald-700/80 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-6">
          <div
            className={`relative mx-auto w-full ${previewWidthClass} bg-white border border-slate-200 rounded-lg shadow-sm font-mono text-slate-900 overflow-hidden`}
          >
            {/* Subtle watermark in preview */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.10]"
            >
              <img
                src={watermarkSrc}
                alt=""
                referrerPolicy="no-referrer"
                className="w-4/5 max-w-[240px] object-contain"
              />
            </div>

            <div className="relative z-10 leading-snug">
              <img
                src={bwLogoSrc}
                alt="El Facha Celulares"
                referrerPolicy="no-referrer"
                className={`mx-auto mb-1.5 object-contain ${
                  paperSize === '58' ? 'w-16 h-16' : 'w-24 h-24'
                }`}
              />
              <p className="text-center font-bold tracking-[0.15em] text-base">
                EL FACHA CELULARES
              </p>
              <p className="text-center text-[11px] text-slate-600 mb-2">
                Servicio Técnico &amp; Repuestos
              </p>
              <div className="mx-auto table border border-slate-900 px-2.5 py-0.5 text-[11px] font-bold tracking-wider mb-2">
                {receipt.kind === 'sale' ? 'COMPROBANTE DE VENTA' : 'ORDEN DE SERVICIO'}
              </div>

              <hr className="border-t border-dashed border-slate-400 my-2" />

              {receipt.kind === 'sale' ? (
                <>
                  <div className="flex justify-between gap-2 font-bold">
                    <span>{receipt.n_recibo}</span>
                    <span className="text-right">{formatTicketDate(receipt.fecha)}</span>
                  </div>
                  <hr className="border-t border-dashed border-slate-400 my-2" />
                  <div className="space-y-1.5">
                    {receipt.items.map((it, idx) => (
                      <div key={idx}>
                        <div className="font-bold break-words">{it.nombre}</div>
                        <div className="flex justify-between gap-2 pl-2">
                          <span>
                            {it.cantidad} x {formatARS(it.precio)}
                            {it.codigo || it.n_orden ? ` · ${it.codigo || it.n_orden}` : ''}
                          </span>
                          <span className="tabular-nums whitespace-nowrap">
                            {formatARS(it.precio * it.cantidad)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <hr className="border-t border-dashed border-slate-400 my-2" />
                  <div className="flex justify-between gap-2">
                    <span>Artículos</span>
                    <span className="tabular-nums">
                      {receipt.items.reduce((s, i) => s + i.cantidad, 0)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Subtotal</span>
                    <span className="tabular-nums">{formatARS(receipt.subtotal)}</span>
                  </div>
                  {receipt.descuento > 0 && (
                    <div className="flex justify-between gap-2">
                      <span>Descuento</span>
                      <span className="tabular-nums">-{formatARS(receipt.descuento)}</span>
                    </div>
                  )}
                  <hr className="border-t-2 border-slate-800 my-2" />
                  <div className="flex justify-between gap-2 font-bold text-base">
                    <span>TOTAL</span>
                    <span className="tabular-nums">{formatARS(receipt.total)}</span>
                  </div>
                  <hr className="border-t-2 border-slate-800 my-2" />
                  <div className="flex justify-between gap-2">
                    <span>Forma de pago</span>
                    <span>{receipt.metodo_pago}</span>
                  </div>
                  {receipt.paga_con > 0 && (
                    <>
                      <div className="flex justify-between gap-2">
                        <span>Paga con</span>
                        <span className="tabular-nums">{formatARS(receipt.paga_con)}</span>
                      </div>
                      <div className="flex justify-between gap-2 font-bold">
                        <span>Vuelto</span>
                        <span className="tabular-nums">
                          {formatARS(Math.max(0, receipt.paga_con - receipt.total))}
                        </span>
                      </div>
                    </>
                  )}
                  <hr className="border-t border-dashed border-slate-400 my-2" />
                  <div className="text-center text-[11px] space-y-0.5">
                    <p>¡Muchas gracias por su preferencia!</p>
                    <p className="font-bold">Av. Alfonsina Storni 136</p>
                    <p className="font-bold">Tel: 3816325529 / 3814120916</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between gap-2 font-bold">
                    <span>{receipt.repair.n_orden}</span>
                    <span className="text-right">{formatTicketDate(receipt.repair.fecha)}</span>
                  </div>
                  <hr className="border-t border-dashed border-slate-400 my-2" />
                  <div className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <span>Cliente</span>
                      <span className="text-right font-semibold">{receipt.repair.cliente}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Teléfono</span>
                      <span className="text-right">{receipt.repair.telefono || '-'}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Equipo</span>
                      <span className="text-right font-semibold">{receipt.repair.equipo}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Estado</span>
                      <span className="text-right">{receipt.repair.estado}</span>
                    </div>
                    <div className="pt-1">
                      <div>Falla declarada:</div>
                      <div className="pl-2 font-bold break-words">
                        {receipt.repair.falla || 'Revisión general'}
                      </div>
                    </div>
                  </div>
                  <hr className="border-t border-dashed border-slate-400 my-2" />
                  <div className="flex justify-between gap-2">
                    <span>Presupuesto</span>
                    <span className="tabular-nums">{formatARS(receipt.repair.presupuesto)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Abonado / Seña</span>
                    <span className="tabular-nums">{formatARS(receipt.repair.senia)}</span>
                  </div>
                  <hr className="border-t-2 border-slate-800 my-2" />
                  <div className="flex justify-between gap-2 font-bold text-base">
                    <span>SALDO</span>
                    <span className="tabular-nums">
                      {formatARS(Math.max(0, receipt.repair.presupuesto - receipt.repair.senia))}
                    </span>
                  </div>
                  <hr className="border-t-2 border-slate-800 my-2" />
                  <div className="text-center text-[11px] space-y-0.5">
                    <p>Conservar este comprobante para retirar el equipo.</p>
                    <p className="font-bold">Av. Alfonsina Storni 136</p>
                    <p className="font-bold">Tel: 3816325529 / 3814120916</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <label htmlFor="paper-format-select" className="text-xs font-semibold text-slate-600">
              Formato:
            </label>
            <select
              id="paper-format-select"
              value={paperSize}
              onChange={(e) => handlePaperChange(e.target.value as PaperSize)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800"
            >
              <option value="80">Térmica 80 mm</option>
              <option value="58">Térmica 58 mm</option>
              <option value="A4">Hoja A4</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-semibold cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildPrintableHtml(receipt: ReceiptPayload, bwLogoSrc: string): string {
  const row = (l: string, r: string, cls = '') =>
    `<div class="row ${cls}"><span>${l}</span><span>${r}</span></div>`;

  const header = `
    <img class="tk-logo" src="${bwLogoSrc}" alt="El Facha Celulares" />
    <p class="tk-name">EL FACHA CELULARES</p>
    <p class="tk-sub">Servicio Técnico &amp; Repuestos</p>
    <div class="tk-title">${receipt.kind === 'sale' ? 'COMPROBANTE DE VENTA' : 'ORDEN DE SERVICIO'}</div>
  `;

  if (receipt.kind === 'sale') {
    const itemsHtml = receipt.items
      .map((it) => {
        const ref = it.codigo || it.n_orden || '';
        return `
          <div class="item">
            <div class="item-name">${escapeHtml(it.nombre)}</div>
            <div class="row">
              <span class="item-det">${it.cantidad} x ${escapeHtml(formatARS(it.precio))}${
                ref ? ' · ' + escapeHtml(ref) : ''
              }</span>
              <span>${escapeHtml(formatARS(it.precio * it.cantidad))}</span>
            </div>
          </div>
        `;
      })
      .join('');

    const totalUnits = receipt.items.reduce((s, i) => s + i.cantidad, 0);
    let paymentHtml = row('Forma de pago', escapeHtml(receipt.metodo_pago));
    if (receipt.paga_con > 0) {
      paymentHtml += row('Paga con', escapeHtml(formatARS(receipt.paga_con)));
      paymentHtml += row(
        'Vuelto',
        escapeHtml(formatARS(Math.max(0, receipt.paga_con - receipt.total))),
        'bold'
      );
    }

    return `
      ${header}
      <hr class="sep" />
      ${row(escapeHtml(receipt.n_recibo), escapeHtml(formatTicketDate(receipt.fecha)), 'bold')}
      <hr class="sep" />
      ${itemsHtml}
      <hr class="sep" />
      ${row('Artículos', String(totalUnits))}
      ${row('Subtotal', escapeHtml(formatARS(receipt.subtotal)))}
      ${receipt.descuento > 0 ? row('Descuento', '-' + escapeHtml(formatARS(receipt.descuento))) : ''}
      <hr class="sep-solid" />
      ${row('TOTAL', escapeHtml(formatARS(receipt.total)), 'total')}
      <hr class="sep-solid" />
      ${paymentHtml}
      <hr class="sep" />
      <div class="foot">
        <p>¡Muchas gracias por su preferencia!</p>
        <p class="bold">Av. Alfonsina Storni 136</p>
        <p class="bold">Tel: 3816325529 / 3814120916</p>
      </div>
    `;
  }

  const r = receipt.repair;
  const saldo = Math.max(0, r.presupuesto - r.senia);
  return `
    ${header}
    <hr class="sep" />
    ${row(escapeHtml(r.n_orden), escapeHtml(formatTicketDate(r.fecha)), 'bold')}
    <hr class="sep" />
    ${row('Cliente', escapeHtml(r.cliente))}
    ${row('Teléfono', escapeHtml(r.telefono || '-'))}
    ${row('Equipo', escapeHtml(r.equipo))}
    ${row('Estado', escapeHtml(r.estado))}
    <div class="item">
      <div>Falla declarada:</div>
      <div class="item-det bold">${escapeHtml(r.falla || 'Revisión general')}</div>
    </div>
    <hr class="sep" />
    ${row('Presupuesto', escapeHtml(formatARS(r.presupuesto)))}
    ${row('Abonado / Seña', escapeHtml(formatARS(r.senia)))}
    <hr class="sep-solid" />
    ${row('SALDO', escapeHtml(formatARS(saldo)), 'total')}
    <hr class="sep-solid" />
    <div class="foot">
      <p>Conservar este comprobante para retirar el equipo.</p>
      <p class="bold">Av. Alfonsina Storni 136</p>
      <p class="bold">Tel: 3816325529 / 3814120916</p>
    </div>
  `;
}
