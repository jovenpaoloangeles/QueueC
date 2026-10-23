import { useEffect, useState } from "react";

// v1.3 hash routing: the live view stays at "/", history views live under
// #/history (list), #/history/:id (session detail) and #/players/:id (career).
// Anything unrecognized is the live view.
function parse() {
  let m = window.location.hash.match(/^#\/history\/(\d+)$/);
  if (m) return { name: "session", id: Number(m[1]) };
  if (window.location.hash === "#/history") return { name: "history", id: null };
  m = window.location.hash.match(/^#\/players\/(\d+)$/);
  if (m) return { name: "player", id: Number(m[1]) };
  return { name: "live", id: null };
}

export default function useHashRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
