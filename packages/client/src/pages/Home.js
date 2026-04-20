import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_LANGUAGE } from "@multilang-call/shared";
import { useAuth } from "../hooks/useAuth";
import { apiUrl, createAuthHeaders } from "../lib/api";
import LanguageSelector from "../components/LanguageSelector";
const Home = () => {
    const navigate = useNavigate();
    const [defaultLanguage, setDefaultLanguage] = useState(DEFAULT_LANGUAGE);
    const [meetingIdInput, setMeetingIdInput] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { user, token, logout } = useAuth();
    const handleCreateMeeting = async () => {
        if (!token) {
            navigate("/auth", {
                state: {
                    redirectTo: "/",
                    redirectState: null
                }
            });
            return;
        }
        if (user?.role !== "HOST") {
            return;
        }
        setIsSubmitting(true);
        try {
            const response = await fetch(`${apiUrl}/meetings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...createAuthHeaders(token)
                },
                body: JSON.stringify({ defaultLanguage })
            });
            const data = (await response.json());
            navigate(`/meet/${data.meeting.id}`, {
                state: {
                    preferredLanguage: defaultLanguage
                }
            });
        }
        finally {
            setIsSubmitting(false);
        }
    };
    return (_jsxs("main", { className: "mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16", children: [_jsxs("section", { className: "grid gap-8 rounded-[40px] bg-white/90 p-8 shadow-panel lg:grid-cols-[1.2fr_0.8fr]", children: [_jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent", children: "AI multilingual meeting MVP" }), _jsx("h1", { className: "max-w-2xl text-4xl font-bold leading-tight text-ink md:text-5xl", children: "Create a live meeting room where everyone can listen in their own language." }), _jsx("p", { className: "max-w-xl text-base leading-7 text-slate-600", children: "This setup focuses on the translation pipeline, a clean video grid, and basic meeting creation without adding extra auth or billing complexity." })] }), _jsx("div", { className: "rounded-[32px] bg-sky p-6", children: _jsxs("div", { className: "space-y-4", children: [_jsx("div", { className: "rounded-[28px] bg-white px-4 py-4", children: _jsx("p", { className: "text-sm font-medium text-ink", children: user
                                            ? `Signed in as ${user.displayName} (${user.role.toLowerCase()})`
                                            : "Sign in to create or join meetings." }) }), _jsx(LanguageSelector, { label: "Default meeting language", value: defaultLanguage, onChange: setDefaultLanguage }), _jsx("button", { type: "button", onClick: handleCreateMeeting, disabled: isSubmitting, className: "w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60", children: isSubmitting
                                        ? "Creating meeting..."
                                        : !user
                                            ? "Sign in to continue"
                                            : user.role === "HOST"
                                                ? "Create meeting"
                                                : "Only hosts can create meetings" }), user ? (_jsx("button", { type: "button", onClick: logout, className: "w-full rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-ink", children: "Sign out" })) : null, _jsx("div", { className: "my-2 h-px bg-white/70" }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Join an existing meeting" }), _jsx("input", { value: meetingIdInput, onChange: (event) => setMeetingIdInput(event.target.value), placeholder: "Enter meeting ID", className: "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent" })] }), _jsx("button", { type: "button", onClick: () => {
                                        const meetingId = meetingIdInput.trim();
                                        if (meetingId) {
                                            navigate(`/join/${meetingId}`);
                                        }
                                    }, className: "w-full rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-ink", children: "Join meeting" })] }) })] }), _jsxs("nav", { className: "mt-6 flex justify-center gap-4", children: [_jsx("a", { href: "/schedule", className: "text-sm font-medium text-accent hover:underline", children: "Schedule a meeting" }), _jsx("span", { className: "text-slate-300", children: "|" }), _jsx("a", { href: "/auth", className: "text-sm font-medium text-accent hover:underline", children: "Sign in / Register" })] })] }));
};
export default Home;
