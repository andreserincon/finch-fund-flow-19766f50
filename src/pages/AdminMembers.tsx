import { useState } from 'react';
import { useMembers } from '@/hooks/useMembers';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { AddMemberForm } from '@/components/forms/AddMemberForm';
import { EditMemberForm } from '@/components/forms/EditMemberForm';
import { DeleteMemberDialog } from '@/components/forms/DeleteMemberDialog';
import { FeeTypeHistoryDialog } from '@/components/forms/FeeTypeHistoryDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, MoreHorizontal, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FEE_TYPE_LABELS, MemberBalance } from '@/lib/types';
import { parseLocalDate } from '@/lib/utils';

type SortColumn = 'matricula' | 'name' | 'fee_type' | 'joined';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  column: SortColumn | null;
  direction: SortDirection;
}

export default function AdminMembers() {
  const { memberBalances, isLoading, updateMember } = useMembers();
  const { isAdmin } = useIsAdmin();
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: 'asc' });
  const [editMember, setEditMember] = useState<MemberBalance | null>(null);
  const [deleteMember, setDeleteMember] = useState<MemberBalance | null>(null);
  const [editingMatricula, setEditingMatricula] = useState<string | null>(null);
  const [matriculaValue, setMatriculaValue] = useState('');

  const handleSort = (column: SortColumn) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) return <ArrowUpDown className="ml-1 h-4 w-4" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-1 h-4 w-4" />
      : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const filteredMembers = memberBalances.filter((member) =>
    member.full_name.toLowerCase().includes(search.toLowerCase()) ||
    member.phone_number.includes(search)
  );

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (!sortConfig.column) return 0;
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.column) {
      case 'matricula': return direction * a.phone_number.localeCompare(b.phone_number);
      case 'name': return direction * a.full_name.localeCompare(b.full_name);
      case 'fee_type': return direction * a.fee_type.localeCompare(b.fee_type);
      case 'joined': return direction * (parseLocalDate(a.join_date).getTime() - parseLocalDate(b.join_date).getTime());
      default: return 0;
    }
  });

  const startEditMatricula = (member: MemberBalance) => {
    setEditingMatricula(member.member_id);
    setMatriculaValue(member.phone_number);
  };

  const saveMatricula = async (member: MemberBalance) => {
    if (matriculaValue.trim() && matriculaValue !== member.phone_number) {
      await updateMember.mutateAsync({
        id: member.member_id,
        phone_number: matriculaValue.trim(),
      });
    }
    setEditingMatricula(null);
  };

  const cancelEditMatricula = () => {
    setEditingMatricula(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Miembros</h1>
          <p className="text-sm text-muted-foreground">
            {memberBalances.filter((m) => m.is_active).length} miembros activos
          </p>
        </div>
        {isAdmin && <AddMemberForm />}
      </div>

      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o matrícula..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden landscape-hide-cards space-y-3">
        {sortedMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">No se encontraron miembros</div>
        ) : (
          sortedMembers.map((member) => (
            <div key={member.member_id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Mat. {member.phone_number}</p>
                  <p className="font-semibold">{member.full_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!member.is_active && <Badge variant="outline">Inactivo</Badge>}
                  <FeeTypeHistoryDialog memberId={member.member_id} memberName={member.full_name} />
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={() => setEditMember(member)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteMember(member)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Tipo de Cuota</p>
                  <Badge variant="secondary" className="mt-1">{FEE_TYPE_LABELS[member.fee_type]}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Ingreso</p>
                  <p className="font-mono text-sm">{format(parseLocalDate(member.join_date), 'd MMM yyyy', { locale: es })}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block landscape-table rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('matricula')}>Matrícula{getSortIcon('matricula')}</Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('name')}>Miembro{getSortIcon('name')}</Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('fee_type')}>Tipo de Cuota{getSortIcon('fee_type')}</Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('joined')}>Ingreso{getSortIcon('joined')}</Button>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No se encontraron miembros</TableCell>
              </TableRow>
            ) : (
              sortedMembers.map((member) => (
                <TableRow key={member.member_id}>
                  <TableCell>
                    {editingMatricula === member.member_id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={matriculaValue}
                          onChange={(e) => setMatriculaValue(e.target.value)}
                          className="h-7 w-20 text-sm"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveMatricula(member);
                            if (e.key === 'Escape') cancelEditMatricula();
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => saveMatricula(member)}>
                          <Check className="h-3 w-3 text-success" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEditMatricula}>
                          <X className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    ) : (
                      <span
                        className="font-mono text-sm cursor-pointer hover:text-primary hover:underline"
                        onClick={() => isAdmin && startEditMatricula(member)}
                        title={isAdmin ? 'Click para editar' : undefined}
                      >
                        {member.phone_number || '—'}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{member.full_name}</p>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{FEE_TYPE_LABELS[member.fee_type]}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{format(parseLocalDate(member.join_date), 'd MMM yyyy', { locale: es })}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <FeeTypeHistoryDialog memberId={member.member_id} memberName={member.full_name} />
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /><span className="sr-only">Abrir menú</span></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => setEditMember(member)}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteMember(member)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" />Eliminar</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditMemberForm member={editMember} open={!!editMember} onOpenChange={(open) => !open && setEditMember(null)} />
      <DeleteMemberDialog member={deleteMember} open={!!deleteMember} onOpenChange={(open) => !open && setDeleteMember(null)} />
    </div>
  );
}
