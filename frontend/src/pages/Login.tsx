import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function Login(): React.ReactElement {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (user) {
    nav("/", { replace: true });
  }

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      nav("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900/50 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">Enterprise Project &amp; Resource Management</p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <label className="block text-sm text-slate-400" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-emerald-500/30 focus:ring-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none ring-emerald-500/30 focus:ring-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-md bg-emerald-600 py-2.5 font-medium text-white hover:bg-emerald-500"
          >
            Sign in
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          No account?{" "}
          <Link className="text-emerald-400 hover:underline" to="/register">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
