import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceStrict } from "date-fns";
import { useNavigate, useParams } from "react-router-dom";
import { apiUrl } from "../lib/api";
const ScheduleLanding = () => {
    const navigate = useNavigate();
    const { shareToken = "" } = useParams();
    const [scheduledMeeting, setScheduledMeeting] = useState(null);
    const [hostDisplayName, setHostDisplayName] = useState("");
    const [countdownMs, setCountdownMs] = useState(0);
    const [error, setError] = useState(null);
    useEffect(() => {
        fetch(`${apiUrl}/s/${shareToken}`)
            .then(async (response) => {
            const data = (await response.json());
            if (!response.ok || !data.scheduledMeeting) {
                throw new Error(data.error ?? "Meeting not found");
            }
            setScheduledMeeting(data.scheduledMeeting);
            setHostDisplayName(data.hostDisplayName ?? "");
            setCountdownMs(data.countdownMs ?? 0);
        })
            .catch((caughtError) => {
            setError(caughtError instanceof Error ? caughtError.message : "Meeting not found");
        });
    }, [shareToken]);
    useEffect(() => {
        if (!scheduledMeeting) {
            return;
        }
        const interval = window.setInterval(() => {
            setCountdownMs(Math.max(new Date(scheduledMeeting.scheduledAt).getTime() - Date.now(), 0));
        }, 1000);
        return () => window.clearInterval(interval);
    }, [scheduledMeeting]);
    const countdownLabel = useMemo(() => {
        if (!scheduledMeeting) {
            return "";
        }
        if (countdownMs === 0) {
            return "Starting time has arrived";
        }
        return formatDistanceStrict(Date.now(), Date.now() + countdownMs);
    }, [countdownMs, scheduledMeeting]);
    if (error) {
        return (_jsx("main", { className: "mx-auto flex min-h-screen max-w-md items-center px-6 py-12", children: _jsxs("section", { className: "w-full rounded-[36px] bg-white/90 p-8 text-center shadow-panel", children: [_jsx("h1", { className: "text-2xl font-bold text-ink", children: "Invite unavailable" }), _jsx("p", { className: "mt-3 text-sm text-rose-600", children: error })] }) }));
    }
    if (!scheduledMeeting) {
        return (_jsx("main", { className: "mx-auto flex min-h-screen max-w-md items-center px-6 py-12", children: _jsx("section", { className: "w-full rounded-[36px] bg-white/90 p-8 text-center shadow-panel", children: _jsx("h1", { className: "text-2xl font-bold text-ink", children: "Loading meeting" }) }) }));
    }
    const localTime = new Intl.DateTimeFormat(undefined, {
        dateStyle: "full",
        timeStyle: "short"
    }).format(new Date(scheduledMeeting.scheduledAt));
    return (_jsx("main", { className: "mx-auto flex min-h-screen max-w-md items-center px-6 py-12", children: _jsxs("section", { className: "mx-auto max-w-md rounded-[36px] bg-white/90 p-8 text-center shadow-panel", children: [_jsx("p", { className: "inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent", children: "Scheduled meeting" }), _jsx("h1", { className: "mt-4 text-3xl font-bold text-ink", children: scheduledMeeting.title }), _jsxs("p", { className: "mt-3 text-sm text-slate-600", children: ["Hosted by ", hostDisplayName] }), _jsx("p", { className: "mt-2 text-sm text-slate-600", children: localTime }), _jsx("p", { className: "mt-6 text-lg font-semibold text-accent", children: countdownLabel }), scheduledMeeting.meetingId ? (_jsx("button", { type: "button", onClick: () => navigate(`/join/${scheduledMeeting.meetingId}`), className: "mt-8 w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60", children: "Join meeting" })) : (_jsxs("p", { className: "mt-8 text-sm text-slate-600", children: ["Meeting hasn't started yet. Come back at ", localTime, "."] }))] }) }));
};
export default ScheduleLanding;
