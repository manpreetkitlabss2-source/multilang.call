import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DEFAULT_LANGUAGE } from "@multilang-call/shared";
import { apiUrl } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import LanguageSelector from "../components/LanguageSelector";
const Join = () => {
    const { meetingId = "" } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const authToken = useAuthStore((state) => state.token);
    const [displayName, setDisplayName] = useState(location.state?.displayName ?? "Guest");
    const [preferredLanguage, setPreferredLanguage] = useState(DEFAULT_LANGUAGE);
    const [isLoadingInvite, setIsLoadingInvite] = useState(false);
    const [inviteError, setInviteError] = useState(null);
    const inviteToken = searchParams.get("invite");
    useEffect(() => {
        if (!inviteToken) {
            return;
        }
        setIsLoadingInvite(true);
        fetch(`${apiUrl}/invite/${inviteToken}`)
            .then(async (response) => {
            const data = (await response.json());
            if (!response.ok || !data.valid) {
                throw new Error(data.reason ?? "Invite is invalid or expired");
            }
            if (data.meetingDefaultLanguage) {
                setPreferredLanguage(data.meetingDefaultLanguage);
            }
        })
            .catch((caughtError) => {
            setInviteError(caughtError instanceof Error
                ? caughtError.message
                : "Invite is invalid or expired");
        })
            .finally(() => {
            setIsLoadingInvite(false);
        });
    }, [inviteToken]);
    if (inviteError) {
        return (_jsx("main", { className: "mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12", children: _jsxs("section", { className: "w-full rounded-[36px] bg-white/90 p-8 shadow-panel", children: [_jsx("h1", { className: "text-3xl font-bold text-ink", children: "Invite unavailable" }), _jsx("p", { className: "mt-3 text-sm text-rose-600", children: inviteError }), _jsx("button", { type: "button", onClick: () => navigate("/"), className: "mt-6 rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60", children: "Back to home" })] }) }));
    }
    return (_jsx("main", { className: "mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12", children: _jsxs("section", { className: "w-full rounded-[36px] bg-white/90 p-8 shadow-panel", children: [_jsxs("h1", { className: "text-3xl font-bold text-ink", children: ["Join meeting ", meetingId] }), _jsx("p", { className: "mt-3 text-sm text-slate-600", children: "Pick the listening language you want for translated playback before entering." }), _jsxs("div", { className: "mt-8 space-y-4", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Display name" }), _jsx("input", { className: "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent", value: displayName, onChange: (event) => setDisplayName(event.target.value) })] }), _jsx(LanguageSelector, { value: preferredLanguage, onChange: setPreferredLanguage }), _jsx("button", { type: "button", disabled: isLoadingInvite, onClick: () => {
                                const redirectState = {
                                    displayName,
                                    preferredLanguage,
                                    inviteToken,
                                    fromJoin: true
                                };
                                if (!authToken) {
                                    navigate("/auth", {
                                        state: {
                                            redirectTo: `/meet/${meetingId}`,
                                            redirectState
                                        }
                                    });
                                    return;
                                }
                                navigate(`/meet/${meetingId}`, {
                                    state: redirectState
                                });
                            }, className: "w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white", children: isLoadingInvite ? "Checking invite..." : "Enter meeting" })] })] }) }));
};
export default Join;
