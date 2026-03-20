import { useEffect, useRef } from "react";

type Callback = () => void;

const RESUME_DEDUP_MS = 500;

export default function useForegroundResume(callback: Callback) {
  const callbackRef = useRef(callback);
  const lastResumeAtRef = useRef(0);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const notifyResume = () => {
      const now = Date.now();
      if (now - lastResumeAtRef.current < RESUME_DEDUP_MS) return;
      lastResumeAtRef.current = now;
      callbackRef.current();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      notifyResume();
    };

    const handlePageShow = () => {
      notifyResume();
    };

    const handleFocus = () => {
      if (document.visibilityState !== "visible") return;
      notifyResume();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);
}
