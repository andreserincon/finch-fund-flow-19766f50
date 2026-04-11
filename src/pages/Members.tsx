import { useState } from 'react';
import { useHiddenMode } from '@/contexts/HiddenModeContext';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AddMemberForm } from '@/components/forms/AddMemberForm';
import { EditMemberForm } from '@/components/forms/EditMemberForm';
import { DeleteMemberDialog } from '@/components/forms/DeleteMemberDialog';
import { FeeTypeHistoryDialog } from '@/components/forms/FeeTypeHistoryDialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { Search, MoreHorizontal, Pencil, Trash2, Filter, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FEE_TYPE_LABELS, MemberBalance } from '@/lib/types';
import { parseLocalDate } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'ahead', label: 'Adelantado' },
  { value: 'up_to_date', label: 'Al día' },
  { value: 'unpaid', label: 'Impago' },
  { value: 'overdue', label: 'Moroso' },
] as const;

type SortColumn = 'name' | 'fee_type' | 'balance' | 'status' | 'joined';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  column: SortColumn | null;
  direction: SortDirection;
}

export default function Members() {
  const { memberBalances, isLoading } = useMembers();
  const { currentMonthFees, isLoading: feesLoading } = useMonthlyFees();
  const { isAdmin } = useIsAdmin();
  const { isMemberOnly } = useIsMemberOnly();
  const { profile } = useAuth();
  const userMemberId = profile?.member_id;
  const { displayName } = useHiddenMode();
  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: 'asc' });
  const [editMember, setEditMember] = useState<MemberBalance | null>(null);
  const [deleteMember, setDeleteMember] = useState<MemberBalance | null>(null);

  const { data: memberEventData = { owed: {}, paid: {} } } = useQuery({
    queryKey: ['member-event-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_member_payments')
        .select('member_id, amount_owed, amount_paid');
      if (error) throw error;
      const owed: Record<string, number> = {};
      const paid: Record<string, number> = {};
      data?.forEach((payment) => {
        owed[payment.member_id] = (owed[payment.member_id] || 0) + payment.amount_owed;
        paid[payment.member_id] = (paid[payment.member_id] || 0) + payment.amount_paid;
      });
      return { owed, paid };
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(amount);
  };

  const getMonthlyFeeForMember = (feeType: 'standard' | 'solidarity') => currentMonthFees[feeType] ?? 0;
  const getEventOwed = (memberId: string) => memberEventData.owed[memberId] || 0;
  const getEventPaid = (memberId: string) => memberEventData.paid[memberId] || 0;
  const getMonthlyOwed = (member: MemberBalance) => member.total_fees_owed - getEventOwed(member.member_id);
  const getEventsBalance = (memberId: string) => getEventPaid(memberId) - getEventOwed(memberId);
  const getMonthlyPaid = (member: MemberBalance) => member.total_paid - getEventPaid(member.member_id);
  const getMonthlyBalance = (member: MemberBalance) => getMonthlyPaid(member) - getMonthlyOwed(member);
  const getOverallBalance = (member: MemberBalance) => getMonthlyBalance(member) + getEventsBalance(member.member_id);

  const getPaymentStatus = (member: MemberBalance) => {
    const overallBalance = getOverallBalance(member);
    const monthlyFeeRate = currentMonthFees[member.fee_type] || 0;
    if (overallBalance < -monthlyFeeRate) return 'overdue';
    if (overallBalance < 0) return 'unpaid';
    if (overallBalance > monthlyFeeRate) return 'ahead';
    return 'up_to_date';
  };

  const getStatusBadge = (status: string) => {
    const config = {
      ahead: { label: 'Adelantado', className: 'status-ahead' },
      up_to_date: { label: 'Al día', className: 'status-up-to-date' },
      unpaid: { label: 'Impago', className: 'status-unpaid' },
      overdue: { label: 'Moroso', className: 'status-overdue' },
    };
    const c = config[status as keyof typeof config] || config.up_to_date;
    return <span className={`status-badge ${c.className}`}>{c.label}</span>;
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };
  const clearFilters = () => setSelectedStatuses([]);

  const handleSort = (column: SortColumn) => {
    setSortConfig(prev => ({ column, direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) return <ArrowUpDown className="ml-1 h-4 w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const filteredMembers = memberBalances.filter((member) => {
    if (isMemberOnly && member.member_id !== userMemberId) return false;
    const matchesSearch = member.full_name.toLowerCase().includes(search.toLowerCase()) || (member.phone_number && member.phone_number.includes(search));
    if (selectedStatuses.length === 0) return matchesSearch;
    const status = getPaymentStatus(member);
    const isActive = member.is_active;
    const matchesStatus = selectedStatuses.some(filter => {
      if (filter === 'active') return isActive;
      if (filter === 'inactive') return !isActive;
      if (!isActive) return false;
      return status === filter;
    });
    return matchesSearch && matchesStatus;
  });

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (!sortConfig.column) return 0;
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.column) {
      case 'name': return direction * a.full_name.localeCompare(b.full_name);
      case 'fee_type': return direction * a.fee_type.localeCompare(b.fee_type);
      case 'balance': return direction * (getOverallBalance(a) - getOverallBalance(b));
      case 'status': {
        const statusOrder = { overdue: 0, unpaid: 1, up_to_date: 2, ahead: 3 };
        const statusA = a.is_active ? statusOrder[getPaymentStatus(a) as keyof typeof statusOrder] : -1;
        const statusB = b.is_active ? statusOrder[getPaymentStatus(b) as keyof typeof statusOrder] : -1;
        return direction * (statusA - statusB);
      }
      case 'joined': return direction * (parseLocalDate(a.join_date).getTime() - parseLocalDate(b.join_date).getTime());
      default: return 0;
    }
  });

  if (isLoading || feesLoading) {
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
        {isAdmin && !isMemberOnly && <AddMemberForm />}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto justify-start">
              <Filter className="mr-2 h-4 w-4" />
              Estado
              {selectedStatuses.length > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5 py-0.5 text-xs">
                  {selectedStatuses.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Filtrar por Estado</span>
              {selectedStatuses.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2 text-xs">
                  Limpiar
                  <X className="ml-1 h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded-md -mx-1.5">
                  <Checkbox checked={selectedStatuses.includes(option.value)} onCheckedChange={() => toggleStatus(option.value)} />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden landscape-hide-cards space-y-3">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            No se encontraron miembros
          </div>
        ) : (
          sortedMembers.map((member) => (
            <div key={member.member_id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  {member.phone_number && <p className="text-xs text-muted-foreground">Mat. {member.phone_number}</p>}
                  <p className="font-semibold">{displayName(member.full_name, member.phone_number)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!member.is_active && <Badge variant="outline">Inactivo</Badge>}
                  {!isMemberOnly && (
                    <FeeTypeHistoryDialog memberId={member.member_id} memberName={member.full_name} />
                  )}
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={() => setEditMember(member)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteMember(member)} className="text-destructive focus:text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
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
                  <p className="text-muted-foreground text-xs">Saldo General</p>
                  <p className={`font-mono text-sm font-semibold ${getOverallBalance(member) < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {formatCurrency(getOverallBalance(member))}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Estado</p>
                  <div className="mt-1">
                    {member.is_active ? getStatusBadge(getPaymentStatus(member)) : <Badge variant="outline">Inactivo</Badge>}
                  </div>
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
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('name')}>
                  Miembro {getSortIcon('name')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('fee_type')}>
                  Tipo de Cuota {getSortIcon('fee_type')}
                </Button>
              </TableHead>
              <TableHead className="text-right">Cuota Mensual</TableHead>
              <TableHead className="text-right">Saldo Mensual</TableHead>
              <TableHead className="text-right">Saldo Eventos</TableHead>
              <TableHead className="text-right">Saldo General</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No se encontraron miembros
                </TableCell>
              </TableRow>
            ) : (
              sortedMembers.map((member) => (
                <TableRow key={member.member_id}>
                  <TableCell>
                    <div>
                      {member.phone_number && <p className="text-xs text-muted-foreground font-mono">Mat. {member.phone_number}</p>}
                      <p className="font-medium">{displayName(member.full_name, member.phone_number)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{FEE_TYPE_LABELS[member.fee_type]}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(getMonthlyFeeForMember(member.fee_type))}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${getMonthlyBalance(member) < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(getMonthlyBalance(member))}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${getEventsBalance(member.member_id) < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(getEventsBalance(member.member_id))}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${getOverallBalance(member) < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(getOverallBalance(member))}
                  </TableCell>
                  <TableCell>
                    {member.is_active ? getStatusBadge(getPaymentStatus(member)) : <Badge variant="outline">Inactivo</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!isMemberOnly && (
                        <FeeTypeHistoryDialog memberId={member.member_id} memberName={member.full_name} />
                      )}
                      {isAdmin && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Abrir menú</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => setEditMember(member)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteMember(member)} className="text-destructive focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
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
