import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Html5Qrcode } from 'html5-qrcode';
import { X } from 'lucide-react';

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onScan: (bookId: string) => void;
}

export function QRScannerDialog({ open, onClose, onScan }: QRScannerDialogProps) {
  const { t } = useTranslation();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const scannerId = 'qr-reader';
    let stopped = false;

    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode(scannerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // Extract book ID from URL or use raw value
            try {
              const url = new URL(decodedText);
              const bookParam = url.searchParams.get('book');
              if (bookParam) {
                onScan(bookParam);
              }
            } catch {
              // Not a URL, try as raw ID
              onScan(decodedText);
            }
            scanner.stop().catch(() => {});
            onClose();
          },
          () => {} // ignore scan failures
        );
      } catch (err) {
        if (!stopped) {
          setError(t('library.cameraError', 'No se pudo acceder a la cámara'));
        }
      }
    };

    // Small delay to ensure DOM element exists
    const timer = setTimeout(startScanner, 300);

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
        </DialogHeader>
        <div className="space-y-3">
          <div id="qr-reader" className="w-full rounded-lg overflow-hidden" />
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
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
