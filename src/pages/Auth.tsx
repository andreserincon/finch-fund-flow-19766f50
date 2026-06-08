import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const authSchema = z.object({
  email: z.string().email('Ingrese un correo electrónico válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

const resetSchema = z.object({
  email: z.string().email('Ingrese un correo electrónico válido'),
});

const newPasswordSchema = z.object({
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmPassword: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ["confirmPassword"],
});

type AuthFormData = z.infer<typeof authSchema>;
type ResetFormData = z.infer<typeof resetSchema>;
type NewPasswordFormData = z.infer<typeof newPasswordSchema>;

/**
 * RaysMark - a fragment of the lodge emblem (the radiating rays), never the
 * full emblem. Rendered in gold as the login threshold mark.
 */
function RaysMark({ className }: { className?: string }) {
  const count = 28;
  const lines = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const isLong = i % 2 === 0;
    const rIn = 30;
    const rOut = isLong ? 104 : 66;
    return (
      <line
        key={i}
        x1={(Math.cos(a) * rIn).toFixed(1)}
        y1={(Math.sin(a) * rIn).toFixed(1)}
        x2={(Math.cos(a) * rOut).toFixed(1)}
        y2={(Math.sin(a) * rOut).toFixed(1)}
        stroke="currentColor"
        strokeWidth={isLong ? 3 : 2}
        strokeLinecap="round"
        opacity={isLong ? 0.95 : 0.5}
        strokeDasharray={isLong ? undefined : '3 5'}
      />
    );
  });
  return (
    <svg viewBox="-110 -110 220 220" className={className} aria-hidden="true">
      {lines}
    </svg>
  );
}

/** The dark, atmospheric backdrop shared by every threshold view. */
function Threshold({ children }: { children: ReactNode }) {
  return (
    <div className="dark relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute left-1/2 top-1/2 h-[660px] w-[660px] -translate-x-1/2 -translate-y-1/2 text-primary opacity-[0.06]">
          <RaysMark className="h-full w-full overflow-visible" />
        </div>
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(circle at 50% 38%, transparent 55%, rgba(2,2,4,.6) 100%)' }}
        />
      </div>
      <div className="relative z-10 w-full max-w-md space-y-6 animate-fade-in">{children}</div>
    </div>
  );
}

/** The lodge wordmark and gold hairline used atop each threshold card. */
function LodgeHead({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="h-14 w-14 text-primary">
        <RaysMark className="h-full w-full overflow-visible" />
      </div>
      <h1 className="font-display text-3xl font-semibold leading-none text-foreground">
        Logia Simón Bolívar
      </h1>
      <span className="font-sans text-[0.7rem] uppercase tracking-[0.3em] text-primary">Nº 646</span>
      <hr className="rule-gold" />
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('login');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [passwordUpdateSuccess, setPasswordUpdateSuccess] = useState(false);
  const [passwordUpdateLoading, setPasswordUpdateLoading] = useState(false);
  const [passwordUpdateError, setPasswordUpdateError] = useState<string | null>(null);

  // Check for password recovery mode on mount
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AuthFormData>({
    resolver: zodResolver(authSchema),
  });

  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    formState: { errors: resetErrors },
    reset: resetResetForm,
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  const {
    register: registerNewPassword,
    handleSubmit: handleSubmitNewPassword,
    formState: { errors: newPasswordErrors },
    reset: resetNewPasswordForm,
  } = useForm<NewPasswordFormData>({
    resolver: zodResolver(newPasswordSchema),
  });

  const handleAuth = async (data: AuthFormData, isSignUp: boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error } = isSignUp
        ? await signUp(data.email, data.password)
        : await signIn(data.email, data.password);

      if (error) {
        if (error.message.includes('User already registered')) {
          setError('Este correo ya está registrado. Ingrese, por favor.');
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Correo o contraseña incorrectos. Intente de nuevo.');
        } else {
          setError(error.message);
        }
        return;
      }

      reset();
      navigate('/home');
    } catch (err) {
      setError('Ocurrió un error inesperado. Intente de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (data: ResetFormData) => {
    setResetLoading(true);
    setResetError(null);
    setResetSuccess(false);

    try {
      const redirectUrl = `${window.location.origin}/auth`;

      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setResetError(error.message || 'No pudimos enviar el correo. Intente de nuevo.');
        return;
      }

      setResetSuccess(true);
      resetResetForm();
    } catch (err) {
      setResetError('Ocurrió un error inesperado. Intente de nuevo.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetDialogChange = (open: boolean) => {
    setResetDialogOpen(open);
    if (!open) {
      setResetError(null);
      setResetSuccess(false);
      resetResetForm();
    }
  };

  const handleNewPassword = async (data: NewPasswordFormData) => {
    setPasswordUpdateLoading(true);
    setPasswordUpdateError(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password
      });

      if (error) {
        setPasswordUpdateError(error.message);
        return;
      }

      setPasswordUpdateSuccess(true);
      resetNewPasswordForm();

      // Redirect to the members home after successful password update
      setTimeout(() => {
        navigate('/home');
      }, 2000);
    } catch (err) {
      setPasswordUpdateError('Ocurrió un error inesperado. Intente de nuevo.');
    } finally {
      setPasswordUpdateLoading(false);
    }
  };

  // Show password reset form if in recovery mode
  if (isRecoveryMode) {
    return (
      <Threshold>
        <LodgeHead subtitle="Establezca su nueva contraseña" />

        <Card className="border-border/60 bg-card shadow-lg">
          <CardHeader>
            <CardTitle className="font-display text-2xl font-semibold">Nueva contraseña</CardTitle>
            <CardDescription>
              Elija una contraseña segura, de al menos 6 caracteres.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {passwordUpdateSuccess ? (
              <Alert className="border-primary/50 bg-primary/10">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <AlertDescription className="text-primary">
                  Contraseña actualizada. Redirigiendo...
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmitNewPassword(handleNewPassword)} className="space-y-4">
                {passwordUpdateError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{passwordUpdateError}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="new-password">Nueva contraseña</Label>
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="••••••••"
                    {...registerNewPassword('password')}
                  />
                  {newPasswordErrors.password && (
                    <p className="text-sm text-destructive">{newPasswordErrors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirmar contraseña</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    {...registerNewPassword('confirmPassword')}
                  />
                  {newPasswordErrors.confirmPassword && (
                    <p className="text-sm text-destructive">{newPasswordErrors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={passwordUpdateLoading}>
                  {passwordUpdateLoading ? 'Actualizando...' : 'Actualizar contraseña'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </Threshold>
    );
  }

  return (
    <Threshold>
      <LodgeHead subtitle="Área reservada para los hermanos" />

      <Card className="border-border/60 bg-card shadow-lg">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader className="pb-4">
            <TabsList className="grid w-full grid-cols-1">
              <TabsTrigger value="login">Ingresar</TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <TabsContent value="login" className="mt-0">
              <form onSubmit={handleSubmit((data) => handleAuth(data, false))} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Correo electrónico</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password">Contraseña</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Ingresando...' : 'Ingresar'}
                </Button>

                <Dialog open={resetDialogOpen} onOpenChange={handleResetDialogChange}>
                  <DialogTrigger asChild>
                    <Button variant="link" type="button" className="w-full text-sm text-muted-foreground">
                      ¿Olvidó su contraseña?
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="dark sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle className="font-display text-2xl font-semibold">Restablecer contraseña</DialogTitle>
                      <DialogDescription>
                        Ingrese su correo y le enviaremos un enlace para restablecerla.
                      </DialogDescription>
                    </DialogHeader>

                    {resetSuccess ? (
                      <Alert className="border-primary/50 bg-primary/10">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <AlertDescription className="text-primary">
                          Le enviamos un correo para restablecer su contraseña. Revise su bandeja.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <form onSubmit={handleSubmitReset(handlePasswordReset)} className="space-y-4">
                        {resetError && (
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{resetError}</AlertDescription>
                          </Alert>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Correo electrónico</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            placeholder="correo@ejemplo.com"
                            {...registerReset('email')}
                          />
                          {resetErrors.email && (
                            <p className="text-sm text-destructive">{resetErrors.email.message}</p>
                          )}
                        </div>

                        <Button type="submit" className="w-full" disabled={resetLoading}>
                          {resetLoading ? 'Enviando...' : 'Enviar enlace'}
                        </Button>
                      </form>
                    )}
                  </DialogContent>
                </Dialog>
              </form>
            </TabsContent>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Los accesos los gestiona la Secretaría o el Venerable. Si necesitás acceso a la aplicación, comunicate con ellos.
            </p>
          </CardContent>
        </Tabs>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Toda consulta se trata con absoluta reserva.
      </p>

      <button
        type="button"
        onClick={() => navigate('/')}
        className="mx-auto block text-xs tracking-[0.14em] text-muted-foreground transition-colors hover:text-primary"
      >
        ‹ Volver al inicio
      </button>
    </Threshold>
  );
}
