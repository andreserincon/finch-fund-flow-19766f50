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
 *   Nota de acceso: el campo `access` de cada tarea refleja el rol que necesita
 *   la ACCION de la tarea (no solo el guard de la ruta). Las tres tareas de
 *   escritura de dinero (T1, T2, T3) viven en AdminRoute. Ademas T4 (generar
 *   reporte), T7 (alta de miembro) y T8 (crear evento) requieren isAdmin aunque
 *   su pantalla sea visible al personal de tesorería, porque su control
 *   principal (Generar Reporte / Agregar Miembro / Nuevo evento) solo aparece
 *   con isAdmin. Solo T5 (calculadora) y T6 (recordatorios) son de personal de
 *   tesorería (staff). El recorrido se ofrece solo a quien puede hacer la tarea.
 */

import type { TourStep } from '@/lib/asistenteTour';

export type KbTaskId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9' | 'T10' | 'T11';

/**
 * Nivel de acceso de la pantalla de la tarea, segun los guards reales de
 * App.tsx. Solo se usa para decidir, en el cliente, si mostrar el boton del
 * recorrido guiado ("Mostrame en la app") para esa tarea. NUNCA se envia al
 * modelo (no entra en buildKbText).
 *   - 'admin'    -> requiere isAdmin: T1, T2, T3 (AdminRoute) y tambien T4, T7, T8
 *                  (pantalla de tesorería, pero su control de crear/generar/dar
 *                  de alta solo aparece con isAdmin).
 *   - 'staff'    -> canViewTreasury && !isMemberOnly: T5, T6.
 *   - 'treasury' -> canViewTreasury. Nivel valido pero hoy sin tareas asignadas.
 */
export type KbTaskAccess = 'admin' | 'staff' | 'treasury';

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
  /**
   * Nivel de acceso de la pantalla, espejo del guard real de App.tsx. Solo
   * sirve para el gate del boton del recorrido en la UI; nunca se envia al
   * modelo (no aparece en buildKbText).
   */
  access: KbTaskAccess;
  /**
   * Tokens de intencion en espanol (stems) para el matcher de texto libre.
   * Se comparan sin acentos ni mayusculas y por inclusion, asi las
   * conjugaciones coinciden (por ejemplo "pag" cubre pago/pagar/pague). Se
   * eligen mayormente disjuntos entre tareas para evitar ambiguedad. Solo se
   * usan en el cliente para detectar la tarea de una pregunta tipeada; nunca se
   * envian al modelo (no aparecen en buildKbText).
   */
  keywords: string[];
  /** Pasos ordenados para completar la tarea. */
  steps: string[];
  /** Terminos del glosario relevantes para esta tarea. */
  glossaryTerms: string[];
  /** Nota opcional de acceso o advertencia. */
  note?: string;
  /**
   * Pasos del recorrido guiado (spotlight) para esta tarea, en orden de los
   * controles reales de la pantalla. Opcional: por ahora solo T1 lo trae (Phase
   * 2 Slice 1). El recorrido solo resalta y describe; nunca completa ni envia el
   * formulario.
   */
  tour?: TourStep[];
}

/** Nota de acceso compartida por las tareas de escritura de dinero (T1, T2, T3). */
const ACCESO_DINERO =
  'Requiere acceso de Tesorero o Administrador. El Venerable (vm) puede ver tesorería pero no puede registrar movimientos de dinero.';

export const ASISTENTE_TASKS: KbTask[] = [
  {
    id: 'T1',
    title: 'Registrar un pago de cápita',
    screen: 'Registrar movimiento',
    route: '/home',
    nav: 'Desde Inicio, abrí "Registrar movimiento" (el botón con el ícono de "+"). En el celular también está el botón "+" central de la barra inferior. Se abre el formulario unificado de movimientos.',
    access: 'admin',
    // Stems de intencion: registrar un pago/cobro. Se evita el stem ambiguo
    // "capita" (lo comparten T1 y T5); el chip lleva el id explicito, asi que
    // no lo necesita.
    keywords: ['pago', 'pagar', 'pague', 'cobro', 'cobrar', 'ingreso'],
    note: ACCESO_DINERO,
    steps: [
      'Desde Inicio, tocá Registrar movimiento para abrir el formulario.',
      'Dejá el Tipo de movimiento en Ingreso (ya viene elegido).',
      'Elegí la Cuenta donde entra el dinero (Banco, Gran Logia o Ahorros). Ahorros es en USD; las demas en ARS.',
      'Dejá la Categoría en Cápita Mensual (es la opción por defecto para un pago de cápita).',
      'Confirmá la Fecha (viene la de hoy).',
      'Revisá el Monto. Con Cápita Mensual se completa solo con la cápita estándar del mes; ajustalo si hace falta.',
      'En Miembro, seleccioná el socio que paga.',
      'Tocá Registrar movimiento para guardar, o Registrar y agregar otro para cargar otro pago sin cerrar.',
      'El pago se aplica a la cápita adeudada mas antigua primero; un pago parcial puede no dejar al socio al día.',
    ],
    glossaryTerms: ['capita', 'estandar', 'solidaria'],
    // Recorrido guiado: abre el formulario unificado desde Inicio y resalta cada
    // control en el orden real del modo Ingreso. Solo muestra y describe; no
    // completa ni envia nada. El usuario hace cada paso.
    tour: [
      {
        route: '/home',
        anchor: 'mov-abrir',
        title: 'Abrí el formulario',
        body: 'Tocá Registrar movimiento para abrir el formulario.',
      },
      {
        route: '/home',
        anchor: 'mov-tipo-ingreso',
        title: 'Dejá el tipo en Ingreso',
        body: 'Dejá el tipo en Ingreso; ya viene elegido.',
      },
      {
        route: '/home',
        anchor: 'mov-cuenta',
        title: 'Elegí la cuenta',
        body: 'Seleccioná la cuenta donde entra el dinero: Banco, Gran Logia o Ahorros. Ahorros es en USD; las demas en ARS.',
      },
      {
        route: '/home',
        anchor: 'mov-categoria',
        title: 'Dejá la categoría en Cápita Mensual',
        body: 'Dejá la categoría en Cápita Mensual. Es la opción por defecto para un pago de cápita.',
      },
      {
        route: '/home',
        anchor: 'mov-fecha',
        title: 'Confirmá la fecha',
        body: 'Confirmá la fecha. Viene la de hoy; cambiala si el pago corresponde a otro día.',
      },
      {
        route: '/home',
        anchor: 'mov-monto',
        title: 'Revisá el monto',
        body: 'Revisá el monto; con Cápita Mensual se completa con la cápita estándar.',
      },
      {
        route: '/home',
        anchor: 'mov-miembro',
        title: 'Elegí el socio',
        body: 'Elegí el socio que paga.',
      },
      {
        route: '/home',
        anchor: 'mov-guardar',
        title: 'Guardá el pago',
        body: 'Tocá Registrar movimiento. El recorrido no lo toca: lo guardás vos.',
      },
    ],
  },
  {
    id: 'T2',
    title: 'Registrar un gasto',
    screen: 'Registrar movimiento',
    route: '/home',
    nav: 'Desde Inicio, abrí "Registrar movimiento" (el botón con el ícono de "+"). En el celular también está el botón "+" central de la barra inferior. Se abre el formulario unificado de movimientos.',
    access: 'admin',
    // Stems de intencion: registrar un gasto/egreso. "gast" cubre gasto/gastos/gastar.
    keywords: ['gast', 'egreso'],
    note: ACCESO_DINERO,
    steps: [
      'Desde Inicio, tocá Registrar movimiento para abrir el formulario.',
      'En el Tipo de movimiento, tocá Gasto.',
      'Elegí la Cuenta de donde sale el dinero (Banco, Gran Logia o Ahorros). Ahorros es en USD; las demas en ARS.',
      'Elegí la Categoría del gasto: Aporte a la organización matriz u Otro Gasto.',
      'Confirmá la Fecha (viene la de hoy).',
      'Ingresá el Monto del gasto.',
      'Si la categoría lo pide, poné un Resumen breve del gasto.',
      'Tocá Registrar movimiento para guardar, o Registrar y agregar otro para cargar otro gasto sin cerrar.',
    ],
    glossaryTerms: ['gl', 'glPortion'],
    tour: [
      {
        route: '/home',
        anchor: 'mov-abrir',
        title: 'Abrí el formulario',
        body: 'Tocá Registrar movimiento para abrir el formulario.',
      },
      {
        route: '/home',
        anchor: 'mov-tipo-gasto',
        title: 'Elegí el tipo Gasto',
        body: 'Tocá Gasto.',
      },
      {
        route: '/home',
        anchor: 'mov-cuenta',
        title: 'Elegí la cuenta',
        body: 'Seleccioná la cuenta de donde sale el dinero: Banco, Gran Logia o Ahorros. Ahorros es en USD; las demas en ARS.',
      },
      {
        route: '/home',
        anchor: 'mov-categoria',
        title: 'Elegí la categoría',
        body: 'Elegí la categoría del gasto.',
      },
      {
        route: '/home',
        anchor: 'mov-fecha',
        title: 'Confirmá la fecha',
        body: 'Confirmá la fecha. Viene la de hoy; cambiala si el gasto corresponde a otro día.',
      },
      {
        route: '/home',
        anchor: 'mov-monto',
        title: 'Ingresá el monto',
        body: 'Cargá el monto del gasto en la moneda de la cuenta elegida.',
      },
      {
        route: '/home',
        anchor: 'mov-resumen',
        title: 'Resumen breve',
        body: 'Si la categoría lo pide, poné un resumen breve del gasto.',
      },
      {
        route: '/home',
        anchor: 'mov-guardar',
        title: 'Guardá el gasto',
        body: 'Tocá Registrar movimiento. El recorrido no lo toca: lo guardás vos.',
      },
    ],
  },
  {
    id: 'T3',
    title: 'Transferir fondos entre cuentas',
    screen: 'Registrar movimiento',
    route: '/home',
    nav: 'Desde Inicio, abrí "Registrar movimiento" (el botón con el ícono de "+"). En el celular también está el botón "+" central de la barra inferior. Se abre el formulario unificado de movimientos.',
    access: 'admin',
    // Stems de intencion: transferir entre cuentas. "transf" cubre
    // transferir/transferencia; "entre cuentas" desambigua de un movimiento comun.
    keywords: ['transf', 'entre cuentas'],
    note: ACCESO_DINERO,
    steps: [
      'Desde Inicio, tocá Registrar movimiento para abrir el formulario.',
      'En el Tipo de movimiento, tocá Transferencia.',
      'Elegí la Cuenta de origen.',
      'Elegí la Cuenta de destino, distinta del origen.',
      'Ingresá el Monto. Si origen y destino usan la misma moneda, alcanza con un campo.',
      'Si es entre monedas distintas (por ejemplo ARS y USD en Ahorros), se abren dos campos: el monto que sale y el monto que llega; la app calcula el tipo de cambio implicito y avisa si se aparta mucho del vigente.',
      'Tocá Registrar movimiento para guardar. Queda registrada en el historial de transferencias.',
    ],
    glossaryTerms: ['gl'],
    tour: [
      {
        route: '/home',
        anchor: 'mov-abrir',
        title: 'Abrí el formulario',
        body: 'Tocá Registrar movimiento para abrir el formulario.',
      },
      {
        route: '/home',
        anchor: 'mov-tipo-transferencia',
        title: 'Elegí el tipo Transferencia',
        body: 'Tocá Transferencia.',
      },
      {
        route: '/home',
        anchor: 'mov-transfer-origen',
        title: 'Elegí la cuenta de origen',
        body: 'Elegí la cuenta de origen.',
      },
      {
        route: '/home',
        anchor: 'mov-transfer-destino',
        title: 'Elegí la cuenta de destino',
        body: 'Elegí la cuenta de destino, distinta del origen.',
      },
      {
        route: '/home',
        anchor: 'mov-transfer-monto',
        title: 'Ingresá el monto',
        body: 'Ingresá el monto; si las monedas difieren se abren dos campos.',
      },
      {
        route: '/home',
        title: 'Si son monedas distintas',
        body: 'Cuando origen y destino usan monedas distintas (por ejemplo ARS y USD en Ahorros), se abren dos campos: el monto que sale y el que llega. La app calcula el tipo de cambio implicito y avisa si se aparta mucho del vigente.',
      },
      {
        route: '/home',
        anchor: 'mov-guardar',
        title: 'Completá la transferencia',
        body: 'Tocá Registrar movimiento. Queda registrada en el historial. El recorrido no lo toca: lo guardás vos.',
      },
    ],
  },
  {
    id: 'T4',
    title: 'Generar el reporte mensual',
    screen: 'Reportes',
    route: '/reports',
    nav: 'En escritorio, Reportes esta en el menú de Resumen de la barra lateral. En el celular, esta en la pestaña Más, dentro de Resumen.',
    // Acceso 'admin': generar el reporte requiere Tesorero/Administrador (el
    // boton Generar Reporte solo aparece con isAdmin), aunque la pantalla de
    // Reportes sea visible para el personal de tesorería.
    access: 'admin',
    // Stems de intencion: reporte/informe mensual. "report" cubre
    // reporte/reportes/reportar; "informe" es el sinonimo comun.
    keywords: ['report', 'informe'],
    steps: [
      'Tocá Generar Reporte (arriba a la derecha).',
      'Elegí el Año y el Mes del período a reportar.',
      'Si el reporte ya existe y querés rehacerlo, marcá la opción de regenerar.',
      'Tocá Generar y esperá; el estado pasa a Generando y luego a Generado.',
      'Cuando este listo, usá el menú de descarga de la fila para bajar el reporte, o compartirlo si tu dispositivo lo permite.',
    ],
    glossaryTerms: ['capita', 'gl'],
    tour: [
      {
        route: '/reports',
        anchor: 'reporte-generar-reporte',
        title: 'Abrí Generar Reporte',
        body: 'Tocá Generar Reporte (arriba a la derecha) para abrir el formulario del período.',
      },
      {
        route: '/reports',
        anchor: 'reporte-anio',
        title: 'Elegí el año',
        body: 'Seleccioná el año del período que querés reportar.',
      },
      {
        route: '/reports',
        anchor: 'reporte-mes',
        title: 'Elegí el mes',
        body: 'Seleccioná el mes del período a reportar.',
      },
      {
        route: '/reports',
        anchor: 'reporte-sobrescribir',
        title: 'Rehacer un reporte ya existente',
        body: 'Si el reporte de ese período ya existe y querés rehacerlo, marcá esta opción para sobrescribirlo.',
      },
      {
        route: '/reports',
        anchor: 'reporte-generar',
        title: 'Generá y esperá',
        body: 'Tocá Generar y esperá. El estado pasa a Generando y luego a Generado. (El recorrido no lo toca: lo generás vos.)',
      },
      {
        route: '/reports',
        anchor: 'reporte-descargar',
        title: 'Descargá o compartí',
        body: 'Cuando este listo, usá el menú de descarga de la fila para bajar el reporte, o compartirlo si tu dispositivo lo permite.',
      },
    ],
  },
  {
    id: 'T5',
    title: 'Calcular las cápitas',
    screen: 'Calculadora de Cápitas',
    route: '/fee-calculator',
    nav: 'En escritorio, Calculadora de Cápitas esta en Configuración en la barra lateral. En el celular, esta en la pestaña Más, dentro de Configuración.',
    access: 'staff',
    // Stems de intencion: calcular las cápitas. "calcul" cubre
    // calcular/calculo/calculadora; "cvs" es el indice propio de esta tarea. Se
    // evita el stem ambiguo "capita" (lo comparten T1 y T5).
    keywords: ['calcul', 'cvs'],
    steps: [
      'Elegí el Mes base; la app toma de referencia las cápitas vigentes de ese mes.',
      'Revisá el Trimestre CVS: se carga solo desde el índice oficial. Si no hay dato, ingresá el CVS a mano.',
      'Mirá la sección de Referencia actual: cápitas estándar y solidaria vigentes, miembros activos de cada tipo y las cápitas de la Gran Logia.',
      'Compará las Propuestas: Ratio GL (mantiene la proporción con la Gran Logia), Base CVS (sigue la inflación) y GL 65%.',
      'Si querés, probá un Escenario personalizado cargando tu propia cápita estándar y solidaria para ver los indicadores.',
      'Con el botón de descarga podés exportar todo a una planilla Excel. La calculadora no modifica nada: el valor elegido se carga despues, a mano, en Cápitas Mensuales.',
    ],
    glossaryTerms: ['capita', 'cvs', 'ratioGl', 'gl65', 'incrementoPropio', 'indiceAnual', 'glPctCapita', 'estandar', 'solidaria'],
    tour: [
      {
        route: '/fee-calculator',
        anchor: 'calc-mes-base',
        title: 'Elegí el mes base',
        body: 'La app toma de referencia las cápitas vigentes de ese mes. Viene preseleccionado el primer mes del trimestre actual.',
      },
      {
        route: '/fee-calculator',
        anchor: 'calc-trimestre-cvs',
        title: 'Revisá el trimestre CVS',
        body: 'Se carga solo desde el índice oficial. Si no hay dato, aparece un campo para ingresar el CVS a mano.',
      },
      {
        route: '/fee-calculator',
        anchor: 'calc-referencia-actual',
        title: 'Mirá la referencia actual',
        body: 'Cápitas estándar y solidaria vigentes, miembros activos de cada tipo y las cápitas de la Gran Logia.',
      },
      {
        route: '/fee-calculator',
        anchor: 'calc-propuestas',
        title: 'Compará las propuestas',
        body: 'Ratio GL (mantiene la proporción con la Gran Logia), Base CVS (sigue la inflación) y GL 65%.',
      },
      {
        route: '/fee-calculator',
        anchor: 'calc-escenario-personalizado',
        title: 'Probá un escenario propio',
        body: 'Cargá tu propia cápita estándar y solidaria para ver los indicadores con esos valores.',
      },
      {
        route: '/fee-calculator',
        anchor: 'calc-exportar',
        title: 'Exportá a Excel',
        body: 'Con el botón de descarga bajás todo a una planilla. La calculadora no modifica nada: el valor elegido se carga despues, a mano, en Cápitas Mensuales.',
      },
    ],
  },
  {
    id: 'T6',
    title: 'Revisar y enviar los recordatorios',
    screen: 'Recordatorios',
    route: '/recordatorios',
    nav: 'En escritorio, Recordatorios esta en Configuración en la barra lateral (con un punto cuando hay pendientes). En el celular, esta como pestaña fija en la barra inferior.',
    access: 'staff',
    // Stems de intencion: recordatorios por WhatsApp. "recordatori" cubre
    // recordatorio/recordatorios; "whatsapp" es el canal de esta tarea.
    keywords: ['recordatori', 'whatsapp'],
    steps: [
      'Abrí Recordatorios: aparece una tarjeta por cada socio con saldo pendiente, con el mensaje ya armado (cápitas y cuotas de eventos).',
      'Leé el mensaje de cada tarjeta y revisá que el detalle de la deuda sea correcto.',
      'Tocá Enviar por WhatsApp para abrir WhatsApp con el mensaje cargado, o Copiar para pegarlo donde quieras. El envío es manual desde tu propio WhatsApp.',
      'Si a un socio le falta el número de WhatsApp, cargalo en formato internacional (por ejemplo +5491155551234) y tocá Guardar número.',
      'Si un socio aparece sin desglose de cuotas, revisá su detalle a mano antes de enviar.',
    ],
    glossaryTerms: ['capita', 'impago', 'demorado', 'matricula'],
    tour: [
      {
        route: '/recordatorios',
        title: 'Una tarjeta por socio con saldo',
        body: 'Aparece una tarjeta por cada socio con saldo pendiente, con el mensaje ya armado (capitas y cuotas de eventos). Si todos estan al dia, no aparece ninguna.',
      },
      {
        route: '/recordatorios',
        title: 'Revisa el mensaje',
        body: 'Lee el mensaje de cada tarjeta y confirma que el detalle de la deuda sea correcto antes de enviarlo.',
      },
      {
        route: '/recordatorios',
        anchor: 'recordatorio-enviar',
        title: 'Envia por WhatsApp',
        body: 'Toca Enviar por WhatsApp para abrir WhatsApp con el mensaje cargado. El envio es manual desde tu propio WhatsApp. (El recorrido no lo envia: lo mandas vos.)',
      },
      {
        route: '/recordatorios',
        anchor: 'recordatorio-copiar',
        title: 'O copia el mensaje',
        body: 'Si preferis, toca Copiar para llevar el mensaje al portapapeles y pegarlo donde quieras.',
      },
      {
        route: '/recordatorios',
        anchor: 'recordatorio-numero',
        title: 'Falta el numero de WhatsApp',
        body: 'Si a un socio le falta el numero, cargalo en formato internacional (por ejemplo +5491155551234). Este campo solo aparece cuando no hay numero guardado.',
      },
      {
        route: '/recordatorios',
        anchor: 'recordatorio-guardar-numero',
        title: 'Guarda el numero',
        body: 'Toca Guardar numero para guardarlo en la ficha del socio. Despues vas a poder enviar el recordatorio por WhatsApp.',
      },
    ],
  },
  {
    id: 'T7',
    title: 'Dar de alta un miembro',
    screen: 'Miembros',
    route: '/members',
    nav: 'En escritorio, Miembros esta en Resumen en la barra lateral. En el celular, es una pestaña fija en la barra inferior.',
    // Acceso 'admin': dar de alta un miembro requiere Tesorero/Administrador (el
    // boton Agregar Miembro solo aparece con isAdmin), aunque la lista de
    // Miembros sea visible para el personal de tesorería.
    access: 'admin',
    // Stems de intencion: alta/gestion de un miembro o socio. "miembro" y
    // "socio" cubren los sustantivos; "dar de alta" cubre el verbo de incorporar
    // (la frase completa evita falsos positivos como "salta" o "resalta").
    keywords: ['miembro', 'socio', 'dar de alta'],
    steps: [
      'En Miembros, tocá el botón para agregar un miembro (arriba a la derecha; solo visible con acceso de edición).',
      'Completá los datos del socio: nombre, matrícula y demas campos de la ficha.',
      'Elegí el tipo de cápita: estándar (la mayoría) o solidaria (monto reducido).',
      'Guardá. El nuevo miembro aparece en la lista y empieza a generar cápita.',
      'Para corregir datos despues, usá el menú de la fila (Editar). Podés filtrar por estado (Activo, Inactivo, Al día, Impago, Demorado, Adelantado) y buscar por nombre o matrícula.',
    ],
    glossaryTerms: ['capita', 'estandar', 'solidaria', 'matricula', 'impago', 'demorado', 'adelantado', 'nc'],
    tour: [
      {
        route: '/members',
        anchor: 'miembro-agregar',
        title: 'Abrí el alta de miembro',
        body: 'Tocá Agregar Miembro (arriba a la derecha). Solo aparece si tenes acceso de edicion. Se abre el formulario del nuevo socio.',
      },
      {
        route: '/members',
        title: 'Completá la ficha y guardá',
        body: 'En el formulario cargá nombre, matricula y los demas datos, elegí el tipo de cápita (estándar para la mayoría, solidaria para monto reducido) y tocá Agregar Miembro. El nuevo socio aparece en la lista y empieza a generar cápita.',
      },
      {
        route: '/members',
        anchor: 'miembro-estado',
        title: 'Filtrá por estado',
        body: 'Con el filtro Estado podés ver los socios por Activo, Inactivo, Al día, Impago, Demorado o Adelantado.',
      },
      {
        route: '/members',
        anchor: 'miembro-buscar',
        title: 'Buscá un miembro',
        body: 'Escribí acá para buscar por nombre o matricula. Para corregir datos despues, usá el menú de la fila (Editar).',
      },
    ],
  },
  {
    id: 'T8',
    title: 'Crear o gestionar un evento',
    screen: 'Eventos',
    route: '/expense-categories',
    nav: 'En escritorio, Eventos esta en Configuración en la barra lateral. En el celular, esta en la pestaña Más, dentro de Configuración. (La ruta /eventos lleva a la misma pantalla.)',
    // Acceso 'admin': crear o gestionar un evento requiere Tesorero/Administrador
    // (Nuevo evento solo aparece con isAdmin), aunque la pantalla de Eventos sea
    // visible para el personal de tesorería.
    access: 'admin',
    // Stems de intencion: crear o gestionar un evento. "evento" cubre
    // evento/eventos.
    keywords: ['evento'],
    steps: [
      'En Eventos, tocá Nuevo evento (arriba a la derecha; solo con acceso de edición).',
      'Poné el Nombre del evento y, si querés, una Descripción.',
      'Cargá la Cuota por miembro (en ARS) y el Número de cuotas (una por mes desde la fecha de cobro).',
      'Si corresponde, elegí Cobrar a partir de (marca el mes de la primera cuota) y la Fecha límite de pago.',
      'Dejá marcada la opción de Asignar cuota a todos los miembros activos si querés generarles el cargo; la app muestra el total estimado.',
      'Tocá Crear evento. Despues podés activar o desactivar, editar o eliminar cada evento, y tocarlo para ver su resumen completo.',
      'Para customizar un evento, tocalo para abrir su resumen: ahi podes elegir que hermanos participan, editar la cuota de cada participante y agregar invitados que no son miembros de la logia.',
    ],
    glossaryTerms: ['impago', 'demorado'],
    tour: [
      {
        route: '/expense-categories',
        anchor: 'evento-nuevo',
        title: 'Abrí Nuevo evento',
        body: 'Tocá Nuevo evento (arriba a la derecha). Solo aparece con acceso de edición.',
      },
      {
        route: '/expense-categories',
        anchor: 'evento-nombre',
        title: 'Poné el nombre',
        body: 'Escribí el Nombre del evento (por ejemplo, Cena de Fin de Año).',
      },
      {
        route: '/expense-categories',
        anchor: 'evento-descripcion',
        title: 'Agregá una descripción',
        body: 'Si querés, sumá una breve Descripción. Es opcional.',
      },
      {
        route: '/expense-categories',
        anchor: 'evento-cuota',
        title: 'Cargá la cuota',
        body: 'Ingresá la Cuota por miembro en ARS.',
      },
      {
        route: '/expense-categories',
        anchor: 'evento-cuotas',
        title: 'Definí el número de cuotas',
        body: 'Indicá el Número de cuotas. Se cobra una por mes desde la fecha de cobro.',
      },
      {
        route: '/expense-categories',
        anchor: 'evento-cobrar-desde',
        title: 'Elegí desde cuándo cobrar',
        body: 'Si corresponde, marcá Cobrar a partir de para fijar el mes de la primera cuota. Es opcional.',
      },
      {
        route: '/expense-categories',
        anchor: 'evento-vencimiento',
        title: 'Poné la fecha límite',
        body: 'Si corresponde, cargá la Fecha límite de pago. Es opcional.',
      },
      {
        route: '/expense-categories',
        anchor: 'evento-asignar',
        title: 'Asigná la cuota a los socios',
        body: 'Dejá marcada la opción de asignar la cuota a todos los miembros activos para generarles el cargo. La app muestra el total estimado.',
      },
      {
        route: '/expense-categories',
        anchor: 'evento-crear',
        title: 'Creá el evento',
        body: 'Cuando todo este correcto, tocá Crear evento. (El recorrido no lo toca: lo creás vos.) Despues podés activar, desactivar, editar o eliminar cada evento.',
      },
    ],
  },
  {
    id: 'T9',
    title: 'Registrar un préstamo nuevo',
    screen: 'Préstamos',
    route: '/loans',
    nav: 'En escritorio, Préstamos esta en Resumen en la barra lateral. En el celular, esta en la pestaña Más.',
    // Acceso 'admin': el boton Nuevo Préstamo solo aparece con isAdmin.
    access: 'admin',
    // Stems de intencion: "prestamo" cubre prestamo/prestamos; "prestar" el verbo.
    keywords: ['prestamo', 'prestar'],
    steps: [
      'En Préstamos, tocá Nuevo Préstamo (arriba a la derecha; solo con acceso de edición).',
      'Elegí el hermano al que le prestás.',
      'Elegí la Cuenta de origen: Cuenta Bancaria Principal (ARS) o Caja de Ahorro (USD). La cuenta define la moneda del préstamo.',
      'Confirmá la Fecha.',
      'Ingresá el Monto; se descuenta de la cuenta elegida.',
      'Tocá Crear préstamo. Despues, cada préstamo lleva su seguimiento de pagos (Agregar Pago desde el menú de la fila).',
    ],
    glossaryTerms: [],
    tour: [
      { route: '/loans', anchor: 'prestamo-nuevo', title: 'Abrí Nuevo Préstamo', body: 'Tocá Nuevo Préstamo (arriba a la derecha). Solo aparece con acceso de edición. Se abre el formulario del préstamo.' },
      { route: '/loans', anchor: 'prestamo-miembro', title: 'Elegí el hermano', body: 'Seleccioná el hermano al que le prestás.' },
      { route: '/loans', anchor: 'prestamo-cuenta', title: 'Elegí la cuenta de origen', body: 'Cuenta Bancaria Principal (ARS) o Caja de Ahorro (USD). La cuenta define la moneda del préstamo.' },
      { route: '/loans', anchor: 'prestamo-fecha', title: 'Confirmá la fecha', body: 'Viene la de hoy; cambiala si corresponde.' },
      { route: '/loans', anchor: 'prestamo-monto', title: 'Ingresá el monto', body: 'El monto se descuenta de la cuenta elegida.' },
      { route: '/loans', anchor: 'prestamo-crear', title: 'Creá el préstamo', body: 'Tocá Crear préstamo. El recorrido no lo toca: lo creás vos.' },
    ],
  },
  {
    id: 'T10',
    title: 'Fijar las cápitas del mes',
    screen: 'Cápitas Mensuales',
    route: '/monthly-fees',
    nav: 'En escritorio, Cápitas Mensuales esta en Configuración en la barra lateral. En el celular, en la pestaña Más, dentro de Configuración.',
    // Acceso 'admin': el boton Agregar cápitas y la edicion solo aparecen con isAdmin.
    access: 'admin',
    // Stems de intencion: fijar/cargar las cápitas mensuales (distinto de T5 calcular).
    keywords: ['capita mensual', 'agregar capita', 'cargar capita'],
    steps: [
      'En Cápitas Mensuales, tocá Agregar cápitas (arriba a la derecha; solo con acceso de edición).',
      'Elegí el mes (se cargan desde el primer día del mes).',
      'Cargá el Monto de la cápita Estándar.',
      'Cargá el Monto de la cápita Solidaria. Si querés, cargá también las cápitas de la Gran Logia (es opcional).',
      'Tocá Guardar cápitas.',
      'Para cambiar una cápita ya cargada, tocá su valor en el Historial de cápitas y editalo.',
    ],
    glossaryTerms: ['capita', 'estandar', 'solidaria', 'gl'],
    tour: [
      { route: '/monthly-fees', anchor: 'capita-agregar', title: 'Abrí Agregar cápitas', body: 'Tocá Agregar cápitas (arriba a la derecha). Solo aparece con acceso de edición. Se abre el formulario.' },
      { route: '/monthly-fees', anchor: 'capita-mes', title: 'Elegí el mes', body: 'Elegí el mes de las cápitas. El calendario solo deja elegir el primer día del mes.' },
      { route: '/monthly-fees', anchor: 'capita-estandar', title: 'Cápita estándar', body: 'Cargá el monto de la cápita estándar (la que paga la mayoría).' },
      { route: '/monthly-fees', anchor: 'capita-solidaria', title: 'Cápita solidaria', body: 'Cargá el monto de la cápita solidaria. Mas abajo podés cargar las cápitas de la Gran Logia (opcional).' },
      { route: '/monthly-fees', anchor: 'capita-guardar', title: 'Guardá las cápitas', body: 'Tocá Guardar cápitas. El recorrido no lo toca: lo guardás vos.' },
      { route: '/monthly-fees', title: 'Editar una cápita ya cargada', body: 'En el Historial de cápitas, tocá cualquier valor para editarlo en el momento.' },
    ],
  },
  {
    id: 'T11',
    title: 'Crear una gestión',
    screen: 'Gestiones',
    route: '/gestiones',
    nav: 'En escritorio, Gestiones esta en Administración en la barra lateral. Entra el Administrador o el Venerable.',
    // Acceso 'admin': /gestiones es admin|vm; el enum no tiene ese nivel, se usa
    // 'admin' para no sobre-mostrar (el vm igual tiene el chat).
    access: 'admin',
    // Stems de intencion: crear una gestion/periodo. Se evita el stem suelto
    // "gestion" porque el chip de T8 contiene "gestiono".
    keywords: ['gestion nueva', 'nueva gestion', 'periodo de gestion'],
    steps: [
      'En Administración → Gestiones, tocá Nueva gestión.',
      'Poné el Nombre del periodo (por ejemplo, Gestión 2027).',
      'Elegí la Fecha de inicio. Esa fecha marca el límite del bloqueo del periodo anterior.',
      'Elegí el Tesorero y el Venerable entrantes (solo aparecen hermanos con usuario).',
      'Tocá Crear gestión. Al crearla, la gestión anterior se cierra y los oficiales elegidos reciben su rol de acceso.',
    ],
    glossaryTerms: [],
    tour: [
      { route: '/gestiones', anchor: 'gestion-nueva', title: 'Abrí Nueva gestión', body: 'Tocá Nueva gestión. Se abre el formulario del periodo.' },
      { route: '/gestiones', anchor: 'gestion-nombre', title: 'Nombre del periodo', body: 'Escribí el nombre (por ejemplo, Gestión 2027).' },
      { route: '/gestiones', anchor: 'gestion-inicio', title: 'Fecha de inicio', body: 'Elegí la fecha de inicio. Marca el límite del bloqueo del periodo anterior.' },
      { route: '/gestiones', anchor: 'gestion-tesorero', title: 'Elegí el Tesorero', body: 'Seleccioná el Tesorero entrante. Solo aparecen hermanos con usuario.' },
      { route: '/gestiones', anchor: 'gestion-vm', title: 'Elegí el Venerable', body: 'Seleccioná el Venerable entrante.' },
      { route: '/gestiones', anchor: 'gestion-crear', title: 'Creá la gestión', body: 'Tocá Crear gestión. El recorrido no lo toca: la creás vos. Cierra la anterior y asigna los roles.' },
    ],
  },
];

/**
 * Pregunta sugerida (chip) por tarea, en lenguaje natural del tesorero. Vive aca
 * (fuente canonica) para que el chat y el test usen el mismo texto y el contrato
 * chip -> tarea no derive si cambia la copia.
 */
export const CHIP_QUESTIONS: Record<KbTaskId, string> = {
  T1: '¿Cómo registro un pago de cápita?',
  T2: '¿Cómo registro un gasto?',
  T3: '¿Cómo transfiero fondos entre cuentas?',
  T4: '¿Cómo genero el reporte mensual?',
  T5: '¿Cómo calculo las cápitas?',
  T6: '¿Cómo reviso y envío los recordatorios?',
  T7: '¿Cómo doy de alta un miembro?',
  T8: '¿Cómo creo o gestiono un evento?',
  T9: '¿Cómo registro un préstamo nuevo?',
  T10: '¿Cómo fijo la cápita mensual?',
  T11: '¿Cómo creo una gestión nueva?',
};

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
 * Información complementaria de la Gran Logia (normas y procedimientos) para que
 * el chat pueda responder preguntas sobre el funcionamiento de la GL. Es texto de
 * referencia (no tareas de la app, por eso no entra en ASISTENTE_TASKS). Se
 * mantienen FUERA los montos concretos (saldos, valores de cápita, montos de
 * derechos): esos no los informa el asistente y están en el manual del tesorero.
 */
export const ASISTENTE_GL_REFERENCE = `GRAN LOGIA (información complementaria para responder preguntas)
- Fecha clave: la Gran Logia cierra el mes y debita las obligaciones el día 5 de cada mes (cierre mensual automático). Los fondos tienen que estar acreditados antes del día 5. El pago abarca los 12 meses del año, incluido enero. Conviene depositar a fin del mes anterior.
- Informar el pago: todo depósito o transferencia a la GL se informa en el Área Reservada de la Gran Logia (sitio web de la GL, menú Tesorería, Informar Pago) con comprobante, fecha, importe y a qué logia o hermano se imputa. Informar un pago no es acreditarlo: la GL lo acredita cuando verifica los fondos.
- Decreto 8.410: si el día 5 la cuenta queda con saldo positivo (cero o más) la logia está "a plomo" y accede a los beneficios. Beneficio: la GL reintegra automáticamente ciertos derechos ya pagados: Iniciación si estuvo al día 6 meses seguidos del semestre; Aumento de Salario y Exaltación si estuvo al día los 12 meses del año. Si el día 5 queda en saldo negativo, pierde el beneficio y se le cobran punitorios (Tasa Efectiva Mensual del Banco Nación más 1%).
- Derechos: cuando un hermano se inicia, asciende (aumento de salario) o es exaltado, la logia le cobra un derecho que luego paga a la GL (Pago GL). Como referencia, en múltiplos de cápita: el aumento de salario (paso a Compañero) equivale a 2 cápitas y la exaltación (paso a Maestro) a 3 cápitas; la iniciación es un derecho fijo cuyo valor vigente está en el manual. Estando a plomo, la GL los reintegra por el Decreto 8.410.
- Ajuste de cápitas (CVS): los aranceles de la GL se actualizan solos cada trimestre según el índice CVS del INDEC, a trimestre vencido. La logia no fija esos valores; se publican cada mes en el Boletín Oficial. En la app, la Calculadora de Cápitas ayuda a proyectarlos.
- Tipos de cápita de la GL: Cuota Gran Logia (plena), Menores de 25 (automático, cesa a los 25), Estudios Superiores (terciario o grado, hasta los 30, requiere constancia de alumno regular cada año), Locación (logias que alquilan su espacio) y Cápita Social.
- Cápita social: beneficio excepcional y temporario (vigencia 3 meses, renovable) para un hermano con dificultad económica. La solicita la logia a través del Venerable Maestro ante la Gran Tesorería (Área Reservada o email cobranzas@masoneria-argentina.org.ar) con la planilla completa, firma del VM y del hermano, nota del VM avalando y justificación. Cupo: hasta el 30% de los miembros que capitan al 100%. En la app se refleja poniendo al hermano en cápita Solidaria.`;

/**
 * Funciones de la app que todavía no tienen una tarea guiada (T1..T8) pero sobre
 * las que el tesorero puede preguntar. Texto de referencia para el chat, para
 * cubrir la mayoría de los temas del manual sin inventar pasos.
 */
export const ASISTENTE_APP_EXTRA = `OTRAS FUNCIONES DE LA APP (para responder preguntas; sin recorrido guiado)
- Pago de la cápita a la GL: es un Gasto con categoría Pago GL desde la cuenta de la Gran Logia. Cada mes se registran tres conceptos (el concepto va en la Nota): CMI, Fondo Inmobiliario y la Cápita del mes.
- Préstamos: en Préstamos ves los préstamos activos y los totales (adeudado, pagado, pendiente). Nuevo Préstamo: elegís el hermano, el monto y la cuenta de origen (cuenta principal en pesos = préstamo en pesos; caja de ahorro en dólares = préstamo en dólares); el monto se descuenta de esa cuenta. Para registrar un pago usás el menú de la fila del préstamo (Agregar Pago) o Registrar movimiento, pestaña Préstamo; el pago toma la moneda del préstamo.
- Gastos de un evento: no se cargan como Otro Gasto; se registran desde Registrar movimiento, pestaña Evento, asociados al evento, para que impacten en el balance del evento.
- Cápitas Mensuales: fija el valor de la cápita estándar y solidaria de cada mes. Tocás un valor del historial para editarlo, o Agregar cápitas para un mes nuevo. La Calculadora solo proyecta; el valor se carga a mano acá.
- Gestiones (Administración): registra los períodos de gestión con sus fechas y los oficiales (Tesorero y Venerable). Al crear una gestión nueva se cierra la anterior y los oficiales elegidos reciben el rol de acceso.
- Bloqueo de periodos: al abrir una gestión nueva, el período anterior queda cerrado. El Tesorero solo edita la gestión abierta; un período cerrado solo lo pueden ajustar el Administrador o el Venerable.
- Bitácora (Administración): registra quién creó, editó o eliminó cada movimiento y cada parámetro, con la fecha y el detalle del cambio.
- Accesos y Roles (Administración): crea los usuarios y define sus roles (Tesorero, Venerable, Administrador, Bibliotecario, Miembro). Un usuario puede tener más de un rol. Tesorero y Venerable se asignan desde Gestiones; los demás, acá.
- Ajustar a un hermano a cápita social: para pasar a un hermano a cápita Solidaria, o volverlo a Estándar, se edita su ficha en Administración, Miembros, con el menú de la fila, Editar, cambiando el Tipo de Cápita. Cada miembro tiene un Historial de tipo de cápita.
- Alta de un hermano nuevo: en Miembros, Agregar Miembro. Poné la Fecha de Ingreso en el mes siguiente a la iniciación, porque la cápita se paga por adelantado y empieza a correr ese mes.
- Desactivar un miembro: si un hermano ya no forma parte del taller, editá su ficha en Administración, Miembros, menú de la fila, Editar, y marcalo como inactivo. Desde ese mes deja de generar cápita.
- Transición y entrega del cargo: al cierre del año se cierra la gestión y se crea la nueva con los oficiales entrantes (reasigna accesos y bloquea el período anterior). Conviene validar que los saldos de las cuentas coincidan con los extractos y revisar el estado de cuenta en el Área Reservada de la GL.`;

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

  lines.push('');
  lines.push(ASISTENTE_GL_REFERENCE.trim());
  lines.push('');
  lines.push(ASISTENTE_APP_EXTRA.trim());

  return lines.join('\n');
}
