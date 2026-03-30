import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  photos: string[];
  currentIndex: number;
  direction: number;
  isOpen: boolean;
  title: string;
  onClose: () => void;
  onNavigate: (direction: number) => void;
};

const swipePower = (offset: number, velocity: number) => {
  return Math.abs(offset) * velocity;
};

const swipeThreshold = 8000;

export default function ImageLightbox({
  photos,
  currentIndex,
  direction,
  isOpen,
  title,
  onClose,
  onNavigate,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" && currentIndex > 0) {
        onNavigate(-1);
        return;
      }
      if (event.key === "ArrowRight" && currentIndex < photos.length - 1) {
        onNavigate(1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [currentIndex, isOpen, onClose, onNavigate, photos.length]);

  if (!isOpen || photos.length === 0) return null;

  const canGoBack = currentIndex > 0;
  const canGoForward = currentIndex < photos.length - 1;

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key="lightbox"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[12000] bg-[rgba(7,7,10,0.96)]"
        onClick={onClose}
      >
        <div
          className="flex h-full w-full flex-col px-4 pb-6 pt-4"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-bold tracking-[-0.02em] text-white">
                {title}
              </p>
              <p className="mt-1 text-xs text-white/60">
                {currentIndex + 1} / {photos.length}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white backdrop-blur"
              aria-label="Close image viewer"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center overflow-hidden">
            {canGoBack && (
              <button
                type="button"
                onClick={() => onNavigate(-1)}
                className="absolute left-0 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur"
                aria-label="Show previous image"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                  <path fillRule="evenodd" d="M12.78 15.53a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 0-1.06l4-4a.75.75 0 1 1 1.06 1.06L9.31 10l3.47 3.47a.75.75 0 0 1 0 1.06" clipRule="evenodd" />
                </svg>
              </button>
            )}

            <AnimatePresence initial={false} custom={direction} mode="wait">
              <motion.img
                key={photos[currentIndex]}
                src={photos[currentIndex]}
                alt={`${title} photo ${currentIndex + 1}`}
                custom={direction}
                initial={{ x: direction > 0 ? 120 : -120, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -120 : 120, opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.9}
                onDragEnd={(_, info) => {
                  const swipe = swipePower(info.offset.x, info.velocity.x);
                  if (swipe < -swipeThreshold && canGoForward) {
                    onNavigate(1);
                    return;
                  }
                  if (swipe > swipeThreshold && canGoBack) {
                    onNavigate(-1);
                  }
                }}
                className="max-h-full max-w-full select-none object-contain"
              />
            </AnimatePresence>

            {canGoForward && (
              <button
                type="button"
                onClick={() => onNavigate(1)}
                className="absolute right-0 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white backdrop-blur"
                aria-label="Show next image"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
                  <path fillRule="evenodd" d="M7.22 4.47a.75.75 0 0 1 1.06 0l4 4a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 1 1-1.06-1.06L10.69 10 7.22 6.53a.75.75 0 0 1 0-1.06" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
