import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Camera, Loader2 } from 'lucide-react';

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onScan: (bookId: string) => void;
}

/**
 * Two-phase scanner:
 * Phase 1 – "Tap to start" button that calls getUserMedia directly from the
 *           user gesture so mobile browsers don't block access.
 * Phase 2 – Once the stream is obtained we hand it to Html5Qrcode for decoding.
 */
export function QRScannerDialog({ open, onClose, onScan }: QRScannerDialogProps) {
  const { t } = useTranslation();
  const scannerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<'prompt' | 'scanning' | 'error'>('prompt');
  const [error, setError] = useState<string | null>(null);

  // Clean up scanner + stream
  const cleanup = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      cleanup();
      setPhase('prompt');
      setError(null);
    }
  }, [open, cleanup]);

  // Called directly from button click – preserves user gesture chain
  const handleStartCamera = async () => {
    setError(null);
    try {
      // 1. Request camera permission directly in the click handler
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setPhase('scanning');

      // 2. Wait a tick so the #qr-reader div is in the DOM
      await new Promise((r) => setTimeout(r, 100));

      const scannerId = 'qr-reader';
      const el = document.getElementById(scannerId);
      if (!el) {
        throw new Error('Scanner element not found');
      }

      // 3. Dynamically import the heavy library
      const { Html5Qrcode } = await import('html5-qrcode');

      // Stop the stream we opened – Html5Qrcode will create its own
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const scanner = new Html5Qrcode(scannerId);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          try {
            const url = new URL(decodedText);
            const bookParam = url.searchParams.get('book');
            onScan(bookParam || decodedText);
          } catch {
            onScan(decodedText);
          }
          scanner.stop().catch(() => {});
          onClose();
        },
        () => {} // ignore per-frame failures
      );
    } catch (err: any) {
      console.error('QR Scanner error:', err);
      const msg = err?.message || '';
      if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
        setError(
          t('library.cameraPermissionDenied', 'Permiso de cámara denegado. Habilitalo en los ajustes del navegador.')
        );
      } else if (msg.includes('NotFoundError') || msg.includes('not found')) {
        setError(t('library.noCameraFound', 'No se encontró ninguna cámara disponible.'));
      } else {
        setError(t('library.cameraError', 'No se pudo acceder a la cámara'));
      }
      setPhase('error');
    }
  };

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
          {phase === 'prompt' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Camera className="h-12 w-12 text-primary/70" />
              <Button onClick={handleStartCamera} className="gap-2">
                <Camera className="h-4 w-4" />
                {t('library.openCamera', 'Abrir cámara')}
              </Button>
            </div>
          )}

          {phase === 'scanning' && (
            <div className="relative min-h-[280px]">
              <div id="qr-reader" className="w-full rounded-lg overflow-hidden" />
            </div>
          )}

          {phase === 'error' && error && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Camera className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-destructive text-center">{error}</p>
              <Button variant="outline" size="sm" onClick={handleStartCamera}>
                {t('common.retry', 'Reintentar')}
              </Button>
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
