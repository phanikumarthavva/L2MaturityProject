import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const linkClass = ({ isActive }: { isActive: boolean }): string =>
  `rounded-md px-3 py-2 text-sm font-medium transition ${
    isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"
  }`;

export function Layout(): React.ReactElement {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight text-white">Enterprise PRM</span>
          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/projects" className={linkClass}>
              Projects
            </NavLink>
            {user?.role === "admin" ? (
              <NavLink to="/users" className={linkClass}>
                Users
              </NavLink>
            ) : null}
          </nav>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span>
              {user?.name} <span className="text-slate-600">·</span>{" "}
              <span className="uppercase text-slate-500">{user?.role}</span>
            </span>
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
