import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useAnimation, useMotionValue } from "framer-motion";

export type BottomDrawerHandle = {
  snapTo: (preset: "min" | "mid" | "max") => void;
};

type Props = {
  onCollapse?: () => void;
  render: (isExpanded: boolean) => React.ReactNode;
  bottomOffset?: number;
  allowScroll?: boolean;
};

const BottomDrawer = forwardRef<BottomDrawerHandle, Props>(
  function BottomDrawer({ onCollapse, render, bottomOffset = 0, allowScroll = false }: Props, ref) {
    const [isMounted, setIsMounted] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(0);
    const [activeSnapHeight, setActiveSnapHeight] = useState<number>(0);
    const controls = useAnimation();
    const y = useMotionValue(0);
    const containerRef = useRef<HTMLDivElement>(null);

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

    const maxHeight = useMemo(() => {
      if (!viewportHeight) return 0;
      return Math.max(bottomOffset, Math.round(viewportHeight * 0.9));
    }, [viewportHeight]);

    const snapPoints = useMemo(() => {
      if (!maxHeight) return [MIN_SNAP];
      const mid = Math.round(maxHeight * 0.5);
      const max = Math.min(maxHeight, Math.round(maxHeight * 0.85));
      return [MIN_SNAP, mid, max].filter(
        (value, index, arr) => arr.indexOf(value) === index,
      );
    }, [maxHeight]);

    useEffect(() => {
      if (!maxHeight) return;
      if (activeSnapHeight === 0) {
        const initial = snapPoints[snapPoints.length - 1];
        setActiveSnapHeight(initial);
        controls.set({ y: Math.max(0, maxHeight - initial) });
        return;
      }
      controls.set({ y: Math.max(0, maxHeight - activeSnapHeight) });
    }, [activeSnapHeight, controls, maxHeight, snapPoints]);

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
          controls.start({
            y: Math.max(0, maxHeight - target),
            transition: { type: "spring", stiffness: 320, damping: 32 },
          });
        },
      }),
      [maxHeight, snapPoints, controls],
    );

    if (!isMounted) return null;

    const handleDragEnd = () => {
      if (!maxHeight) return;
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
      controls.start({
        y: Math.max(0, maxHeight - closest),
        transition: { type: "spring", stiffness: 320, damping: 32 },
      });
    };

    const containerHeight = window.innerHeight - (containerRef.current?.getBoundingClientRect().top ?? 0) - 60;

    return (
      <div
        className="pointer-events-none absolute inset-x-0 z-[60]"
        style={{ bottom: FOOTER_HEIGHT }}

      >
        <motion.div
          className="pointer-events-auto relative mx-auto flex w-full flex-col rounded-t-[28px] bg-white shadow-lg outline-none"
          ref={containerRef}
          style={{ y, height: maxHeight || undefined }}
          animate={controls}
          drag="y"
          dragConstraints={{
            top: 0,
            bottom: Math.max(0, (maxHeight || 0) - MIN_SNAP),
          }}
          dragElastic={0.06}
          onDragEnd={handleDragEnd}
          
        >
          <div onTouchStart={e => {
            e.stopPropagation();
          }} onTouchMove={e => {
            e.stopPropagation();
          }} style={{ height: allowScroll ? containerHeight : undefined }}>
            <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200" />
            {render(isExpanded)}
          </div>
        </motion.div>
      </div>
    );
  },
);

export default BottomDrawer;
