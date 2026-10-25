import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const noop = () => {};
const ToastContext = createContext(noop);

const TYPE_STYLES = {
  success: "bg-wash-green text-green-deep border-green-deep/15",
  error: "bg-wash-red text-destructive border-destructive/15",
  warning: "bg-wash-amber text-amber border-amber/20",
  info: "bg-card text-card-foreground border-border",
};

export function ToastProvider({ children }) {
  const [state, setState] = useState(null);
  const timerRef = useRef(null);

  const toast = useCallback((message, type = "info", { undo } = {}) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ message, type, undo });
    timerRef.current = setTimeout(() => {
      setState(null);
      timerRef.current = null;
    }, 3500);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState(null);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {state && (
        <div
          data-testid="toast"
          data-toast-type={state.type}
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold shadow-lift transition-transform duration-150 ${TYPE_STYLES[state.type] || TYPE_STYLES.info}`}
        >
          {state.message}
          {state.undo && (
            <button
              type="button"
              data-testid="toast-undo"
              className="rounded-full bg-foreground/10 px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-foreground/20"
              onClick={async () => {
                const undo = state.undo;
                dismiss();
                let ok;
                try {
                  ok = await undo();
                } catch {}
                // an undo that handled its drop — returns false — don't clobber with "Undone"
                if (ok !== false) toast("Undone", "info");
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) || noop;
}
