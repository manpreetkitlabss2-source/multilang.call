import { useMemo } from "react";

export const useVAD = () => {
  return useMemo(
    () => ({
      isLikelySilence(samples: Float32Array) {
        const average =
          samples.reduce((sum, sample) => sum + Math.abs(sample), 0) /
          Math.max(samples.length, 1);
        return average < 0.015;
      }
    }),
    []
  );
};
