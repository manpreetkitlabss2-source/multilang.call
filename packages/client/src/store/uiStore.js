import { create } from "zustand";
export const useUIStore = create((set, get) => ({
    layoutMode: "grid",
    audioBufferQueue: [],
    setLayoutMode: (layoutMode) => set({ layoutMode }),
    enqueueAudio: (item) => set((state) => ({
        audioBufferQueue: [...state.audioBufferQueue, item]
    })),
    dequeueAudio: () => {
        const [next, ...rest] = get().audioBufferQueue;
        set({ audioBufferQueue: rest });
        return next;
    }
}));
