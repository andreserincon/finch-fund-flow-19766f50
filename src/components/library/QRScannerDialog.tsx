import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Camera, Loader2 } from 'lucide-react';

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onScan: (bookId: string) => void;
}

export function QRScannerDialog({ open, onClose, onScan }: QRScannerDialogProps) {
  const { t } = useTranslation();
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setLoading(true);

    const scannerId = 'qr-reader';
    let stopped = false;

    const startScanner = async () => {
      try {
        // Dynamic import to avoid loading the heavy library upfront
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopped) return;

        const el = document.getElementById(scannerId);
        if (!el) {
          setError(t('library.cameraError', 'No se pudo iniciar el escáner'));
          setLoading(false);
          return;
        }

        const scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            try {
              const url = new URL(decodedText);
              const bookParam = url.searchParams.get('book');
              if (bookParam) {
                onScan(bookParam);
              } else {
                onScan(decodedText);
              }
            } catch {
              onScan(decodedText);
            }
            scanner.stop().catch(() => {});
            onClose();
          },
          () => {} // ignore per-frame scan failures
        );

        if (!stopped) setLoading(false);
      } catch (err: any) {
        console.error('QR Scanner error:', err);
        if (!stopped) {
          const msg = err?.message || '';
          if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
            setError(t('library.cameraPermissionDenied', 'Permiso de cámara denegado. Habilitalo en los ajustes del navegador.'));
          } else if (msg.includes('NotFoundError') || msg.includes('Requested device not found')) {
            setError(t('library.noCameraFound', 'No se encontró ninguna cámara disponible.'));
          } else {
            setError(t('library.cameraError', 'No se pudo acceder a la cámara'));
          }
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(startScanner, 500);

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('library.scanQR', 'Escanear QR del libro')}</DialogTitle>
          <DialogDescription>
            {t('library.scanQRDesc', 'Apuntá la cámara al código QR de la etiqueta del libro.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative min-h-[260px]">
            <div id="qr-reader" className="w-full rounded-lg overflow-hidden" />
            {loading && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/50 rounded-lg">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('library.startingCamera', 'Iniciando cámara…')}</p>
              </div>
            )}
          </div>
          {error && (
            <div className="flex flex-col items-center gap-2 py-4">
              <Camera className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-destructive text-center">{error}</p>
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            {t('common.cancel', 'Cancelar')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
