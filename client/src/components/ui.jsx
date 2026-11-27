import {
  cloneElement, createContext, isValidElement, useCallback, useContext, useEffect,
  useId, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import { useOnline } from '../hooks.js';
import { STATUS_LABELS, copyToClipboard, formatKes } from '../lib.js';

const ICONS = {
  home: <><path d="M3 10.8 12 3l9 7.8" /><path d="M5.5 9.2V21h13V9.2" /><path d="M9.5 21v-6h5v6" /></>,
  earn: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
  wallet: <><path d="M20 8.5V7a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7" /><path d="M16.5 12.5h.01" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16 5.3a3.2 3.2 0 0 1 0 5.4" /><path d="M17.5 14.4A6.2 6.2 0 0 1 21.2 20" /></>,
  play: <><circle cx="12" cy="12" r="9" /><path d="M10 8.8v6.4l5.2-3.2z" fill="currentColor" stroke="none" /></>,
  share: <><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="6" r="2.6" /><circle cx="18" cy="18" r="2.6" /><path d="M8.4 10.8 15.6 7.4M8.4 13.2l7.2 3.4" /></>,
  grid: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="10" rx="2.5" /><path d="M8.2 10V7.5a3.8 3.8 0 0 1 7.6 0V10" /><path d="M12 14v2.4" /></>,
  unlock: <><rect x="4.5" y="10" width="15" height="10" rx="2.5" /><path d="M8.2 10V7.5a3.8 3.8 0 0 1 7.2-1.7" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h10" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  arrowLeft: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  arrowRight: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6a3 3 0 0 0-3 3v6.5A2.5 2.5 0 0 0 5.5 15" /></>,
  check: <path d="m4 12.5 5 5L20 6.5" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.4 9" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4.5 20h15" /></>,
  logout: <><path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M10 8l-4 4 4 4M6 12h9" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H4.5v1.5A3.5 3.5 0 0 0 8 11M16 6h3.5v1.5A3.5 3.5 0 0 1 16 11" /><path d="M12 13v4M8.5 21h7M10 17h4v4h-4z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  shield: <><path d="m12 3 8 3v6c0 4.6-3.3 7.9-8 9-4.7-1.1-8-4.4-8-9V6z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></>,
  alert: <><path d="M12 3 2.8 20h18.4z" /><path d="M12 9v5M12 17.5h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  phone: <path d="M8 3h2l1.5 4-2 1.5a12 12 0 0 0 6 6L17 12.5l4 1.5v2a2.5 2.5 0 0 1-2.7 2.5A17 17 0 0 1 3.5 5.7 2.5 2.5 0 0 1 6 3z" />,
  spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
  send: <><path d="m21 3-7.5 18-3.5-7-7-3.5z" /><path d="m10 14 4.2-4.2" /></>,
  refresh: <><path d="M20 5v5h-5" /><path d="M19 10a8 8 0 1 0 1 5" /></>,
  install: <><path d="M12 3v11" /><path d="m8 10 4 4 4-4" /><path d="M5 17v3h14v-3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1" /><circle cx="12" cy="13" r="3.3" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4" /></>,
  eye: <><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12" /><circle cx="12" cy="12" r="3" /></>,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8C10 8 7.5 7.2 7.5 5A2.5 2.5 0 0 1 12 3.8 2.5 2.5 0 0 1 16.5 5C16.5 7.2 14 8 12 8" /></>,
  zap: <path d="M13 2 4.5 13H11l-1 9 8.5-11H12z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  more: <><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></>,
  gamepad: <><rect x="2.5" y="7" width="19" height="11" rx="5" /><path d="M7 10.5v4M5 12.5h4M16 11h.01M18.5 13.5h.01" /></>,
  arrowUp: <path d="M12 19V5m-6 6 6-6 6 6" />,
  arrowDown: <path d="M12 5v14m-6-6 6 6 6-6" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8M16 4l3 3M14 6l3 3" /></>,
  whatsapp: <><path d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.5z" /><path d="M8.7 7.9c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.2-.2.3 0 .5.4.7 1 1.3 1.7 1.7.2.1.4.1.5 0l.7-.7c.2-.2.4-.2.6-.1l1.5.7c.3.1.3.3.3.5 0 .7-.5 1.5-1.1 1.7-.5.2-1.2.3-3.1-.5-2.3-.9-3.8-3.1-4-3.4-.1-.2-.9-1.2-.9-2.3 0-1.1.6-1.7.8-1.9z" fill="currentColor" stroke="none" /></>,
  message: <><path d="M4 5.5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
  book: <><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H11v17H5.5A2.5 2.5 0 0 0 3 22.5z" /><path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H13v17h5.5a2.5 2.5 0 0 1 2.5 2.5z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  trash: <><path d="M4 7h16M9 7V5h6v2M6 7l1 14h10l1-14" /><path d="M10 11v6M14 11v6" /></>,
  external: <><path d="M14 4h6v6M20 4l-8 8" /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" /></>,
  certificate: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10M9 16v4M15 16v4" /><path d="m9 8 2 2 4-4" /></>,
};

export function Icon({ name, size = 19, strokeWidth = 1.8, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {ICONS[name] || ICONS.info}
    </svg>
  );
}

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  const remove = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((message, type = 'info', duration = 4200) => {
    const id = ++counter.current;
    setToasts((list) => [...list.slice(-2), { id, message, type }]);
    window.setTimeout(() => remove(id), duration);
    return id;
  }, [remove]);

  const value = useMemo(() => ({ push, remove }), [push, remove]);
  const icons = { success: 'checkCircle', error: 'alert', info: 'info' };

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-stack" aria-live="polite">
          {toasts.map((toast) => (
            <div className={`toast ${toast.type}`} key={toast.id}>
              <Icon name={icons[toast.type] || 'info'} size={17} />
              <div>{toast.message}</div>
              <button className="toast-close" onClick={() => remove(toast.id)} aria-label="Dismiss">
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = '', closeLabel = 'Close', className = '', hideClose = false }) {
  const titleId = `${useId()}-title`;
  const modalRef = useRef(null);
  const lastFocused = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    lastFocused.current = document.activeElement;

    const onKey = (event) => {
      if (event.key === 'Escape') {
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !modalRef.current) return;
      const nodes = modalRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const focusable = modalRef.current?.querySelector('input:not([disabled]), select, textarea, button');
      (focusable || modalRef.current)?.focus?.();
    }, 90);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
      if (lastFocused.current && typeof lastFocused.current.focus === 'function') {
        lastFocused.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div
        ref={modalRef}
        className={`modal ${size} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={typeof title === 'string' && title ? titleId : undefined}
        aria-label={typeof title === 'string' && title ? undefined : closeLabel}
        tabIndex={-1}
      >
        <div className="modal-grab" />
        {(title || !hideClose) && (
          <div className="modal-head">
            <div>
              {title && <h3 id={titleId}>{title}</h3>}
              {description && <p>{description}</p>}
            </div>
            {!hideClose && (
              <button type="button" className="btn-icon round modal-close" onClick={onClose} aria-label={closeLabel}>
                <Icon name="close" size={17} />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function PasswordStrength({ result }) {
  return (
    <div className="pw-meter">
      <div className="pw-bars">
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className={result.score >= level ? `on-${result.score}` : ''} />
        ))}
      </div>
      <div className="pw-meta">
        <span>Password strength</span>
        <strong style={{ color: ['#d64550', '#d64550', '#b0761c', '#6d9a2f', '#14a06b'][result.score] }}>{result.label}</strong>
      </div>
      <div className="pw-checks">
        {result.checks.map((check) => (
          <span key={check.key} className={check.pass ? 'ok' : ''}>
            {check.pass ? <Icon name="check" size={12} /> : <Icon name="close" size={12} />} {check.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatusPill({ status }) {
  return <span className={`pill ${status}`}>{STATUS_LABELS[status] || status}</span>;
}

export function Spinner({ small = false, label = 'Loading' }) {
  return (
    <span className={`spinner ${small ? 'sm' : ''}`} role="status">
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ width = '100%', height = 14, radius = 8, className = '', style }) {
  return (
    <span
      className={`skeleton ${className}`}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }) {
  return (
    <span className={`skeleton-text ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} height={11} width={index === lines - 1 ? '68%' : '100%'} />
      ))}
    </span>
  );
}

export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="card" aria-hidden="true">
      <Skeleton height={16} width="42%" />
      <div style={{ height: 12 }} />
      <SkeletonText lines={lines} />
    </div>
  );
}

export function PageSkeleton({ label = 'Loading page', cards = 2 }) {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      <Skeleton height={30} width="min(280px, 70%)" radius={10} />
      <div style={{ height: 10 }} />
      <Skeleton height={14} width="min(420px, 90%)" />
      <div style={{ height: 22 }} />
      <div className="skeleton-hero" aria-hidden="true">
        <Skeleton height={12} width="30%" />
        <div style={{ height: 18 }} />
        <Skeleton height={38} width="55%" radius={10} />
        <div style={{ height: 20 }} />
        <Skeleton height={12} width="40%" />
      </div>
      <div className="grid-2" style={{ marginTop: 18 }}>
        {Array.from({ length: cards }, (_, index) => <SkeletonCard key={index} />)}
      </div>
    </div>
  );
}

export function BootSkeleton() {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-busy="true">
      <div className="boot-card">
        <img src="/img/logo.png" alt="" width="46" height="46" />
        <div className="spinner" aria-hidden="true" />
        <span className="sr-only">Loading KaziLink…</span>
        <p className="tiny muted">Getting things ready…</p>
      </div>
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <Icon name="alert" size={16} />
      <span>You are offline. Saved data stays visible and we will retry when your connection returns.</span>
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'We could not load this yet' }) {
  return (
    <div className="empty" role="alert">
      <div className="empty-icon"><Icon name="alert" size={21} /></div>
      <strong style={{ display: 'block', fontSize: '.9rem', color: 'var(--ink)' }}>{title}</strong>
      <p className="mt-1">{error?.message || 'Check your connection and try again.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-soft btn-sm mt-2" onClick={onRetry}>
          <Icon name="refresh" size={14} /> Try again
        </button>
      )}
    </div>
  );
}

export function StaleNotice({ onRetry }) {
  return (
    <div className="stale-note" role="status">
      <Icon name="info" size={14} />
      <span className="grow">Showing saved data — the connection is slow or offline.</span>
      {onRetry && <button type="button" className="link-btn" onClick={onRetry}>Refresh</button>}
    </div>
  );
}

export function EmptyState({ icon = 'info', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={21} /></div>
      {title && <strong style={{ display: 'block', fontSize: '.88rem', color: 'var(--ink)' }}>{title}</strong>}
      {text && <p>{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  const autoId = useId();
  const id = htmlFor || `field-${autoId}`;
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || hint);

  let content = children;
  if (isValidElement(children) && typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type)) {
    content = cloneElement(children, {
      id: children.props.id || id,
      'aria-invalid': error ? true : children.props['aria-invalid'],
      'aria-describedby': children.props['aria-describedby'] || (hasMessage ? messageId : undefined),
    });
  }

  return (
    <div className="field">
      {label && <label className="label" htmlFor={id}>{label}</label>}
      {content}
      {error
        ? <span className="error-text" id={messageId} role="alert">{error}</span>
        : hint ? <span className="hint" id={messageId}>{hint}</span> : null}
    </div>
  );
}

export function CopyButton({ text, label = 'Copy', small = false, className = '' }) {
  const { push } = useToast();
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      push('Could not copy. Long-press the text to copy it manually.', 'error');
    }
  };
  return (
    <button type="button" className={`btn ${small ? 'btn-sm' : ''} ${className}`} onClick={onCopy}>
      <Icon name={copied ? 'check' : 'copy'} size={14} />
      {copied ? 'Copied' : label}
    </button>
  );
}

export function PinModal({ open, onClose, onSubmit, amountCents, phone, title = 'Confirm payment', description, submitting, error, confirmLabel = 'Confirm payment' }) {
  const [digits, setDigits] = useState(['', '', '', '']);
  const refs = useRef([]);
  const { push } = useToast();

  useEffect(() => {
    if (open) {
      setDigits(['', '', '', '']);
      window.setTimeout(() => refs.current[0]?.focus(), 120);
    }
  }, [open]);

  const setDigit = (index, value) => {
    const clean = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < 3) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < 3) refs.current[index + 1]?.focus();
  };

  const onPaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!pasted) return;
    event.preventDefault();
    const next = pasted.padEnd(4, '').split('').slice(0, 4);
    setDigits(next);
    refs.current[Math.min(pasted.length, 3)]?.focus();
  };

  const submit = () => {
    const pin = digits.join('');
    if (pin.length !== 4) {
      push('Enter your 4-digit M-Pesa PIN.', 'error');
      return;
    }
    onSubmit(pin);
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={title}
      description={description || 'An M-Pesa payment request was sent to your phone. Enter your PIN to authorise it.'}
      size="sm"
      hideClose={submitting}
    >
      <div className="pay-summary">
        <div className="amount">{formatKes(amountCents || 0)}</div>
        <p>Paying from {phone || 'your registered line'}</p>
      </div>
      <div className="pin-row" onPaste={onPaste}>
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { refs.current[index] = el; }}
            className="pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={digit}
            aria-label={`PIN digit ${index + 1} of 4`}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => onKeyDown(index, event)}
            disabled={submitting}
          />
        ))}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {submitting ? 'Waiting for M-Pesa to confirm your payment. Please keep this page open.' : ''}
      </div>
      {error && <p className="error-text center mt-2" role="alert">{error}</p>}
      {submitting && (
        <p className="hint center mt-2" aria-hidden="true">
          Awaiting confirmation from M-Pesa. This can take up to 30 seconds.
        </p>
      )}
      <p className="hint center mt-2" style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
        <Icon name="lock" size={13} /> Your PIN is never stored on KaziLink.
      </p>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={submitting || digits.some((d) => !d)}>
          {submitting ? <><Spinner small label="Confirming payment" /> Confirming payment…</> : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function WithdrawModal({ open, onClose, presetBucket = 'affiliate', onSubmitted }) {
  const [options, setOptions] = useState(null);
  const [bucket, setBucket] = useState(presetBucket);
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const { push } = useToast();

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError('');
    setBucket(presetBucket);
    setLoading(true);
    api('/withdrawals/options')
      .then((data) => {
        setOptions(data);
        setPhone(data.phone || '');
        setBucket(presetBucket);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [open, presetBucket]);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setResult(null);
      setError('');
    }
  }, [open]);

  const selected = options?.buckets?.find((b) => b.key === bucket);
  const amountCents = Math.round((Number(amount) || 0) * 100);

  const submit = async (event) => {
    event?.preventDefault();
    setError('');
    if (!selected) return;
    if (amountCents < selected.minCents) {
      setError(`Minimum withdrawal is ${formatKes(selected.minCents)}.`);
      return;
    }
    if (amountCents > selected.maxCents) {
      setError(`Maximum withdrawal is ${formatKes(selected.maxCents)} per day.`);
      return;
    }
    if (amountCents > selected.availableCents) {
      setError(`You can withdraw up to ${formatKes(selected.availableCents)} from this activity.`);
      return;
    }
    setLoading(true);
    try {
      const data = await api('/withdraw', { method: 'POST', body: { bucket, amountCents, phone } });
      setResult(data);
      push('Withdrawal requested — pending admin approval.', 'success');
      onSubmitted?.(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <Modal open={open} onClose={onClose} title="Withdrawal requested" size="sm">
        <div className="celebrate">
          <div className="celebrate-icon" style={{ background: 'var(--orange-soft)', color: 'var(--orange)' }}>
            <Icon name="clock" size={38} />
          </div>
          <h2 style={{ fontSize: '1.25rem' }}>Pending approval</h2>
          <p className="mt-1">
            {formatKes(result.withdrawal.amountCents)} will be sent to {result.withdrawal.phone} once an admin approves the request.
          </p>
          <div className="mini-note mt-3">
            <strong>Status: Pending.</strong> You can track this request under Wallet → Withdrawals.
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Withdraw funds" description="Choose where the money comes from. Each activity has its own daily limit." size="lg">
      {loading && !options ? (
        <div className="center" style={{ padding: 30 }}><Spinner /></div>
      ) : (
        <form onSubmit={submit} className="stack">
          {error && <div className="mini-note warn">{error}</div>}
          <div className="stack-sm">
            {options?.buckets?.map((option) => (
              <label
                key={option.key}
                className="row"
                style={{
                  border: `1.5px solid ${bucket === option.key ? 'var(--brand)' : 'var(--line)'}`,
                  background: bucket === option.key ? '#faf8ff' : '#fff',
                  borderRadius: 13,
                  padding: '11px 13px',
                  cursor: 'pointer',
                  alignItems: 'center',
                }}
              >
                <input
                  type="radio"
                  name="bucket"
                  checked={bucket === option.key}
                  onChange={() => { setBucket(option.key); setAmount(''); setError(''); }}
                  style={{ accentColor: 'var(--brand)' }}
                />
                <div className="grow">
                  <strong style={{ fontSize: '.82rem', display: 'block' }}>{option.label}</strong>
                  <span className="tiny muted">
                    Available {formatKes(option.availableCents)} · min {formatKes(option.minCents, { decimals: false })} · max {formatKes(option.maxCents, { decimals: false })}/day
                  </span>
                </div>
                <span className="small strong">{formatKes(option.availableCents)}</span>
              </label>
            ))}
          </div>

          <Field
            label="Amount (KSh)"
            hint={selected ? `You can withdraw between ${formatKes(selected.minCents)} and ${formatKes(selected.maxCents)} today.` : ''}
          >
            <div className="input-prefix">
              <span className="prefix">KSh</span>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </Field>
          {selected && selected.availableCents >= selected.minCents && (
            <div className="row wrap">
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setAmount((selected.minCents / 100).toString())}>
                Min {formatKes(selected.minCents, { decimals: false })}
              </button>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                onClick={() => setAmount((Math.min(selected.availableCents, selected.maxCents) / 100).toString())}
              >
                Max available
              </button>
            </div>
          )}

          <Field label="M-Pesa number" hint="Approved withdrawals are paid to this number.">
            <input
              className="input"
              inputMode="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="0712 345 678"
            />
          </Field>

          <div className="mini-note">
            Withdrawals are reviewed by an admin before payout. Requested funds are reserved from your balance while pending, and returned if rejected.
          </div>

          <button className="btn btn-primary btn-lg btn-block" disabled={loading || !selected}>
            {loading ? <><Spinner small /> Submitting…</> : `Request withdrawal${amountCents ? ` · ${formatKes(amountCents)}` : ''}`}
          </button>
        </form>
      )}
    </Modal>
  );
}

export function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 26 }, (_, index) => ({
    left: `${(index * 37) % 100}%`,
    background: ['#5b3df5', '#14a06b', '#f59e0b', '#ef6f6c', '#7c5cff'][index % 5],
    animationDelay: `${(index % 9) * 0.06}s`,
  })), []);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((style, index) => <span key={index} style={style} />)}
    </div>
  );
}
