import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { focusHref } from './QuickFocus.jsx';

const pad = (n) => String(n).padStart(2, '0');
const DISMISS_KEY = 'lume-avisos-dispensados';

export function readDismissed() {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function saveDismissed(list) {
  try { localStorage.setItem(DISMISS_KEY, JSON.stringify(list.slice(-100))); } catch { /* sem armazenamento: o aviso volta na próxima visita */ }
}

/** Próxima hora cheia com pelo menos 30 min de folga, entre 08:00 e 22:00. */
export function suggestTime(now = new Date()) {
  const t = new Date(now.getTime() + 30 * 60000);
  let h = t.getHours() + (t.getMinutes() > 0 || t.getSeconds() > 0 ? 1 : 0);
  h = Math.min(22, Math.max(8, h));
  return `${pad(h)}:00`;
}

const hourText = (hhmm) => {
  const [h, m] = hhmm.split(':');
  return m === '00' ? `${Number(h)}h` : `${Number(h)}h${m}`;
};

/** "hoje", "ontem", "anteontem" ou "em 08/03", a partir da data AAAA-MM-DD. */
export function dayWord(date, now = new Date()) {
  const [y, m, d] = date.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - new Date(y, m - 1, d)) / 86400000);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'ontem';
  if (diff === 2) return 'anteontem';
  return `em ${pad(d)}/${pad(m)}`;
}

export function missedText(b, now = new Date()) {
  const w = dayWord(b.date, now);
  return `Você perdeu o bloco de ${w} às ${hourText(b.startTime)}${b.courseTitle ? ` (${b.courseTitle})` : ''}`;
}

const todayKey = (now) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

function Item({ block, onDone, onDismiss }) {
  const [editing, setEditing] = useState(false);
  const [time, setTime] = useState(() => suggestTime());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function confirm(e) {
    e.preventDefault();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { setError({ message: 'Escolha um horário válido.' }); return; }
    setBusy(true);
    setError(null);
    try {
      await api.addOnceBlock({
        date: todayKey(new Date()), startTime: time, durationMin: block.durationMin, courseId: block.courseId ?? undefined,
        ...(block.planId ? { fromPlanId: block.planId, fromDate: block.date } : {}),
      });
      // um avulso remarcado é "movido": o antigo sai para não aparecer de novo como perdido
      if (block.kind === 'once' && block.onceId) await api.removeOnceBlock(block.onceId).catch(() => {});
      onDone(`Pronto! Bloco marcado para hoje às ${hourText(time)}.`);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <li className="missed-item">
      <p style={{ margin: 0, fontWeight: 600 }}>{missedText(block)}</p>
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {!editing && <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>Remarcar para hoje</button>}
        <Link className="btn btn-sm" to={focusHref({ courseId: block.courseId, min: 25 })}>Estudar agora</Link>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onDismiss}>Dispensar</button>
      </div>
      {editing && (
        <form className="row" onSubmit={confirm} style={{ gap: 10, marginTop: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="field">
            <label htmlFor={`missed-time-${block.key}`}>Que horas hoje?</label>
            <input id={`missed-time-${block.key}`} className="input" type="time" min="08:00" max="22:00" value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>{busy ? 'Marcando…' : 'Confirmar'}</button>
          <button type="button" className="btn btn-sm" onClick={() => { setEditing(false); setError(null); }} disabled={busy}>Cancelar</button>
        </form>
      )}
      {error && <p role="alert" className="alert error" style={{ margin: '10px 0 0' }}>{error.message}</p>}
    </li>
  );
}

/** Aviso de blocos de estudo perdidos (só aparece quando existe algum). */
export function MissedBlocks({ onChanged }) {
  const list = useAsync(async () => { try { return await api.calendarMissed(); } catch { return []; } }, []);
  const [dismissed, setDismissed] = useState(() => readDismissed());
  const [message, setMessage] = useState(null);

  const visible = (list.data ?? []).filter((b) => !dismissed.includes(b.key));
  if (!message && visible.length === 0) return null;

  function dismiss(key) {
    const next = [...dismissed, key];
    setDismissed(next);
    saveDismissed(next);
  }

  return (
    <section className="card missed-card" aria-label="Blocos de estudo perdidos">
      <h2 className="card-title">Atrasado? Dá para remarcar</h2>
      <p role="status" aria-live="polite" style={{ margin: message ? '8px 0 0' : 0 }}>{message}</p>
      <ul className="missed-list">
        {visible.map((b) => (
          <Item key={b.key} block={b} onDismiss={() => dismiss(b.key)}
            onDone={(msg) => { setMessage(msg); list.reload(); onChanged?.(); }} />
        ))}
      </ul>
    </section>
  );
}
