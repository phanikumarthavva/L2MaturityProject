import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { Projects } from "@/pages/Projects";
import { ProjectDetail } from "@/pages/ProjectDetail";
import { UsersAdmin } from "@/pages/UsersAdmin";

function Protected({ children }: { children: React.ReactNode }): React.ReactElement {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App(): React.ReactElement {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="users" element={<UsersAdmin />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
