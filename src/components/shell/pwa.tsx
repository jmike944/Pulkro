"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/* Tiny external store for the deferred install prompt (captured once, used from Perfil). */
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Registers /sw.js in production and captures the install prompt. Mount once (Providers).
 * Once the worker controls the page and there is signal, it asks the worker for a build check: the worker re-precaches the
 * field screens (jornada, order, report templates and their scripts) once per deploy, so they open offline even if never visited.
 */
export function PwaRegistrar() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
      emit();
    };
    const onInstalled = () => {
      deferred = null;
      emit();
      toast.success("Pulkro quedó instalada en este dispositivo");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((reg) => {
          // The worker fingerprints the build itself (scripts of "/") and throttles the check: the page only says "a load happened".
          const warm = () => {
            if (navigator.onLine) (navigator.serviceWorker.controller ?? reg.active)?.postMessage({ type: "WARM" });
          };
          if (navigator.serviceWorker.controller) warm();
          else navigator.serviceWorker.addEventListener("controllerchange", warm, { once: true });
          reg.addEventListener("updatefound", () => {
            const next = reg.installing;
            next?.addEventListener("statechange", () => {
              if (next.state === "installed" && navigator.serviceWorker.controller) {
                toast("Hay una nueva versión de Pulkro", {
                  action: { label: "Actualizar", onClick: () => { next.postMessage("SKIP_WAITING"); location.reload(); } },
                });
              }
            });
          });
        })
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

function getPlatform() {
  if (typeof window === "undefined") return { standalone: false, ios: false };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
  return { standalone, ios };
}

/** Install state for the "Instalar app" card. */
export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const { standalone, ios } = getPlatform();
  const install = async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    emit();
    return choice.outcome === "accepted";
  };
  return { canPrompt, standalone, ios, install };
}
