import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api, type UserDto, type UserRole } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export function UsersAdmin(): React.ReactElement {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState<UserDto[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await api<UserDto[]>("/users");
    setRows(list);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void load().catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }, [isAdmin, load]);

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  async function onCreate(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await api("/users", {
        method: "POST",
        json: { email, password, name, role },
      });
      setEmail("");
      setPassword("");
      setName("");
      setRole("user");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">User administration</h1>
        <p className="text-slate-400">Create users and assign roles (Admin only).</p>
      </div>
      <form
        onSubmit={(e) => void onCreate(e)}
        className="max-w-xl space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4"
      >
        <h2 className="font-medium text-white">New user</h2>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        <select
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
        >
          <option value="user">user</option>
          <option value="manager">manager</option>
          <option value="admin">admin</option>
        </select>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Create user
        </button>
      </form>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-900/40">
                <td className="px-4 py-3 text-white">{r.email}</td>
                <td className="px-4 py-3 text-slate-300">{r.name}</td>
                <td className="px-4 py-3 uppercase text-slate-500">{r.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
