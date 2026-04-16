import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

type AuthTab = "signin" | "register";

const inputClass =
  "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent";

const AuthPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { redirectTo?: string } | null)?.redirectTo ?? "/";
  const redirectState =
    (location.state as { redirectState?: unknown } | null)?.redirectState ?? null;
  const [tab, setTab] = useState<AuthTab>("signin");
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"HOST" | "PARTICIPANT">("PARTICIPANT");
  const { login, register, isLoading, error } = useAuth();

  const pageTitle = useMemo(
    () => (tab === "signin" ? "Sign in to continue" : "Create your account"),
    [tab]
  );

  const handleSignIn = async () => {
    await login(signInEmail, signInPassword);
    navigate(redirectTo, { state: redirectState });
  };

  const handleRegister = async () => {
    await register(email, displayName, password, role);
    navigate(redirectTo, { state: redirectState });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-[36px] bg-white/90 p-8 shadow-panel">
        <div className="rounded-full bg-sky p-1">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setTab("signin")}
              className={
                tab === "signin"
                  ? "rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
                  : "px-5 py-2 text-sm font-medium text-slate-600"
              }
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setTab("register")}
              className={
                tab === "register"
                  ? "rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
                  : "px-5 py-2 text-sm font-medium text-slate-600"
              }
            >
              Create account
            </button>
          </div>
        </div>

        <h1 className="mt-6 text-3xl font-bold text-ink">{pageTitle}</h1>
        <p className="mt-3 text-sm text-slate-600">
          Hosts can schedule and start rooms, while participants can sign in and join via
          shared links.
        </p>

        {tab === "signin" ? (
          <div className="mt-8 space-y-4">
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Email</span>
              <input
                type="email"
                className={inputClass}
                value={signInEmail}
                onChange={(event) => setSignInEmail(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Password</span>
              <input
                type="password"
                className={inputClass}
                value={signInPassword}
                onChange={(event) => setSignInPassword(event.target.value)}
              />
            </label>
            {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
            <button
              type="button"
              onClick={() => void handleSignIn()}
              disabled={isLoading}
              className="w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Email</span>
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Display name</span>
              <input
                className={inputClass}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Password</span>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Role</span>
              <select
                className={inputClass}
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as "HOST" | "PARTICIPANT")
                }
              >
                <option value="PARTICIPANT">Participant</option>
                <option value="HOST">Host</option>
              </select>
            </label>
            {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
            <button
              type="button"
              onClick={() => void handleRegister()}
              disabled={isLoading}
              className="w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
            >
              {isLoading ? "Creating account..." : "Create account"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
};

export default AuthPage;
