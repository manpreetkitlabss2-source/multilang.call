import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Navigate, useNavigate } from "react-router-dom";
import type { ScheduledMeetingRecord } from "@multilang-call/shared";
import { apiUrl, createAuthHeaders } from "../lib/api";
import { useAuthStore } from "../store/authStore";

const inputClass =
  "rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent";

const timezones = ["UTC", "Asia/Kolkata", "America/New_York", "America/Los_Angeles", "Europe/Berlin"];

const formatForInput = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
};

const SchedulePage = () => {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [title, setTitle] = useState("Team sync");
  const [scheduledAt, setScheduledAt] = useState(formatForInput(new Date(Date.now() + 3600_000)));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [timezone, setTimezone] = useState("UTC");
  const [scheduledMeetings, setScheduledMeetings] = useState<ScheduledMeetingRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      .then((data: { scheduledMeetings?: ScheduledMeetingRecord[]; error?: string }) => {
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
    return <Navigate to="/" replace />;
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
    const data = (await response.json()) as {
      scheduledMeeting?: ScheduledMeetingRecord;
      error?: string;
    };

    if (!response.ok || !data.scheduledMeeting) {
      setError(data.error ?? "Unable to schedule meeting");
      return;
    }

    setScheduledMeetings((current) =>
      [...current, data.scheduledMeeting as ScheduledMeetingRecord].sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
      )
    );
  };

  const handleStartNow = async (id: string) => {
    if (!token) {
      return;
    }

    const response = await fetch(`${apiUrl}/scheduled-meetings/${id}/start`, {
      method: "POST",
      headers: {
        ...createAuthHeaders(token)
      }
    });
    const data = (await response.json()) as { meetingId?: string; error?: string };
    if (!response.ok || !data.meetingId) {
      setError(data.error ?? "Unable to start meeting");
      return;
    }

    navigate(`/meet/${data.meetingId}`);
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[40px] bg-white/90 p-8 shadow-panel">
          <p className="inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            Plan ahead
          </p>
          <h1 className="mt-4 text-3xl font-bold text-ink">Schedule a meeting</h1>
          <div className="mt-8 space-y-4">
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Meeting title</span>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Scheduled time</span>
              <input
                type="datetime-local"
                className={inputClass}
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Duration in minutes</span>
              <input
                type="number"
                min="15"
                step="15"
                className={inputClass}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Timezone</span>
              <select
                className={inputClass}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                {timezones.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
            <button
              type="button"
              onClick={() => void handleSchedule()}
              className="w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
            >
              Schedule meeting
            </button>
          </div>
        </section>

        <section className="space-y-4">
          {scheduledMeetings.map((meeting) => {
            const scheduledTime = new Date(meeting.scheduledAt);
            const canStart =
              !meeting.meetingId &&
              scheduledTime.getTime() - now <= 15 * 60 * 1000;
            const shareLink = `${window.location.origin}/s/${meeting.shareToken}`;

            return (
              <article key={meeting.id} className="rounded-[28px] bg-sky p-5">
                <h2 className="text-lg font-semibold text-ink">{meeting.title}</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {format(scheduledTime, "PPP p")} · {meeting.durationMinutes} min
                </p>
                <p className="mt-3 break-all text-xs font-medium text-accent">{shareLink}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(shareLink)}
                    className="rounded-full border border-teal-200 bg-white px-4 py-2 text-xs font-semibold text-accent"
                  >
                    Copy share link
                  </button>
                  {meeting.meetingId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/meet/${meeting.meetingId}`)}
                      className="rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
                    >
                      Open meeting room
                    </button>
                  ) : canStart ? (
                    <button
                      type="button"
                      onClick={() => void handleStartNow(meeting.id)}
                      className="rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
                    >
                      Start now
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
};

export default SchedulePage;
