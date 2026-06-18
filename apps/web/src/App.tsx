import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { usePublicConfig } from "./config/PublicConfigContext";
import AdminPanelPage from "./pages/AdminPanelPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import ContactPage from "./pages/ContactPage";
import DashboardPage from "./pages/DashboardPage";
import DocsPage from "./pages/DocsPage";
import EditorPage from "./pages/EditorPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SettingsPage from "./pages/SettingsPage";

function Loading() {
  return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
}

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/landing" replace />;
}

// En modo local sin login (auth_disabled), las pantallas de autenticación no
// tienen sentido: se entra directo como admin, así que redirigimos al dashboard.
function AuthRoute({ children }: { children: JSX.Element }) {
  const { auth_disabled } = usePublicConfig();
  return auth_disabled ? <Navigate to="/" replace /> : children;
}

// Solo accesible por administradores loggueados.
function AdminProtected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/landing" replace />;
  return user.role === "admin" ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Públicas */}
      <Route path="/landing" element={<AuthRoute><LandingPage /></AuthRoute>} />
      <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
      <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />
      <Route path="/forgot-password" element={<AuthRoute><ForgotPasswordPage /></AuthRoute>} />
      <Route path="/reset-password" element={<AuthRoute><ResetPasswordPage /></AuthRoute>} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* Protegidas */}
      <Route
        path="/"
        element={
          <Protected>
            <DashboardPage />
          </Protected>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <Protected>
            <EditorPage />
          </Protected>
        }
      />
      <Route
        path="/settings"
        element={
          <Protected>
            <SettingsPage />
          </Protected>
        }
      />
      <Route
        path="/docs"
        element={
          <AdminProtected>
            <DocsPage />
          </AdminProtected>
        }
      />
      <Route
        path="/adminpanel"
        element={
          <AdminProtected>
            <AdminPanelPage />
          </AdminProtected>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
