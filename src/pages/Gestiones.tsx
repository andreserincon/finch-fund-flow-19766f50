/**
 * @file Gestiones.tsx
 * @description Admin/Venerable screen to manage lodge administrative periods
 *   (gestiones): list them with their dates and officers, and open a new one
 *   (which closes the current open gestion). Behind UserAdminRoute (admin|vm).
 *   The open gestion's start date will anchor the closed-period lock in Fase 2.
 */
import { useState } from 'react';
import { CalendarClock, Plus, CheckCircle, Lock, RefreshCw } from 'lucide-react';
import { useGestiones } from '@/hooks/useGestiones';
import { useMembers } from '@/hooks/useMembers';
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
  const { gestiones, currentGestion, isLoading, createGestion } = useGestiones();
  const { members } = useMembers();

  const activeMembers = members.filter((m) => m.is_active);
  const memberName = (id: string | null) =>
    id ? members.find((m) => m.id === id)?.full_name ?? 'Miembro eliminado' : '-';

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [tesoreroId, setTesoreroId] = useState<string>(NONE);
  const [vmId, setVmId] = useState<string>(NONE);

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
                      {activeMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
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
                      {activeMembers.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
