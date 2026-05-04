import { type FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";

interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  memberIds: string[];
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
}

export function ProjectDetail(): React.ReactElement {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await api<Project>(`/projects/${id}`);
        const t = await api<TaskRow[]>(`/projects/${id}/tasks`);
        if (!cancelled) {
          setProject(p);
          setTasks(t);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function addTask(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!id) return;
    setError(null);
    try {
      await api(`/projects/${id}/tasks`, {
        method: "POST",
        json: { title, status: "todo" },
      });
      setTitle("");
      const t = await api<TaskRow[]>(`/projects/${id}/tasks`);
      setTasks(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function updateStatus(taskId: string, status: string): Promise<void> {
    if (!id) return;
    await api(`/projects/${id}/tasks/${taskId}`, {
      method: "PATCH",
      json: { status },
    });
    const t = await api<TaskRow[]>(`/projects/${id}/tasks`);
    setTasks(t);
  }

  if (!id) return <p className="text-slate-400">Invalid project</p>;
  if (error && !project) return <p className="text-red-400">{error}</p>;
  if (!project) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm text-slate-500">
        <Link to="/projects" className="hover:text-emerald-400">
          ← Projects
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
        <p className="text-slate-400">{project.description || "No description"}</p>
      </div>
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="font-medium text-white">Tasks</h2>
        <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => void addTask(e)}>
          <input
            className="min-w-[200px] flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            placeholder="New task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Add task
          </button>
        </form>
        {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        <ul className="mt-4 divide-y divide-slate-800">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="text-white">{t.title}</span>
              <select
                className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
                value={t.status}
                onChange={(e) => void updateStatus(t.id, e.target.value)}
              >
                <option value="todo">todo</option>
                <option value="in_progress">in progress</option>
                <option value="done">done</option>
              </select>
            </li>
          ))}
          {tasks.length === 0 ? <li className="py-4 text-center text-slate-500">No tasks</li> : null}
        </ul>
      </section>
    </div>
  );
}
