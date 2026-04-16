import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (!token) {
    return <Navigate to="/auth" replace />;
  }

  if (!user || isLoading) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
        <section className="w-full rounded-[36px] bg-white/90 p-8 text-center shadow-panel">
          <p className="inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            Restoring session
          </p>
          <h1 className="mt-4 text-2xl font-bold text-ink">Checking your account</h1>
        </section>
      </main>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
