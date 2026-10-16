import { useEffect, useRef } from "react";

export function useSSE(onMessage, onConnection) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onConnRef = useRef(onConnection);
  onConnRef.current = onConnection;

  useEffect(() => {
    let es;
    let retryTimer;

    function connect() {
      es = new EventSource("/api/sse");
      es.addEventListener("state", (e) => {
        onConnRef.current?.(true);
        try {
          onMessageRef.current(JSON.parse(e.data));
        } catch {}
      });
      es.onerror = () => {
        onConnRef.current?.(false);
        es.close();
        retryTimer = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      es?.close();
      clearTimeout(retryTimer);
    };
  }, []);
}
