import { useEffect, useRef } from "react";
import type { Participant } from "@multilang-call/shared";

interface VideoTileProps {
  participant: Participant;
  stream: MediaStream | null;
  isMuted: boolean;
  isMirrored?: boolean;
  isVideoEnabled?: boolean;
}

const VideoTile = ({
  participant,
  stream,
  isMuted,
  isMirrored = false,
  isVideoEnabled = true
}: VideoTileProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = stream;
    videoRef.current.muted = isMuted;
    videoRef.current.volume = isMuted ? 0 : 0.9;
  }, [isMuted, stream]);

  return (
    <article
      className={`relative overflow-hidden rounded-[40px] bg-ink text-white shadow-panel transition ${
        participant.isSpeaking ? "ring-4 ring-accent/40" : "ring-1 ring-white/10"
      }`}
    >
      {stream && isVideoEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`h-72 w-full bg-slate-950 object-cover ${
            isMirrored ? "scale-x-[-1]" : ""
          }`}
        />
      ) : (
        <div className="flex h-72 items-center justify-center bg-ink">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/15 text-3xl font-semibold text-white">
            {participant.displayName.slice(0, 1).toUpperCase()}
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-4">
        <div>
          <p className="text-sm font-semibold">{participant.displayName}</p>
          <p className="text-xs uppercase tracking-[0.18em] text-sky">
            Listening in {participant.preferredLanguage}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {participant.isMuted ? (
            <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white">
              Muted
            </span>
          ) : null}
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] ${
              participant.isSpeaking ? "bg-accent text-white" : "bg-white/10 text-white"
            }`}
          >
            {participant.isSpeaking ? "Speaking" : "Idle"}
          </span>
        </div>
      </div>
    </article>
  );
};

export default VideoTile;
