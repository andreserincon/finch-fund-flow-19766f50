import { useState } from 'react';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
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
import { Search, Phone, MoreHorizontal, Pencil, Trash2, Filter, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { FEE_TYPE_LABELS, MemberBalance } from '@/lib/types';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'ahead', label: 'Ahead' },
  { value: 'up_to_date', label: 'Up to Date' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
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
  const [search, setSearch] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: 'asc' });
  const [editMember, setEditMember] = useState<MemberBalance | null>(null);
  const [deleteMember, setDeleteMember] = useState<MemberBalance | null>(null);

  // Query unpaid event amounts per member
  const { data: memberEventDebts = {} } = useQuery({
    queryKey: ['member-event-debts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_member_payments')
        .select('member_id, amount_owed, amount_paid');
      
      if (error) throw error;
      
      // Aggregate unpaid event amounts per member
      const debts: Record<string, number> = {};
      data?.forEach((payment) => {
        const unpaid = payment.amount_owed - payment.amount_paid;
        if (unpaid > 0) {
          debts[payment.member_id] = (debts[payment.member_id] || 0) + unpaid;
        }
      });
      return debts;
    },
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  const getMonthlyFeeForMember = (feeType: 'standard' | 'solidarity') => {
    return currentMonthFees[feeType] ?? 0;
  };

  // Get event debt for a member
  const getEventDebt = (memberId: string) => {
    return memberEventDebts[memberId] || 0;
  };

  // Calculate overall balance (monthly + events)
  const getOverallBalance = (member: MemberBalance) => {
    const eventDebt = getEventDebt(member.member_id);
    return member.current_balance - eventDebt;
  };

  // Determine payment status based on overall balance
  const getPaymentStatus = (member: MemberBalance) => {
    const overallBalance = getOverallBalance(member);
    const monthlyFeeRate = currentMonthFees[member.fee_type] || 0;
    
    // Negative balance more than 1 monthly fee = overdue
    if (overallBalance < -monthlyFeeRate) return 'overdue';
    // Negative balance between 0 and 1 monthly fee = unpaid
    if (overallBalance < 0) return 'unpaid';
    // Balance above 1 monthly fee = ahead
    if (overallBalance > monthlyFeeRate) return 'ahead';
    // Balance between 0 and 1 monthly fee = up_to_date
    return 'up_to_date';
  };

  const getStatusBadge = (status: string) => {
    const config = {
      ahead: { label: 'Ahead', className: 'status-ahead' },
      up_to_date: { label: 'Up to date', className: 'status-up-to-date' },
      unpaid: { label: 'Unpaid', className: 'status-unpaid' },
      overdue: { label: 'Overdue', className: 'status-overdue' },
    };
    const c = config[status as keyof typeof config] || config.up_to_date;
    return <span className={`status-badge ${c.className}`}>{c.label}</span>;
  };

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const clearFilters = () => {
    setSelectedStatuses([]);
  };

  const handleSort = (column: SortColumn) => {
    setSortConfig(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) {
      return <ArrowUpDown className="ml-1 h-4 w-4" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-1 h-4 w-4" />
      : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const filteredMembers = memberBalances.filter((member) => {
    const matchesSearch =
      member.full_name.toLowerCase().includes(search.toLowerCase()) ||
      member.phone_number.includes(search);

    // If no filters selected, show all
    if (selectedStatuses.length === 0) {
      return matchesSearch;
    }

    const status = getPaymentStatus(member);
    const isActive = member.is_active;
    
    // Check if member matches any selected filter
    const matchesStatus = selectedStatuses.some(filter => {
      if (filter === 'active') return isActive;
      if (filter === 'inactive') return !isActive;
      // Payment status filters only apply to active members
      if (!isActive) return false;
      return status === filter;
    });

    return matchesSearch && matchesStatus;
  });

  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (!sortConfig.column) return 0;
    
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    
    switch (sortConfig.column) {
      case 'name':
        return direction * a.full_name.localeCompare(b.full_name);
      case 'fee_type':
        return direction * a.fee_type.localeCompare(b.fee_type);
      case 'balance':
        return direction * (getOverallBalance(a) - getOverallBalance(b));
      case 'status': {
        const statusOrder = { overdue: 0, unpaid: 1, up_to_date: 2, ahead: 3 };
        const statusA = a.is_active ? statusOrder[getPaymentStatus(a) as keyof typeof statusOrder] : -1;
        const statusB = b.is_active ? statusOrder[getPaymentStatus(b) as keyof typeof statusOrder] : -1;
        return direction * (statusA - statusB);
      }
      case 'joined':
        return direction * (new Date(a.join_date).getTime() - new Date(b.join_date).getTime());
      default:
        return 0;
    }
  });

  if (isLoading || feesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Members</h1>
          <p className="text-sm text-muted-foreground">
            {memberBalances.filter((m) => m.is_active).length} active members
          </p>
        </div>
        <AddMemberForm />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full sm:w-auto justify-start">
              <Filter className="mr-2 h-4 w-4" />
              Status
              {selectedStatuses.length > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5 py-0.5 text-xs">
                  {selectedStatuses.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="start">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Filter by Status</span>
              {selectedStatuses.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={clearFilters}
                  className="h-6 px-2 text-xs"
                >
                  Clear
                  <X className="ml-1 h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {STATUS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded-md -mx-1.5"
                >
                  <Checkbox
                    checked={selectedStatuses.includes(option.value)}
                    onCheckedChange={() => toggleStatus(option.value)}
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            No members found
          </div>
        ) : (
          sortedMembers.map((member) => (
            <div key={member.member_id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{member.full_name}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                    <Phone className="h-3 w-3" />
                    {member.phone_number}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {member.is_active ? (
                    getStatusBadge(getPaymentStatus(member))
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
                    <FeeTypeHistoryDialog
                      memberId={member.member_id}
                      memberName={member.full_name}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={() => setEditMember(member)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeleteMember(member)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Fee Type</p>
                  <Badge variant="secondary" className="mt-1">
                    {FEE_TYPE_LABELS[member.fee_type]}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Joined</p>
                  <p className="font-mono text-sm">{format(new Date(member.join_date), 'MMM d, yyyy')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Balance</p>
                  <p className={`font-mono font-semibold ${getOverallBalance(member) >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                    {formatCurrency(getOverallBalance(member))}
                  </p>
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
                  Member
                  {getSortIcon('name')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('fee_type')}>
                  Fee Type
                  {getSortIcon('fee_type')}
                </Button>
              </TableHead>
              <TableHead className="text-right">Monthly Fee</TableHead>
              <TableHead className="text-right">Monthly Balance</TableHead>
              <TableHead className="text-right">Events Balance</TableHead>
              <TableHead className="text-right">
                <Button variant="ghost" size="sm" className="-mr-3 h-8" onClick={() => handleSort('balance')}>
                  Overall Balance
                  {getSortIcon('balance')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('status')}>
                  Status
                  {getSortIcon('status')}
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => handleSort('joined')}>
                  Joined
                  {getSortIcon('joined')}
                </Button>
              </TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  No members found
                </TableCell>
              </TableRow>
            ) : (
              sortedMembers.map((member) => (
                <TableRow key={member.member_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{member.full_name}</p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {member.phone_number}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {FEE_TYPE_LABELS[member.fee_type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(getMonthlyFeeForMember(member.fee_type))}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span
                      className={
                        member.current_balance >= 0
                          ? 'amount-positive'
                          : 'amount-negative'
                      }
                    >
                      {formatCurrency(member.current_balance)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span
                      className={
                        -getEventDebt(member.member_id) >= 0
                          ? 'amount-positive'
                          : 'amount-negative'
                      }
                    >
                      {formatCurrency(-getEventDebt(member.member_id))}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span
                      className={
                        getOverallBalance(member) >= 0
                          ? 'amount-positive'
                          : 'amount-negative'
                      }
                    >
                      {formatCurrency(getOverallBalance(member))}
                    </span>
                  </TableCell>
                  <TableCell>
                    {member.is_active ? (
                      getStatusBadge(getPaymentStatus(member))
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(member.join_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <FeeTypeHistoryDialog
                        memberId={member.member_id}
                        memberName={member.full_name}
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          <DropdownMenuItem onClick={() => setEditMember(member)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => setDeleteMember(member)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditMemberForm
        member={editMember}
        open={!!editMember}
        onOpenChange={(open) => !open && setEditMember(null)}
      />

      <DeleteMemberDialog
        member={deleteMember}
        open={!!deleteMember}
        onOpenChange={(open) => !open && setDeleteMember(null)}
      />
    </div>
  );
}
