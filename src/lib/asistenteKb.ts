/**
 * @file asistenteKb.ts
 * @description Base de conocimiento curada para el asistente de tesorería.
 *
 *   Modulo de datos puro (sin efectos, sin imports con efectos, sin React, sin
 *   red, sin Deno). Describe las ocho tareas principales del tesorero con sus
 *   pasos exactos segun la app actual (rediseno de onboarding ya integrado:
 *   "Cápita" en vez de "Cuota", Inicio es la home, "/panel" se titula "Detalle
 *   financiero"). El asistente (Slice 3) usa buildKbText() como contexto que
 *   envia a la edge function en cada consulta, por eso el texto se mantiene
 *   compacto.
 *
 *   Nota de acceso: las tres tareas de escritura de dinero (T1 registrar pago,
 *   T2 registrar gasto, T3 transferir) requieren rol Tesorero o Administrador.
 *   Un Venerable (vm) puede ver tesorería pero no ejecutarlas. T4 a T8 estan
 *   disponibles para el personal de tesorería en general.
 */

export type KbTaskId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8';

export interface KbTask {
  /** Identificador estable de la tarea. */
  id: KbTaskId;
  /** Titulo de la tarea, en lenguaje del tesorero. */
  title: string;
  /** Nombre de la pantalla tal como aparece en su encabezado. */
  screen: string;
  /** Ruta canonica de la pantalla. */
  route: string;
  /** Como llegar a la pantalla en escritorio y en celular. */
  nav: string;
  /** Pasos ordenados para completar la tarea. */
  steps: string[];
  /** Terminos del glosario relevantes para esta tarea. */
  glossaryTerms: string[];
  /** Nota opcional de acceso o advertencia. */
  note?: string;
}

/** Nota de acceso compartida por las tareas de escritura de dinero (T1, T2, T3). */
const ACCESO_DINERO =
  'Requiere acceso de Tesorero o Administrador. El Venerable (vm) puede ver tesorería pero no puede registrar movimientos de dinero.';

export const ASISTENTE_TASKS: KbTask[] = [
  {
    id: 'T1',
    title: 'Registrar un pago de cápita',
    screen: 'Registrar Pago',
    route: '/log-payment',
    nav: 'En el celular, tocá el botón "+" central de la barra inferior y elegí registrar un ingreso. En escritorio, abrí el formulario de movimiento desde Detalle financiero (Panel).',
    note: ACCESO_DINERO,
    steps: [
      'Elegí la Cuenta donde entra el dinero (Banco, Gran Logia o Ahorros). Ahorros es en USD; las demas en ARS.',
      'Confirmá la Fecha (viene la de hoy) y revisá el Monto. Si la categoría es Cápita Mensual, el monto se completa solo con la cápita estándar del mes; ajustalo si hace falta.',
      'Dejá la Categoría en Cápita Mensual (es la opción por defecto para un pago de cápita).',
      'En Miembro, seleccioná el socio que paga. Si es un invitado, elegí Invitado.',
      'Si querés, agregá una nota en Notas.',
      'Tocá Registrar Pago para guardar, o Agregar otro para guardar y cargar otro pago sin salir de la pantalla.',
      'El pago se aplica a la cápita adeudada mas antigua primero; un pago parcial puede no dejar al socio al día.',
    ],
    glossaryTerms: ['capita', 'estandar', 'solidaria'],
  },
  {
    id: 'T2',
    title: 'Registrar un gasto',
    screen: 'Registrar Gasto',
    route: '/log-expense',
    nav: 'En el celular, tocá el botón "+" central de la barra inferior y elegí registrar un gasto. En escritorio, abrí el formulario de movimiento desde Detalle financiero (Panel).',
    note: ACCESO_DINERO,
    steps: [
      'Elegí la Cuenta de donde sale el dinero (Banco, Gran Logia o Ahorros). Ahorros es en USD; las demas en ARS.',
      'Confirmá la Fecha (viene la de hoy) e ingresá el Monto del gasto.',
      'Elegí la Categoría: Gasto de Evento, Aporte a la organización matriz u Otro Gasto.',
      'Si elegiste Gasto de Evento, seleccioná el evento al que corresponde; su nombre se agrega a la nota.',
      'Si querés, agregá detalle en Notas.',
      'Tocá Registrar Gasto para guardar, o Agregar otro para cargar otro gasto sin salir.',
    ],
    glossaryTerms: ['gl', 'glPortion'],
  },
  {
    id: 'T3',
    title: 'Transferir fondos entre cuentas',
    screen: 'Transferir Fondos',
    route: '/account-transfer',
    nav: 'En escritorio, entrá desde el menú de tesorería al historial de transferencias. En el celular, abrilo desde la pestaña Más. Una vez en la pantalla, tocá Nueva transferencia.',
    note: ACCESO_DINERO,
    steps: [
      'Tocá Nueva transferencia para abrir el formulario.',
      'Elegí la Cuenta de origen y la Cuenta de destino (deben ser distintas).',
      'Confirmá la Fecha de la transferencia.',
      'Ingresá el Monto. Si origen y destino usan la misma moneda, alcanza con un campo.',
      'Si es entre monedas distintas (por ejemplo ARS y USD en Ahorros), cargá el monto que sale y el monto que llega; la app calcula el tipo de cambio implicito y avisa si se aparta mucho del vigente.',
      'Si querés, agregá una nota.',
      'Tocá Completar Transferencia para guardar. Queda registrada en el historial de transferencias.',
    ],
    glossaryTerms: ['gl'],
  },
  {
    id: 'T4',
    title: 'Generar el reporte mensual',
    screen: 'Reportes',
    route: '/reports',
    nav: 'En escritorio, Reportes esta en el menú de Resumen de la barra lateral. En el celular, esta en la pestaña Más, dentro de Resumen.',
    steps: [
      'Tocá Generar Reporte (arriba a la derecha).',
      'Elegí el Año y el Mes del período a reportar.',
      'Si el reporte ya existe y querés rehacerlo, marcá la opción de regenerar.',
      'Tocá Generar y esperá; el estado pasa a Generando y luego a Generado.',
      'Cuando este listo, usá el menú de descarga de la fila para bajar el reporte Completo o el Resumen, o compartirlo si tu dispositivo lo permite.',
    ],
    glossaryTerms: ['capita', 'gl'],
  },
  {
    id: 'T5',
    title: 'Calcular las cápitas',
    screen: 'Calculadora de Cápitas',
    route: '/fee-calculator',
    nav: 'En escritorio, Calculadora de Cápitas esta en Configuración en la barra lateral. En el celular, esta en la pestaña Más, dentro de Configuración.',
    steps: [
      'Elegí el Mes base; la app toma de referencia las cápitas vigentes de ese mes.',
      'Revisá el Trimestre CVS: se carga solo desde el índice oficial. Si no hay dato, ingresá el CVS a mano.',
      'Mirá la sección de Referencia actual: cápitas estándar y solidaria vigentes, miembros activos de cada tipo y las cápitas de la Gran Logia.',
      'Compará las Propuestas: Ratio GL (mantiene la proporción con la Gran Logia), Base CVS (sigue la inflación) y GL 65%.',
      'Si querés, probá un Escenario personalizado cargando tu propia cápita estándar y solidaria para ver los indicadores.',
      'Con el botón de descarga podés exportar todo a una planilla Excel. La calculadora no modifica nada: el valor elegido se carga despues, a mano, en Cápitas Mensuales.',
    ],
    glossaryTerms: ['capita', 'cvs', 'ratioGl', 'gl65', 'incrementoPropio', 'indiceAnual', 'glPctCapita', 'estandar', 'solidaria'],
  },
  {
    id: 'T6',
    title: 'Revisar y enviar los recordatorios',
    screen: 'Recordatorios',
    route: '/recordatorios',
    nav: 'En escritorio, Recordatorios esta en Configuración en la barra lateral (con un punto cuando hay pendientes). En el celular, esta como pestaña fija en la barra inferior.',
    steps: [
      'Abrí Recordatorios: aparece una tarjeta por cada socio con saldo pendiente, con el mensaje ya armado (cápitas y cuotas de eventos).',
      'Leé el mensaje de cada tarjeta y revisá que el detalle de la deuda sea correcto.',
      'Tocá Enviar por WhatsApp para abrir WhatsApp con el mensaje cargado, o Copiar para pegarlo donde quieras. El envío es manual desde tu propio WhatsApp.',
      'Si a un socio le falta el número de WhatsApp, cargalo en formato internacional (por ejemplo +5491155551234) y tocá Guardar número.',
      'Si un socio aparece sin desglose de cuotas, revisá su detalle a mano antes de enviar.',
    ],
    glossaryTerms: ['capita', 'impago', 'demorado', 'matricula'],
  },
  {
    id: 'T7',
    title: 'Dar de alta un miembro',
    screen: 'Miembros',
    route: '/members',
    nav: 'En escritorio, Miembros esta en Resumen en la barra lateral. En el celular, es una pestaña fija en la barra inferior.',
    steps: [
      'En Miembros, tocá el botón para agregar un miembro (arriba a la derecha; solo visible con acceso de edición).',
      'Completá los datos del socio: nombre, matrícula y demas campos de la ficha.',
      'Elegí el tipo de cápita: estándar (la mayoría) o solidaria (monto reducido).',
      'Guardá. El nuevo miembro aparece en la lista y empieza a generar cápita.',
      'Para corregir datos despues, usá el menú de la fila (Editar). Podés filtrar por estado (Activo, Inactivo, Al día, Impago, Demorado, Adelantado) y buscar por nombre o matrícula.',
    ],
    glossaryTerms: ['capita', 'estandar', 'solidaria', 'matricula', 'impago', 'demorado', 'adelantado', 'nc'],
  },
  {
    id: 'T8',
    title: 'Crear o gestionar un evento',
    screen: 'Eventos',
    route: '/expense-categories',
    nav: 'En escritorio, Eventos esta en Configuración en la barra lateral. En el celular, esta en la pestaña Más, dentro de Configuración. (La ruta /eventos lleva a la misma pantalla.)',
    steps: [
      'En Eventos, tocá Nuevo evento (arriba a la derecha; solo con acceso de edición).',
      'Poné el Nombre del evento y, si querés, una Descripción.',
      'Cargá la Cuota por miembro (en ARS) y el Número de cuotas (una por mes desde la fecha de cobro).',
      'Si corresponde, elegí Cobrar a partir de (marca el mes de la primera cuota) y la Fecha límite de pago.',
      'Dejá marcada la opción de Asignar cuota a todos los miembros activos si querés generarles el cargo; la app muestra el total estimado.',
      'Tocá Crear evento. Despues podés activar o desactivar, editar o eliminar cada evento, y tocarlo para ver su resumen completo.',
    ],
    glossaryTerms: ['impago', 'demorado'],
  },
];

/**
 * Glosario relevante para el asistente. Las definiciones reflejan el namespace
 * `glossary` de src/i18n/locales/es.ts; no se inventan terminos nuevos.
 */
export const ASISTENTE_GLOSSARY: Record<string, string> = {
  gl: 'Gran Logia: la organización matriz; parte de cada cápita se le gira.',
  glPortion: 'La porción de la cápita que se gira a la Gran Logia.',
  glPctCapita: 'El porcentaje de la cápita total que representa la porción de la Gran Logia.',
  cvs: 'Coeficiente de Variación Salarial: índice usado para ajustar las cápitas.',
  ratioGl: 'Propuesta que mantiene la misma proporción GL sobre cápita que hace un año.',
  gl65: 'Propuesta donde la cápita GL representa el 65% de la cápita total.',
  incrementoPropio: 'El aumento de nuestra cápita respecto del período anterior, en porcentaje.',
  indiceAnual: 'El índice CVS acumulado de los últimos 12 meses, como referencia.',
  capita: 'La cuota mensual de cada miembro.',
  estandar: 'Cápita estándar: el monto que paga la mayoría de los miembros.',
  solidaria: 'Cápita solidaria: un monto reducido para miembros con esa condición.',
  impago: 'Debe la cápita del mes corriente.',
  demorado: 'Debe la cápita de un mes anterior (vencida).',
  adelantado: 'Pagó cápitas de meses que todavía no vencieron.',
  matricula: 'Número de matrícula del miembro.',
  nc: 'n/c: aún no era miembro ese mes.',
};

/**
 * Renderiza ASISTENTE_TASKS y ASISTENTE_GLOSSARY en un texto plano compacto en
 * espanol. Es la base de conocimiento que Slice 3 envia a la edge function como
 * `kb` en cada consulta, por eso se busca que sea breve y autocontenida.
 */
export function buildKbText(): string {
  const lines: string[] = [];

  lines.push('BASE DE CONOCIMIENTO DEL ASISTENTE DE TESORERÍA');
  lines.push(
    'Acceso: registrar pago, registrar gasto y transferir fondos requieren rol Tesorero o Administrador. El resto esta disponible para el personal de tesorería.',
  );
  lines.push('');
  lines.push('TAREAS');

  for (const task of ASISTENTE_TASKS) {
    lines.push('');
    lines.push(`${task.id}. ${task.title}`);
    lines.push(`Pantalla: ${task.screen} (${task.route})`);
    lines.push(`Como llegar: ${task.nav}`);
    if (task.note) lines.push(`Acceso: ${task.note}`);
    lines.push('Pasos:');
    task.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    if (task.glossaryTerms.length > 0) {
      lines.push(`Terminos: ${task.glossaryTerms.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('GLOSARIO');
  for (const [term, definition] of Object.entries(ASISTENTE_GLOSSARY)) {
    lines.push(`${term}: ${definition}`);
  }

  return lines.join('\n');
}
