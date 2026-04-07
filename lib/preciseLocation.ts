import { Geolocation } from "@capacitor/geolocation";

type LocationSuccess = {
  ok: true;
  location: {
    lat: number;
    lng: number;
  };
};

type LocationFailure = {
  ok: false;
  message: string;
};

const NATIVE_TIMEOUT_MS = 10000;

type PreciseLocationOptions = {
  promptIfNeeded?: boolean;
};

const isPermissionDeniedError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("denied") ||
    normalized.includes("not authorized") ||
    normalized.includes("permission")
  );
};

const isServicesDisabledError = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("disabled") ||
    normalized.includes("location services") ||
    normalized.includes("turned off")
  );
};

const mapNativeLocationError = (error: unknown) => {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (isPermissionDeniedError(message)) {
    return "Location permission denied.";
  }
  if (isServicesDisabledError(message)) {
    return "Location services are turned off.";
  }
  return "Unable to detect your location.";
};

export const getPreciseLocation = async (isNative: boolean): Promise<LocationSuccess | LocationFailure> => {
  return getPreciseLocationWithOptions(isNative, {});
};

export const getPreciseLocationWithOptions = async (
  isNative: boolean,
  options: PreciseLocationOptions = {},
): Promise<LocationSuccess | LocationFailure> => {
  const promptIfNeeded = options.promptIfNeeded ?? true;
  if (typeof window === "undefined") {
    return { ok: false, message: "Location services are not supported." };
  }

  if (isNative) {
    try {
      const permissions = await Geolocation.checkPermissions();
      const granted =
        permissions.location === "granted" ||
        permissions.coarseLocation === "granted";

      if (!granted) {
        if (!promptIfNeeded) {
          return { ok: false, message: "Location permission denied." };
        }
        const requested = await Geolocation.requestPermissions();
        const requestGranted =
          requested.location === "granted" ||
          requested.coarseLocation === "granted";
        if (!requestGranted) {
          return { ok: false, message: "Location permission denied." };
        }
      }

      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: NATIVE_TIMEOUT_MS,
      });
      return {
        ok: true,
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        },
      };
    } catch (error) {
      return { ok: false, message: mapNativeLocationError(error) };
    }
  }

  if (!("geolocation" in navigator)) {
    return { ok: false, message: "Location services are not supported." };
  }

  if (!promptIfNeeded) {
    const permissionsApi = navigator.permissions;
    if (permissionsApi?.query) {
      try {
        const status = await permissionsApi.query({
          name: "geolocation",
        } as PermissionDescriptor);
        if (status.state !== "granted") {
          return { ok: false, message: "Location permission denied." };
        }
      } catch {
        return { ok: false, message: "Location permission denied." };
      }
    } else {
      return { ok: false, message: "Location permission denied." };
    }
  }

  return new Promise<LocationSuccess | LocationFailure>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        });
      },
      () => {
        resolve({ ok: false, message: "Location permission denied." });
      },
      { enableHighAccuracy: true, timeout: NATIVE_TIMEOUT_MS },
    );
  });
};
