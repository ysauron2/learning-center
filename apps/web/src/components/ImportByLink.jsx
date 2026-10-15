import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { formatMinutes } from '../lib/format.js';
import { DEFAULT_CATEGORIES } from '../lib/choices.js';
import { IMPORT_PLATFORMS } from '../lib/platforms.js';
import { ChoiceOrNew } from './ChoiceOrNew.jsx';
import { ErrorState } from './ui.jsx';

const MAX_MODULES_SHOWN = 12;

/**
 * Importar por link: a pessoa cola o endereço público de um curso (Alura ou Fundação Bradesco),
 * vê a prévia e confirma. Sem login. Tudo que vem do site aparece como texto.
 */
export function ImportByLink({ platform }) {
  const hint = platform ? IMPORT_PLATFORMS[platform] : null;
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('Geral');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // 'preview' | 'import' | null
  const opts = useAsync(() => api.options(), []);
  const headRef = useRef(null);
  useEffect(() => { if (preview) headRef.current?.focus(); }, [preview]);

  const reset = () => { setPreview(null); setResult(null); setError(null); };

  async function loadPreview(e) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy('preview');
    reset();
    try {
      setPreview(await api.linkPreview(url.trim()));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    setBusy('import');
    setError(null);
    try {
      setResult(await api.importLink(url.trim(), preview.existing ? undefined : category.trim() || undefined));
      setPreview(null);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const shown = preview ? preview.modules.slice(0, MAX_MODULES_SHOWN) : [];
  const platformName = preview ? IMPORT_PLATFORMS[preview.platform]?.name ?? '' : '';

  return (
    <section className="card" aria-label="Importar por link">
      <h2 className="card-title">Importar por link</h2>
      <ol className="muted" style={{ margin: '0 0 14px', paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Abra o curso no navegador e copie o endereço (o link) da página dele.</li>
        <li>Cole aqui e clique em <strong>Ver prévia</strong>.</li>
        <li>Confira e clique em <strong>Importar</strong>. Não precisa entrar na sua conta.</li>
      </ol>
      {hint?.linkNote && <p className="page-sub">{hint.linkNote}</p>}

      <form onSubmit={loadPreview} className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 320px' }}>
          <label htmlFor="link-url">Link do curso</label>
          <input id="link-url" className="input" type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }}
            placeholder={hint?.linkExample ?? 'https://www.alura.com.br/curso-online-… ou https://www.ev.org.br/cursos/…'} autoComplete="off" />
        </div>
        <button className="btn btn-primary" type="submit" disabled={!url.trim() || Boolean(busy)}>{busy === 'preview' ? 'Lendo a página…' : 'Ver prévia'}</button>
      </form>

      {error && <div style={{ marginTop: 12 }}><ErrorState error={error} /></div>}

      {preview && (
        <div style={{ marginTop: 16 }} aria-label="Prévia do curso">
          <h3 className="card-title" tabIndex={-1} ref={headRef}>{preview.title}</h3>
          <p className="page-sub">
            {platformName}
            {preview.workloadMin ? ` · ${formatMinutes(preview.workloadMin)} de carga horária` : ''}
            {` · ${preview.moduleCount} módulo(s) · ${preview.lessonCount} aula(s)`}
          </p>
          {preview.imageUrl && <img src={preview.imageUrl} alt="" style={{ maxWidth: 240, borderRadius: 8, margin: '8px 0' }} />}
          {preview.description && <p style={{ whiteSpace: 'pre-line' }}>{preview.description}</p>}
          {preview.warnings.map((w) => <p key={w} role="status" className="muted">{w}</p>)}
          {shown.map((m) => (
            <details key={m.title} style={{ margin: '4px 0' }}>
              <summary>{m.title} ({m.lessons.length})</summary>
              <ul>{m.lessons.map((l, i) => <li key={`${i}-${l.title}`}>{l.title}</li>)}</ul>
            </details>
          ))}
          {preview.modules.length > shown.length && <p className="muted">…e mais {preview.modules.length - shown.length} módulo(s).</p>}

          {preview.existing ? (
            <p role="status" style={{ marginTop: 12 }}>
              Esse curso já está no Lume: <strong>{preview.existing.title}</strong>.{' '}
              {preview.existing.newLessons ? `Vamos acrescentar ${preview.existing.newLessons} aula(s) nova(s), sem mexer no que você já marcou.` : 'Não há aulas novas.'}
            </p>
          ) : (
            <div style={{ marginTop: 12, maxWidth: 360 }}>
              <ChoiceOrNew id="link-category" label="Categoria do curso" value={category} options={opts.data ? opts.data.categories.map((c) => c.name) : DEFAULT_CATEGORIES}
                onChange={setCategory} newLabel="Nova categoria…" placeholder="Ex.: Design" />
            </div>
          )}
          <div className="row" style={{ gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" disabled={Boolean(busy)} onClick={confirm}>
              {busy === 'import' ? 'Importando…' : preview.existing ? 'Atualizar curso' : 'Importar curso'}
            </button>
            <button className="btn" disabled={Boolean(busy)} onClick={reset}>Cancelar</button>
          </div>
        </div>
      )}

      {result && (
        <div role="status" aria-live="polite" style={{ marginTop: 16 }}>
          <h3 className="card-title">Pronto!</h3>
          <p>
            {result.created ? 'Curso criado' : 'Curso atualizado'}: <strong>{result.title}</strong>
            {result.lessonsAdded ? ` (${result.lessonsAdded} aula(s) ${result.created ? 'importada(s)' : 'nova(s)'})` : ''}.
          </p>
          {result.warnings.map((w) => <p key={w} className="muted">{w}{' '}<Link to="/importar-outras">Colar lista de aulas</Link></p>)}
          <Link className="btn btn-primary" to={`/cursos/${result.courseId}`}>Ver o curso</Link>
        </div>
      )}
    </section>
  );
}
