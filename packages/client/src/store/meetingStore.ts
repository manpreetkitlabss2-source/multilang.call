import { create } from "zustand";
import type { Participant, WaitingParticipant } from "@multilang-call/shared";

interface MeetingStoreState {
  meetingId: string;
  participants: Participant[];
  waitingParticipants: WaitingParticipant[];
  waitingForAdmission: boolean;
  joinDeniedMessage: string | null;
  isMuted: boolean;
  setMeetingId: (meetingId: string) => void;
  setParticipants: (participants: Participant[]) => void;
  setWaitingParticipants: (waitingParticipants: WaitingParticipant[]) => void;
  setWaitingForAdmission: (waitingForAdmission: boolean) => void;
  setJoinDeniedMessage: (joinDeniedMessage: string | null) => void;
  setMuted: (isMuted: boolean) => void;
}

export const useMeetingStore = create<MeetingStoreState>((set) => ({
  meetingId: "",
  participants: [],
  waitingParticipants: [],
  waitingForAdmission: false,
  joinDeniedMessage: null,
  isMuted: false,
  setMeetingId: (meetingId) => set({ meetingId }),
  setParticipants: (participants) => set({ participants }),
  setWaitingParticipants: (waitingParticipants) => set({ waitingParticipants }),
  setWaitingForAdmission: (waitingForAdmission) => set({ waitingForAdmission }),
  setJoinDeniedMessage: (joinDeniedMessage) => set({ joinDeniedMessage }),
  setMuted: (isMuted) => set({ isMuted })
}));
