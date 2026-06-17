import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { api, setToken, type ProfileUpdate, type User } from "../lib/api";
import { useTheme } from "../theme/ThemeContext";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    captchaToken: string,
    profile?: Omit<ProfileUpdate, "theme" | "preferences">,
  ) => Promise<void>;
  // Adopta un token (p. ej. el devuelto por el callback de Google) y carga el usuario.
  adoptToken: (token: string) => Promise<void>;
  updateProfile: (data: ProfileUpdate) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { setTheme } = useTheme();

  // Aplica el tema guardado en el perfil del usuario (si lo tiene).
  function adopt(u: User | null) {
    setUser(u);
    if (u?.theme) setTheme(u.theme);
  }

  // Al cargar, intenta recuperar el usuario con el token guardado. Si falla,
  // limpiamos el token (el usuario quedará en null → rutas protegidas redirigen).
  useEffect(() => {
    api
      .me()
      .then(adopt)
      .catch(() => api.logout())
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
    captchaToken: string,
    profile: Omit<ProfileUpdate, "theme" | "preferences"> = {},
  ) {
    await api.register(email, password, captchaToken, profile);
    await login(email, password);
  }

  async function adoptToken(token: string) {
    setToken(token);
    adopt(await api.me());
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
    <AuthContext.Provider
      value={{ user, loading, login, register, adoptToken, updateProfile, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
