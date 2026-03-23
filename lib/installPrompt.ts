type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallState = {
  available: boolean;
  standalone: boolean;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

const isStandaloneDisplay = () => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches;
};

const isIosStandalone = () => {
  if (typeof window === "undefined") return false;
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
};

export const isStandaloneApp = () => isStandaloneDisplay() || isIosStandalone();

const emitChange = () => {
  listeners.forEach((listener) => listener());
};

export const getInstallState = (): InstallState => {
  const standalone = isStandaloneApp();
  return {
    standalone,
    available: !standalone && (Boolean(deferredPrompt) || isIosInstallable()),
  };
};

export const isIosInstallable = () => {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/crios|fxios|edgios/.test(ua);
  return isIos && isSafari && !isStandaloneApp();
};

export const initInstallPrompt = () => {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emitChange();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emitChange();
  });
};

export const subscribeInstallState = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const promptInstall = async () => {
  if (!deferredPrompt) {
    return { outcome: "unavailable" as const };
  }

  const prompt = deferredPrompt;
  deferredPrompt = null;
  emitChange();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome !== "accepted") {
    deferredPrompt = prompt;
    emitChange();
  }
  return { outcome: choice.outcome as "accepted" | "dismissed" };
};
