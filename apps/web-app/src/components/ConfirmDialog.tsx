import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

interface DialogState extends ConfirmOptions {
  open: boolean;
}

// Promise-based replacement for window.confirm(). Returns `{ confirm, dialog }`:
// call `await confirm({ ... })` to get a boolean, and render `dialog` somewhere
// in the tree so the modal can appear. Keeps async flows reading exactly like
// they did with the native dialog.
export function useConfirm() {
  const [state, setState] = useState<DialogState | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    // Resolve any in-flight prompt as cancelled before opening a new one.
    resolver.current?.(false);
    return new Promise<boolean>(resolve => {
      resolver.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(prev => (prev ? { ...prev, open: false } : prev));
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setState(null), 200);
  }, []);

  const dialog = state ? <ConfirmDialog state={state} onResult={close} /> : null;

  return { confirm, dialog };
}

function ConfirmDialog({
  state,
  onResult,
}: {
  state: DialogState;
  onResult: (result: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onResult(false);
      else if (e.key === 'Enter') onResult(true);
    }
    document.addEventListener('keydown', onKey);
    // Focus the confirm action so Enter/Space work and focus is trapped here.
    confirmRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onResult]);

  const danger = state.tone === 'danger';

  return createPortal(
    <div
      className={`confirm-backdrop ${state.open ? 'open' : ''}`}
      onClick={() => onResult(false)}
      aria-hidden={!state.open}
    >
      <div
        className={`confirm-card glass ${state.open ? 'open' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={e => e.stopPropagation()}
      >
        <button className="confirm-close icon-btn" onClick={() => onResult(false)} title="Cancel">
          <X size={14} />
        </button>

        <div className="confirm-head">
          <span className={`confirm-icon ${danger ? 'danger' : ''}`}>
            {danger ? <AlertTriangle size={18} /> : <HelpCircle size={18} />}
          </span>
          <h2 id="confirm-title" className="confirm-title">{state.title}</h2>
        </div>

        <p id="confirm-message" className="confirm-message">{state.message}</p>

        <div className="confirm-actions">
          <button className="action-btn" onClick={() => onResult(false)}>
            {state.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            className={`action-btn ${danger ? 'danger' : 'primary'}`}
            onClick={() => onResult(true)}
          >
            {state.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
