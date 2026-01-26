import { useState } from 'react';
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
import { Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

const authSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const resetSchema = z.object({
  email: z.string().email('Please enter a valid email'),
});

type AuthFormData = z.infer<typeof authSchema>;
type ResetFormData = z.infer<typeof resetSchema>;

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

  const handleAuth = async (data: AuthFormData, isSignUp: boolean) => {
    setIsLoading(true);
    setError(null);

    try {
      const { error } = isSignUp
        ? await signUp(data.email, data.password)
        : await signIn(data.email, data.password);

      if (error) {
        if (error.message.includes('User already registered')) {
          setError('This email is already registered. Please sign in instead.');
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please try again.');
        } else {
          setError(error.message);
        }
        return;
      }

      reset();
      navigate('/');
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
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
      
      const { error } = await supabase.functions.invoke('reset-password', {
        body: { email: data.email, redirectUrl }
      });

      if (error) {
        setResetError(error.message || 'Failed to send reset email. Please try again.');
        return;
      }

      setResetSuccess(true);
      resetResetForm();
    } catch (err) {
      setResetError('An unexpected error occurred. Please try again.');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl gradient-primary shadow-lg">
            <Wallet className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Treasury Management</h1>
          <p className="text-muted-foreground text-center">
            Manage your organization's finances with ease
          </p>
        </div>

        {/* Auth Card */}
        <Card className="border-border/50 shadow-lg">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
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
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="treasurer@organization.com"
                      {...register('email')}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
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
                    {isLoading ? 'Signing in...' : 'Sign In'}
                  </Button>

                  <Dialog open={resetDialogOpen} onOpenChange={handleResetDialogChange}>
                    <DialogTrigger asChild>
                      <Button variant="link" type="button" className="w-full text-sm text-muted-foreground">
                        Forgot your password?
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Reset Password</DialogTitle>
                        <DialogDescription>
                          Enter your email address and we'll send you a link to reset your password.
                        </DialogDescription>
                      </DialogHeader>
                      
                      {resetSuccess ? (
                        <Alert className="border-primary/50 bg-primary/10">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          <AlertDescription className="text-primary">
                            Password reset email sent! Check your inbox.
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
                            <Label htmlFor="reset-email">Email</Label>
                            <Input
                              id="reset-email"
                              type="email"
                              placeholder="your@email.com"
                              {...registerReset('email')}
                            />
                            {resetErrors.email && (
                              <p className="text-sm text-destructive">{resetErrors.email.message}</p>
                            )}
                          </div>
                          
                          <Button type="submit" className="w-full" disabled={resetLoading}>
                            {resetLoading ? 'Sending...' : 'Send Reset Email'}
                          </Button>
                        </form>
                      )}
                    </DialogContent>
                  </Dialog>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSubmit((data) => handleAuth(data, true))} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="treasurer@organization.com"
                      {...register('email')}
                    />
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      {...register('password')}
                    />
                    {errors.password && (
                      <p className="text-sm text-destructive">{errors.password.message}</p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to the Terms of Service
        </p>
      </div>
    </div>
  );
}
