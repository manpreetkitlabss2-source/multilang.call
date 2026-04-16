import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { DEFAULT_LANGUAGE, type SupportedLanguageCode } from "@multilang-call/shared";
import LanguageSelector from "../components/LanguageSelector";

const Join = () => {
  const { meetingId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [displayName, setDisplayName] = useState(
    (location.state as { displayName?: string } | null)?.displayName ?? "Guest"
  );
  const [preferredLanguage, setPreferredLanguage] =
    useState<SupportedLanguageCode>(DEFAULT_LANGUAGE);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <section className="w-full rounded-[36px] bg-white/90 p-8 shadow-panel">
        <h1 className="text-3xl font-bold text-ink">Join meeting {meetingId}</h1>
        <p className="mt-3 text-sm text-slate-600">
          Pick the listening language you want for translated playback before entering.
        </p>
        <div className="mt-8 space-y-4">
          <label className="flex flex-col gap-2 text-sm font-medium text-ink">
            <span>Display name</span>
            <input
              className="rounded-2xl border border-teal-200 bg-white px-4 py-3 outline-none focus:border-accent"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <LanguageSelector value={preferredLanguage} onChange={setPreferredLanguage} />
          <button
            type="button"
            onClick={() =>
              navigate(`/meet/${meetingId}`, {
                state: { displayName, preferredLanguage }
              })
            }
            className="w-full rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white"
          >
            Enter meeting
          </button>
        </div>
      </section>
    </main>
  );
};

export default Join;
