import type { SupportedLanguageCode } from "@multilang-call/shared";
import LanguageSelector from "./LanguageSelector";

interface MeetingControlsProps {
  isMuted: boolean;
  isVideoEnabled: boolean;
  preferredLanguage: SupportedLanguageCode;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onLanguageChange: (value: SupportedLanguageCode) => void;
  onLeave: () => void;
}

const MeetingControls = ({
  isMuted,
  isVideoEnabled,
  preferredLanguage,
  onToggleMute,
  onToggleVideo,
  onLanguageChange,
  onLeave
}: MeetingControlsProps) => (
  <div className="flex flex-wrap items-end gap-3 rounded-[36px] bg-ink p-4 text-white shadow-panel">
    <button
      type="button"
      onClick={onToggleMute}
      className={
        isMuted
          ? "rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white"
          : "rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-white"
      }
    >
      {isMuted ? "Unmute microphone" : "Mute microphone"}
    </button>
    <button
      type="button"
      onClick={onToggleVideo}
      className={
        isVideoEnabled
          ? "rounded-full px-5 py-3 text-sm font-semibold bg-white/10 text-white"
          : "rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white"
      }
    >
      {isVideoEnabled ? "Turn video off" : "Turn video on"}
    </button>
    <div className="min-w-[220px] flex-1">
      <LanguageSelector
        label="Listening language"
        value={preferredLanguage}
        onChange={onLanguageChange}
        variant="dark"
      />
    </div>
    <button
      type="button"
      onClick={onLeave}
      className="rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white"
    >
      Leave meeting
    </button>
  </div>
);

export default MeetingControls;
