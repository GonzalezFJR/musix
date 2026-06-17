import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import AdminPanelPage from "./pages/AdminPanelPage";
import DashboardPage from "./pages/DashboardPage";
import DocsPage from "./pages/DocsPage";
import EditorPage from "./pages/EditorPage";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import SettingsPage from "./pages/SettingsPage";

function Loading() {
  return <div className="flex h-full items-center justify-center text-slate-400">Cargando…</div>;
}

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/login" replace />;
}

// Solo accesible por administradores loggueados.
function AdminProtected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return user.role === "admin" ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
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
