import type { WaitingParticipant } from "@multilang-call/shared";

interface WaitingRoomProps {
  waitingParticipants: WaitingParticipant[];
  onAdmit: (socketId: string) => void;
  onDeny: (socketId: string) => void;
}

const WaitingRoom = ({
  waitingParticipants,
  onAdmit,
  onDeny
}: WaitingRoomProps) => (
  <section className="rounded-[36px] bg-white/90 p-5 shadow-panel">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-semibold text-ink">Waiting to join</h2>
      <span className="inline-flex rounded-full bg-sky px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
        {waitingParticipants.length}
      </span>
    </div>
    <ul className="mt-4 space-y-3">
      {waitingParticipants.map((participant) => (
        <li
          key={participant.socketId}
          className="rounded-[28px] bg-sky px-4 py-4 shadow-panel"
        >
          <p className="text-sm font-semibold text-ink">{participant.displayName}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
            Prefers {participant.preferredLanguage}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => onAdmit(participant.socketId)}
              className="rounded-2xl bg-accent px-5 py-4 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60"
            >
              Admit
            </button>
            <button
              type="button"
              onClick={() => onDeny(participant.socketId)}
              className="rounded-full bg-rose-500 px-5 py-3 text-sm font-semibold text-white"
            >
              Deny
            </button>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

export default WaitingRoom;
