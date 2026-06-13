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
import { LodgeLoader } from "@/components/lodge/LodgeLoader";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useIsSuperAdmin } from "@/hooks/useIsSuperAdmin";
import { useCanManageUsers } from "@/hooks/useCanManageUsers";
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
import EventOverview from "./pages/EventOverview";
import FeeCalculator from "./pages/FeeCalculator";
import PaymentReminders from "./pages/PaymentReminders";
import AccountTransfer from "./pages/AccountTransfer";
import UserManagement from "./pages/UserManagement";
import MyPayments from "./pages/MyPayments";
import Reports from "./pages/Reports";
import Budget from "./pages/Budget";
import Library from "./pages/Library";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import Lock from "./pages/Lock";
import { useIsStandalone } from "@/hooks/useIsStandalone";

/* ------------------------------------------------------------------ */
/*  React Query client (singleton)                                    */
/* ------------------------------------------------------------------ */
/**
 * Configured defaults. The Panel (and every screen) fires a dozen queries;
 * with the library defaults (staleTime 0, refetchOnWindowFocus on) the whole
 * set re-ran on every mount and every window/tab refocus, which is the main
 * reason the Panel felt slow for both admins and members. We cache for a
 * minute and stop the focus-refetch storm. This is safe because every write
 * path invalidates its query keys (members, member_balances, transactions,
 * loans, transfers, fee history), so balances still refresh immediately after
 * the treasurer records something. Retries are capped and never fire on
 * auth/permission/4xx errors (a member hitting a staff-only table fails fast
 * instead of retrying three times with backoff).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount: number, error: unknown) => {
        const e = error as { status?: number; statusCode?: number; code?: string; message?: string } | null;
        const status = e?.status ?? e?.statusCode ?? 0;
        if (status >= 400 && status < 500) return false;
        const msg = String(e?.message ?? '').toLowerCase();
        if (
          msg.includes('jwt') ||
          msg.includes('permission') ||
          msg.includes('row-level') ||
          msg.includes('not authorized') ||
          msg.includes('unauthorized')
        ) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

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
        <LodgeLoader size={56} />
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
        <LodgeLoader size={56} />
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
        <LodgeLoader size={56} />
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
        <LodgeLoader size={56} />
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
        <LodgeLoader size={56} />
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
 * UserAdminRoute – requires admin OR Venerable (vm). Used for managing accesses
 * (create accounts, assign roles, send reset links).
 */
function UserAdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { canManageUsers, isLoading } = useCanManageUsers();

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LodgeLoader size={56} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!canManageUsers) {
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
        <LodgeLoader size={56} />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

/**
 * RootGate - decides what the app root ("/") shows:
 *   - installed mobile app (standalone): the sun lock screen, never the landing
 *   - public web visitor (not signed in): the public landing page
 *   - signed-in web member: the treasury dashboard (existing behavior)
 * The reserved area is entered through the hidden door (the sun), not a button.
 */
function RootGate() {
  const { user, loading } = useAuth();
  const isStandalone = useIsStandalone();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LodgeLoader size={56} />
      </div>
    );
  }

  if (isStandalone) {
    return <Lock />;
  }

  if (!user) {
    return <Landing />;
  }

  // Signed-in web users land on the dashboard at its own stable route (/panel),
  // so "/" stays purely the entry gate and the Panel is reachable in the
  // installed PWA without re-showing the lock screen.
  return <Navigate to="/panel" replace />;
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

        {/* Root: public landing, app lock screen, or redirect to /panel (see RootGate) */}
        <Route path="/" element={<RootGate />} />

        {/* Treasury dashboard - stable route, works in the installed PWA */}
        <Route path="/panel" element={<TreasuryRoute><Dashboard /></TreasuryRoute>} />

        {/* Treasury – view-only routes */}
        <Route path="/index" element={<Navigate to="/" replace />} />
        <Route path="/members" element={<TreasuryRoute><Members /></TreasuryRoute>} />
        <Route path="/mis-pagos" element={<TreasuryRoute><MyPayments /></TreasuryRoute>} />

        {/* Treasury – staff routes (no member-only) */}
        <Route path="/transactions" element={<TreasuryStaffRoute><Transactions /></TreasuryStaffRoute>} />
        <Route path="/loans" element={<TreasuryStaffRoute><Loans /></TreasuryStaffRoute>} />
        <Route path="/monthly-fees" element={<TreasuryStaffRoute><MonthlyFees /></TreasuryStaffRoute>} />
        <Route path="/expense-categories" element={<TreasuryStaffRoute><ExtraordinaryExpenses /></TreasuryStaffRoute>} />
        <Route path="/events/:id" element={<TreasuryStaffRoute><EventOverview /></TreasuryStaffRoute>} />
        <Route path="/fee-calculator" element={<TreasuryStaffRoute><FeeCalculator /></TreasuryStaffRoute>} />
        <Route path="/reports" element={<TreasuryStaffRoute><Reports /></TreasuryStaffRoute>} />
        <Route path="/budget" element={<TreasuryStaffRoute><Budget /></TreasuryStaffRoute>} />
        <Route path="/recordatorios" element={<TreasuryStaffRoute><PaymentReminders /></TreasuryStaffRoute>} />

        {/* Treasury – admin-only write routes */}
        <Route path="/log-payment" element={<AdminRoute><LogPayment /></AdminRoute>} />
        <Route path="/log-expense" element={<AdminRoute><LogExpense /></AdminRoute>} />
        <Route path="/account-transfer" element={<AdminRoute><AccountTransfer /></AdminRoute>} />

        {/* Library – any authenticated user */}
        <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />

        {/* Super-admin */}
        <Route path="/admin/members" element={<SuperAdminRoute><AdminMembers /></SuperAdminRoute>} />
        <Route path="/user-management" element={<UserAdminRoute><UserManagement /></UserAdminRoute>} />

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
    </HiddenModeProvider>
  </QueryClientProvider>
);

export default App;
