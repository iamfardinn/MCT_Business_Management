import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore } from '../../stores/toastStore';
import type { ToastType } from '../../stores/toastStore';

const icons: Record<ToastType, React.ElementType> = {
  success: CheckCircle,
  error:   XCircle,
  warning: AlertTriangle,
  info:    Info,
};

const colors: Record<ToastType, string> = {
  success: 'var(--success)',
  error:   'var(--danger)',
  warning: 'var(--warning)',
  info:    'var(--info)',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <Icon size={16} style={{ color: colors[t.type], flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.875rem' }}>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
