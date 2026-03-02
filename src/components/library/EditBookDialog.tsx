import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBooks } from '@/hooks/useBooks';
import type { Book, MasonicGrade } from '@/lib/library-types';

interface EditBookDialogProps {
  book: Book;
  open: boolean;
  onClose: () => void;
}

export function EditBookDialog({ book, open, onClose }: EditBookDialogProps) {
  const { t } = useTranslation();
  const { updateBook } = useBooks('maestro');
  const [form, setForm] = useState({
    title: book.title,
    author: book.author,
    edition: book.edition || '',
    copy_number: book.copy_number || 1,
    publication_date: book.publication_date || '',
    description: book.description || '',
    grade_level: book.grade_level,
  });

  const handleSubmit = () => {
    if (!form.title.trim() || !form.author.trim()) return;
    updateBook.mutate(
      {
        id: book.id,
        title: form.title.trim(),
        author: form.author.trim(),
        edition: form.edition.trim() || null,
        copy_number: form.copy_number,
        publication_date: form.publication_date || null,
        description: form.description.trim() || null,
        grade_level: form.grade_level,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('library.editBook')}</DialogTitle>
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
            <Label>{t('common.description')}</Label>
            <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
          </div>
          <Button onClick={handleSubmit} disabled={!form.title.trim() || !form.author.trim() || updateBook.isPending} className="w-full">
            {updateBook.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
