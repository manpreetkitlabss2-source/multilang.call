import { useEffect, useRef } from "react";
import type { Participant } from "@multilang-call/shared";
import SpeakingIndicator from "./SpeakingIndicator";

interface VideoGridProps {
  participants: Participant[];
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
}

const VideoCard = ({
  participant,
  stream,
  muted
}: {
  participant: Participant;
  stream: MediaStream | null;
  muted: boolean;
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current || !stream) {
      return;
    }

    videoRef.current.srcObject = stream;
    videoRef.current.volume = muted ? 0 : 0.2;
  }, [muted, stream]);

  return (
    <article className="relative overflow-hidden rounded-[28px] bg-ink text-white shadow-panel">
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-64 w-full bg-slate-900 object-cover"
        />
      ) : (
        <div className="flex h-64 items-center justify-center bg-slate-900">
          <span className="rounded-full bg-white/10 px-5 py-4 text-2xl font-semibold">
            {participant.displayName.slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-4">
        <div>
          <p className="text-sm font-semibold">{participant.displayName}</p>
          <p className="text-xs uppercase tracking-[0.18em] text-teal-200">
            Listening in {participant.preferredLanguage}
          </p>
        </div>
        <SpeakingIndicator isSpeaking={participant.isSpeaking} />
      </div>
    </article>
  );
};

const VideoGrid = ({ participants, localStream, remoteStreams }: VideoGridProps) => (
  <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
    {participants.map((participant) => (
      <VideoCard
        key={participant.socketId}
        participant={participant}
        stream={participant.socketId === "local" ? localStream : remoteStreams[participant.socketId] ?? null}
        muted={participant.socketId === "local"}
      />
    ))}
  </section>
);

export default VideoGrid;
