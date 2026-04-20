import { create } from "zustand";
import type { Participant, ParticipantRole, WaitingParticipant } from "@multilang-call/shared";

interface MeetingStoreState {
  meetingId: string;
  participants: Participant[];
  waitingParticipants: WaitingParticipant[];
  waitingForAdmission: boolean;
  admittedToMeeting: boolean;
  joinDeniedMessage: string | null;
  joinError: string | null;
  joinErrorCode: string | null;
  userRole: ParticipantRole | null;
  isMuted: boolean;
  isVideoEnabled: boolean;
  setMeetingId: (meetingId: string) => void;
  setParticipants: (participants: Participant[]) => void;
  setWaitingParticipants: (waitingParticipants: WaitingParticipant[]) => void;
  setWaitingForAdmission: (waitingForAdmission: boolean) => void;
  setAdmittedToMeeting: (admitted: boolean) => void;
  setJoinDeniedMessage: (joinDeniedMessage: string | null) => void;
  setJoinError: (error: string | null, code?: string) => void;
  setUserRole: (role: ParticipantRole | null) => void;
  setMuted: (isMuted: boolean) => void;
  setVideoEnabled: (isVideoEnabled: boolean) => void;
  reset: () => void;
}

export const useMeetingStore = create<MeetingStoreState>((set) => ({
  meetingId: "",
  participants: [],
  waitingParticipants: [],
  waitingForAdmission: false,
  admittedToMeeting: false,
  joinDeniedMessage: null,
  joinError: null,
  joinErrorCode: null,
  userRole: null,
  isMuted: false,
  isVideoEnabled: true,
  setMeetingId: (meetingId) => set({ meetingId }),
  setParticipants: (participants) => set({ participants }),
  setWaitingParticipants: (waitingParticipants) => set({ waitingParticipants }),
  setWaitingForAdmission: (waitingForAdmission) => set({ waitingForAdmission }),
  setAdmittedToMeeting: (admittedToMeeting) => set({ admittedToMeeting }),
  setJoinDeniedMessage: (joinDeniedMessage) => set({ joinDeniedMessage }),
  setJoinError: (error, code) => set({ joinError: error, joinErrorCode: code ?? null }),
  setUserRole: (userRole) => set({ userRole }),
  setMuted: (isMuted) => set({ isMuted }),
  setVideoEnabled: (isVideoEnabled) => set({ isVideoEnabled }),
  reset: () =>
    set({
      meetingId: "",
      participants: [],
      waitingParticipants: [],
      waitingForAdmission: false,
      admittedToMeeting: false,
      joinDeniedMessage: null,
      joinError: null,
      joinErrorCode: null,
      userRole: null,
      isMuted: false,
      isVideoEnabled: true
    })
}));
