import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBooks } from '@/hooks/useBooks';
import { useMembers } from '@/hooks/useMembers';
import { useIsBibliotecario } from '@/hooks/useIsBibliotecario';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import type { MasonicGrade } from '@/lib/library-types';

interface AddBookDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddBookDialog({ open, onClose }: AddBookDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { addBook } = useBooks('maestro');
  const { isBibliotecario } = useIsBibliotecario();
  const { members } = useMembers();

  // Get current user's member_id
  const { data: userProfile } = useQuery({
    queryKey: ['user-profile-member', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('member_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!profile?.member_id) return null;
      const { data: member } = await supabase
        .from('members')
        .select('id, full_name')
        .eq('id', profile.member_id)
        .maybeSingle();
      return member;
    },
    enabled: !!user?.id,
  });

  const [form, setForm] = useState({
    title: '',
    author: '',
    edition: '',
    copy_number: 1,
    publication_date: '',
    description: '',
    grade_level: 'profano' as MasonicGrade,
    owner_type: 'lodge' as 'lodge' | 'member',
    owner_id: '' as string,
  });

  const handleSubmit = () => {
    if (!form.title.trim() || !form.author.trim()) return;

    const ownerId = form.owner_type === 'lodge'
      ? null
      : (isBibliotecario ? (form.owner_id || userProfile?.id || null) : (userProfile?.id || null));

    addBook.mutate(
      {
        title: form.title.trim(),
        author: form.author.trim(),
        edition: form.edition.trim() || null,
        copy_number: form.copy_number,
        publication_date: form.publication_date || null,
        description: form.description.trim() || null,
        grade_level: form.grade_level,
        current_holder_id: null,
        held_since: null,
        status: 'available',
        owner_id: ownerId,
        is_approved: isBibliotecario ? true : undefined,
      },
      {
        onSuccess: () => {
          onClose();
          setForm({ title: '', author: '', edition: '', copy_number: 1, publication_date: '', description: '', grade_level: 'profano', owner_type: 'lodge', owner_id: '' });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('library.addBook')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t('library.bookTitle')} *</Label>
            <Input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <Label>{t('library.author')} *</Label>
            <Input value={form.author} onChange={(e) => setForm(f => ({ ...f, author: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('library.edition')}</Label>
              <Input value={form.edition} onChange={(e) => setForm(f => ({ ...f, edition: e.target.value }))} />
            </div>
            <div>
              <Label>{t('library.copyNumber')}</Label>
              <Input type="number" min={1} value={form.copy_number} onChange={(e) => setForm(f => ({ ...f, copy_number: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <div>
            <Label>{t('library.pubDate')}</Label>
            <Input type="date" value={form.publication_date} onChange={(e) => setForm(f => ({ ...f, publication_date: e.target.value }))} />
          </div>
          <div>
            <Label>{t('library.gradeLevel')}</Label>
            <Select value={form.grade_level} onValueChange={(v) => setForm(f => ({ ...f, grade_level: v as MasonicGrade }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="profano">{t('library.grades.profano')}</SelectItem>
                <SelectItem value="aprendiz">{t('library.grades.aprendiz')}</SelectItem>
                <SelectItem value="companero">{t('library.grades.companero')}</SelectItem>
                <SelectItem value="maestro">{t('library.grades.maestro')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('library.owner')}</Label>
            {isBibliotecario ? (
              <Select value={form.owner_type} onValueChange={(v) => setForm(f => ({ ...f, owner_type: v as 'lodge' | 'member', owner_id: '' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lodge">{t('library.ownerLodge')}</SelectItem>
                  <SelectItem value="member">{t('library.ownerMember')}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input value={userProfile?.full_name || ''} disabled className="bg-muted" />
            )}
          </div>
          {form.owner_type === 'member' && isBibliotecario && (
            <div>
              <Label>{t('library.selectOwner')}</Label>
              <Select value={form.owner_id} onValueChange={(v) => setForm(f => ({ ...f, owner_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t('library.selectOwner')} /></SelectTrigger>
                <SelectContent>
                  {(members || []).filter(m => m.is_active).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>{t('common.description')}</Label>
            <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
          <Button onClick={handleSubmit} disabled={!form.title.trim() || !form.author.trim() || addBook.isPending} className="w-full">
            {addBook.isPending ? t('common.creating') : t('library.addBook')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
