import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { MainLayout } from "@/components/layout/MainLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import Transactions from "./pages/Transactions";
import Loans from "./pages/Loans";
import LogPayment from "./pages/LogPayment";
import LogExpense from "./pages/LogExpense";
import MonthlyFees from "./pages/MonthlyFees";
import ExtraordinaryExpenses from "./pages/ExtraordinaryExpenses";
import FeeCalculator from "./pages/FeeCalculator";
import AccountTransfer from "./pages/AccountTransfer";
import UserManagement from "./pages/UserManagement";
import Reports from "./pages/Reports";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  if (loading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
}

function AuthRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <Toaster />
    <Sonner />
    <InstallPrompt />
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/members" element={<ProtectedRoute><Members /></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><Transactions /></ProtectedRoute>} />
        <Route path="/loans" element={<ProtectedRoute><Loans /></ProtectedRoute>} />
        <Route path="/log-payment" element={<AdminRoute><LogPayment /></AdminRoute>} />
        <Route path="/log-expense" element={<AdminRoute><LogExpense /></AdminRoute>} />
        <Route path="/account-transfer" element={<AdminRoute><AccountTransfer /></AdminRoute>} />
        <Route path="/monthly-fees" element={<ProtectedRoute><MonthlyFees /></ProtectedRoute>} />
        <Route path="/expense-categories" element={<ProtectedRoute><ExtraordinaryExpenses /></ProtectedRoute>} />
        <Route path="/fee-calculator" element={<ProtectedRoute><FeeCalculator /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
        <Route path="/user-management" element={<AdminRoute><UserManagement /></AdminRoute>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
