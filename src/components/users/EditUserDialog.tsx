import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useUserRoles, type AppRole } from '@/hooks/useUserRoles';
import { useMembers } from '@/hooks/useMembers';

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentRole: AppRole | null;
  currentMemberId: string | null;
}

export function EditUserDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentRole,
  currentMemberId,
}: EditUserDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { assignRole, removeRole } = useUserRoles();
  const { members } = useMembers();
  const [isLoading, setIsLoading] = useState(false);
  const [role, setRole] = useState<string>('none');
  const [memberId, setMemberId] = useState<string>('none');

  useEffect(() => {
    if (open) {
      setRole(currentRole || 'none');
      setMemberId(currentMemberId || 'none');
    }
  }, [open, currentRole, currentMemberId]);

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Update role
      const newRole = role === 'none' ? null : role;
      const oldRole = currentRole;

      if (newRole !== oldRole) {
        if (newRole === null) {
          await new Promise<void>((resolve, reject) => {
            removeRole.mutate(userId, {
              onSuccess: () => resolve(),
              onError: (err) => reject(err),
            });
          });
        } else {
          await new Promise<void>((resolve, reject) => {
            assignRole.mutate(
              { userId, role: newRole as AppRole },
              { onSuccess: () => resolve(), onError: (err) => reject(err) }
            );
          });
        }
      }

      // Update member association
      const newMemberId = memberId === 'none' ? null : memberId;
      if (newMemberId !== currentMemberId) {
        const { error } = await supabase
          .from('profiles')
          .update({ member_id: newMemberId })
          .eq('id', userId);

        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success(t('userManagement.userUpdated', 'Usuario actualizado'));
      handleClose();
    } catch (err: any) {
      console.error('Error updating user:', err);
      toast.error(t('userManagement.updateError', 'Error al actualizar usuario'));
    } finally {
      setIsLoading(false);
    }
  };

  const activeMembers = members?.filter((m) => m.is_active) || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('userManagement.editUser', 'Editar Usuario')}</DialogTitle>
          <DialogDescription>{userEmail}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>{t('userManagement.role', 'Rol')}</Label>
              <Select value={role} onValueChange={setRole} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('userManagement.noRole', 'Sin rol')}</SelectItem>
                  <SelectItem value="treasurer">{t('userManagement.roles.treasurer')}</SelectItem>
                  <SelectItem value="vm">{t('userManagement.roles.vm')}</SelectItem>
                  <SelectItem value="member">{t('userManagement.roles.member')}</SelectItem>
                  <SelectItem value="bibliotecario">{t('userManagement.roles.bibliotecario')}</SelectItem>
                  <SelectItem value="admin">{t('userManagement.roles.admin')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t('userManagement.associatedMember', 'Miembro Asociado')}</Label>
              <Select value={memberId} onValueChange={setMemberId} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('userManagement.noMember', 'Sin miembro')}</SelectItem>
                  {activeMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('userManagement.memberAssociationHint', 'El grado se hereda del miembro asociado.')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save', 'Guardar')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
