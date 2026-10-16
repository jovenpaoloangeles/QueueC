import { useEffect, useRef, useState } from "react";
import { netWait } from "@/lib/utils";

export function useTimers(serverTime, queue, activeMatches) {
  const [, setTick] = useState(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // `now` derives from the local clock plus an offset adopted from the last
  // serverTime snapshot — never from snapshot + tick. Extrapolating a snapshot
  // with a tick counter made every broadcast render `newServerTime + stale
  // tick` (wait jumps forward) and then reset the tick (jumps back): the
  // flicker. Small drift (SSE latency) is ignored; only a real clock skew of
  // ≥2s re-anchors the offset, and the correction applies on the next tick.
  useEffect(() => {
    if (serverTime == null) return;
    const drift = serverTime - Math.floor(Date.now() / 1000);
    if (Math.abs(drift - offsetRef.current) >= 2) offsetRef.current = drift;
  }, [serverTime]);

  const now = Math.floor(Date.now() / 1000) + offsetRef.current;

  const waitSeconds = new Map();
  for (const e of queue ?? []) {
    if (e.status === "waiting") {
      waitSeconds.set(e.id, netWait(now, e));
    }
  }

  const playSeconds = new Map();
  for (const m of activeMatches ?? []) {
    playSeconds.set(m.id, Math.max(0, now - m.started_at));
  }

  return { waitSeconds, playSeconds };
}
