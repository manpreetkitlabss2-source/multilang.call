import { jsx as _jsx } from "react/jsx-runtime";
import VideoTile from "./VideoTile";
const VideoGrid = ({ participants, localStream, remoteStreams, localPreferredLanguage, isLocalVideoEnabled }) => {
    const gridClass = participants.length <= 1
        ? "grid-cols-1"
        : participants.length <= 4
            ? "md:grid-cols-2"
            : "xl:grid-cols-3";
    return (_jsx("section", { className: `grid gap-5 ${gridClass}`, children: participants.map((participant) => {
            const isLocal = participant.socketId === "local";
            const stream = isLocal ? localStream : remoteStreams[participant.socketId] ?? null;
            return (_jsx(VideoTile, { participant: participant, stream: stream, isMuted: isLocal || participant.preferredLanguage !== localPreferredLanguage, isMirrored: isLocal, isVideoEnabled: isLocal ? isLocalVideoEnabled : true }, participant.socketId));
        }) }));
};
export default VideoGrid;
