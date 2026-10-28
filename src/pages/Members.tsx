import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHiddenMode } from '@/contexts/HiddenModeContext';
import { useMembers } from '@/hooks/useMembers';
import { useMemberCharges } from '@/hooks/useMemberCharges';
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
import { Search, MoreHorizontal, Pencil, Trash2, Filter, X, ArrowUpDown, ArrowUp, ArrowDown, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { FEE_TYPE_LABELS, MASONIC_GRADE_LABELS, MemberBalance, PaymentStatus } from '@/lib/types';
import { parseLocalDate, formatCurrency } from '@/lib/utils';
import { chargeBalance } from '@/lib/cobros-types';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/loading';
import { useSearchParams } from 'react-router-dom';
import { requiresAttention, getMemberCapitaStatus } from '@/lib/attention';
import { MemberStatusBadge } from '@/components/dashboard/MemberStatusBadge';
import { toast } from 'sonner';

/** PaymentStatus -> clave i18n, para el texto del estado en el snapshot. */
const STATUS_I18N_KEY: Record<PaymentStatus, string> = {
  al_dia: 'status.alDia',
  adelantado: 'status.adelantado',
  impago: 'status.impago',
  demorado: 'status.demorado',
};

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'adelantado', label: 'Adelantado' },
  { value: 'al_dia', label: 'Al día' },
  { value: 'impago', label: 'Impago' },
  { value: 'demorado', label: 'Demorado' },
] as const;

type SortColumn = 'name' | 'fee_type' | 'balance' | 'status' | 'joined';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  column: SortColumn | null;
  direction: SortDirection;
}

export default function Members() {
  const { t } = useTranslation();
  const { memberBalances, members, isLoading } = useMembers();
  const { charges } = useMemberCharges();
  // member_balances (the view) does not carry the masonic grade, so map it
  // from the full member rows for display.
  const gradeByMember = new Map(members.map((m) => [m.id, m.masonic_grade] as const));
  const { currentMonthFees, isLoading: feesLoading } = useMonthlyFees();
  const { isAdmin } = useIsAdmin();
  const { isMemberOnly } = useIsMemberOnly();
  const { profile } = useAuth();
  const userMemberId = profile?.member_id;
  const { displayName } = useHiddenMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const atencion = searchParams.get('atencion') === '1';
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

  const getMonthlyFeeForMember = (feeType: 'standard' | 'solidarity') => currentMonthFees[feeType] ?? 0;
  const getEventOwed = (memberId: string) => memberEventData.owed[memberId] || 0;
  const getEventPaid = (memberId: string) => memberEventData.paid[memberId] || 0;
  const getMonthlyOwed = (member: MemberBalance) => member.total_fees_owed - getEventOwed(member.member_id);
  const getEventsBalance = (memberId: string) => getEventPaid(memberId) - getEventOwed(memberId);
  const getMonthlyPaid = (member: MemberBalance) => member.total_paid - getEventPaid(member.member_id);
  const getMonthlyBalance = (member: MemberBalance) => getMonthlyPaid(member) - getMonthlyOwed(member);

  // Cobros pendientes por miembro (cuentas por cobrar abiertas), separados por
  // moneda: el total general se lleva en pesos y los cobros en dolares se
  // muestran aparte (no se convierten sin un tipo de cambio).
  const chargesByMember = new Map<string, { ars: number; usd: number }>();
  for (const c of charges) {
    if (c.status === 'paid' || c.status === 'cancelled') continue;
    const bal = chargeBalance(c);
    if (bal <= 0.5) continue;
    const acc = chargesByMember.get(c.member_id) ?? { ars: 0, usd: 0 };
    if (c.currency === 'USD') acc.usd += bal; else acc.ars += bal;
    chargesByMember.set(c.member_id, acc);
  }
  const getChargesArs = (memberId: string) => chargesByMember.get(memberId)?.ars ?? 0;
  const getChargesUsd = (memberId: string) => chargesByMember.get(memberId)?.usd ?? 0;

  // Total de la persona, en pesos: saldo de capita + saldo de eventos menos los
  // cobros pendientes en pesos. Los cobros en dolares quedan fuera (se ven aparte).
  const getOverallBalance = (member: MemberBalance) =>
    getMonthlyBalance(member) + getEventsBalance(member.member_id) - getChargesArs(member.member_id);

  /**
   * Capita-only status, classified into the four canonical states via the
   * shared derivation. Event debt is excluded (memberEventData is passed so
   * capitaOwed strips it), so a member who is up-to-date with monthly fees
   * but owes an event isn't shown as Demorado/Impago by mistake.
   */
  const getPaymentStatus = (member: MemberBalance): PaymentStatus =>
    getMemberCapitaStatus(member, currentMonthFees, undefined, memberEventData);

  /** Event-only status badge: "Al día" if balance >= 0, else "Pendiente". */
  const getEventStatusBadge = (memberId: string) => {
    const ok = getEventsBalance(memberId) >= 0;
    return (
      <span className={`status-badge ${ok ? 'status-al-dia' : 'status-impago'}`}>
        {ok ? 'Al día' : 'Pendiente'}
      </span>
    );
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };
  const clearFilters = () => setSelectedStatuses([]);

  // Comparte el estado del socio como imagen. En vez de snapshotear la tarjeta
  // viva (que daba recortes y lineas de borde), armamos un nodo dedicado, limpio
  // y con medidas propias, lo snapshoteamos y abrimos el menu de compartir.
  const handleShareStatus = async (member: MemberBalance) => {
    const grade = gradeByMember.get(member.member_id);
    const capitaBal = getMonthlyBalance(member);
    const eventoBal = getEventsBalance(member.member_id);
    const capitaStatus = getPaymentStatus(member);
    const capitaOk = capitaStatus === 'al_dia' || capitaStatus === 'adelantado';
    const eventoOk = eventoBal >= 0;
    const pill = (text: string, ok: boolean) =>
      `<span style="display:inline-block;font-size:14px;line-height:1;padding:7px 14px;border-radius:999px;background:${ok ? '#dcfce7' : '#fef9c3'};color:${ok ? '#15803d' : '#854d0e'};">${ok ? '&#9679; ' : ''}${text}</span>`;
    const tag = (text: string, filled: boolean) =>
      `<span style="display:inline-block;font-size:14px;line-height:1;padding:6px 13px;border-radius:999px;${filled ? 'background:#ece9e1;color:#44403c;' : 'border:1px solid #d6d3d1;color:#44403c;'}">${text}</span>`;
    const amount = (value: number) =>
      `<div style="font-size:24px;font-weight:700;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:${value < 0 ? '#dc2626' : '#059669'};margin:5px 0 10px;">${formatCurrency(value)}</div>`;
    const node = document.createElement('div');
    // Dentro del viewport pero detras de todo (z-index muy negativo): si se
    // posiciona muy lejos fuera de pantalla, el navegador movil no lo pinta y
    // html-to-image captura una imagen en blanco.
    node.style.cssText =
      "position:fixed;left:0;top:0;z-index:-9999;pointer-events:none;" +
      "width:440px;box-sizing:border-box;background:#ffffff;" +
      "padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1a1a1a;";
    node.innerHTML =
      `<div style="font-size:15px;color:#6b7280;">Mat. ${member.phone_number || '-'}</div>` +
      `<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:5px;">` +
        `<span style="font-size:26px;font-weight:700;">${member.full_name}</span>` +
        tag(FEE_TYPE_LABELS[member.fee_type], true) +
      `</div>` +
      (grade ? `<div style="margin-top:10px;">${tag(MASONIC_GRADE_LABELS[grade], false)}</div>` : '') +
      `<div style="border-top:1px solid #e5e7eb;margin:20px 0;"></div>` +
      `<div style="display:flex;gap:32px;">` +
        `<div style="flex:1;"><div style="font-size:15px;color:#6b7280;">Cápita</div>${amount(capitaBal)}${pill(t(STATUS_I18N_KEY[capitaStatus]), capitaOk)}</div>` +
        `<div style="flex:1;"><div style="font-size:15px;color:#6b7280;">Evento</div>${amount(eventoBal)}${pill(eventoOk ? 'Al día' : 'Pendiente', eventoOk)}</div>` +
      `</div>`;
    document.body.appendChild(node);
    try {
      const { toPng } = await import('html-to-image');
      // Dos frames para que el navegador haga layout y pinte el nodo antes de
      // capturarlo; si no, la imagen puede salir en blanco.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `estado-${member.phone_number || member.member_id}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Estado del socio', text: `Estado de ${member.full_name}` });
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
  };

  const handleSort = (column: SortColumn) => {
    setSortConfig(prev => ({ column, direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) return <ArrowUpDown className="ml-1 h-4 w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const filteredMembers = memberBalances.filter((member) => {
    if (isMemberOnly && member.member_id !== userMemberId) return false;
    if (atencion && !requiresAttention(member, currentMonthFees, memberEventData)) return false;
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
        const statusOrder: Record<PaymentStatus, number> = { demorado: 0, impago: 1, al_dia: 2, adelantado: 3 };
        const statusA = a.is_active ? statusOrder[getPaymentStatus(a)] : -1;
        const statusB = b.is_active ? statusOrder[getPaymentStatus(b)] : -1;
        return direction * (statusA - statusB);
      }
      case 'joined': return direction * (parseLocalDate(a.join_date).getTime() - parseLocalDate(b.join_date).getTime());
      default: return 0;
    }
  });

  if (isLoading || feesLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <TableSkeleton rows={8} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground font-display">Miembros</h1>
          <p className="text-sm text-muted-foreground">
            {isMemberOnly ? 'Tu estado de cuenta' : `${memberBalances.filter((m) => m.is_active).length} miembros activos`}
          </p>
        </div>
        {isAdmin && !isMemberOnly && (
          <span data-asistente="miembro-agregar" className="inline-flex">
            <AddMemberForm />
          </span>
        )}
      </div>

      {atencion && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-overdue/40 bg-overdue/10 px-4 py-2.5">
          <p className="text-sm font-medium text-foreground">Mostrando solo miembros que requieren atención</p>
          <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>Ver todos</Button>
        </div>
      )}

      {!isMemberOnly && (
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('members.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-asistente="miembro-buscar"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto justify-start" data-asistente="miembro-estado">
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
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            {isMemberOnly ? 'Tu usuario aún no está vinculado a una ficha de miembro. Escribile al Tesorero para vincularlo.' : 'No se encontraron miembros'}
          </div>
        ) : (
          sortedMembers.map((member) => (
            <div key={member.member_id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {member.phone_number && <p className="text-xs text-muted-foreground">Mat. {member.phone_number}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{displayName(member.full_name, member.phone_number)}</p>
                    <Badge variant="secondary">{FEE_TYPE_LABELS[member.fee_type]}</Badge>
                    {gradeByMember.get(member.member_id) && (
                      <Badge variant="outline">{MASONIC_GRADE_LABELS[gradeByMember.get(member.member_id)!]}</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!member.is_active && <Badge variant="outline">Inactivo</Badge>}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => handleShareStatus(member)}
                    aria-label="Compartir estado por WhatsApp"
                    data-asistente="miembro-compartir"
                  >
                    <Share2 className="h-4 w-4" />
                  </Button>
                  {!isMemberOnly && (
                    <FeeTypeHistoryDialog memberId={member.member_id} memberName={member.full_name} />
                  )}
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10">
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
              {/* Capita and Evento split: each shows its own balance + status */}
              <div className="grid grid-cols-2 gap-3 text-sm border-t border-border/50 pt-3">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Capita</p>
                  <p className={`font-mono text-sm font-semibold ${getMonthlyBalance(member) < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {formatCurrency(getMonthlyBalance(member))}
                  </p>
                  {member.is_active && <MemberStatusBadge status={getPaymentStatus(member)} />}
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">Evento</p>
                  <p className={`font-mono text-sm font-semibold ${getEventsBalance(member.member_id) < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {formatCurrency(getEventsBalance(member.member_id))}
                  </p>
                  {member.is_active && getEventStatusBadge(member.member_id)}
                </div>
              </div>
              {/* Cobros pendientes + Total de la persona */}
              <div className="space-y-1.5 border-t border-border/50 pt-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-xs">Cobros pendientes</span>
                  {getChargesArs(member.member_id) > 0 || getChargesUsd(member.member_id) > 0 ? (
                    <span className="font-mono text-destructive text-right">
                      {getChargesArs(member.member_id) > 0 && formatCurrency(-getChargesArs(member.member_id))}
                      {getChargesUsd(member.member_id) > 0 && (
                        <span className="block text-xs">-{formatCurrency(getChargesUsd(member.member_id), 'USD')}</span>
                      )}
                    </span>
                  ) : (
                    <span className="font-mono text-muted-foreground">{formatCurrency(0)}</span>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-border/50 pt-1.5">
                  <span className="text-xs font-semibold">Total (pesos)</span>
                  <span className={`font-mono text-sm font-bold ${getOverallBalance(member) < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                    {formatCurrency(getOverallBalance(member))}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
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
                  Tipo de Cápita {getSortIcon('fee_type')}
                </Button>
              </TableHead>
              <TableHead className="text-right">Cápita Mensual</TableHead>
              <TableHead className="text-right">Saldo Mensual</TableHead>
              <TableHead className="text-right">Saldo Eventos</TableHead>
              <TableHead className="text-right">Saldo Cobros</TableHead>
              <TableHead className="text-right">Saldo General</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  {isMemberOnly ? 'Tu usuario aún no está vinculado a una ficha de miembro. Escribile al Tesorero para vincularlo.' : 'No se encontraron miembros'}
                </TableCell>
              </TableRow>
            ) : (
              sortedMembers.map((member) => (
                <TableRow key={member.member_id}>
                  <TableCell>
                    <div>
                      {member.phone_number && <p className="text-xs text-muted-foreground font-mono">Mat. {member.phone_number}</p>}
                      <p className="font-medium">{displayName(member.full_name, member.phone_number)}</p>
                      {gradeByMember.get(member.member_id) && (
                        <p className="text-xs text-muted-foreground">{MASONIC_GRADE_LABELS[gradeByMember.get(member.member_id)!]}</p>
                      )}
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
                  <TableCell className={`text-right font-mono ${getChargesArs(member.member_id) > 0 ? 'text-destructive' : ''}`}>
                    {getChargesArs(member.member_id) > 0 ? formatCurrency(-getChargesArs(member.member_id)) : formatCurrency(0)}
                    {getChargesUsd(member.member_id) > 0 && (
                      <span className="block text-xs text-destructive">-{formatCurrency(getChargesUsd(member.member_id), 'USD')}</span>
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${getOverallBalance(member) < 0 ? 'text-destructive' : ''}`}>
                    {formatCurrency(getOverallBalance(member))}
                  </TableCell>
                  <TableCell>
                    {member.is_active ? <MemberStatusBadge status={getPaymentStatus(member)} /> : <Badge variant="outline">Inactivo</Badge>}
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
