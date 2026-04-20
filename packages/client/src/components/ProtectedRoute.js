import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
const ProtectedRoute = ({ children }) => {
    const token = useAuthStore((state) => state.token);
    const user = useAuthStore((state) => state.user);
    const isLoading = useAuthStore((state) => state.isLoading);
    if (!token) {
        return _jsx(Navigate, { to: "/auth", replace: true });
    }
    if (!user || isLoading) {
        return (_jsx("main", { className: "mx-auto flex min-h-screen max-w-md items-center px-6 py-12", children: _jsxs("section", { className: "w-full rounded-[36px] bg-white/90 p-8 text-center shadow-panel", children: [_jsx("p", { className: "inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent", children: "Restoring session" }), _jsx("h1", { className: "mt-4 text-2xl font-bold text-ink", children: "Checking your account" })] }) }));
    }
    return _jsx(_Fragment, { children: children });
};
export default ProtectedRoute;
