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

export type KbTaskId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8';

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
    screen: 'Registrar Pago',
    route: '/log-payment',
    nav: 'En el celular, tocá el botón "+" central de la barra inferior y elegí registrar un ingreso. En escritorio, abrí el formulario de movimiento desde Detalle financiero (Panel).',
    access: 'admin',
    // Stems de intencion: registrar un pago/cobro. Se evita el stem ambiguo
    // "capita" (lo comparten T1 y T5); el chip lleva el id explicito, asi que
    // no lo necesita.
    keywords: ['pago', 'pagar', 'pague', 'cobro', 'cobrar', 'ingreso'],
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
    // Recorrido guiado: resalta cada control en el orden real del formulario de
    // Registrar Pago. Solo muestra y describe; no completa ni envia nada. El
    // usuario hace cada paso. Los textos salen de los pasos de T1 de arriba.
    tour: [
      {
        route: '/log-payment',
        anchor: 'pago-cuenta',
        title: 'Elegí la cuenta',
        body: 'Seleccioná la cuenta donde entra el dinero: Banco, Gran Logia o Ahorros. Ahorros es en USD; las demas en ARS.',
      },
      {
        route: '/log-payment',
        anchor: 'pago-fecha',
        title: 'Confirmá la fecha',
        body: 'Viene la fecha de hoy. Cambiala si el pago corresponde a otro día.',
      },
      {
        route: '/log-payment',
        anchor: 'pago-monto',
        title: 'Revisá el monto',
        body: 'Con la categoría Cápita Mensual, el monto se completa solo con la cápita estándar del mes. Ajustalo si hace falta.',
      },
      {
        route: '/log-payment',
        anchor: 'pago-categoria',
        title: 'Dejá la categoría en Cápita Mensual',
        body: 'Es la opción por defecto para un pago de cápita. No hace falta cambiarla.',
      },
      {
        route: '/log-payment',
        anchor: 'pago-miembro',
        title: 'Elegí el miembro',
        body: 'Seleccioná el socio que paga. Si es un invitado, elegí Invitado.',
      },
      {
        route: '/log-payment',
        anchor: 'pago-guardar',
        title: 'Guardá el pago',
        body: 'Cuando todo este correcto, tocá Registrar Pago. (El recorrido no lo toca: lo guardás vos.)',
      },
    ],
  },
  {
    id: 'T2',
    title: 'Registrar un gasto',
    screen: 'Registrar Gasto',
    route: '/log-expense',
    nav: 'En el celular, tocá el botón "+" central de la barra inferior y elegí registrar un gasto. En escritorio, abrí el formulario de movimiento desde Detalle financiero (Panel).',
    access: 'admin',
    // Stems de intencion: registrar un gasto/egreso. "gast" cubre gasto/gastos/gastar.
    keywords: ['gast', 'egreso'],
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
    tour: [
      {
        route: '/log-expense',
        anchor: 'gasto-cuenta',
        title: 'Elegí la cuenta',
        body: 'Seleccioná la cuenta de donde sale el dinero: Banco, Gran Logia o Ahorros. Ahorros es en USD; las demas en ARS.',
      },
      {
        route: '/log-expense',
        anchor: 'gasto-fecha',
        title: 'Confirmá la fecha',
        body: 'Viene la fecha de hoy. Cambiala si el gasto corresponde a otro día.',
      },
      {
        route: '/log-expense',
        anchor: 'gasto-monto',
        title: 'Ingresá el monto',
        body: 'Cargá el monto del gasto en la moneda de la cuenta elegida.',
      },
      {
        route: '/log-expense',
        anchor: 'gasto-categoria',
        title: 'Elegí la categoría',
        body: 'Gasto de Evento, Aporte a la organización matriz u Otro Gasto.',
      },
      {
        route: '/log-expense',
        anchor: 'gasto-evento',
        title: 'Seleccioná el evento',
        body: 'Solo si elegiste Gasto de Evento: indicá el evento al que corresponde. Su nombre se agrega a la nota.',
      },
      {
        route: '/log-expense',
        anchor: 'gasto-guardar',
        title: 'Guardá el gasto',
        body: 'Cuando todo este correcto, tocá Registrar Gasto. (El recorrido no lo toca: lo guardás vos.)',
      },
    ],
  },
  {
    id: 'T3',
    title: 'Transferir fondos entre cuentas',
    screen: 'Transferir Fondos',
    route: '/account-transfer',
    nav: 'En escritorio, entrá desde el menú de tesorería al historial de transferencias. En el celular, abrilo desde la pestaña Más. Una vez en la pantalla, tocá Nueva transferencia.',
    access: 'admin',
    // Stems de intencion: transferir entre cuentas. "transf" cubre
    // transferir/transferencia; "entre cuentas" desambigua de un movimiento comun.
    keywords: ['transf', 'entre cuentas'],
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
    tour: [
      {
        route: '/account-transfer',
        anchor: 'transfer-nueva',
        title: 'Abrí una transferencia',
        body: 'Tocá Nueva Transferencia para abrir el formulario.',
      },
      {
        route: '/account-transfer',
        anchor: 'transfer-origen',
        title: 'Elegí la cuenta de origen',
        body: 'Seleccioná la cuenta de donde sale el dinero. Debe ser distinta de la de destino.',
      },
      {
        route: '/account-transfer',
        anchor: 'transfer-destino',
        title: 'Elegí la cuenta de destino',
        body: 'Seleccioná la cuenta a donde entra el dinero. Tiene que ser distinta de la de origen.',
      },
      {
        route: '/account-transfer',
        anchor: 'transfer-fecha',
        title: 'Confirmá la fecha',
        body: 'Viene la fecha de hoy. Cambiala si la transferencia corresponde a otro día.',
      },
      {
        route: '/account-transfer',
        anchor: 'transfer-monto',
        title: 'Ingresá el monto',
        body: 'Cargá el monto a transferir. Si origen y destino usan la misma moneda, alcanza con este campo.',
      },
      {
        route: '/account-transfer',
        title: 'Si son monedas distintas',
        body: 'Cuando origen y destino usan monedas distintas (por ejemplo ARS y USD en Ahorros), se abren dos campos: el monto que sale y el que llega. La app calcula el tipo de cambio implicito y avisa si se aparta mucho del vigente.',
      },
      {
        route: '/account-transfer',
        anchor: 'transfer-completar',
        title: 'Completá la transferencia',
        body: 'Cuando todo este correcto, tocá Completar Transferencia. Queda registrada en el historial. (El recorrido no lo toca: lo guardás vos.)',
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
      'Cuando este listo, usá el menú de descarga de la fila para bajar el reporte Completo o el Resumen, o compartirlo si tu dispositivo lo permite.',
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
        body: 'Cuando este listo, usá el menú de descarga de la fila para bajar el Reporte Completo o el Resumen, o compartirlo si tu dispositivo lo permite.',
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
