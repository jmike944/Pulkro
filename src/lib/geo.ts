/**
 * The device's real current position, or null (no GPS, permission denied, timeout). Never simulated: use it to stamp evidence
 * (new photos) where a made-up point would be worse than none. A recent fix (≤ maxAgeMs) is accepted so capture stays fast.
 */
export function currentPosition(timeoutMs = 4000, maxAgeMs = 60_000): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: maxAgeMs },
    );
  });
}
