import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, Loader2, Sparkles, ArrowLeft } from 'lucide-react';
import { useDigitalBooks } from '@/hooks/useDigitalBooks';
import { useAuth } from '@/hooks/useAuth';
import { useIsBibliotecario } from '@/hooks/useIsBibliotecario';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MasonicGrade } from '@/lib/library-types';

interface Props {
  open: boolean;
  onClose: () => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type Step = 'upload' | 'analyzing' | 'review';

export function UploadDigitalBookDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isBibliotecario } = useIsBibliotecario();
  const { uploadBook } = useDigitalBooks();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [tempFilePath, setTempFilePath] = useState<string | null>(null);

  // Metadata fields (populated by AI, editable by user)
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [description, setDescription] = useState('');
  const [gradeLevel, setGradeLevel] = useState<MasonicGrade>('aprendiz');

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

  const handleAnalyze = async () => {
    if (!file || !user?.id) return;
    setStep('analyzing');

    try {
      // Upload file temporarily
      const filePath = `${user.id}/temp_${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('digital-books')
        .upload(filePath, file, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;
      setTempFilePath(filePath);

      // Call AI to extract metadata
      const { data, error } = await supabase.functions.invoke('describe-pdf', {
        body: { file_path: filePath },
      });

      if (error) throw error;
      if (data?.error === 'rate_limited') {
        toast.error(t('digitalLibrary.rateLimited'));
        setStep('upload');
        return;
      }
      if (data?.error === 'payment_required') {
        toast.error(t('digitalLibrary.paymentRequired'));
        setStep('upload');
        return;
      }

      setTitle(data?.title || '');
      setAuthor(data?.author || '');
      setDescription(data?.description || '');
      setStep('review');
    } catch (err) {
      console.error('Analyze PDF error:', err);
      toast.error(t('digitalLibrary.analyzeError'));
      setStep('upload');
    }
  };

  const handleBack = () => {
    setStep('upload');
    setTitle('');
    setAuthor('');
    setDescription('');
    // Clean up temp file
    if (tempFilePath) {
      supabase.storage.from('digital-books').remove([tempFilePath]).catch(() => {});
      setTempFilePath(null);
    }
  };

  const handleSubmit = () => {
    if (!user?.id || !file || !title.trim() || !author.trim()) return;

    // Clean up temp file
    if (tempFilePath) {
      supabase.storage.from('digital-books').remove([tempFilePath]).catch(() => {});
    }

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

  const handleClose = () => {
    if (tempFilePath) {
      supabase.storage.from('digital-books').remove([tempFilePath]).catch(() => {});
    }
    onClose();
  };

  const canSubmit = !!file && !!title.trim() && !!author.trim() && !fileError;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {t('digitalLibrary.uploadBook')}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Upload PDF */}
        {step === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('digitalLibrary.uploadStep1')}
            </p>
            <div className="space-y-2">
              <Label>PDF *</Label>
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
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
                    <FileText className="h-6 w-6 text-destructive/70" />
                    <div className="text-left">
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    <Upload className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">{t('digitalLibrary.clickToUpload')}</p>
                    <p className="text-xs">{t('digitalLibrary.maxSize')}</p>
                  </div>
                )}
              </div>
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={!file || !!fileError}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                {t('digitalLibrary.analyzeWithAI')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: Analyzing */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium text-foreground">{t('digitalLibrary.analyzing')}</p>
              <p className="text-sm text-muted-foreground">{t('digitalLibrary.analyzingHint')}</p>
            </div>
          </div>
        )}

        {/* Step 3: Review metadata */}
        {step === 'review' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0" />
              {t('digitalLibrary.aiExtracted')}
            </div>

            <div className="space-y-2">
              <Label>{t('library.bookTitle')} *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('library.author')} *</Label>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('library.gradeLevel')} *</Label>
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

            {file && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4 text-destructive/70" />
                {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
              </div>
            )}

            {!isBibliotecario && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                {t('digitalLibrary.approvalNotice')}
              </p>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleBack} className="gap-1 mr-auto">
                <ArrowLeft className="h-4 w-4" />
                {t('common.back')}
              </Button>
              <Button variant="outline" onClick={handleClose}>
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || uploadBook.isPending}>
                {uploadBook.isPending ? t('common.processing') : t('digitalLibrary.upload')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
