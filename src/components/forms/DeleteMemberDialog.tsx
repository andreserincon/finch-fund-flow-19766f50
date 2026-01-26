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
import { useMembers } from '@/hooks/useMembers';
import { MemberBalance } from '@/lib/types';

interface DeleteMemberDialogProps {
  member: MemberBalance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteMemberDialog({ member, open, onOpenChange }: DeleteMemberDialogProps) {
  const { deleteMember } = useMembers();

  const handleDelete = async () => {
    if (!member) return;
    await deleteMember.mutateAsync(member.member_id);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Member</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete <strong>{member?.full_name}</strong>? 
            This action cannot be undone and will remove all associated transaction history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
