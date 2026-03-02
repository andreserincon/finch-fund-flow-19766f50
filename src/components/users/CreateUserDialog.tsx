import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Copy, Check } from 'lucide-react';
import type { AppRole } from '@/hooks/useUserRoles';
import { useMembers } from '@/hooks/useMembers';

const createUserSchema = z.object({
  email: z.string().trim().email({ message: 'Email inválido' }),
});

interface CreatedUserInfo {
  email: string;
  password: string;
}

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { members } = useMembers();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('none');
  const [memberId, setMemberId] = useState<string>('none');
  const [grade, setGrade] = useState<string>('aprendiz');
  const [errors, setErrors] = useState<{ email?: string }>({});
  const [createdUser, setCreatedUser] = useState<CreatedUserInfo | null>(null);
  const [copied, setCopied] = useState(false);

  const activeMembers = members?.filter((m) => m.is_active) || [];

  const resetForm = () => {
    setEmail('');
    setRole('none');
    setMemberId('none');
    setGrade('aprendiz');
    setErrors({});
    setCreatedUser(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleCopy = async () => {
    if (!createdUser) return;
    const text = `Email: ${createdUser.email}\n${t('userManagement.password', 'Contraseña')}: ${createdUser.password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMemberChange = (newMemberId: string) => {
    setMemberId(newMemberId);
    if (newMemberId !== 'none') {
      const selectedMember = members?.find((m) => m.id === newMemberId);
      if (selectedMember) {
        setGrade(selectedMember.masonic_grade || 'aprendiz');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = createUserSchema.safeParse({ email });
    if (!result.success) {
      const fieldErrors: { email?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: email.trim(),
          role: role !== 'none' ? role : undefined,
          memberId: memberId !== 'none' ? memberId : undefined,
          masonicGrade: memberId !== 'none' ? grade : undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setCreatedUser({
        email: email.trim(),
        password: data.generatedPassword,
      });

      toast.success(t('userManagement.userCreated', 'Usuario creado exitosamente'));
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    } catch (error: any) {
      console.error('Error creating user:', error);

      let errorMessage = t('userManagement.createError', 'Error al crear usuario');
      if (error.message?.includes('already been registered')) {
        errorMessage = t('userManagement.emailExists', 'Este email ya está registrado');
      } else if (error.message?.includes('Unauthorized')) {
        errorMessage = t('userManagement.unauthorized', 'No tienes permisos para crear usuarios');
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  if (createdUser) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t('userManagement.userCreated', 'Usuario Creado')}</DialogTitle>
            <DialogDescription>
              {t('userManagement.credentialsWarning', 'Copiá estas credenciales ahora. La contraseña no se podrá ver de nuevo.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">{t('userManagement.email', 'Email')}</Label>
                <p className="font-mono text-sm">{createdUser.email}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('userManagement.password', 'Contraseña')}</Label>
                <p className="font-mono text-sm">{createdUser.password}</p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? t('common.copied', 'Copiado') : t('common.copy', 'Copiar')}
            </Button>
            <Button onClick={handleClose}>
              {t('common.close', 'Cerrar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('userManagement.createUser', 'Crear Usuario')}</DialogTitle>
          <DialogDescription>
            {t('userManagement.createUserAutoPassword', 'Ingresá el email. La contraseña se generará automáticamente.')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">{t('userManagement.email', 'Email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
                disabled={isLoading}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>{t('userManagement.role', 'Rol')}</Label>
              <Select value={role} onValueChange={setRole} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('userManagement.noRole', 'Sin rol')}</SelectItem>
                  <SelectItem value="treasurer">{t('userManagement.roles.treasurer', 'Tesorero')}</SelectItem>
                  <SelectItem value="vm">{t('userManagement.roles.vm', 'VM')}</SelectItem>
                  <SelectItem value="member">{t('userManagement.roles.member', 'Miembro')}</SelectItem>
                  <SelectItem value="bibliotecario">{t('userManagement.roles.bibliotecario', 'Bibliotecario')}</SelectItem>
                  <SelectItem value="admin">{t('userManagement.roles.admin', 'Administrador')}</SelectItem>
                </SelectContent>
              </Select>
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
              {t('common.create', 'Crear')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
