import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  ownerId: string;
}

export function Projects(): React.ReactElement {
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    const list = await api<ProjectRow[]>("/projects");
    setRows(list);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, []);

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api<ProjectRow>("/projects", {
        method: "POST",
        json: { name, description, memberIds: [] },
      });
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Projects</h1>
        <p className="text-slate-400">Create and open projects you own or are a member of.</p>
      </div>
      <form
        onSubmit={(e) => void onCreate(e)}
        className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3 max-w-xl"
      >
        <h2 className="font-medium text-white">New project</h2>
        <input
          placeholder="Name"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <textarea
          placeholder="Description"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Create
        </button>
      </form>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-900/40">
                <td className="px-4 py-3 text-white">{r.name}</td>
                <td className="px-4 py-3 text-slate-400 line-clamp-2">{r.description || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Link className="text-emerald-400 hover:underline" to={`/projects/${r.id}`}>
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
