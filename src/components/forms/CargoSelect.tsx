/**
 * @file CargoSelect.tsx
 * @description Lodge office (cargo) picker that enforces one member per office.
 *   Unassigned offices are listed first; already-assigned offices are shown
 *   below, color-coded with the current holder's name. Picking a taken office
 *   warns that the current holder will be set to "Sin cargo" and, on confirm,
 *   reports the displaced member id so the caller can clear them before saving.
 */
import { useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { LODGE_OFFICES, LODGE_OFFICE_LABELS, type LodgeOffice } from '@/lib/types';

interface CargoHolder {
  id: string;
  name: string;
}

interface CargoSelectProps {
  value: string | null;
  /** Fired when the office changes. displacedMemberId is the member to clear (reassignment), or null. */
  onChange: (office: LodgeOffice | null, displacedMemberId: string | null) => void;
  members: { id: string; full_name: string; lodge_office: string | null }[];
  /** The member being edited, excluded from the "taken by someone else" check. Omit when creating. */
  currentMemberId?: string;
  disabled?: boolean;
}

export function CargoSelect({ value, onChange, members, currentMemberId, disabled }: CargoSelectProps) {
  const [pending, setPending] = useState<{ office: LodgeOffice; holder: CargoHolder } | null>(null);

  const holderByOffice = useMemo(() => {
    const map = new Map<string, CargoHolder>();
    for (const m of members) {
      if (m.lodge_office && m.id !== currentMemberId) {
        map.set(m.lodge_office, { id: m.id, name: m.full_name });
      }
    }
    return map;
  }, [members, currentMemberId]);

  // Unassigned first, then assigned; each group keeps the ceremonial order.
  const orderedOffices = useMemo(() => {
    const unassigned = LODGE_OFFICES.filter((o) => !holderByOffice.has(o));
    const assigned = LODGE_OFFICES.filter((o) => holderByOffice.has(o));
    return [...unassigned, ...assigned];
  }, [holderByOffice]);

  const handleValueChange = (next: string) => {
    if (next === 'none') {
      onChange(null, null);
      return;
    }
    const holder = holderByOffice.get(next);
    if (holder) {
      // Taken by another member: confirm before reassigning.
      setPending({ office: next as LodgeOffice, holder });
    } else {
      onChange(next as LodgeOffice, null);
    }
  };

  return (
    <>
      <Select value={value ?? 'none'} onValueChange={handleValueChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Sin cargo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin cargo</SelectItem>
          {orderedOffices.map((o) => {
            const holder = holderByOffice.get(o);
            return (
              <SelectItem key={o} value={o}>
                <span className="flex items-center gap-2">
                  <span className={holder ? 'text-muted-foreground' : ''}>{LODGE_OFFICE_LABELS[o]}</span>
                  {holder && <span className="text-xs text-amber-600">ocupado: {holder.name}</span>}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reasignar cargo</AlertDialogTitle>
            <AlertDialogDescription>
              {pending && (
                <>
                  El cargo {LODGE_OFFICE_LABELS[pending.office]} lo tiene actualmente {pending.holder.name}.
                  Si continuás, {pending.holder.name} quedará Sin cargo y el cargo pasará a este miembro al guardar.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onChange(pending.office, pending.holder.id);
                setPending(null);
              }}
            >
              Reasignar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
