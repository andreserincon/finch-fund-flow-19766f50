/**
 * @file memberImage.ts
 * @description Imagenes compartibles (PNG) de un hermano, para mandar por
 *   WhatsApp. Dos salidas que comparten el mismo render de filas de saldo:
 *     - shareMemberStatus: el "estado del hermano" (saldo actual).
 *     - shareMemberReceipt: el comprobante de un pago (encabezado institucional,
 *       detalle del pago y saldo a la fecha de ese pago).
 *
 *   Se arma un nodo HTML dedicado (limpio, con medidas propias), se captura con
 *   html-to-image y se abre el menu de compartir del dispositivo, con respaldo a
 *   descarga cuando el navegador no permite compartir archivos.
 */
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { FEE_TYPE_LABELS, MASONIC_GRADE_LABELS, type FeeType, type PaymentStatus } from '@/lib/types';

/** Traductor i18n (solo se usa para las etiquetas de estado de capita). */
type Translate = (key: string) => string;

/** Resultado de compartir: compartido/descargado, cancelado por el usuario, o error. */
export type ShareResult = 'shared' | 'cancelled' | 'error';

/** Datos de identidad del hermano para el encabezado de la imagen. */
export interface MemberHeaderInfo {
  matricula: string | null;
  fullName: string;
  feeType: FeeType;
  grade?: string | null;
  isActive: boolean;
}

/** Saldos netos por concepto (pagado menos adeudado); negativos = debe. */
export interface MemberBalanceInfo {
  capitaBal: number;
  capitaStatus: PaymentStatus;
  eventoBal: number;
  eventoOk: boolean;
  cobrosArs: number;
  cobrosUsd: number;
  totalBal: number;
}

/** Detalle del pago para el comprobante. */
export interface ReceiptPaymentInfo {
  dateText: string;
  concept: string;
  note?: string | null;
  amountText: string;
}

/** Encabezado institucional del comprobante. */
export interface InstitutionInfo {
  lodge: string;
  tesorero?: string | null;
}

/** La leyenda de la logia, la misma que usa el reporte mensual. */
export const LODGE_NAME = 'R.·.L.·. Simón Bolívar N° 646';

const STATUS_I18N_KEY: Record<PaymentStatus, string> = {
  al_dia: 'status.alDia',
  adelantado: 'status.adelantado',
  impago: 'status.impago',
  demorado: 'status.demorado',
};

// Colores de estado, alineados con los tokens de la app (success/info/warning/
// overdue): verde al dia, azul adelantado, ambar impago, rojo demorado.
const STATUS_COLORS: Record<PaymentStatus, { bg: string; fg: string }> = {
  al_dia: { bg: '#dcf7ea', fg: '#15803d' },
  adelantado: { bg: '#dbeafe', fg: '#1d4ed8' },
  impago: { bg: '#fbebc6', fg: '#92700e' },
  demorado: { bg: '#fde2e2', fg: '#b91c1c' },
};

const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace';
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";

const statusPill = (text: string, kind: PaymentStatus, withDot: boolean) => {
  const c = STATUS_COLORS[kind];
  return `<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;line-height:1;`
    + `padding:5px 11px;border-radius:999px;font-weight:500;background:${c.bg};color:${c.fg};">`
    + (withDot ? `<span style="width:6px;height:6px;border-radius:999px;background:currentColor;"></span>` : '')
    + `${text}</span>`;
};

const tag = (text: string, filled: boolean) =>
  `<span style="display:inline-block;font-size:13px;line-height:1;padding:6px 12px;border-radius:999px;`
  + `${filled ? 'background:#ece9e1;color:#1c1c22;' : 'border:1px solid #d6d3d1;color:#1c1c22;'}">${text}</span>`;

/** Monto con la moneda explicita: pesos "$ 1.234,56", dolares "US$ 1.234,56". */
export const moneyText = (value: number, currency: 'ARS' | 'USD' = 'ARS') =>
  currency === 'USD' ? formatCurrency(value, 'USD').replace('$', 'US$ ') : formatCurrency(value, 'ARS');

const amt = (value: number, bold: boolean, colored = true) =>
  `<span style="font-family:${MONO};font-size:18px;`
  + `font-weight:${bold ? 700 : 600};color:${colored ? (value < 0 ? '#dc2626' : '#059669') : '#1c1c22'};">${formatCurrency(value)}</span>`;

const rowStart = (topBorder: boolean) =>
  `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;`
  + `${topBorder ? 'border-top:1px solid #eae7e1;margin-top:12px;padding-top:12px;' : 'margin-top:10px;'}">`;

/**
 * Encabezado del hermano: matricula y nombre. Con showTags (estado del
 * hermano) suma el tipo de capita, el grado y, si corresponde, "Inactivo". El
 * comprobante lo arma sin tags, mas limpio.
 */
function renderMemberHeader(h: MemberHeaderInfo, showTags = true): string {
  const tags = showTags
    ? tag(FEE_TYPE_LABELS[h.feeType], true)
      + (h.grade ? tag(MASONIC_GRADE_LABELS[h.grade as keyof typeof MASONIC_GRADE_LABELS], false) : '')
      + (h.isActive ? '' : tag('Inactivo', false))
    : '';
  return (
    `<div style="font-size:14px;color:#6b7280;">Mat. ${h.matricula || '-'}</div>` +
    `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px;">` +
      `<span style="font-size:22px;font-weight:700;">${h.fullName}</span>` +
      tags +
    `</div>`
  );
}

/**
 * Filas de saldo (Capita / Evento / Cobros / Total en pesos). Mismo bloque que
 * la tarjeta de la vista movil de Miembros. `heading`, si viene, se muestra
 * arriba (por ejemplo "Saldo al 5 ene 2026").
 */
function renderBalanceRows(b: MemberBalanceInfo, t: Translate, heading?: string, showPills = true, colored = true, cobrosLabel = 'Cobros', subheading?: string): string {
  // Cobros pendientes: se muestran en pesos Y en dolares si hay de los dos.
  const cobrosColor = colored ? '#dc2626' : '#1c1c22';
  const cobrosVal = (b.cobrosArs > 0 || b.cobrosUsd > 0)
    ? `<span style="font-family:${MONO};font-size:18px;font-weight:600;color:${cobrosColor};text-align:right;">`
      + (b.cobrosArs > 0 ? `<span style="display:block;">-${moneyText(b.cobrosArs, 'ARS')}</span>` : '')
      + (b.cobrosUsd > 0 ? `<span style="display:block;">-${moneyText(b.cobrosUsd, 'USD')}</span>` : '')
      + `</span>`
    : `<span style="font-family:${MONO};font-size:18px;color:#6b7280;">${formatCurrency(0)}</span>`;
  return (
    (heading
      ? `<div style="margin-top:28px;border-top:2px solid #d6d3d1;padding-top:16px;">`
        + `<div style="font-size:18px;font-weight:700;color:#1c1c22;">${heading}</div>`
        + (subheading ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${subheading}</div>` : '')
        + `</div>`
      : '') +
    `<div style="margin-top:${heading ? 4 : 10}px;">` +
      rowStart(true) +
        `<span style="display:flex;align-items:center;gap:8px;min-width:0;">` +
          `<span style="font-size:15px;color:#6b7280;">Cápita</span>` +
          (showPills ? statusPill(t(STATUS_I18N_KEY[b.capitaStatus]), b.capitaStatus, true) : '') +
        `</span>` +
        amt(b.capitaBal, false, colored) +
      `</div>` +
      rowStart(false) +
        `<span style="display:flex;align-items:center;gap:8px;min-width:0;">` +
          `<span style="font-size:15px;color:#6b7280;">Evento</span>` +
          (showPills ? statusPill(b.eventoOk ? 'Al día' : 'Pendiente', b.eventoOk ? 'al_dia' : 'impago', false) : '') +
        `</span>` +
        amt(b.eventoBal, false, colored) +
      `</div>` +
      rowStart(false) +
        `<span style="font-size:15px;color:#6b7280;">${cobrosLabel}</span>` +
        cobrosVal +
      `</div>` +
      rowStart(true) +
        `<span style="font-size:15px;font-weight:700;">Total (pesos)</span>` +
        `<span style="font-family:${MONO};font-size:18px;font-weight:700;color:${colored ? (b.totalBal < 0 ? '#dc2626' : '#059669') : '#1c1c22'};">${formatCurrency(b.totalBal)}</span>` +
      `</div>` +
    `</div>`
  );
}

/** Estilos del nodo que se captura (contenedor de 460px, fondo blanco). */
const NODE_CSS =
  'position:fixed;left:0;top:0;z-index:-9999;pointer-events:none;' +
  'width:460px;box-sizing:border-box;background:#ffffff;' +
  `padding:26px;font-family:${SANS};color:#15151a;`;

/**
 * Captura un HTML como archivo PNG. Se arma el nodo dentro del viewport pero
 * detras de todo (z-index muy negativo): si se lo posiciona lejos fuera de
 * pantalla, el navegador movil no lo pinta y la captura sale en blanco.
 */
async function htmlToPngFile(html: string, fileName: string): Promise<File | null> {
  const node = document.createElement('div');
  node.style.cssText = NODE_CSS;
  node.innerHTML = html;
  document.body.appendChild(node);
  try {
    const { toPng } = await import('html-to-image');
    // Dos frames para que el navegador haga layout y pinte antes de capturar.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], fileName, { type: 'image/png' });
  } catch {
    return null;
  } finally {
    node.remove();
  }
}

/** Comparte uno o varios archivos juntos, con respaldo a descarga. title/text
 *  son opcionales: si no se pasan, el menu de compartir no lleva mensaje. */
async function shareFiles(files: File[], title?: string, text?: string): Promise<ShareResult> {
  try {
    if (navigator.canShare?.({ files })) {
      const payload: ShareData = { files };
      if (title) payload.title = title;
      if (text) payload.text = text;
      await navigator.share(payload);
      return 'shared';
    }
    // Respaldo (p. ej. escritorio): descargar cada imagen.
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.click();
      URL.revokeObjectURL(url);
    }
    toast.info(files.length > 1
      ? 'Tu dispositivo no permite compartir directo. Se descargaron las imagenes para adjuntarlas en WhatsApp.'
      : 'Tu dispositivo no permite compartir directo. Descargue la imagen para adjuntarla en WhatsApp.');
    return 'shared';
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return 'cancelled';
    toast.error('No se pudo compartir.');
    return 'error';
  }
}

/** Captura cada item (html + nombre de archivo) y comparte todos juntos. */
export async function shareImages(
  items: { html: string; fileName: string }[],
  title?: string,
  text?: string,
): Promise<ShareResult> {
  const files: File[] = [];
  for (const it of items) {
    const f = await htmlToPngFile(it.html, it.fileName);
    if (f) files.push(f);
  }
  if (files.length === 0) {
    toast.error('No se pudo generar la imagen para compartir.');
    return 'error';
  }
  return shareFiles(files, title, text);
}

/** HTML del estado del hermano (saldo actual, con tags). showPills controla las
 *  etiquetas de estado al lado de Cápita y Evento; colored, el color de los montos. */
export function buildStatusHtml(header: MemberHeaderInfo, balance: MemberBalanceInfo, t: Translate, showPills = true, colored = true): string {
  return renderMemberHeader(header) + renderBalanceRows(balance, t, undefined, showPills && header.isActive, colored);
}

/** Comparte el estado del hermano (saldo actual) como imagen. */
export async function shareMemberStatus(header: MemberHeaderInfo, balance: MemberBalanceInfo, t: Translate): Promise<ShareResult> {
  return shareImages(
    [{ html: buildStatusHtml(header, balance, t), fileName: `estado-${header.matricula || header.fullName}.png` }],
    'Estado del socio',
    `Estado de ${header.fullName}`,
  );
}

/**
 * HTML del comprobante de un pago (solo el pago): encabezado institucional,
 * detalle del pago y la firma del tesorero. El balance va en una imagen aparte
 * (el estado del hermano).
 */
export function buildReceiptHtml(header: MemberHeaderInfo, payment: ReceiptPaymentInfo, institution: InstitutionInfo): string {
  const institutionalHeader =
    `<div style="text-align:center;padding-bottom:16px;border-bottom:2px solid #c8a24b;">` +
      `<div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;color:#1c1c22;">${institution.lodge}</div>` +
      `<div style="font-size:13px;color:#6b7280;margin-top:3px;">Tesorería</div>` +
    `</div>`;
  const title =
    `<div style="font-size:19px;font-weight:700;margin:16px 0 12px;">Comprobante de pago</div>`;
  const member = renderMemberHeader(header, false);
  const line = (label: string, value: string, strong?: boolean) =>
    `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:8px;">` +
      `<span style="font-size:14px;color:#6b7280;">${label}</span>` +
      `<span style="font-size:${strong ? 20 : 15}px;${strong ? 'font-weight:700;font-family:' + MONO + ';color:#1c1c22;' : 'color:#1c1c22;text-align:right;'}">${value}</span>` +
    `</div>`;
  const noteLine = payment.note ? line('Nota', payment.note) : '';
  const paymentBlock =
    `<div style="border-top:1px solid #eae7e1;margin-top:14px;padding-top:12px;">` +
      line('Fecha', payment.dateText) +
      line('Concepto', payment.concept) +
      noteLine +
      line('Monto', payment.amountText, true) +
    `</div>`;
  // Firma del tesorero al pie, centrada, con la abreviatura Tes.
  const sign = institution.tesorero
    ? `<div style="margin-top:28px;display:flex;justify-content:center;">`
      + `<div style="min-width:220px;text-align:center;border-top:1px solid #d6d3d1;padding-top:6px;font-size:14px;color:#44403c;">Tes∴ ${institution.tesorero}</div>`
      + `</div>`
    : '';
  return institutionalHeader + title + member + paymentBlock + sign;
}
