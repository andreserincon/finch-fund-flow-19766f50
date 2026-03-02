import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, FileText } from 'lucide-react';
import { useDigitalBooks, type DigitalBook } from '@/hooks/useDigitalBooks';
import { toast } from 'sonner';

const gradeColors: Record<string, string> = {
  aprendiz: 'bg-blue-500/10 text-blue-700 border-blue-500/30',
  companero: 'bg-amber-500/10 text-amber-700 border-amber-500/30',
  maestro: 'bg-red-500/10 text-red-700 border-red-500/30',
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DigitalBookDetailDrawerProps {
  book: DigitalBook;
  open: boolean;
  onClose: () => void;
}

export function DigitalBookDetailDrawer({ book, open, onClose }: DigitalBookDetailDrawerProps) {
  const { t } = useTranslation();
  const { getDownloadUrl } = useDigitalBooks();

  const handleDownload = async () => {
    try {
      const url = await getDownloadUrl(book.file_path);
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${book.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      toast.error(t('digitalLibrary.downloadError'));
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{book.title}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <p className="text-sm">
              <span className="font-medium">{t('library.author')}:</span> {book.author}
            </p>
            {book.description && (
              <p className="text-sm text-muted-foreground mt-2">{book.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={gradeColors[book.grade_level]}>
              {t(`library.grades.${book.grade_level}`)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              PDF • {formatFileSize(book.file_size_bytes)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm bg-muted/30 rounded-lg p-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{t('digitalLibrary.title')}</span>
          </div>

          {book.is_approved && (
            <Button className="w-full gap-2" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              {t('digitalLibrary.download')}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
