import { useEffect, useState, type ReactNode } from "react";
import { Sheet } from "react-modal-sheet";

type AppBottomSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function AppBottomSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: AppBottomSheetProps) {
  const [initialSnapRatio, setInitialSnapRatio] = useState(0.5);

  useEffect(() => {
    const updateSnapRatio = () => {
      const isCompactViewport =
        window.innerWidth <= 390 || window.innerHeight <= 760;
      setInitialSnapRatio(isCompactViewport ? 0.4 : 0.5);
    };

    updateSnapRatio();
    window.addEventListener("resize", updateSnapRatio);
    return () => window.removeEventListener("resize", updateSnapRatio);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const { body, documentElement } = document;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyTouchAction = body.style.touchAction;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = "hidden";
    body.style.touchAction = "none";
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";

    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.touchAction = previousBodyTouchAction;
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscroll;
    };
  }, [isOpen]);

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={[initialSnapRatio, 0]}
      initialSnap={0}
      disableScrollLocking
      dragCloseThreshold={0.35}
      dragVelocityThreshold={450}
      tweenConfig={{ ease: "easeOut", duration: 0.16 }}
    >
      <Sheet.Backdrop className="!bg-black/55" onTap={onClose} />
      <Sheet.Container className="!bg-[#141418] !rounded-t-[24px] !shadow-[0_-24px_70px_rgba(0,0,0,0.55)]">
        <Sheet.Header className="px-5 pb-4 pt-3">
          <div className="mx-auto h-1 w-9 rounded-full bg-[#252530]" />
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <div className="font-display text-[24px] font-extrabold tracking-[-0.04em] text-white">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 text-[14px] text-[#8b8b9c]">{subtitle}</div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#1c1c22] text-[#5a5a70]"
              aria-label="Close sheet"
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="h-4 w-4"
              >
                <path
                  d="M4 4l8 8M12 4 4 12"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </Sheet.Header>
        <Sheet.Content className="flex h-full flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-0">
            {children}
          </div>
          {footer ? (
            <div className="bg-[#141418] px-5 pb-[34px] pt-1">{footer}</div>
          ) : null}
        </Sheet.Content>
      </Sheet.Container>
    </Sheet>
  );
}
