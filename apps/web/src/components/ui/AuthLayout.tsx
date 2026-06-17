import { type ReactNode } from "react";
import { Link } from "react-router-dom";

import Logo from "./Logo";

/** Tarjeta centrada para las páginas públicas de auth (login, registro, etc.). */
export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <Link to="/landing">
            <Logo className="mx-auto mb-3 h-12 w-auto text-white" />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="mt-4 text-center text-sm text-slate-400">{footer}</div>}
      </div>
    </div>
  );
}
