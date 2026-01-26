import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { FeeType, FEE_TYPE_LABELS, MemberBalance } from '@/lib/types';

const memberSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100),
  phone_number: z.string().min(1, 'Phone number is required').max(20),
  monthly_fee_amount: z.number().min(0, 'Fee must be positive'),
  fee_type: z.enum(['standard', 'solidarity']),
  is_active: z.boolean(),
});

type MemberFormData = z.infer<typeof memberSchema>;

interface EditMemberFormProps {
  member: MemberBalance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditMemberForm({ member, open, onOpenChange }: EditMemberFormProps) {
  const { updateMember } = useMembers();

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
  const isActive = watch('is_active');

  useEffect(() => {
    if (member) {
      reset({
        full_name: member.full_name,
        phone_number: member.phone_number,
        monthly_fee_amount: member.monthly_fee_amount,
        fee_type: member.fee_type,
        is_active: member.is_active,
      });
    }
  }, [member, reset]);

  const onSubmit = async (data: MemberFormData) => {
    if (!member) return;
    
    await updateMember.mutateAsync({
      id: member.member_id,
      full_name: data.full_name,
      phone_number: data.phone_number,
      monthly_fee_amount: data.monthly_fee_amount,
      fee_type: data.fee_type,
      is_active: data.is_active,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Member</DialogTitle>
          <DialogDescription>
            Update member details. Changes will be saved immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit_full_name">Full Name</Label>
            <Input
              id="edit_full_name"
              {...register('full_name')}
              placeholder="John Doe"
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit_phone_number">Phone Number</Label>
            <Input
              id="edit_phone_number"
              {...register('phone_number')}
              placeholder="+1234567890"
            />
            {errors.phone_number && (
              <p className="text-sm text-destructive">{errors.phone_number.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit_monthly_fee_amount">Monthly Fee</Label>
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
              <Label>Fee Type</Label>
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

          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Active Member</Label>
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={(checked) => setValue('is_active', checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
