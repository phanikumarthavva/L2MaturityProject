import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
}

export function Dashboard(): React.ReactElement {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api<ProjectRow[]>("/projects");
        if (!cancelled) setProjects(list);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-slate-400">Welcome back, {user?.name}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-500">Your role</p>
          <p className="mt-1 text-xl font-medium capitalize text-white">{user?.role}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-500">Accessible projects</p>
          <p className="mt-1 text-xl font-medium text-white">{projects.length}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-slate-500">Quick action</p>
          <Link
            to="/projects"
            className="mt-2 inline-block text-sm font-medium text-emerald-400 hover:underline"
          >
            Manage projects
          </Link>
        </div>
      </div>
      {err ? <p className="text-red-400">{err}</p> : null}
      <section>
        <h2 className="text-lg font-medium text-white">Recent projects</h2>
        <ul className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
          {projects.slice(0, 5).map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3 hover:bg-slate-900/50">
              <div>
                <p className="font-medium text-white">{p.name}</p>
                <p className="text-sm text-slate-500 line-clamp-1">{p.description || "—"}</p>
              </div>
              <Link
                to={`/projects/${p.id}`}
                className="text-sm text-emerald-400 hover:underline"
              >
                Open
              </Link>
            </li>
          ))}
          {projects.length === 0 && !err ? (
            <li className="px-4 py-6 text-center text-slate-500">No projects yet</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
