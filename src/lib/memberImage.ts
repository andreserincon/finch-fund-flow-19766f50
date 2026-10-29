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

const amt = (value: number, bold: boolean) =>
  `<span style="font-family:${MONO};font-size:18px;`
  + `font-weight:${bold ? 700 : 600};color:${value < 0 ? '#dc2626' : '#059669'};">${formatCurrency(value)}</span>`;

const rowStart = (topBorder: boolean) =>
  `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;`
  + `${topBorder ? 'border-top:1px solid #eae7e1;margin-top:12px;padding-top:12px;' : 'margin-top:10px;'}">`;

/** Encabezado del hermano: matricula, nombre, tipo de capita y grado. */
function renderMemberHeader(h: MemberHeaderInfo): string {
  const gradeTag = h.grade ? tag(MASONIC_GRADE_LABELS[h.grade as keyof typeof MASONIC_GRADE_LABELS], false) : '';
  return (
    `<div style="font-size:14px;color:#6b7280;">Mat. ${h.matricula || '-'}</div>` +
    `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px;">` +
      `<span style="font-size:22px;font-weight:700;">${h.fullName}</span>` +
      tag(FEE_TYPE_LABELS[h.feeType], true) +
      gradeTag +
      (h.isActive ? '' : tag('Inactivo', false)) +
    `</div>`
  );
}

/**
 * Filas de saldo (Capita / Evento / Cobros / Total en pesos). Mismo bloque que
 * la tarjeta de la vista movil de Miembros. `heading`, si viene, se muestra
 * arriba (por ejemplo "Saldo al 5 ene 2026").
 */
function renderBalanceRows(b: MemberBalanceInfo, t: Translate, heading?: string, showPills = true): string {
  const cobrosVal = (b.cobrosArs > 0 || b.cobrosUsd > 0)
    ? `<span style="font-family:${MONO};font-size:18px;font-weight:600;color:#dc2626;">`
      + (b.cobrosArs > 0 ? formatCurrency(-b.cobrosArs) : '')
      + (b.cobrosUsd > 0 ? `<span style="display:block;font-size:13px;">-${formatCurrency(b.cobrosUsd, 'USD')}</span>` : '')
      + `</span>`
    : `<span style="font-family:${MONO};font-size:18px;color:#6b7280;">${formatCurrency(0)}</span>`;
  return (
    (heading ? `<div style="font-size:14px;color:#6b7280;margin-top:16px;">${heading}</div>` : '') +
    `<div style="margin-top:${heading ? 6 : 10}px;">` +
      rowStart(true) +
        `<span style="display:flex;align-items:center;gap:8px;min-width:0;">` +
          `<span style="font-size:15px;color:#6b7280;">Cápita</span>` +
          (showPills ? statusPill(t(STATUS_I18N_KEY[b.capitaStatus]), b.capitaStatus, true) : '') +
        `</span>` +
        amt(b.capitaBal, false) +
      `</div>` +
      rowStart(false) +
        `<span style="display:flex;align-items:center;gap:8px;min-width:0;">` +
          `<span style="font-size:15px;color:#6b7280;">Evento</span>` +
          (showPills ? statusPill(b.eventoOk ? 'Al día' : 'Pendiente', b.eventoOk ? 'al_dia' : 'impago', false) : '') +
        `</span>` +
        amt(b.eventoBal, false) +
      `</div>` +
      rowStart(false) +
        `<span style="font-size:15px;color:#6b7280;">Cobros</span>` +
        cobrosVal +
      `</div>` +
      rowStart(true) +
        `<span style="font-size:15px;font-weight:700;">Total (pesos)</span>` +
        `<span style="font-family:${MONO};font-size:18px;font-weight:700;color:${b.totalBal < 0 ? '#dc2626' : '#059669'};">${formatCurrency(b.totalBal)}</span>` +
      `</div>` +
    `</div>`
  );
}

/**
 * Captura el HTML como PNG y abre el menu de compartir, con respaldo a descarga.
 * Se arma el nodo dentro del viewport pero detras de todo (z-index muy negativo):
 * si se lo posiciona lejos fuera de pantalla, el navegador movil no lo pinta y la
 * captura sale en blanco.
 */
async function captureAndShare(innerHtml: string, fileName: string, title: string, text: string): Promise<void> {
  const node = document.createElement('div');
  node.style.cssText =
    'position:fixed;left:0;top:0;z-index:-9999;pointer-events:none;' +
    'width:460px;box-sizing:border-box;background:#ffffff;' +
    `padding:26px;font-family:${SANS};color:#15151a;`;
  node.innerHTML = innerHtml;
  document.body.appendChild(node);
  try {
    const { toPng } = await import('html-to-image');
    // Dos frames para que el navegador haga layout y pinte antes de capturar.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
    } else {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = fileName;
      a.click();
      toast.info('Tu dispositivo no permite compartir directo. Descargue la imagen para adjuntarla en WhatsApp.');
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') return;
    toast.error('No se pudo generar la imagen para compartir.');
  } finally {
    node.remove();
  }
}

/** Comparte el estado del hermano (saldo actual) como imagen. */
export async function shareMemberStatus(header: MemberHeaderInfo, balance: MemberBalanceInfo, t: Translate): Promise<void> {
  const html = renderMemberHeader(header) + renderBalanceRows(balance, t, undefined, header.isActive);
  await captureAndShare(
    html,
    `estado-${header.matricula || header.fullName}.png`,
    'Estado del socio',
    `Estado de ${header.fullName}`,
  );
}

/**
 * Comparte el comprobante de un pago: encabezado institucional, detalle del pago
 * y el saldo del hermano a la fecha de ese pago.
 */
export async function shareMemberReceipt(
  header: MemberHeaderInfo,
  payment: ReceiptPaymentInfo,
  balance: MemberBalanceInfo,
  institution: InstitutionInfo,
  t: Translate,
): Promise<void> {
  const tesoreroLine = institution.tesorero
    ? ` · <span style="color:#44403c;">${institution.tesorero}</span>`
    : '';
  const institutionalHeader =
    `<div style="text-align:center;padding-bottom:16px;border-bottom:2px solid #c8a24b;">` +
      `<div style="font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;color:#1c1c22;">${institution.lodge}</div>` +
      `<div style="font-size:13px;color:#6b7280;margin-top:3px;">Tesorería${tesoreroLine}</div>` +
    `</div>`;
  const title =
    `<div style="font-size:19px;font-weight:700;margin:16px 0 12px;">Comprobante de pago</div>`;
  const member = renderMemberHeader(header);
  const line = (label: string, value: string, strong?: boolean) =>
    `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:8px;">` +
      `<span style="font-size:14px;color:#6b7280;">${label}</span>` +
      `<span style="font-size:${strong ? 20 : 15}px;${strong ? 'font-weight:700;font-family:' + MONO + ';color:#059669;' : 'color:#1c1c22;text-align:right;'}">${value}</span>` +
    `</div>`;
  const noteLine = payment.note
    ? line('Nota', payment.note)
    : '';
  const paymentBlock =
    `<div style="border-top:1px solid #eae7e1;margin-top:14px;padding-top:12px;">` +
      line('Fecha', payment.dateText) +
      line('Concepto', payment.concept) +
      noteLine +
      line('Monto', payment.amountText, true) +
    `</div>`;
  const footer = renderBalanceRows(balance, t, `Saldo al ${payment.dateText}`, header.isActive);
  const html = institutionalHeader + title + member + paymentBlock + footer;
  await captureAndShare(
    html,
    `comprobante-${header.matricula || header.fullName}.png`,
    'Comprobante de pago',
    `Comprobante de ${header.fullName}`,
  );
}
