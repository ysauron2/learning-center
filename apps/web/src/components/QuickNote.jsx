import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';

export const NOTE_MAX = 100000; // o mesmo limite do módulo de anotações
const DRAFT_KEY = 'lume-anotacao-rapida';

const readDraft = () => { try { return localStorage.getItem(DRAFT_KEY) ?? ''; } catch { return ''; } };
const writeDraft = (v) => {
  try { if (v) localStorage.setItem(DRAFT_KEY, v); else localStorage.removeItem(DRAFT_KEY); } catch { /* sem armazenamento: só não guarda o rascunho */ }
};

/** Título automático: a primeira linha com o Markdown tirado (até 80 caracteres) ou "Anotação rápida · dd/mm". */
export function autoTitle(text, now = new Date()) {
  const first = text.split(/\r?\n/).map((l) => l.replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/, '').replace(/[*_`~[\]]/g, '').trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) ?? '';
  if (first) return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first;
  const p = (n) => String(n).padStart(2, '0');
  return `Anotação rápida · ${p(now.getDate())}/${p(now.getMonth() + 1)}`;
}

/** Cartão "O que você aprendeu hoje?" do Início: salva uma anotação ligada a um curso. */
export function QuickNote({ defaultCourseId = null }) {
  const [text, setText] = useState(readDraft);
  const [courseId, setCourseId] = useState(defaultCourseId ? String(defaultCourseId) : '');
  const [touchedCourse, setTouchedCourse] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null);
  const ref = useRef(null);
  const courses = useAsync(async () => { try { return await api.courses({ status: 'active' }); } catch { return []; } }, []);

  // o padrão acompanha a "próxima ação" até a pessoa escolher outro curso
  useEffect(() => {
    if (!touchedCourse) setCourseId(defaultCourseId ? String(defaultCourseId) : '');
  }, [defaultCourseId, touchedCourse]);

  const list = courses.data ?? [];
  const empty = text.trim().length === 0;

  function change(v) {
    setText(v);
    writeDraft(v);
  }

  async function submit(e) {
    e.preventDefault();
    if (empty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const note = await api.createNote({ title: autoTitle(text), body: text, courseId: courseId ? Number(courseId) : null });
      setSaved(note);
      setText('');
      writeDraft('');
      ref.current?.focus();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card quick-card" aria-label="Anotação rápida">
      <h2 className="card-title"><label htmlFor="quick-note-text">O que você aprendeu hoje?</label></h2>
      <form onSubmit={submit} style={{ display: 'grid', gap: 12, marginTop: 10 }}>
        <textarea id="quick-note-text" ref={ref} className="textarea" rows={4} maxLength={NOTE_MAX} value={text} onChange={(e) => change(e.target.value)}
          placeholder="Escreva em poucas palavras. Dá para usar Markdown simples (# título, - lista, **negrito**)." />
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="quick-note-course">Curso</label>
          <select id="quick-note-course" className="select" value={courseId} onChange={(e) => { setTouchedCourse(true); setCourseId(e.target.value); }}>
            <option value="">Sem curso</option>
            {courseId && !list.some((c) => String(c.id) === courseId) && <option value={courseId}>Curso da próxima ação</option>}
            {list.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={empty || busy}>{busy ? 'Salvando…' : 'Salvar anotação'}</button>
          <span role="status" aria-live="polite" style={{ fontSize: 14 }}>
            {saved && <>Anotação salva. <Link to={`/anotacoes/${saved.id}`}>Ver anotação</Link></>}
          </span>
        </div>
        {error && <p role="alert" className="alert error" style={{ margin: 0 }}>{error.details?.[0]?.message ?? error.message}</p>}
      </form>
    </section>
  );
}
