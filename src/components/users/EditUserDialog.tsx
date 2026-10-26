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
import type { AppRole, MasonicGrade } from '@/hooks/useUserRoles';
import { useMembers } from '@/hooks/useMembers';
import { ASSIGNABLE_ROLE_OPTIONS, getRoleLabel } from '@/lib/roles';
import { Checkbox } from '@/components/ui/checkbox';

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userEmail: string;
  currentRoles: AppRole[];
  currentMemberId: string | null;
  currentGrade: MasonicGrade | null;
}

export function EditUserDialog({
  open,
  onOpenChange,
  userId,
  userEmail,
  currentRoles,
  currentMemberId,
  currentGrade,
}: EditUserDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { members } = useMembers();
  const [isLoading, setIsLoading] = useState(false);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [memberId, setMemberId] = useState<string>('none');
  const [grade, setGrade] = useState<string>('aprendiz');

  useEffect(() => {
    if (open) {
      setRoles(currentRoles);
      setMemberId(currentMemberId || 'none');
      setGrade(currentGrade || 'aprendiz');
    }
  }, [open, currentRoles, currentMemberId, currentGrade]);

  // When member changes in the form, load that member's grade
  const handleMemberChange = (newMemberId: string) => {
    setMemberId(newMemberId);
    if (newMemberId !== 'none') {
      const selectedMember = members?.find((m) => m.id === newMemberId);
      if (selectedMember) {
        setGrade(selectedMember.masonic_grade || 'aprendiz');
      }
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-update-user', {
        body: {
          userId,
          roles,
          memberId: memberId === 'none' ? null : memberId,
          masonicGrade: memberId === 'none' ? null : grade,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(t('userManagement.userUpdated', 'Usuario actualizado'));
      handleClose();
    } catch (err: any) {
      console.error('Error updating user:', err);
      toast.error(err.message || t('userManagement.updateError', 'Error al actualizar usuario'));
    } finally {
      setIsLoading(false);
    }
  };

  const activeMembers = members?.filter((m) => m.is_active) || [];

  const toggleRole = (value: AppRole, checked: boolean) => {
    setRoles((prev) => (checked ? Array.from(new Set([...prev, value])) : prev.filter((r) => r !== value)));
  };
  // Tesorero y Venerable son consecuencia de la gestion: se muestran bloqueados
  // (no se editan aca) y se conservan al guardar; el resto se marca con checkboxes.
  const gestionManaged = roles.filter((r) => r === 'treasurer' || r === 'vm');

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
              <Label>{t('userManagement.role', 'Roles')}</Label>
              <div className="space-y-2 rounded-md border p-3">
                {ASSIGNABLE_ROLE_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-start gap-2 cursor-pointer">
                    <Checkbox
                      checked={roles.includes(o.value)}
                      onCheckedChange={(c) => toggleRole(o.value, c === true)}
                      disabled={isLoading}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-sm font-medium">{o.label}</span>
                      <span className="block text-xs text-muted-foreground">{o.description}</span>
                    </span>
                  </label>
                ))}
                {gestionManaged.map((r) => (
                  <label key={r} className="flex items-start gap-2 opacity-70">
                    <Checkbox checked disabled className="mt-0.5" />
                    <span>
                      <span className="text-sm font-medium">{getRoleLabel(r)}</span>
                      <span className="block text-xs text-muted-foreground">Se gestiona desde Gestiones.</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Un usuario puede tener mas de un rol.</p>
            </div>
            <div className="grid gap-2">
              <Label>{t('userManagement.associatedMember', 'Miembro Asociado')}</Label>
              <Select value={memberId} onValueChange={handleMemberChange} disabled={isLoading}>
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
            </div>
            <div className="grid gap-2">
              <Label>{t('userManagement.grade', 'Grado')}</Label>
              <Select value={grade} onValueChange={setGrade} disabled={isLoading || memberId === 'none'}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aprendiz">{t('userManagement.grades.aprendiz', 'Aprendiz')}</SelectItem>
                  <SelectItem value="companero">{t('userManagement.grades.companero', 'Compañero')}</SelectItem>
                  <SelectItem value="maestro">{t('userManagement.grades.maestro', 'Maestro')}</SelectItem>
                </SelectContent>
              </Select>
              {memberId === 'none' && (
                <p className="text-xs text-muted-foreground">
                  {t('userManagement.gradeRequiresMember', 'Asociá un miembro para editar el grado.')}
                </p>
              )}
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
