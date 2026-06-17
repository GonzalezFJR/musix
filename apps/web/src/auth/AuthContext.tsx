import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { api, type ProfileUpdate, type User } from "../lib/api";
import { useTheme } from "../theme/ThemeContext";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    profile?: Omit<ProfileUpdate, "theme" | "preferences">,
  ) => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

// Usuario "dev" de respaldo: en modo desarrollo (vite dev), si /auth/me no
// responde (backend caído o aún arrancando) entramos igualmente sin pasar por
// /login. Las llamadas a la API siguen funcionando porque el backend, con
// AUTH_DISABLED=true, atiende toda petición como su propio usuario dev.
const DEV_FALLBACK_USER: User = {
  id: 0,
  email: "dev@example.com",
  role: "admin",
  display_name: "Dev",
  author_name: "",
  first_name: "",
  last_name: "",
  location: "",
  theme: "normal",
  preferences: {},
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();

  // Aplica el tema guardado en el perfil del usuario (si lo tiene).
  function adopt(u: User | null) {
    setUser(u);
    if (u?.theme) setTheme(u.theme);
  }

  // Al cargar intenta recuperar el usuario. Si la auth está desactivada (modo
  // desarrollo), /auth/me devuelve el usuario "dev" sin token y entramos directos.
  // En dev, si /auth/me falla, usamos el usuario de respaldo para no exigir login.
  // En producción, un fallo lleva al login.
  useEffect(() => {
    api
      .me()
      .then(adopt)
      .catch(() => {
        if (import.meta.env.DEV) setUser(DEV_FALLBACK_USER);
        else api.logout();
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    await api.login(email, password);
    adopt(await api.me());
  }

  async function register(
    email: string,
    password: string,
    profile: Omit<ProfileUpdate, "theme" | "preferences"> = {},
  ) {
    await api.register(email, password, profile);
    await login(email, password);
  }

  async function updateProfile(data: ProfileUpdate): Promise<User> {
    const updated = await api.updateProfile(data);
    adopt(updated);
    return updated;
  }

  function logout() {
    api.logout();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, updateProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
