import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Navigate, useNavigate } from "react-router-dom";
import { apiUrl, createAuthHeaders } from "../lib/api";
import { useAuthStore } from "../store/authStore";
const inputClass = "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent";
const timezones = ["UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/Berlin"];
const formatForInput = (date) => {
    const pad = (value) => value.toString().padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const SchedulePage = () => {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const token = useAuthStore((state) => state.token);
    const [title, setTitle] = useState("Team sync");
    const [scheduledAt, setScheduledAt] = useState(formatForInput(new Date(Date.now() + 3600_000)));
    const [durationMinutes, setDurationMinutes] = useState(60);
    const [timezone, setTimezone] = useState("UTC");
    const [scheduledMeetings, setScheduledMeetings] = useState([]);
    const [error, setError] = useState(null);
    useEffect(() => {
        if (!token) {
            return;
        }
        fetch(`${apiUrl}/scheduled-meetings`, {
            headers: {
                ...createAuthHeaders(token)
            }
        })
            .then((response) => response.json())
            .then((data) => {
            if (data.scheduledMeetings) {
                setScheduledMeetings(data.scheduledMeetings);
                return;
            }
            setError(data.error ?? "Unable to load scheduled meetings");
        })
            .catch(() => {
            setError("Unable to load scheduled meetings");
        });
    }, [token]);
    const now = useMemo(() => Date.now(), [scheduledMeetings]);
    if (user?.role !== "HOST") {
        return _jsx(Navigate, { to: "/", replace: true });
    }
    const handleSchedule = async () => {
        if (!token) {
            return;
        }
        setError(null);
        const response = await fetch(`${apiUrl}/scheduled-meetings`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...createAuthHeaders(token)
            },
            body: JSON.stringify({
                title,
                scheduledAt: new Date(scheduledAt).toISOString(),
                durationMinutes,
                timezone
            })
        });
        const data = (await response.json());
        if (!response.ok || !data.scheduledMeeting) {
            setError(data.error ?? "Unable to schedule meeting");
            return;
        }
        setScheduledMeetings((current) => [...current, data.scheduledMeeting].sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()));
    };
    const handleStartNow = async (id) => {
        if (!token) {
            return;
        }
        const response = await fetch(`${apiUrl}/scheduled-meetings/${id}/start`, {
            method: "POST",
            headers: {
                ...createAuthHeaders(token)
            }
        });
        const data = (await response.json());
        if (!response.ok || !data.meetingId) {
            setError(data.error ?? "Unable to start meeting");
            return;
        }
        navigate(`/meet/${data.meetingId}`);
    };
    return (_jsx("main", { className: "mx-auto max-w-5xl px-6 py-16", children: _jsxs("div", { className: "grid gap-8 lg:grid-cols-[0.95fr_1.05fr]", children: [_jsxs("section", { className: "rounded-[40px] bg-white/90 p-8 shadow-panel", children: [_jsx("p", { className: "inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent", children: "Plan ahead" }), _jsx("h1", { className: "mt-4 text-3xl font-bold text-ink", children: "Schedule a meeting" }), _jsxs("div", { className: "mt-8 space-y-4", children: [_jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Meeting title" }), _jsx("input", { className: inputClass, value: title, onChange: (e) => setTitle(e.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Scheduled time" }), _jsx("input", { type: "datetime-local", className: inputClass, value: scheduledAt, onChange: (e) => setScheduledAt(e.target.value) })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Duration in minutes" }), _jsx("input", { type: "number", min: "15", step: "15", className: inputClass, value: durationMinutes, onChange: (e) => setDurationMinutes(Number(e.target.value)) })] }), _jsxs("label", { className: "flex flex-col gap-2 text-sm font-medium text-ink", children: [_jsx("span", { children: "Timezone" }), _jsx("select", { className: inputClass, value: timezone, onChange: (e) => setTimezone(e.target.value), children: timezones.map((entry) => (_jsx("option", { value: entry, children: entry }, entry))) })] }), error ? _jsx("p", { className: "mt-2 text-sm text-rose-600", children: error }) : null, _jsx("button", { type: "button", onClick: () => void handleSchedule(), className: "w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60", children: "Schedule meeting" })] })] }), _jsx("section", { className: "space-y-4", children: scheduledMeetings.map((meeting) => {
                        const scheduledTime = new Date(meeting.scheduledAt);
                        const canStart = !meeting.meetingId &&
                            scheduledTime.getTime() - now <= 15 * 60 * 1000;
                        const shareLink = `${window.location.origin}/s/${meeting.shareToken}`;
                        return (_jsxs("article", { className: "rounded-[28px] bg-sky p-5", children: [_jsx("h2", { className: "text-lg font-semibold text-ink", children: meeting.title }), _jsxs("p", { className: "mt-2 text-sm text-slate-600", children: [format(scheduledTime, "PPP p"), " \u00B7 ", meeting.durationMinutes, " min"] }), _jsx("p", { className: "mt-3 break-all text-xs font-medium text-accent", children: shareLink }), _jsxs("div", { className: "mt-4 flex flex-wrap gap-3", children: [_jsx("button", { type: "button", onClick: () => void navigator.clipboard.writeText(shareLink), className: "rounded-full border border-teal-200 bg-white px-4 py-2 text-xs font-semibold text-accent", children: "Copy share link" }), meeting.meetingId ? (_jsx("button", { type: "button", onClick: () => navigate(`/meet/${meeting.meetingId}`), className: "rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60", children: "Open meeting room" })) : canStart ? (_jsx("button", { type: "button", onClick: () => void handleStartNow(meeting.id), className: "rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60", children: "Start now" })) : null] })] }, meeting.id));
                    }) })] }) }));
};
export default SchedulePage;
