/**
 * RedBit Drive — Root App v2.0
 * Добавлен маршрут /trash (корзина)
 */

import React, { Suspense, lazy } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ToastProvider } from "@/components/ui/Toast";
import DashboardLayout from "@/components/DashboardLayout";

const AuthPage     = lazy(() => import("@/pages/AuthPage"));
const FilesPage    = lazy(() => import("@/pages/FilesPage"));
const SearchPage   = lazy(() => import("@/pages/SearchPage"));
const AdminPage    = lazy(() => import("@/pages/AdminPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const AboutPage    = lazy(() => import("@/pages/AboutPage"));
const TrashPage    = lazy(() => import("@/pages/TrashPage"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (user) return <Navigate to="/drive" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/auth"  replace />;
  if (!isAdmin) return <Navigate to="/drive" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/drive" replace />} />
        <Route path="/auth" element={<PublicRoute><AuthPage /></PublicRoute>} />

        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/drive"    element={<FilesPage />} />
          <Route path="/search"   element={<SearchPage />} />
          <Route path="/trash"    element={<TrashPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about"    element={<AboutPage />} />
          <Route path="/admin"    element={<AdminRoute><AdminPage /></AdminRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/drive" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
