import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { FeeType, FEE_TYPE_LABELS } from '@/lib/types';
import { PlusCircle } from 'lucide-react';

const memberSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100),
  phone_number: z.string().min(1, 'Phone number is required').max(20),
  monthly_fee_amount: z.number().min(0, 'Fee must be positive'),
  fee_type: z.enum(['standard', 'solidarity']),
  join_date: z.string().min(1, 'Join date is required'),
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
      monthly_fee_amount: 0,
    },
  });

  const feeType = watch('fee_type');

  const onSubmit = async (data: MemberFormData) => {
    await addMember.mutateAsync({
      full_name: data.full_name,
      phone_number: data.phone_number,
      monthly_fee_amount: data.monthly_fee_amount,
      fee_type: data.fee_type,
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
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
          <DialogDescription>
            Add a new member to the organization. They will start accumulating fees from the join date.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              {...register('full_name')}
              placeholder="John Doe"
            />
            {errors.full_name && (
              <p className="text-sm text-destructive">{errors.full_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              id="phone_number"
              {...register('phone_number')}
              placeholder="+1234567890"
            />
            {errors.phone_number && (
              <p className="text-sm text-destructive">{errors.phone_number.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="monthly_fee_amount">Monthly Fee</Label>
              <Input
                id="monthly_fee_amount"
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

          <div className="space-y-2">
            <Label htmlFor="join_date">Join Date</Label>
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
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add Member'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
