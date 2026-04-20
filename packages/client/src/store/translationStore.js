import { create } from "zustand";
export const useTranslationStore = create((set) => ({
    status: "idle",
    activeTranscript: "",
    subtitle: null,
    setStatus: (status) => set({ status }),
    setTranscript: (activeTranscript) => set({ activeTranscript }),
    setSubtitle: (subtitle) => set({ subtitle }),
    reset: () => set({
        status: "idle",
        activeTranscript: "",
        subtitle: null
    })
}));
