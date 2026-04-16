interface MeetingControlsProps {
  isMuted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
}

const MeetingControls = ({
  isMuted,
  onToggleMute,
  onLeave
}: MeetingControlsProps) => (
  <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-ink p-4 text-white shadow-panel">
    <button
      type="button"
      onClick={onToggleMute}
      className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
        isMuted ? "bg-amber-400 text-ink" : "bg-white/10"
      }`}
    >
      {isMuted ? "Unmute microphone" : "Mute microphone"}
    </button>
    <button
      type="button"
      onClick={onLeave}
      className="rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold"
    >
      Leave meeting
    </button>
  </div>
);

export default MeetingControls;
