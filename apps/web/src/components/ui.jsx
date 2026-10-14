import { useEffect, useRef } from 'react';
import { Icon } from './Icon.jsx';
import { STATUS_LABEL, STATUS_TONE } from '../lib/format.js';

export function ProgressBar({ value, tone = '', size = '', label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  return (
    <div
      className={`bar ${tone} ${size}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Progresso'}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_TONE[status] ?? ''}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function EmptyState({ icon = 'courses', title, children, action }) {
  return (
    <div className="empty card">
      <div className="empty-icon"><Icon name={icon} size={26} /></div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card" role="alert">
      <p className="alert error" style={{ margin: 0 }}>{error?.message ?? 'Não foi possível carregar.'}</p>
      {onRetry && <button className="btn btn-sm" style={{ marginTop: 12 }} onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}

export function Skeleton({ height = 120, style }) {
  return <div className="skeleton" style={{ height, ...style }} aria-hidden="true" />;
}

/** Modal acessível: foco preso, Esc fecha, devolve o foco ao fechar. */
export function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const el = ref.current;
    const focusables = () =>
      el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusables()[0] ?? el).focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const list = [...focusables()].filter((n) => !n.disabled);
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref} tabIndex={-1}>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}
