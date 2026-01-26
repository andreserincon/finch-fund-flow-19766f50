import { useState } from 'react';
import { useMembers } from '@/hooks/useMembers';
import { AddMemberForm } from '@/components/forms/AddMemberForm';
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
import { Search, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { FEE_TYPE_LABELS } from '@/lib/types';

export default function Members() {
  const { memberBalances, isLoading } = useMembers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Members</h1>
          <p className="text-muted-foreground">
            {memberBalances.filter((m) => m.is_active).length} active members
          </p>
        </div>
        <AddMemberForm />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
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

      {/* Table */}
      <div className="rounded-lg border bg-card">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                    {formatCurrency(member.monthly_fee_amount)}
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
