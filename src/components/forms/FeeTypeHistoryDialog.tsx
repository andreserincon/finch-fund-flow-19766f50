import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMemberFeeTypeHistory, MemberFeeTypeHistory } from '@/hooks/useMemberFeeTypeHistory';
import { FeeType, FEE_TYPE_LABELS } from '@/lib/types';
import { History, Plus, Pencil, Trash2 } from 'lucide-react';

interface FeeTypeHistoryDialogProps {
  memberId: string;
  memberName: string;
}

export function FeeTypeHistoryDialog({ memberId, memberName }: FeeTypeHistoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<MemberFeeTypeHistory | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const { history, isLoading, addHistory, updateHistory, deleteHistory } = useMemberFeeTypeHistory(memberId);

  const [formData, setFormData] = useState<{
    fee_type: FeeType;
    effective_from: string;
  }>({
    fee_type: 'standard',
    effective_from: new Date().toISOString().slice(0, 7) + '-01',
  });

  const handleAdd = () => {
    setFormData({
      fee_type: 'standard',
      effective_from: new Date().toISOString().slice(0, 7) + '-01',
    });
    setIsAdding(true);
    setEditingEntry(null);
  };

  const handleEdit = (entry: MemberFeeTypeHistory) => {
    setFormData({
      fee_type: entry.fee_type,
      effective_from: entry.effective_from,
    });
    setEditingEntry(entry);
    setIsAdding(false);
  };

  const handleSave = async () => {
    if (isAdding) {
      await addHistory.mutateAsync({
        member_id: memberId,
        fee_type: formData.fee_type,
        effective_from: formData.effective_from,
      });
    } else if (editingEntry) {
      await updateHistory.mutateAsync({
        id: editingEntry.id,
        fee_type: formData.fee_type,
        effective_from: formData.effective_from,
      });
    }
    setIsAdding(false);
    setEditingEntry(null);
  };

  const handleDelete = async (id: string) => {
    await deleteHistory.mutateAsync(id);
    setDeleteConfirmId(null);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingEntry(null);
  };

  const isEditing = isAdding || editingEntry !== null;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="Fee Type History">
            <History className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Fee Type History</DialogTitle>
            <DialogDescription>
              Manage fee type changes for {memberName}. Changes are effective from the specified month.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {isEditing && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                <h4 className="font-medium">
                  {isAdding ? 'Add New Entry' : 'Edit Entry'}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fee Type</Label>
                    <Select
                      value={formData.fee_type}
                      onValueChange={(value: FeeType) =>
                        setFormData((prev) => ({ ...prev, fee_type: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FEE_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Effective From (Month)</Label>
                    <Input
                      type="month"
                      value={formData.effective_from.slice(0, 7)}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          effective_from: e.target.value + '-01',
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={addHistory.isPending || updateHistory.isPending}
                  >
                    {addHistory.isPending || updateHistory.isPending
                      ? 'Saving...'
                      : 'Save'}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                {history.length} {history.length === 1 ? 'entry' : 'entries'}
              </span>
              {!isEditing && (
                <Button size="sm" onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Entry
                </Button>
              )}
            </div>

            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee Type</TableHead>
                    <TableHead>Effective From</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : history.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No history entries
                      </TableCell>
                    </TableRow>
                  ) : (
                    history.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              entry.fee_type === 'standard'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-secondary/50 text-secondary-foreground'
                            }`}
                          >
                            {FEE_TYPE_LABELS[entry.fee_type]}
                          </span>
                        </TableCell>
                        <TableCell>
                          {format(parseISO(entry.effective_from), 'MMMM yyyy')}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(entry)}
                              disabled={isEditing}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteConfirmId(entry.id)}
                              disabled={isEditing || history.length <= 1}
                              title={
                                history.length <= 1
                                  ? 'Cannot delete the only entry'
                                  : 'Delete'
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={() => setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fee Type Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this fee type history entry. This may affect how
              fees are calculated for past months.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
