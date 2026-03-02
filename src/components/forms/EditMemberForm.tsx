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
import { FeeType, FEE_TYPE_LABELS, MemberBalance } from '@/lib/types';
import { cn } from '@/lib/utils';

const memberSchema = z.object({
  full_name: z.string().min(1, 'Name is required').max(100),
  phone_number: z.string().min(1, 'Phone number is required').max(20),
  fee_type: z.enum(['standard', 'solidarity']),
  is_active: z.boolean(),
  join_date: z.string().min(1, 'Join date is required'),
});

type MemberFormData = z.infer<typeof memberSchema>;

interface EditMemberFormProps {
  member: MemberBalance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditMemberForm({ member, open, onOpenChange }: EditMemberFormProps) {
  const { updateMember } = useMembers();
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
  const isActive = watch('is_active');

  useEffect(() => {
    if (member) {
      const parsedDate = parseISO(member.join_date);
      setJoinDate(parsedDate);
      reset({
        full_name: member.full_name,
        phone_number: member.phone_number,
        fee_type: member.fee_type,
        is_active: member.is_active,
        join_date: member.join_date,
      });
    }
  }, [member, reset]);

  const onSubmit = async (data: MemberFormData) => {
    if (!member) return;
    
    await updateMember.mutateAsync({
      id: member.member_id,
      full_name: data.full_name,
      phone_number: data.phone_number,
      fee_type: data.fee_type,
      is_active: data.is_active,
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

          <div className="space-y-2">
            <Label>Join Date</Label>
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
                  {joinDate ? format(joinDate, 'PPP') : <span>Pick a date</span>}
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
