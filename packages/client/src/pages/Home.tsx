import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DEFAULT_LANGUAGE, type CreateMeetingResponse, type SupportedLanguageCode } from "@multilang-call/shared";
import LanguageSelector from "../components/LanguageSelector";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const Home = () => {
  const navigate = useNavigate();
  const [hostId, setHostId] = useState("host-demo");
  const [defaultLanguage, setDefaultLanguage] =
    useState<SupportedLanguageCode>(DEFAULT_LANGUAGE);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateMeeting = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/meetings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ hostId, defaultLanguage })
      });
      const data = (await response.json()) as CreateMeetingResponse;
      navigate(`/meet/${data.meeting.id}`, {
        state: {
          hostId,
          preferredLanguage: defaultLanguage,
          displayName: "Host"
        }
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <section className="grid gap-8 rounded-[40px] bg-white/90 p-8 shadow-panel lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <p className="inline-flex rounded-full bg-teal-100 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-accent">
            AI multilingual meeting MVP
          </p>
          <h1 className="max-w-2xl text-4xl font-bold leading-tight text-ink md:text-5xl">
            Create a live meeting room where everyone can listen in their own language.
          </h1>
          <p className="max-w-xl text-base leading-7 text-slate-600">
            This setup focuses on the translation pipeline, a clean video grid, and basic
            meeting creation without adding extra auth or billing complexity.
          </p>
        </div>
        <div className="rounded-[32px] bg-sky p-6">
          <div className="space-y-4">
            <label className="flex flex-col gap-2 text-sm font-medium text-ink">
              <span>Host identifier</span>
              <input
                className="rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent"
                value={hostId}
                onChange={(event) => setHostId(event.target.value)}
              />
            </label>
            <LanguageSelector
              label="Default meeting language"
              value={defaultLanguage}
              onChange={setDefaultLanguage}
            />
            <button
              type="button"
              onClick={handleCreateMeeting}
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating meeting..." : "Create meeting"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home;
