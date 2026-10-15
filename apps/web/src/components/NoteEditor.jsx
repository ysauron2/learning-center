import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { formatTags, lessonOptions, parseTags, saveStatusText } from '../lib/notes.js';
import { Markdown } from './Markdown.jsx';
import { ErrorState, Skeleton } from './ui.jsx';

const AUTOSAVE_MS = 1500;
const blank = (preset) => ({
  title: '',
  body: '',
  tagsText: '',
  courseId: preset?.courseId ? String(preset.courseId) : '',
  lessonId: preset?.lessonId ? String(preset.lessonId) : '',
});

/**
 * Editor de uma anotação em Markdown. Anotação nova só é criada ao clicar em Salvar;
 * as já existentes salvam sozinhas pouco depois de você parar de digitar.
 */
export function NoteEditor({ noteId, preset, courses, onChanged, onCreated, onDeleted, onClose }) {
  const isNew = noteId === 'nova';
  const loaded = useAsync(() => (isNew ? Promise.resolve(null) : api.note(Number(noteId))), [noteId]);
  const [form, setForm] = useState(() => blank(preset));
  const [status, setStatus] = useState(isNew ? 'new' : 'saved');
  const [mode, setMode] = useState('edit');
  const [error, setError] = useState(null);
  const editVersion = useRef(0);
  const saving = useRef(false);

  // Preenche o formulário quando a anotação chega do servidor.
  useEffect(() => {
    const n = loaded.data;
    if (n) {
      setForm({
        title: n.title,
        body: n.body,
        tagsText: formatTags(n.tags),
        courseId: n.courseId ? String(n.courseId) : '',
        lessonId: n.lessonId ? String(n.lessonId) : '',
      });
      setStatus('saved');
      editVersion.current = 0;
    }
  }, [loaded.data]);

  const course = useAsync(() => (form.courseId ? api.course(Number(form.courseId)) : Promise.resolve(null)), [form.courseId]);
  const lessons = lessonOptions(course.data);

  const change = (patch) => {
    editVersion.current += 1;
    setForm((f) => ({ ...f, ...patch }));
    setStatus(isNew ? 'new' : 'dirty');
  };

  const save = useCallback(async () => {
    if (saving.current) return;
    const payload = {
      title: form.title,
      body: form.body,
      tags: parseTags(form.tagsText),
      courseId: form.courseId ? Number(form.courseId) : null,
      lessonId: form.lessonId ? Number(form.lessonId) : null,
    };
    const version = editVersion.current;
    saving.current = true;
    setStatus('saving');
    setError(null);
    try {
      if (isNew) {
        const created = await api.createNote(payload);
        onChanged();
        onCreated(created.id);
        return;
      }
      await api.updateNote(Number(noteId), payload);
      setStatus(editVersion.current === version ? 'saved' : 'dirty'); // digitou durante o salvamento: salva de novo
      onChanged();
    } catch (err) {
      setError(err);
      setStatus('error');
    } finally {
      saving.current = false;
    }
  }, [form, isNew, noteId, onChanged, onCreated]);

  // Salvamento automático (só para anotações que já existem).
  useEffect(() => {
    if (isNew || status !== 'dirty') return undefined;
    const t = setTimeout(save, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [isNew, status, save]);

  async function remove() {
    if (!window.confirm('Apagar esta anotação? Não dá para desfazer.')) return;
    try {
      await api.deleteNote(Number(noteId));
      onChanged();
      onDeleted();
    } catch (err) {
      setError(err);
    }
  }

  if (!isNew && loaded.loading && !loaded.data) return <section className="card"><Skeleton height={320} /></section>;
  if (!isNew && loaded.error) return <ErrorState error={loaded.error} onRetry={loaded.refetch} />;

  const onKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };

  return (
    <section className="card note-editor" aria-label="Editor de anotação" onKeyDown={onKeyDown}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-sm notes-back" onClick={onClose}>← Voltar à lista</button>
        <span className="muted" role="status" aria-live="polite" style={{ fontSize: 13 }}>{saveStatusText(status)}</span>
      </div>

      {error && <p className="alert error" role="alert">{error.details?.[0]?.message ?? error.message}</p>}

      <div className="field">
        <label htmlFor="ne-title">Título</label>
        <input id="ne-title" className="input" value={form.title} maxLength={200} placeholder="Ex.: Modelo OSI em 7 camadas"
          onChange={(e) => change({ title: e.target.value })} />
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: '1 1 220px' }}>
          <label htmlFor="ne-course">Curso (opcional)</label>
          <select id="ne-course" className="select" value={form.courseId} onChange={(e) => change({ courseId: e.target.value, lessonId: '' })}>
            <option value="">Sem curso</option>
            {(courses ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
        {form.courseId && lessons.length > 0 && (
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="ne-lesson">Aula (opcional)</label>
            <select id="ne-lesson" className="select" value={form.lessonId} onChange={(e) => change({ lessonId: e.target.value })}>
              <option value="">Sem aula</option>
              {lessons.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="ne-tags">Tags (separadas por vírgula)</label>
        <input id="ne-tags" className="input" value={form.tagsText} placeholder="redes, resumo"
          onChange={(e) => change({ tagsText: e.target.value })} />
      </div>

      <div className="row" role="group" aria-label="Modo" style={{ gap: 8 }}>
        <button className="chip" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Escrever</button>
        <button className="chip" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>Visualizar</button>
        <span className="muted" style={{ fontSize: 12 }}>Aceita Markdown: # título, **negrito**, listas, tabelas e - [ ] tarefas.</span>
      </div>

      {mode === 'edit' ? (
        <div className="field">
          <label htmlFor="ne-body" className="sr-only">Texto da anotação</label>
          <textarea id="ne-body" className="textarea note-body" value={form.body} maxLength={100000}
            placeholder="Escreva aqui…" onChange={(e) => change({ body: e.target.value })} />
        </div>
      ) : (
        <div className="note-preview" aria-label="Visualização">
          {form.body.trim() ? <Markdown>{form.body}</Markdown> : <p className="muted">Nada escrito ainda.</p>}
        </div>
      )}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn-primary" onClick={save} disabled={status === 'saving'}>
          {isNew ? 'Criar anotação' : 'Salvar agora'}
        </button>
        {!isNew && <button className="btn" onClick={remove}>Apagar</button>}
      </div>
    </section>
  );
}
