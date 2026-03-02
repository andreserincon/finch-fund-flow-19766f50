import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText } from 'lucide-react';
import { useDigitalBooks } from '@/hooks/useDigitalBooks';
import { useAuth } from '@/hooks/useAuth';
import { useIsBibliotecario } from '@/hooks/useIsBibliotecario';
import type { MasonicGrade } from '@/lib/library-types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export function UploadDigitalBookDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isBibliotecario } = useIsBibliotecario();
  const { uploadBook } = useDigitalBooks();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [gradeLevel, setGradeLevel] = useState<MasonicGrade>('aprendiz');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    setFileError('');
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      setFileError(t('digitalLibrary.onlyPdf'));
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFileError(t('digitalLibrary.fileTooLarge'));
      return;
    }
    setFile(selected);
  };

  const handleSubmit = () => {
    if (!user?.id || !file || !title.trim() || !author.trim()) return;
    uploadBook.mutate(
      {
        file,
        title: title.trim(),
        author: author.trim(),
        description: description.trim() || undefined,
        gradeLevel,
        userId: user.id,
      },
      { onSuccess: onClose }
    );
  };

  const canSubmit = !!file && !!title.trim() && !!author.trim() && !fileError;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t('digitalLibrary.uploadBook')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('library.bookTitle')} *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t('library.author')} *</Label>
            <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>{t('common.description')} ({t('common.optional')})</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>{t('library.gradeLevel')}</Label>
            <Select value={gradeLevel} onValueChange={(v) => setGradeLevel(v as MasonicGrade)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aprendiz">{t('library.grades.aprendiz')}</SelectItem>
                <SelectItem value="companero">{t('library.grades.companero')}</SelectItem>
                <SelectItem value="maestro">{t('library.grades.maestro')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>PDF *</Label>
            <div
              className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              {file ? (
                <div className="flex items-center gap-2 justify-center">
                  <FileText className="h-5 w-5 text-red-500" />
                  <span className="text-sm font-medium">{file.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  <Upload className="h-8 w-8 mx-auto mb-1 opacity-40" />
                  <p className="text-sm">{t('digitalLibrary.clickToUpload')}</p>
                  <p className="text-xs">{t('digitalLibrary.maxSize')}</p>
                </div>
              )}
            </div>
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </div>

          {!isBibliotecario && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
              {t('digitalLibrary.approvalNotice')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || uploadBook.isPending}>
            {uploadBook.isPending ? t('common.processing') : t('digitalLibrary.upload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
