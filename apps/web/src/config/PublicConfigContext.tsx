import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { api, type PublicConfig } from "../lib/api";

// Clave de TEST de Turnstile (pasa siempre) como fallback hasta cargar la real.
const DEFAULT_CONFIG: PublicConfig = {
  turnstile_site_key: "1x00000000000000000000AA",
  google_enabled: false,
  registration_enabled: true,
};

const PublicConfigContext = createContext<PublicConfig>(DEFAULT_CONFIG);

export function PublicConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    api
      .publicConfig()
      .then(setConfig)
      .catch(() => {
        /* mantenemos los valores por defecto */
      });
  }, []);

  return <PublicConfigContext.Provider value={config}>{children}</PublicConfigContext.Provider>;
}

export function usePublicConfig(): PublicConfig {
  return useContext(PublicConfigContext);
}
