/**
 * @file App.tsx
 * @description Root component that wires up the application shell:
 *   - React Query provider for server-state management
 *   - Toast / Sonner notifications
 *   - PWA install prompt
 *   - React Router with role-based route guards
 *
 * Route hierarchy:
 *   /auth             → public login/signup (redirects to /home if logged in)
 *   /home             → authenticated landing with module cards
 *   /                 → treasury dashboard (treasury viewers only)
 *   /members          → member list (treasury viewers)
 *   /transactions     → income/expense log (treasury staff, not member-only)
 *   /loans            → loan management (treasury staff)
 *   /log-payment      → register a payment (admin)
 *   /log-expense      → register an expense (admin)
 *   /account-transfer → transfer between accounts (admin)
 *   /monthly-fees     → monthly fee config (treasury staff)
 *   /expense-categories → extraordinary expense types (treasury staff)
 *   /fee-calculator   → fee calculator tool (treasury staff)
 *   /reports          → monthly report generation (treasury staff)
 *   /budget           → annual budget planning (treasury staff)
 *   /library          → book library (any authenticated user)
 *   /admin/members    → member CRUD (super-admin)
 *   /user-management  → user roles & accounts (super-admin)
 */

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import { useCanViewTreasury } from "@/hooks/useCanViewTreasury";
import { useIsMemberOnly } from "@/hooks/useIsMemberOnly";
import { MainLayout } from "@/components/layout/MainLayout";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { HiddenModeProvider } from "@/contexts/HiddenModeContext";
import Dashboard from "./pages/Dashboard";
import Members from "./pages/Members";
import AdminMembers from "./pages/AdminMembers";
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
import Budget from "./pages/Budget";
import Library from "./pages/Library";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";

/* ------------------------------------------------------------------ */
/*  React Query client (singleton)                                    */
/* ------------------------------------------------------------------ */
const queryClient = new QueryClient();

/* ================================================================== */
/*  Route-guard wrapper components                                    */
/* ================================================================== */

/**
 * ProtectedRoute – requires the user to be authenticated.
 * Renders children inside the shared MainLayout shell.
 */
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

/**
 * TreasuryRoute – requires authentication AND the `canViewTreasury`
 * permission (treasurer, vm, admin, or similar).
 */
function TreasuryRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { canViewTreasury, isLoading } = useCanViewTreasury();

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Users without treasury access are redirected to the library
  if (!canViewTreasury) {
    return <Navigate to="/library" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
}

/**
 * TreasuryStaffRoute – like TreasuryRoute but also excludes
 * member-only users (they can view dashboards but not edit data).
 */
function TreasuryStaffRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { canViewTreasury, isLoading } = useCanViewTreasury();
  const { isMemberOnly, isLoading: memberLoading } = useIsMemberOnly();

  if (loading || isLoading || memberLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!canViewTreasury || isMemberOnly) {
    return <Navigate to="/" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
}

/**
 * AdminRoute – requires the "admin" role (treasurer-level write access).
 */
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

/**
 * SuperAdminRoute – requires the "admin" app_role (full system access).
 */
function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { isSuperAdmin, isLoading: adminLoading } = useIsSuperAdmin();

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

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <MainLayout>{children}</MainLayout>;
}

/**
 * AuthRoute – public route that redirects to /home if already logged in.
 */
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
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
}

/* ================================================================== */
/*  App component                                                     */
/* ================================================================== */

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HiddenModeProvider>
    {/* Toast notification providers */}
    <Toaster />
    <Sonner />

    {/* PWA install banner (mobile) */}
    <InstallPrompt />

    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/auth" element={<AuthRoute><Auth /></AuthRoute>} />

        {/* Authenticated landing */}
        <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />

        {/* Treasury – view-only routes */}
        <Route path="/" element={<TreasuryRoute><Dashboard /></TreasuryRoute>} />
        <Route path="/members" element={<TreasuryRoute><Members /></TreasuryRoute>} />

        {/* Treasury – staff routes (no member-only) */}
        <Route path="/transactions" element={<TreasuryStaffRoute><Transactions /></TreasuryStaffRoute>} />
        <Route path="/loans" element={<TreasuryStaffRoute><Loans /></TreasuryStaffRoute>} />
        <Route path="/monthly-fees" element={<TreasuryStaffRoute><MonthlyFees /></TreasuryStaffRoute>} />
        <Route path="/expense-categories" element={<TreasuryStaffRoute><ExtraordinaryExpenses /></TreasuryStaffRoute>} />
        <Route path="/fee-calculator" element={<TreasuryStaffRoute><FeeCalculator /></TreasuryStaffRoute>} />
        <Route path="/reports" element={<TreasuryStaffRoute><Reports /></TreasuryStaffRoute>} />
        <Route path="/budget" element={<TreasuryStaffRoute><Budget /></TreasuryStaffRoute>} />

        {/* Treasury – admin-only write routes */}
        <Route path="/log-payment" element={<AdminRoute><LogPayment /></AdminRoute>} />
        <Route path="/log-expense" element={<AdminRoute><LogExpense /></AdminRoute>} />
        <Route path="/account-transfer" element={<AdminRoute><AccountTransfer /></AdminRoute>} />

        {/* Library – any authenticated user */}
        <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />

        {/* Super-admin */}
        <Route path="/admin/members" element={<SuperAdminRoute><AdminMembers /></SuperAdminRoute>} />
        <Route path="/user-management" element={<SuperAdminRoute><UserManagement /></SuperAdminRoute>} />

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
    </HiddenModeProvider>
  </QueryClientProvider>
);

export default App;
