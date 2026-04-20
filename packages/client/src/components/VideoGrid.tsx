import type { Participant, SupportedLanguageCode } from "@multilang-call/shared";
import VideoTile from "./VideoTile";

interface VideoGridProps {
  participants: Participant[];
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  localPreferredLanguage: SupportedLanguageCode;
  isLocalVideoEnabled: boolean;
}

const VideoGrid = ({
  participants,
  localStream,
  remoteStreams,
  localPreferredLanguage,
  isLocalVideoEnabled
}: VideoGridProps) => {
  const gridClass =
    participants.length <= 1
      ? "grid-cols-1"
      : participants.length <= 4
        ? "md:grid-cols-2"
        : "xl:grid-cols-3";

  return (
    <section className={`grid gap-5 ${gridClass}`}>
      {participants.map((participant) => {
        const isLocal = participant.socketId === "local";
        const stream = isLocal ? localStream : remoteStreams[participant.socketId] ?? null;

        return (
          <VideoTile
            key={participant.socketId}
            participant={participant}
            stream={stream}
            isMuted={isLocal || participant.preferredLanguage !== localPreferredLanguage}
            isMirrored={isLocal}
            isVideoEnabled={isLocal ? isLocalVideoEnabled : true}
          />
        );
      })}
    </section>
  );
};

export default VideoGrid;
