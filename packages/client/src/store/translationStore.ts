import { create } from "zustand";

interface TranslationStoreState {
  status: "idle" | "capturing" | "translating" | "ready";
  activeTranscript: string;
  subtitle: string | null;
  setStatus: (status: TranslationStoreState["status"]) => void;
  setTranscript: (transcript: string) => void;
  setSubtitle: (subtitle: string | null) => void;
  reset: () => void;
}

export const useTranslationStore = create<TranslationStoreState>((set) => ({
  status: "idle",
  activeTranscript: "",
  subtitle: null,
  setStatus: (status) => set({ status }),
  setTranscript: (activeTranscript) => set({ activeTranscript }),
  setSubtitle: (subtitle) => set({ subtitle }),
  reset: () =>
    set({
      status: "idle",
      activeTranscript: "",
      subtitle: null
    })
}));
