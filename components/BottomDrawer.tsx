import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import type { PanInfo } from "framer-motion";

export type BottomDrawerHandle = {
  snapTo: (preset: "min" | "mid" | "max") => void;
};

type Props = {
  onCollapse?: () => void;
  render: (isExpanded: boolean) => React.ReactNode;
  bottomOffset?: number;
  allowScroll?: boolean;
  containerClassName?: string;
  handleClassName?: string;
  maxHeightRatio?: number;
  defaultSnap?: "min" | "mid" | "max";
  snapMode?: "default" | "single";
  dismissOnDragDown?: boolean;
  fitContent?: boolean;
};

const BottomDrawer = forwardRef<BottomDrawerHandle, Props>(
  function BottomDrawer(
    {
      onCollapse,
      render,
      bottomOffset = 0,
      allowScroll = false,
      containerClassName = "",
      handleClassName = "",
      maxHeightRatio = 0.9,
      defaultSnap = "max",
      snapMode = "default",
      dismissOnDragDown = false,
      fitContent = false,
    }: Props,
    ref,
  ) {
    const [isMounted, setIsMounted] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [activeSnapHeight, setActiveSnapHeight] = useState<number>(0);
    const y = useMotionValue(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const hasAnimatedInRef = useRef(false);
    const animationRef = useRef<ReturnType<typeof animate> | null>(null);
    const [measuredHeight, setMeasuredHeight] = useState(0);

    const FOOTER_HEIGHT = 80;
    const MIN_SNAP = 64;

    const isExpanded = activeSnapHeight > MIN_SNAP;

    useEffect(() => {
      setIsMounted(true);
    }, []);

    useEffect(() => {
      const updateHeight = () => {
        setViewportHeight(window.innerHeight || 0);
      };
      updateHeight();
      window.addEventListener("resize", updateHeight);
      return () => window.removeEventListener("resize", updateHeight);
    }, []);

    useEffect(() => {
      if (!fitContent || !contentRef.current) return;

      const measure = () => {
        const contentHeight = contentRef.current?.scrollHeight || 0;
        const paddedHeight = Math.ceil(contentHeight + 20);
        setMeasuredHeight(paddedHeight);
      };

      measure();
      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    }, [fitContent, render]);

    const maxHeight = useMemo(() => {
      if (!viewportHeight) return 0;
      if (fitContent) {
        const boundedHeight = Math.min(
          Math.max(MIN_SNAP, measuredHeight || MIN_SNAP),
          Math.round(viewportHeight * maxHeightRatio),
        );
        return Math.max(bottomOffset, boundedHeight);
      }
      return Math.max(bottomOffset, Math.round(viewportHeight * maxHeightRatio));
    }, [bottomOffset, fitContent, maxHeightRatio, measuredHeight, viewportHeight]);

    const snapPoints = useMemo(() => {
      if (!maxHeight) return [MIN_SNAP];
      if (snapMode === "single") {
        return [maxHeight];
      }
      const mid = Math.round(maxHeight * 0.5);
      const max = Math.min(maxHeight, Math.round(maxHeight * 0.85));
      return [MIN_SNAP, mid, max].filter(
        (value, index, arr) => arr.indexOf(value) === index,
      );
    }, [maxHeight, snapMode]);

    useEffect(() => {
      if (!maxHeight) return;
      if (activeSnapHeight === 0) {
        const initial =
          defaultSnap === "min"
            ? snapPoints[0]
            : defaultSnap === "mid"
              ? snapPoints[Math.min(1, snapPoints.length - 1)]
              : snapPoints[snapPoints.length - 1];
        setActiveSnapHeight(initial);
        return;
      }
      const targetY = Math.max(0, maxHeight - activeSnapHeight);
      animationRef.current?.stop();

      if (!hasAnimatedInRef.current) {
        hasAnimatedInRef.current = true;
        y.set(maxHeight);
        animationRef.current = animate(y, targetY, {
          type: "spring",
          stiffness: 280,
          damping: 30,
        });
        return;
      }

      y.set(targetY);
    }, [activeSnapHeight, defaultSnap, maxHeight, snapPoints, y]);

    useEffect(() => {
      return () => {
        animationRef.current?.stop();
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        snapTo(preset) {
          if (!maxHeight || snapPoints.length === 0) return;
          const target =
            preset === "min"
              ? snapPoints[0]
              : preset === "mid"
                ? snapPoints[Math.min(1, snapPoints.length - 1)]
                : snapPoints[snapPoints.length - 1];
          setActiveSnapHeight(target);
          animationRef.current?.stop();
          animationRef.current = animate(y, Math.max(0, maxHeight - target), {
            type: "spring",
            stiffness: 320,
            damping: 32,
          });
        },
      }),
      [maxHeight, snapPoints, y],
    );

    if (!isMounted) return null;

    const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!maxHeight) return;
      if (
        dismissOnDragDown &&
        (info.offset.y > maxHeight * 0.18 || info.velocity.y > 650)
      ) {
        onCollapse?.();
        return;
      }
      const currentY = y.get();
      const currentHeight = Math.max(
        MIN_SNAP,
        Math.min(maxHeight, maxHeight - currentY),
      );
      const closest = snapPoints.reduce(
        (prev, point) =>
          Math.abs(point - currentHeight) < Math.abs(prev - currentHeight)
            ? point
            : prev,
        snapPoints[0],
      );
      setActiveSnapHeight(closest);
      animationRef.current?.stop();
      animationRef.current = animate(y, Math.max(0, maxHeight - closest), {
        type: "spring",
        stiffness: 320,
        damping: 32,
      });
    };

    return (
      <div
        className="pointer-events-none absolute inset-x-0 z-[60]"
        style={{ bottom: FOOTER_HEIGHT }}
      >
        <motion.div
          className={`pointer-events-auto relative mx-auto flex w-full flex-col rounded-t-[28px] shadow-lg outline-none ${containerClassName}`}
          ref={containerRef}
          style={{ y, height: maxHeight || undefined }}
          drag="y"
          dragConstraints={{
            top: 0,
            bottom: Math.max(0, (maxHeight || 0) - MIN_SNAP),
          }}
          dragElastic={0.06}
          onDragEnd={handleDragEnd}
        >
          <div
            ref={contentRef}
            onTouchStart={(e) => {
              e.stopPropagation();
            }}
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            className={allowScroll ? "h-full" : undefined}
          >
            <div
              className={`mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200 ${handleClassName}`}
            />
            {render(isExpanded)}
          </div>
        </motion.div>
      </div>
    );
  },
);

export default BottomDrawer;
