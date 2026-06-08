import { useMemo, useState } from 'react';
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
import { Loader2, Copy, Check, Link2 } from 'lucide-react';
import { useMembers } from '@/hooks/useMembers';
import { roleOptionsFor } from '@/lib/roles';

const createUserSchema = z.object({
  email: z.string().trim().email({ message: 'Correo invalido' }),
});

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the current officer is an Administrator (vs a Venerable). Caps the role options. */
  callerIsAdmin: boolean;
  /** member_ids that already have an account, excluded from the picker. */
  excludeMemberIds: string[];
}

export function CreateUserDialog({ open, onOpenChange, callerIsAdmin, excludeMemberIds }: CreateUserDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { members } = useMembers();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('member');
  const [memberId, setMemberId] = useState<string>('');
  const [grade, setGrade] = useState<string>('aprendiz');
  const [errors, setErrors] = useState<{ email?: string; member?: string }>({});
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const roleOptions = useMemo(() => roleOptionsFor(callerIsAdmin), [callerIsAdmin]);
  const roleDescription = roleOptions.find((o) => o.value === role)?.description ?? '';

  const excluded = useMemo(() => new Set(excludeMemberIds), [excludeMemberIds]);
  const availableMembers = useMemo(
    () => (members ?? []).filter((m) => m.is_active && !excluded.has(m.id)),
    [members, excluded]
  );

  const resetForm = () => {
    setEmail('');
    setRole('member');
    setMemberId('');
    setGrade('aprendiz');
    setErrors({});
    setCreatedLink(null);
    setCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleCopy = async () => {
    if (!createdLink) return;
    await navigator.clipboard.writeText(createdLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMemberChange = (newMemberId: string) => {
    setMemberId(newMemberId);
    setErrors((prev) => ({ ...prev, member: undefined }));
    const selectedMember = members?.find((m) => m.id === newMemberId);
    if (selectedMember) setGrade(selectedMember.masonic_grade || 'aprendiz');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: { email?: string; member?: string } = {};

    const result = createUserSchema.safeParse({ email });
    if (!result.success) nextErrors.email = result.error.errors[0]?.message;
    if (!memberId) nextErrors.member = 'Elegi un hermano para asociar el acceso.';

    if (nextErrors.email || nextErrors.member) {
      setErrors(nextErrors);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: email.trim(),
          role,
          memberId,
          masonicGrade: grade,
          redirectTo: `${window.location.origin}/auth`,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setCreatedLink(data.actionLink ?? null);
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
    } catch (err: any) {
      console.error('Error creating access:', err);
      toast.error(err.message || 'No se pudo crear el acceso.');
    } finally {
      setIsLoading(false);
    }
  };

  // Success: show the one-time link the officer shares with the brother.
  if (createdLink !== null) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent
          className="sm:max-w-[460px]"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-primary" />
              Acceso creado
            </DialogTitle>
            <DialogDescription>
              Envia este enlace al hermano por WhatsApp o entregaselo en persona. Con el crea su
              propia contrasena. El enlace es de un solo uso y vence en una hora.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs text-muted-foreground">Enlace para establecer la contrasena</Label>
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="font-mono text-xs break-all">{createdLink || 'No se pudo generar el enlace. Usa "Restablecer" en la tabla.'}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose}>
              {t('common.close', 'Cerrar')}
            </Button>
            <Button onClick={handleCopy} disabled={!createdLink}>
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? t('common.copied', 'Copiado') : 'Copiar enlace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[460px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Otorgar acceso a un hermano</DialogTitle>
          <DialogDescription>
            Asocia el acceso a un hermano de la logia. Recibira un enlace para crear su propia contrasena.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Miembro <span className="text-primary">obligatorio</span></Label>
              <Select value={memberId} onValueChange={handleMemberChange} disabled={isLoading}>
                <SelectTrigger className={errors.member ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Seleccionar hermano sin acceso..." />
                </SelectTrigger>
                <SelectContent>
                  {availableMembers.length === 0 ? (
                    <div className="px-2 py-3 text-sm text-muted-foreground">
                      Todos los hermanos activos ya tienen acceso.
                    </div>
                  ) : (
                    availableMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {errors.member && <p className="text-sm text-destructive">{errors.member}</p>}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                placeholder="hermano@correo.com"
                disabled={isLoading}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>

            <div className="grid gap-2">
              <Label>Rol</Label>
              <Select value={role} onValueChange={setRole} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {roleDescription && <p className="text-xs text-muted-foreground">{roleDescription}</p>}
            </div>

            <div className="grid gap-2">
              <Label>Grado masonico</Label>
              <Select value={grade} onValueChange={setGrade} disabled={isLoading || !memberId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aprendiz">{t('userManagement.grades.aprendiz', 'Aprendiz')}</SelectItem>
                  <SelectItem value="companero">{t('userManagement.grades.companero', 'Companero')}</SelectItem>
                  <SelectItem value="maestro">{t('userManagement.grades.maestro', 'Maestro')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Es el grado del miembro, no el rol en la aplicacion.</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              {t('common.cancel', 'Cancelar')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar invitacion
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
