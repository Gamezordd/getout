import { useEffect, useState } from "react";
import {
  getInstallState,
  initInstallPrompt,
  isIosInstallable,
  promptInstall,
  subscribeInstallState,
} from "../lib/installPrompt";
import { toast } from "sonner";

const IOS_MESSAGE = 'On iPhone, tap Share and choose "Add to Home Screen".';
const FALLBACK_MESSAGE = "Use your browser menu to add GetOut to your home screen.";

export default function useInstallPrompt() {
  const [installState, setInstallState] = useState(getInstallState());

  useEffect(() => {
    initInstallPrompt();
    setInstallState(getInstallState());
    return subscribeInstallState(() => {
      setInstallState(getInstallState());
    });
  }, []);

  const triggerInstall = async () => {
    if (installState.standalone) return;

    if (isIosInstallable()) {
      toast.info("Add to Home Screen", {
        description: IOS_MESSAGE,
      });
      return;
    }

    const result = await promptInstall();
    if (result.outcome === "dismissed") {
      toast.info("Install dismissed");
      return;
    }
    if (result.outcome === "unavailable") {
      toast.info("Add to Home Screen", {
        description: FALLBACK_MESSAGE,
      });
    }
  };

  return {
    canInstall: installState.available,
    isStandalone: installState.standalone,
    triggerInstall,
  };
}
