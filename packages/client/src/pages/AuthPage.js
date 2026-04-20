import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
const inputClass = "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent";
const AuthPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const redirectTo = location.state?.redirectTo ?? "/";
    const redirectState = location.state?.redirectState ?? null;
    const [tab, setTab] = useState("signin");
    const [signInEmail, setSignInEmail] = useState("");
    const [signInPassword, setSignInPassword] = useState("");
    const [email, setEmail] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("PARTICIPANT");
    const { login, register, isLoading, error } = useAuth();
    const pageTitle = useMemo(() => (tab === "signin" ? "Sign in to continue" : "Create your account"), [tab]);
    const handleSignIn = async () => {
        try {
            await login(signInEmail, signInPassword);
            navigate(redirectTo, { state: redirectState });
        }
        catch {
            // error already set in store
        }
    };
    const handleRegister = async () => {
        try {
            await register(email, displayName, password, role);
            navigate(redirectTo, { state: redirectState });
        }
        catch {
            // error already set in store
        }
    };
    return (_jsx("main", { className: "mx-auto flex min-h-screen max-w-md items-center px-6 py-12", children: _jsxs("section", { className: "w-full rounded-[36px] bg-white/90 p-8 shadow-panel", children: [_jsx("div", { className: "rounded-full bg-sky p-1", children: _jsxs("div", { className: "grid grid-cols-2 gap-1", children: [_jsx("button", { type: "button", onClick: () => setTab("signin"), className: tab === "signin"
                                    ? "rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
                                    : "px-5 py-2 text-sm font-medium text-slate-600", children: "Sign in" }), _jsx("button", { type: "button", onClick: () => setTab("register"), className: tab === "register"
                                    ? "rounded-full bg-accent px-5 py-2 text-sm font-semibold text-white"
                                    : "px-5 py-2 text-sm font-medium text-slate-600", children: "Create account" })] }) }), _jsx("h1", { className: "mt-6 text-3xl font-bold text-ink", children: pageTitle }), _jsx("p", { className: "mt-3 text-sm text-slate-600", children: "Hosts can schedule and start rooms, while participants can sign in and join via shared links." }), tab === "signin" ? (_jsxs("div", { className: "mt-8 space-y-4", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Email" }), _jsx("input", { type: "email", className: inputClass, value: signInEmail, onChange: (event) => setSignInEmail(event.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Password" }), _jsx("input", { type: "password", className: inputClass, value: signInPassword, onChange: (event) => setSignInPassword(event.target.value) })] }), error ? _jsx("p", { className: "mt-2 text-sm text-rose-600", children: error }) : null, _jsx("button", { type: "button", onClick: () => void handleSignIn(), disabled: isLoading, className: "w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60", children: isLoading ? "Signing in..." : "Sign in" })] })) : (_jsxs("div", { className: "mt-8 space-y-4", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Email" }), _jsx("input", { type: "email", className: inputClass, value: email, onChange: (event) => setEmail(event.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Display name" }), _jsx("input", { className: inputClass, value: displayName, onChange: (event) => setDisplayName(event.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Password" }), _jsx("input", { type: "password", className: inputClass, value: password, onChange: (event) => setPassword(event.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Role" }), _jsxs("select", { className: inputClass, value: role, onChange: (event) => setRole(event.target.value), children: [_jsx("option", { value: "PARTICIPANT", children: "Participant" }), _jsx("option", { value: "HOST", children: "Host" })] })] }), error ? _jsx("p", { className: "mt-2 text-sm text-rose-600", children: error }) : null, _jsx("button", { type: "button", onClick: () => void handleRegister(), disabled: isLoading, className: "w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60", children: isLoading ? "Creating account..." : "Create account" })] }))] }) }));
};
export default AuthPage;
