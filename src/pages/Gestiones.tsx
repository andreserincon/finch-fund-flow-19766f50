/**
 * @file Gestiones.tsx
 * @description Admin/Venerable screen to manage lodge administrative periods
 *   (gestiones): list them with their dates and officers, and open a new one
 *   (which closes the current open gestion). Behind UserAdminRoute (admin|vm).
 *   The open gestion's start date will anchor the closed-period lock in Fase 2.
 */
import { useState } from 'react';
import { CalendarClock, Plus, CheckCircle, Lock, RefreshCw, Pencil } from 'lucide-react';
import { useGestiones, type Gestion } from '@/hooks/useGestiones';
import { useMembers } from '@/hooks/useMembers';
import { useUserRoles } from '@/hooks/useUserRoles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LodgeLoader } from '@/components/lodge/LodgeLoader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/PageHeader';

const NONE = 'none';

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-AR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function Gestiones() {
  const { gestiones, currentGestion, isLoading, createGestion, editGestion } = useGestiones();
  const { members } = useMembers();
  const { users } = useUserRoles();

  // Un oficial debe tener usuario: el selector lista solo miembros vinculados a
  // un usuario (dedup por miembro, por si un miembro tuviera mas de un usuario).
  const officerOptions = Array.from(
    new Map(
      (users ?? [])
        .filter((u) => u.member_id && u.member_name)
        .map((u) => [u.member_id as string, u.member_name as string]),
    ).entries(),
  ).map(([member_id, member_name]) => ({ member_id, member_name }));

  const memberName = (id: string | null) =>
    id ? members.find((m) => m.id === id)?.full_name ?? 'Miembro eliminado' : '-';

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [tesoreroId, setTesoreroId] = useState<string>(NONE);
  const [vmId, setVmId] = useState<string>(NONE);

  const [editingGestion, setEditingGestion] = useState<Gestion | null>(null);
  const [eNombre, setENombre] = useState('');
  const [eInicio, setEInicio] = useState('');
  const [eFin, setEFin] = useState('');
  const [eTesorero, setETesorero] = useState<string>(NONE);
  const [eVm, setEVm] = useState<string>(NONE);

  const resetForm = () => {
    setNombre('');
    setFechaInicio('');
    setTesoreroId(NONE);
    setVmId(NONE);
  };

  const canSubmit = nombre.trim().length > 0 && fechaInicio.length > 0 && !createGestion.isPending;

  const handleCreate = async () => {
    await createGestion.mutateAsync({
      nombre: nombre.trim(),
      fecha_inicio: fechaInicio,
      tesorero_member_id: tesoreroId === NONE ? null : tesoreroId,
      vm_member_id: vmId === NONE ? null : vmId,
    });
    setIsDialogOpen(false);
    resetForm();
  };

  const openEdit = (g: Gestion) => {
    setEditingGestion(g);
    setENombre(g.nombre);
    setEInicio(g.fecha_inicio);
    setEFin(g.fecha_fin ?? '');
    setETesorero(g.tesorero_member_id ?? NONE);
    setEVm(g.vm_member_id ?? NONE);
  };

  const canEdit = eNombre.trim().length > 0 && eInicio.length > 0 && !editGestion.isPending;

  const handleEdit = async () => {
    if (!editingGestion) return;
    await editGestion.mutateAsync({
      id: editingGestion.id,
      isOpen: editingGestion.estado === 'abierta',
      nombre: eNombre.trim(),
      fecha_inicio: eInicio,
      fecha_fin: eFin || null,
      tesorero_member_id: eTesorero === NONE ? null : eTesorero,
      vm_member_id: eVm === NONE ? null : eVm,
      prevTesoreroMemberId: editingGestion.tesorero_member_id,
      prevVmMemberId: editingGestion.vm_member_id,
    });
    setEditingGestion(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestiones"
        subtitle="Periodos de gestión del Tesorero y el Venerable"
        hairline
        actions={
          <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nueva gestión
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nueva gestión</DialogTitle>
                <DialogDescription>
                  Al crearla, la gestión abierta actual queda cerrada y su fecha de fin se fija en el día
                  anterior al inicio de esta. El inicio de la gestión abierta marca el límite del bloqueo.
                  El Tesorero y el Venerable elegidos reciben ese rol de acceso; el saliente pasa a Miembro.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="gestion-nombre">Nombre</Label>
                  <Input
                    id="gestion-nombre"
                    placeholder="Gestión 2027"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gestion-inicio">Fecha de inicio</Label>
                  <Input
                    id="gestion-inicio"
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tesorero</Label>
                  <Select value={tesoreroId} onValueChange={setTesoreroId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin asignar</SelectItem>
                      {officerOptions.map((o) => (
                        <SelectItem key={o.member_id} value={o.member_id}>{o.member_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Venerable</Label>
                  <Select value={vmId} onValueChange={setVmId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sin asignar</SelectItem>
                      {officerOptions.map((o) => (
                        <SelectItem key={o.member_id} value={o.member_id}>{o.member_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Solo aparecen miembros con usuario. Si falta alguien, creá su usuario en Accesos y Roles.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleCreate} disabled={!canSubmit}>
                  {createGestion.isPending ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Creando
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Crear gestión
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Historial de gestiones
          </CardTitle>
          <CardDescription>
            {currentGestion
              ? `Gestión abierta: ${currentGestion.nombre} (desde ${formatDate(currentGestion.fecha_inicio)})`
              : 'No hay ninguna gestión abierta todavía. Creá la primera para empezar a registrar los periodos.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LodgeLoader />
          ) : gestiones.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarClock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Todavía no hay gestiones registradas.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead className="hidden md:table-cell">Tesorero</TableHead>
                  <TableHead className="hidden md:table-cell">Venerable</TableHead>
                  <TableHead className="text-right">Estado</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gestiones.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium whitespace-nowrap">{g.nombre}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(g.fecha_inicio)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(g.fecha_fin)}</TableCell>
                    <TableCell className="hidden md:table-cell">{memberName(g.tesorero_member_id)}</TableCell>
                    <TableCell className="hidden md:table-cell">{memberName(g.vm_member_id)}</TableCell>
                    <TableCell className="text-right">
                      {g.estado === 'abierta' ? (
                        <Badge variant="default" className="bg-success/10 text-success border-success/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Abierta
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          <Lock className="h-3 w-3 mr-1" />
                          Cerrada
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(g)}
                        aria-label="Editar gestión"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingGestion} onOpenChange={(o) => { if (!o) setEditingGestion(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar gestión</DialogTitle>
            <DialogDescription>
              {editingGestion?.estado === 'abierta'
                ? 'Al guardar, el Tesorero y el Venerable elegidos reciben su rol de acceso; si reemplazás a uno, el saliente pierde ese rol.'
                : 'Editás los datos de una gestión cerrada. No se cambian roles de acceso (los roles reflejan la gestión abierta).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nombre">Nombre</Label>
              <Input id="edit-nombre" value={eNombre} onChange={(e) => setENombre(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-inicio">Fecha de inicio</Label>
                <Input id="edit-inicio" type="date" value={eInicio} onChange={(e) => setEInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-fin">Fecha de fin</Label>
                <Input id="edit-fin" type="date" value={eFin} onChange={(e) => setEFin(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tesorero</Label>
              <Select value={eTesorero} onValueChange={setETesorero}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin asignar</SelectItem>
                  {officerOptions.map((o) => (
                    <SelectItem key={o.member_id} value={o.member_id}>{o.member_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Venerable</Label>
              <Select value={eVm} onValueChange={setEVm}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin asignar</SelectItem>
                  {officerOptions.map((o) => (
                    <SelectItem key={o.member_id} value={o.member_id}>{o.member_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Solo aparecen miembros con usuario. Si falta alguien, creá su usuario en Accesos y Roles.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGestion(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={!canEdit}>
              {editGestion.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Guardando
                </>
              ) : (
                'Guardar cambios'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
