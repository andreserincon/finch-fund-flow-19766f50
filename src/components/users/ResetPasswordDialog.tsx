import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Copy, Check, KeyRound } from 'lucide-react';

interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
}

export function ResetPasswordDialog({ open, onOpenChange, userEmail }: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    setLink(null);
    setCopied(false);
    onOpenChange(false);
  };

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-link', {
        body: { email: userEmail, redirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setLink(data.actionLink ?? null);
    } catch (err: any) {
      console.error('Error generating reset link:', err);
      toast.error(err.message || 'No se pudo generar el enlace.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[460px]"
        onInteractOutside={link ? (e) => e.preventDefault() : undefined}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Restablecer acceso
          </DialogTitle>
          <DialogDescription>{userEmail}</DialogDescription>
        </DialogHeader>

        {link === null ? (
          <>
            <div className="py-2 text-sm text-muted-foreground">
              Se generara un enlace de un solo uso para que el hermano establezca una contrasena nueva.
              Vos no veras ni elegiras la contrasena. Envia el enlace por WhatsApp o en persona.
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={isLoading}>
                {t('common.cancel', 'Cancelar')}
              </Button>
              <Button onClick={handleGenerate} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generar enlace
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <Label className="text-xs text-muted-foreground">Enlace para restablecer la contrasena</Label>
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="font-mono text-xs break-all">{link || 'No se pudo generar el enlace. Intenta de nuevo.'}</p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>
                {t('common.close', 'Cerrar')}
              </Button>
              <Button onClick={handleCopy} disabled={!link}>
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? t('common.copied', 'Copiado') : 'Copiar enlace'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
