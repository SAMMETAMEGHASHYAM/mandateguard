import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";

export type ToastMessage = {
  id: number;
  kind: "ok" | "err" | "info";
  text: string;
};

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5200);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const Icon =
    toast.kind === "ok" ? CheckCircle2 : toast.kind === "err" ? AlertTriangle : Info;

  return (
    <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite">
      <Icon size={17} aria-hidden />
      <span>{toast.text}</span>
      <button
        type="button"
        className="toast-close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </div>
  );
}
