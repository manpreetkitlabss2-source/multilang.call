import { create } from "zustand";

interface TranslationStoreState {
  status: "idle" | "capturing" | "translating" | "ready";
  activeTranscript: string;
  setStatus: (status: TranslationStoreState["status"]) => void;
  setTranscript: (transcript: string) => void;
}

export const useTranslationStore = create<TranslationStoreState>((set) => ({
  status: "idle",
  activeTranscript: "",
  setStatus: (status) => set({ status }),
  setTranscript: (activeTranscript) => set({ activeTranscript })
}));
