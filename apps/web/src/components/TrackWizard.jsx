import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { selectionNumbers, toggleSelection } from '../lib/tracks.js';
import { Modal } from './ui.jsx';

/**
 * Criar uma trilha em um passo só: dar um nome e marcar os cursos na ordem em que quer fazer.
 * `suggestions` (opcional) são atalhos que preenchem nome e cursos.
 */
export function TrackWizard({ courses, suggestions = [], preset, onClose, onCreated }) {
  const [title, setTitle] = useState(preset?.title ?? '');
  const [selected, setSelected] = useState(preset?.courseIds ?? []);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const numbers = selectionNumbers(selected);

  const fill = (s) => { setTitle(s.title); setSelected(s.courseIds); };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(await api.createTrack({ title, courseIds: selected }));
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  const titleError = error?.details?.find((d) => d.path === 'title')?.message;

  return (
    <Modal title="Nova trilha" onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 18 }}>
        <p className="muted" style={{ margin: 0 }}>
          Uma trilha é a ordem em que você quer fazer seus cursos. Ela avança sozinha conforme você estuda.
        </p>

        {suggestions.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Atalhos (preenchem tudo para você)</div>
            <div className="row" style={{ gap: 8 }}>
              {suggestions.map((s) => (
                <button key={s.title} type="button" className="chip" onClick={() => fill(s)}>{s.title} · {s.courseIds.length} cursos</button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="tw-title"><strong>1.</strong> Dê um nome à trilha</label>
          <input id="tw-title" className="input" value={title} maxLength={120} required placeholder="Ex.: Quero aprender Redes"
            aria-invalid={Boolean(titleError)} onChange={(e) => setTitle(e.target.value)} />
          {titleError && <span className="error-text">{titleError}</span>}
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}><strong>2.</strong> Marque os cursos, na ordem em que quer fazer</legend>
          {courses.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Você ainda não tem cursos. <Link to="/importar" onClick={onClose}>Importe da Udemy</Link> ou <Link to="/cursos" onClick={onClose}>cadastre um curso</Link> primeiro. Você também pode criar a trilha vazia e adicionar etapas depois.
            </p>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>O número mostra a ordem em que você marcou. Dá para mudar a ordem depois.</p>
              <ul className="wizard-courses">
                {courses.map((c) => {
                  const n = numbers.get(c.id);
                  return (
                    <li key={c.id}>
                      <label className={`wizard-course${n ? ' on' : ''}`}>
                        <input type="checkbox" checked={Boolean(n)} onChange={() => setSelected((ids) => toggleSelection(ids, c.id))} />
                        <span className="wizard-num" aria-hidden="true">{n ?? ''}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <strong>{c.title}</strong>
                          <span className="muted" style={{ display: 'block', fontSize: 12 }}>{c.platform} · {c.category} · {c.progress}%</span>
                        </span>
                        {n && <span className="sr-only">Posição {n}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </fieldset>

        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Depois de criar, você pode adicionar provas, projetos ou livros como etapas avulsas.
        </p>

        {error && !titleError && <p className="alert error" role="alert">{error.message}</p>}
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Criando…' : selected.length ? `Criar trilha com ${selected.length} ${selected.length === 1 ? 'curso' : 'cursos'}` : 'Criar trilha'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
