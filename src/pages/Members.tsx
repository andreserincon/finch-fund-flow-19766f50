import { useState } from 'react';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { AddMemberForm } from '@/components/forms/AddMemberForm';
import { EditMemberForm } from '@/components/forms/EditMemberForm';
import { DeleteMemberDialog } from '@/components/forms/DeleteMemberDialog';
import { MemberStatusBadge } from '@/components/dashboard/MemberStatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Search, Phone, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { FEE_TYPE_LABELS, MemberBalance } from '@/lib/types';

export default function Members() {
  const { memberBalances, isLoading } = useMembers();
  const { currentMonthFees, isLoading: feesLoading } = useMonthlyFees();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editMember, setEditMember] = useState<MemberBalance | null>(null);
  const [deleteMember, setDeleteMember] = useState<MemberBalance | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  const getMonthlyFeeForMember = (feeType: 'standard' | 'solidarity') => {
    return currentMonthFees[feeType] ?? 0;
  };

  const getPaymentStatus = (balance: number, owed: number) => {
    if (balance >= owed) return 'up_to_date';
    return 'overdue';
  };

  const filteredMembers = memberBalances.filter((member) => {
    const matchesSearch =
      member.full_name.toLowerCase().includes(search.toLowerCase()) ||
      member.phone_number.includes(search);

    const status = getPaymentStatus(member.current_balance, member.total_fees_owed);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && member.is_active) ||
      (statusFilter === 'inactive' && !member.is_active) ||
      (statusFilter === 'overdue' && status === 'overdue' && member.is_active) ||
      (statusFilter === 'up_to_date' && status === 'up_to_date' && member.is_active);

    return matchesSearch && matchesStatus;
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
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Members</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="up_to_date">Up to Date</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            No members found
          </div>
        ) : (
          filteredMembers.map((member) => (
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
                    <MemberStatusBadge
                      balance={member.current_balance}
                      totalOwed={member.total_fees_owed}
                    />
                  ) : (
                    <Badge variant="outline">Inactive</Badge>
                  )}
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
                  <p className={`font-mono font-semibold ${member.current_balance >= 0 ? 'amount-positive' : 'amount-negative'}`}>
                    {formatCurrency(member.current_balance)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Owed</p>
                  <p className="font-mono text-muted-foreground">{formatCurrency(member.total_fees_owed)}</p>
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
              <TableHead>Member</TableHead>
              <TableHead>Fee Type</TableHead>
              <TableHead className="text-right">Monthly Fee</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Owed</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No members found
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
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
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatCurrency(member.total_fees_owed)}
                  </TableCell>
                  <TableCell>
                    {member.is_active ? (
                      <MemberStatusBadge
                        balance={member.current_balance}
                        totalOwed={member.total_fees_owed}
                      />
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(member.join_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
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
