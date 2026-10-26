/**
 * @file Bitacora.tsx
 * @description Admin/Venerable audit log screen: who created, edited or deleted
 *   each money movement or parameter, with the before/after detail. Read-only;
 *   behind UserAdminRoute (admin|vm). Data comes from the audit_log table.
 */
import { useState } from 'react';
import { ScrollText, Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { useAuditLog, type AuditEntry } from '@/hooks/useAuditLog';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LodgeLoader } from '@/components/lodge/LodgeLoader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/PageHeader';

const TABLE_LABELS: Record<string, string> = {
  transactions: 'Movimiento',
  account_transfers: 'Transferencia',
  loans: 'Préstamo',
  loan_payments: 'Pago de préstamo',
  event_member_payments: 'Pago de evento',
  monthly_fees: 'Cápita (valor)',
  extraordinary_expenses: 'Evento',
  budget_scenario_parameters: 'Parámetro de presupuesto',
  organization_settings: 'Configuración',
  members: 'Miembro',
};

const ACTION_LABELS: Record<string, string> = { INSERT: 'Creó', UPDATE: 'Editó', DELETE: 'Eliminó' };

function tableLabel(name: string): string {
  return TABLE_LABELS[name] ?? name;
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

const IGNORED_FIELDS = new Set(['created_at', 'updated_at', 'id']);

/** Fields that changed (UPDATE) or the row's fields (INSERT/DELETE). */
function fieldChanges(entry: AuditEntry): Array<{ field: string; from: unknown; to: unknown }> {
  const oldData = entry.old_data ?? {};
  const newData = entry.new_data ?? {};
  if (entry.action === 'UPDATE') {
    const keys = Array.from(new Set([...Object.keys(oldData), ...Object.keys(newData)]));
    return keys
      .filter((k) => !IGNORED_FIELDS.has(k) && JSON.stringify(oldData[k]) !== JSON.stringify(newData[k]))
      .map((k) => ({ field: k, from: oldData[k], to: newData[k] }));
  }
  const src = entry.action === 'DELETE' ? oldData : newData;
  return Object.keys(src)
    .filter((k) => !IGNORED_FIELDS.has(k))
    .map((k) => ({ field: k, from: undefined, to: src[k] }));
}

function ActionBadge({ action }: { action: AuditEntry['action'] }) {
  if (action === 'INSERT') {
    return (
      <Badge variant="default" className="bg-success/10 text-success border-success/20">
        <Plus className="h-3 w-3 mr-1" /> {ACTION_LABELS.INSERT}
      </Badge>
    );
  }
  if (action === 'DELETE') {
    return (
      <Badge variant="destructive">
        <Trash2 className="h-3 w-3 mr-1" /> {ACTION_LABELS.DELETE}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Pencil className="h-3 w-3 mr-1" /> {ACTION_LABELS.UPDATE}
    </Badge>
  );
}

export default function Bitacora() {
  const { entries, isLoading, error } = useAuditLog();
  const { users } = useUserRoles();

  const [tableFilter, setTableFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [detail, setDetail] = useState<AuditEntry | null>(null);

  const actorLabel = (id: string | null) => {
    if (!id) return 'Sistema';
    return users?.find((u) => u.user_id === id)?.email ?? 'Usuario eliminado';
  };

  const filtered = entries.filter(
    (e) => (tableFilter === 'all' || e.table_name === tableFilter) && (actionFilter === 'all' || e.action === actionFilter),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Bitácora" subtitle="Registro de cambios en movimientos y parámetros" hairline />

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            Actividad reciente
          </CardTitle>
          <CardDescription>Quién creó, editó o eliminó cada registro, con el detalle del cambio.</CardDescription>
          <div className="flex flex-wrap gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <Select value={tableFilter} onValueChange={setTableFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.keys(TABLE_LABELS).map((k) => (
                    <SelectItem key={k} value={k}>{TABLE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Acción</Label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="INSERT">Creó</SelectItem>
                  <SelectItem value="UPDATE">Editó</SelectItem>
                  <SelectItem value="DELETE">Eliminó</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LodgeLoader />
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground">
              <ScrollText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No se pudo leer la bitácora. Si recién corriste el SQL, probá recargar en un momento.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ScrollText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Todavía no hay cambios registrados.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(e.changed_at).toLocaleString('es-AR', {
                        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="text-sm break-all">{actorLabel(e.actor_user_id)}</TableCell>
                    <TableCell><ActionBadge action={e.action} /></TableCell>
                    <TableCell className="whitespace-nowrap">{tableLabel(e.table_name)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setDetail(e)} aria-label="Ver detalle">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail ? `${ACTION_LABELS[detail.action]} · ${tableLabel(detail.table_name)}` : 'Detalle'}
            </DialogTitle>
            <DialogDescription>
              {detail
                ? `${actorLabel(detail.actor_user_id)} · ${new Date(detail.changed_at).toLocaleString('es-AR')}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-2 py-2">
              {fieldChanges(detail).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin cambios de campos registrados.</p>
              ) : (
                <div className="rounded-md border divide-y">
                  {detail.action === 'UPDATE' && (
                    <div className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>Campo</span><span>Antes</span><span>Después</span>
                    </div>
                  )}
                  {fieldChanges(detail).map((c) => (
                    <div key={c.field} className="grid grid-cols-[1fr_1fr_1fr] gap-2 px-3 py-2 text-sm">
                      <span className="font-medium break-all">{c.field}</span>
                      {detail.action === 'UPDATE' ? (
                        <>
                          <span className="text-muted-foreground break-all">{formatVal(c.from)}</span>
                          <span className="break-all">{formatVal(c.to)}</span>
                        </>
                      ) : (
                        <span className="col-span-2 break-all">{formatVal(c.to)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
