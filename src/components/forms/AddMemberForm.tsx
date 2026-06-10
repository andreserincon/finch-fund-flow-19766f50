import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { useMembers } from '@/hooks/useMembers';
import { FeeType, FEE_TYPE_LABELS, LODGE_OFFICES, LODGE_OFFICE_LABELS, LodgeOffice } from '@/lib/types';
import { PlusCircle } from 'lucide-react';

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
  fee_type: z.enum(['standard', 'solidarity']),
  lodge_office: z.string().nullable().optional(),
  join_date: z.string().min(1, 'La fecha de ingreso es obligatoria'),
});

type MemberFormData = z.infer<typeof memberSchema>;

export function AddMemberForm() {
  const [open, setOpen] = useState(false);
  const { addMember } = useMembers();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
    defaultValues: {
      fee_type: 'standard',
      join_date: new Date().toISOString().split('T')[0],
      whatsapp_opt_out: false,
    },
  });

  const feeType = watch('fee_type');
  const whatsappOptOut = watch('whatsapp_opt_out');
  const lodgeOffice = watch('lodge_office');

  const onSubmit = async (data: MemberFormData) => {
    await addMember.mutateAsync({
      full_name: data.full_name,
      phone_number: data.phone_number,
      whatsapp_number: data.whatsapp_number || null,
      whatsapp_opt_out: !!data.whatsapp_opt_out,
      monthly_fee_amount: 0,
      fee_type: data.fee_type,
      lodge_office: (data.lodge_office && data.lodge_office !== 'none' ? data.lodge_office : null) as LodgeOffice | null,
      join_date: data.join_date,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Agregar Miembro
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Agregar Nuevo Miembro</DialogTitle>
          <DialogDescription>
            Agregar un nuevo miembro a la organización. Comenzará a acumular capita desde la fecha de ingreso.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Nombre Completo</Label>
            <Input
              id="full_name"
              {...register('full_name')}
              placeholder="Nombre y Apellido"
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">Matrícula</Label>
            <Input
              id="phone_number"
              {...register('phone_number')}
              placeholder="Ej: 12345"
            />
            {errors.phone_number && (
              <p className="text-sm text-destructive">{errors.phone_number.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp_number">WhatsApp</Label>
            <Input
              id="whatsapp_number"
              {...register('whatsapp_number')}
              placeholder="+5491155551234"
            />
            <p className="text-xs text-muted-foreground">
              Formato internacional con código de país (ej: +54 9 11 5555 1234).
            </p>
            {errors.whatsapp_number && (
              <p className="text-sm text-destructive">{errors.whatsapp_number.message}</p>
            )}
          </div>

          <div className="flex items-start space-x-2">
            <Checkbox
              id="whatsapp_opt_out"
              checked={!!whatsappOptOut}
              onCheckedChange={(checked) => setValue('whatsapp_opt_out', !!checked)}
            />
            <div className="space-y-0.5">
              <Label htmlFor="whatsapp_opt_out" className="cursor-pointer">
                No enviar recordatorios por WhatsApp
              </Label>
              <p className="text-xs text-muted-foreground">
                Excluí al miembro de la cola de recordatorios automáticos.
              </p>
            </div>
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

          <div className="space-y-2">
            <Label>Cargo (opcional)</Label>
            <Select
              value={lodgeOffice ?? 'none'}
              onValueChange={(value) => setValue('lodge_office', value === 'none' ? null : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin cargo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin cargo</SelectItem>
                {LODGE_OFFICES.map((o) => (
                  <SelectItem key={o} value={o}>{LODGE_OFFICE_LABELS[o]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="join_date">Fecha de Ingreso</Label>
            <Input
              id="join_date"
              type="date"
              {...register('join_date')}
            />
            {errors.join_date && (
              <p className="text-sm text-destructive">{errors.join_date.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Agregando...' : 'Agregar Miembro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
