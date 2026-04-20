interface TranslationOverlayProps {
  subtitle: string | null;
}

const TranslationOverlay = ({ subtitle }: TranslationOverlayProps) => {
  if (!subtitle) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 w-[min(90vw,42rem)] -translate-x-1/2 rounded-[28px] bg-ink/90 px-6 py-4 text-center text-sm font-semibold text-white shadow-panel backdrop-blur">
      {subtitle}
    </div>
  );
};

export default TranslationOverlay;
