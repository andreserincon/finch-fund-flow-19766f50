import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMembers } from '@/hooks/useMembers';
import { FeeType, FEE_TYPE_LABELS, MemberBalance, MasonicGrade } from '@/lib/types';
import { cn } from '@/lib/utils';

const GRADE_OPTIONS: { value: MasonicGrade; label: string }[] = [
  { value: 'aprendiz', label: 'Aprendiz' },
  { value: 'companero', label: 'Compañero' },
  { value: 'maestro', label: 'Maestro' },
  { value: 'profano', label: 'Profano' },
];

const E164_REGEX = /^\+[0-9]{8,15}$/;

const memberSchema = z.object({
  full_name: z.string().min(1, 'El nombre es obligatorio').max(100),
  phone_number: z.string().max(20).optional().default(''),
  whatsapp_number: z
    .string()
    .max(20)
    .optional()
    .default('')
    .refine((v) => !v || E164_REGEX.test(v), {
      message: 'Formato esperado: +5491155551234',
    }),
  whatsapp_opt_out: z.boolean().optional().default(false),
  monthly_fee_amount: z.number().min(0, 'La cuota debe ser positiva'),
  fee_type: z.enum(['standard', 'solidarity']),
  masonic_grade: z.enum(['profano', 'aprendiz', 'companero', 'maestro']),
  is_active: z.boolean(),
  inactive_since: z.string().nullable().optional(),
  join_date: z.string().min(1, 'La fecha de ingreso es obligatoria'),
});

type MemberFormData = z.infer<typeof memberSchema>;

interface EditMemberFormProps {
  member: MemberBalance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditMemberForm({ member, open, onOpenChange }: EditMemberFormProps) {
  const { updateMember, members } = useMembers();
  const [joinDate, setJoinDate] = useState<Date | undefined>();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
  });

  const feeType = watch('fee_type');
  const masonicGrade = watch('masonic_grade');
  const isActive = watch('is_active');
  const whatsappOptOut = watch('whatsapp_opt_out');
  const inactiveSince = watch('inactive_since');

  useEffect(() => {
    if (member) {
      const parsedDate = parseISO(member.join_date);
      setJoinDate(parsedDate);
      // member_balances (the view this form receives) does not expose the
      // masonic grade, so read it from the full member row.
      const fullMember = members.find((m) => m.id === member.member_id);
      reset({
        full_name: member.full_name,
        phone_number: member.phone_number,
        whatsapp_number: member.whatsapp_number ?? '',
        whatsapp_opt_out: member.whatsapp_opt_out ?? false,
        monthly_fee_amount: member.monthly_fee_amount,
        fee_type: member.fee_type,
        masonic_grade: fullMember?.masonic_grade ?? 'aprendiz',
        is_active: member.is_active,
        inactive_since: member.inactive_since ?? null,
        join_date: member.join_date,
      });
    }
  }, [member, members, reset]);

  const onSubmit = async (data: MemberFormData) => {
    if (!member) return;

    await updateMember.mutateAsync({
      id: member.member_id,
      full_name: data.full_name,
      phone_number: data.phone_number,
      whatsapp_number: data.whatsapp_number || null,
      whatsapp_opt_out: !!data.whatsapp_opt_out,
      monthly_fee_amount: data.monthly_fee_amount,
      fee_type: data.fee_type,
      masonic_grade: data.masonic_grade,
      is_active: data.is_active,
      inactive_since: data.is_active ? null : (data.inactive_since || null),
      join_date: data.join_date,
    });
    onOpenChange(false);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setJoinDate(date);
      setValue('join_date', format(date, 'yyyy-MM-dd'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Editar Miembro</DialogTitle>
          <DialogDescription>
            Actualizar datos del miembro. Los cambios se guardarán inmediatamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit_full_name">Nombre Completo</Label>
            <Input
              id="edit_full_name"
              {...register('full_name')}
              placeholder="Nombre y Apellido"
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_phone_number">Matrícula</Label>
            <Input
              id="edit_phone_number"
              {...register('phone_number')}
              placeholder="Ej: 12345"
            />
            {errors.phone_number && (
              <p className="text-sm text-destructive">{errors.phone_number.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_whatsapp_number">WhatsApp</Label>
            <Input
              id="edit_whatsapp_number"
              {...register('whatsapp_number')}
              placeholder="+5491155551234"
            />
            <p className="text-xs text-muted-foreground">
              Formato internacional con código de país.
            </p>
            {errors.whatsapp_number && (
              <p className="text-sm text-destructive">{errors.whatsapp_number.message}</p>
            )}
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="edit_whatsapp_opt_out"
              checked={!!whatsappOptOut}
              onCheckedChange={(checked) => setValue('whatsapp_opt_out', !!checked)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="edit_whatsapp_opt_out" className="cursor-pointer">
                No enviar recordatorios por WhatsApp
              </Label>
              <p className="text-xs text-muted-foreground">
                Excluí al miembro de la cola de recordatorios automáticos.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit_monthly_fee_amount">Cuota Mensual</Label>
              <Input
                id="edit_monthly_fee_amount"
                type="number"
                step="0.01"
                {...register('monthly_fee_amount', { valueAsNumber: true })}
                placeholder="0.00"
              />
              {errors.monthly_fee_amount && (
                <p className="text-sm text-destructive">{errors.monthly_fee_amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Tipo de Cuota</Label>
              <Select
                value={feeType}
                onValueChange={(value: FeeType) => setValue('fee_type', value)}
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
          </div>

          <div className="space-y-2">
            <Label>Grado masónico</Label>
            <Select
              value={masonicGrade}
              onValueChange={(value: MasonicGrade) => setValue('masonic_grade', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar grado" />
              </SelectTrigger>
              <SelectContent>
                {GRADE_OPTIONS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Fecha de Ingreso</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !joinDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {joinDate ? format(joinDate, 'PPP') : <span>Seleccionar fecha</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={joinDate}
                  onSelect={handleDateSelect}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {errors.join_date && (
              <p className="text-sm text-destructive">{errors.join_date.message}</p>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Miembro Activo</Label>
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={(checked) => {
                  setValue('is_active', checked);
                  if (checked) {
                    setValue('inactive_since', null);
                  } else if (!watch('inactive_since')) {
                    setValue('inactive_since', `${new Date().toISOString().slice(0, 7)}-01`);
                  }
                }}
              />
            </div>
            {!isActive && (
              <div className="space-y-2">
                <Label htmlFor="inactive_since">Inactivo desde</Label>
                <Input
                  id="inactive_since"
                  type="month"
                  value={inactiveSince ? inactiveSince.slice(0, 7) : ''}
                  onChange={(e) => setValue('inactive_since', e.target.value ? `${e.target.value}-01` : null)}
                />
                <p className="text-xs text-muted-foreground">
                  Desde este mes el miembro no acumula capita. Las cuotas impagas anteriores siguen vigentes.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
