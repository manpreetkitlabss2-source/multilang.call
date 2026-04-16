import { create } from "zustand";
import type { TranslationQueueItem } from "@multilang-call/shared";

interface UIStoreState {
  layoutMode: "grid" | "focus";
  audioBufferQueue: TranslationQueueItem[];
  setLayoutMode: (layoutMode: UIStoreState["layoutMode"]) => void;
  enqueueAudio: (item: TranslationQueueItem) => void;
  dequeueAudio: () => TranslationQueueItem | undefined;
}

export const useUIStore = create<UIStoreState>((set, get) => ({
  layoutMode: "grid",
  audioBufferQueue: [],
  setLayoutMode: (layoutMode) => set({ layoutMode }),
  enqueueAudio: (item) =>
    set((state) => ({
      audioBufferQueue: [...state.audioBufferQueue, item]
    })),
  dequeueAudio: () => {
    const [next, ...rest] = get().audioBufferQueue;
    set({ audioBufferQueue: rest });
    return next;
  }
}));
