## Cambios propuestos

### 1. Base de datos
Agregar columna `payment_deadline DATE` (nullable) a la tabla `extraordinary_expenses`. Permite definir fecha límite de pago por evento.

### 2. Crear/Editar evento (`ExtraordinaryExpenses.tsx`)
- Nuevo campo opcional **"Fecha límite de pago"** (date picker) en el formulario de crear y editar evento.
- Se guarda en `payment_deadline`.

### 3. Lógica de estado por evento
Para cada miembro con saldo pendiente en un evento activo:
- **Al día**: pagó completo, o no hay deadline configurado.
- **Demorado (evento)**: hoy ≥ (deadline − 15 días) y hoy ≤ deadline, no pagó completo.
- **Moroso (evento)**: hoy > deadline y no pagó completo.

### 4. Dashboard — KPIs (separación estricta capitas ↔ eventos)
Reemplazar las tarjetas actuales:

```text
Antes:                          Después:
┌─────────────┬────────────┐    ┌─────────────┬────────────┐
│ Pendiente   │ Pago       │    │ Pendiente   │ Pago       │
│ Capita      │ Demorado   │    │ Capita      │ Demorado   │
│ (mezcla)    │ (mezcla)   │    │ (cuotas)    │ (cuotas)   │
└─────────────┴────────────┘    ├─────────────┼────────────┤
                                │ Demorado    │ Moroso     │
                                │ Evento      │ Evento     │
                                └─────────────┴────────────┘
```

- **Pendiente Capita**: miembros activos con cuotas mensuales sin pagar (no incluye eventos).
- **Pago Demorado** (capitas): activos que deben > 1 cuota mensual (no incluye eventos).
- **Demorado Evento**: activos con deuda en al menos un evento dentro de los 15 días previos al deadline.
- **Moroso Evento**: activos con deuda en al menos un evento ya vencido.

### 5. "Miembros que Requieren Atención"
Cada fila lista por separado los chips:
- `Cuotas` (rojo) — debe > 1 cuota
- `Evento Demorado` (ámbar)
- `Evento Moroso` (rojo intenso)

Sin combinar ambos mundos en un único estado.

### 6. Archivos a modificar
- `supabase` migración (nueva columna `payment_deadline`)
- `src/hooks/useExtraordinaryExpenses.ts` (tipo + create/update)
- `src/pages/ExtraordinaryExpenses.tsx` (formularios)
- `src/pages/Dashboard.tsx` (KPIs + lista de atención + cálculo separado de event debts con deadline)
- `src/pages/EventOverview.tsx` (mostrar deadline + estado por miembro) — opcional/menor
- `src/i18n/locales/es.ts` (nuevas etiquetas)

### Notas técnicas
- La query `memberEventDebts` ya usa `event_member_payments`. La extiendo para hacer JOIN con `extraordinary_expenses` y traer `payment_deadline` + `is_active`, así puedo clasificar por evento (solo eventos activos cuentan).
- Si un evento no tiene deadline, su deuda no genera "demorado/moroso" (solo aparece como saldo pendiente sin badge de morosidad).
