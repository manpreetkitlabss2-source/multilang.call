import { create } from "zustand";
import type { Participant } from "@multilang-call/shared";

interface MeetingStoreState {
  meetingId: string;
  participants: Participant[];
  isMuted: boolean;
  setMeetingId: (meetingId: string) => void;
  setParticipants: (participants: Participant[]) => void;
  setMuted: (isMuted: boolean) => void;
}

export const useMeetingStore = create<MeetingStoreState>((set) => ({
  meetingId: "",
  participants: [],
  isMuted: false,
  setMeetingId: (meetingId) => set({ meetingId }),
  setParticipants: (participants) => set({ participants }),
  setMuted: (isMuted) => set({ isMuted })
}));
