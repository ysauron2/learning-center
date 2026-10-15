import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { formatMinutes } from '../lib/format.js';
import { ChoiceOrNew } from '../components/ChoiceOrNew.jsx';
import { DEFAULT_CATEGORIES, DEFAULT_PLATFORMS } from '../lib/choices.js';
import { ErrorState } from '../components/ui.jsx';

const names = (list, fallback) => (list ? list.map((o) => o.name) : fallback);

function Steps({ items }) {
  return (
    <ol className="muted" style={{ margin: '0 0 14px', paddingLeft: 20, lineHeight: 1.7 }}>
      {items.map((t) => <li key={t}>{t}</li>)}
    </ol>
  );
}

/** Foca o bloco da prévia quando ele aparece (leitores de tela leem o resumo). */
function useFocusOnShow(show) {
  const ref = useRef(null);
  useEffect(() => { if (show) ref.current?.focus(); }, [show]);
  return ref;
}

function YoutubeTab({ options }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState('YouTube');
  const [category, setCategory] = useState('Geral');
  const [preview, setPreview] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(null); // 'preview' | 'import' | null
  const [error, setError] = useState(null);
  const headRef = useFocusOnShow(Boolean(preview));

  const reset = () => { setPreview(null); setError(null); };

  async function loadPreview(e) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy('preview');
    reset();
    try {
      const p = await api.youtubePreview({ url: url.trim() });
      setPreview(p);
      setPicked(new Set(p.videos.map((v) => v.id)));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function doImport() {
    setBusy('import');
    setError(null);
    try {
      const all = picked.size === preview.videos.length;
      const r = await api.importYoutube({
        url: url.trim(),
        ...(preview.existing ? {} : { platform: platform.trim() || undefined, category: category.trim() || undefined }),
        ...(all ? {} : { selectedVideoIds: [...picked] }),
      });
      const flash = r.created
        ? `Pronto! Importei ${r.lessonsAdded} vídeo(s) para o curso.`
        : r.lessonsAdded ? `Pronto! Acrescentei ${r.lessonsAdded} vídeo(s) novo(s) ao curso.` : 'Esse curso já estava completo. Não tinha vídeo novo.';
      navigate(`/cursos/${r.courseId}`, { state: { flash } });
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = preview ? preview.videos.filter((v) => picked.has(v.id)) : [];
  const chosenMin = chosen.reduce((n, v) => n + Math.max(1, Math.ceil(v.durationSec / 60)), 0);
  const nothingNew = preview?.existing && preview.existing.newVideos === 0;

  return (
    <div role="tabpanel" id="panel-youtube" aria-labelledby="tab-youtube">
      <Steps items={['Abra a playlist no YouTube e copie o link da barra do navegador.', 'Cole o link aqui embaixo e toque em “Ver prévia”.', 'Confira os vídeos e toque em “Importar”.']} />
      <form className="card" onSubmit={loadPreview}>
        <div className="field">
          <label htmlFor="yt-url">Link da playlist</label>
          <input id="yt-url" className="input" inputMode="url" autoComplete="off" value={url} placeholder="https://www.youtube.com/playlist?list=…"
            onChange={(e) => { setUrl(e.target.value); if (preview) reset(); }} />
          <span className="muted" style={{ fontSize: 12 }}>A playlist precisa ser pública ou não listada. Você não precisa entrar na sua conta.</span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!url.trim() || busy !== null}>{busy === 'preview' ? 'Lendo a playlist…' : 'Ver prévia'}</button>
        </div>
      </form>

      <div aria-live="polite" className="sr-only">{busy === 'preview' ? 'Lendo a playlist, aguarde.' : ''}</div>
      {error && <ErrorState error={error} />}

      {preview && (
        <section className="card" aria-label="Prévia da playlist" style={{ marginTop: 14 }}>
          <h2 className="card-title" tabIndex={-1} ref={headRef}>{preview.title}</h2>
          <p className="page-sub">
            {preview.channel ? `${preview.channel} · ` : ''}{preview.videoCount} vídeo(s) · {formatMinutes(preview.totalMin)} no total
          </p>
          {preview.skipped > 0 && <p className="alert" role="status">{preview.skipped} vídeo(s) privado(s) ou removido(s) foram pulados.</p>}
          {preview.truncated && <p className="alert" role="status">A playlist é grande: trouxe só os primeiros {preview.videoCount} vídeos.</p>}
          {preview.existing && (
            <p className="alert" role="status">
              Você já importou essa playlist (“{preview.existing.title}”). {preview.existing.newVideos
                ? `Vou acrescentar só os ${preview.existing.newVideos} vídeo(s) novo(s), sem duplicar.`
                : 'Não tem vídeo novo para acrescentar.'}
            </p>
          )}
          {!preview.existing && (
            <div className="row" style={{ gap: 12, margin: '12px 0' }}>
              <ChoiceOrNew id="yt-platform" label="Plataforma" value={platform} options={names(options?.platforms, DEFAULT_PLATFORMS)} onChange={setPlatform} newLabel="Nova plataforma…" placeholder="Ex.: Domestika" />
              <ChoiceOrNew id="yt-category" label="Categoria" value={category} options={names(options?.categories, DEFAULT_CATEGORIES)} onChange={setCategory} newLabel="Nova categoria…" placeholder="Ex.: Design" />
            </div>
          )}
          <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}>
            <legend className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
              Vídeos ({chosen.length} de {preview.videos.length} marcados)
              {' '}<button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set(preview.videos.map((v) => v.id)))}>Marcar todos</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicked(new Set())}>Desmarcar todos</button>
            </legend>
            <ul className="list" style={{ margin: 0, padding: 0, listStyle: 'none', maxHeight: 320, overflow: 'auto' }}>
              {preview.videos.map((v) => (
                <li key={`${v.id}`} style={{ padding: '6px 0', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <input type="checkbox" checked={picked.has(v.id)} onChange={() => toggle(v.id)} />
                    <span style={{ flex: 1 }}>{v.title}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{formatMinutes(Math.max(1, Math.ceil(v.durationSec / 60)))}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy !== null || chosen.length === 0 || nothingNew} onClick={doImport}>
              {busy === 'import' ? 'Importando…' : nothingNew ? 'Nada novo para importar' : preview.existing ? 'Acrescentar vídeos novos' : `Importar ${chosen.length} vídeo(s) · ${formatMinutes(chosenMin)}`}
            </button>
            <button className="btn" disabled={busy !== null} onClick={reset}>Cancelar</button>
          </div>
        </section>
      )}
    </div>
  );
}

function TextTab({ options }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', platform: 'Outro', category: 'Geral', url: '', text: '' });
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('acrescentar');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const headRef = useFocusOnShow(Boolean(preview));

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setPreview(null); setError(null); };
  const body = () => ({
    title: form.title.trim(),
    platform: form.platform.trim() || undefined,
    category: form.category.trim() || undefined,
    url: form.url.trim() || undefined,
    text: form.text,
  });
  const ready = form.title.trim() && form.text.trim();

  async function loadPreview(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy('preview');
    setError(null);
    setPreview(null);
    try {
      const p = await api.textPreview(body());
      setPreview(p);
      setMode('acrescentar');
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function doImport() {
    setBusy('import');
    setError(null);
    try {
      const r = await api.importText({ ...body(), ...(preview.existing ? { mode: mode === 'novo' ? 'novo' : 'acrescentar' } : {}) });
      const flash = r.created ? `Pronto! Criei o curso com ${r.lessonsAdded} aula(s).` : r.lessonsAdded ? `Pronto! Acrescentei ${r.lessonsAdded} aula(s) nova(s).` : 'Nenhuma aula nova: o curso já tinha todas.';
      navigate(`/cursos/${r.courseId}`, { state: { flash } });
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  return (
    <div role="tabpanel" id="panel-text" aria-labelledby="tab-text">
      <Steps items={['Copie a lista de aulas do curso (do site, de um PDF ou do seu caderno).', 'Cole na caixa abaixo, uma aula por linha. Se souber o tempo, escreva junto: “Aula 1 | 12:30”.', 'Toque em “Ver prévia”, confira e importe.']} />
      <form className="card" onSubmit={loadPreview}>
        <div className="field">
          <label htmlFor="tx-title">Título do curso</label>
          <input id="tx-title" className="input" maxLength={160} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="row" style={{ gap: 12, margin: '12px 0' }}>
          <ChoiceOrNew id="tx-platform" label="Plataforma" value={form.platform} options={names(options?.platforms, DEFAULT_PLATFORMS)} onChange={(v) => set({ platform: v })} newLabel="Nova plataforma…" placeholder="Ex.: Domestika" />
          <ChoiceOrNew id="tx-category" label="Categoria" value={form.category} options={names(options?.categories, DEFAULT_CATEGORIES)} onChange={(v) => set({ category: v })} newLabel="Nova categoria…" placeholder="Ex.: Design" />
        </div>
        <div className="field">
          <label htmlFor="tx-url">Link do curso (opcional)</label>
          <input id="tx-url" className="input" inputMode="url" autoComplete="off" value={form.url} placeholder="https://…" onChange={(e) => set({ url: e.target.value })} />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label htmlFor="tx-text">Lista de aulas</label>
          <textarea id="tx-text" className="input" rows={10} value={form.text} onChange={(e) => set({ text: e.target.value })}
            placeholder={'Módulo 1: Começando\n1. Boas-vindas | 3:20\n2. Instalação - 8 min\nMódulo 2: Prática\nPrimeiro projeto (1h05)'} />
          <span className="muted" style={{ fontSize: 12 }}>Linhas como “Módulo 2: …” ou terminadas em “:” abrem um módulo novo. Sem tempo, conto 10 min por aula.</span>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" disabled={!ready || busy !== null}>{busy === 'preview' ? 'Lendo a lista…' : 'Ver prévia'}</button>
        </div>
      </form>

      {error && <ErrorState error={error} />}

      {preview && (
        <section className="card" aria-label="Prévia da lista" style={{ marginTop: 14 }}>
          <h2 className="card-title" tabIndex={-1} ref={headRef}>{form.title.trim()}</h2>
          <p className="page-sub">{preview.moduleCount} módulo(s) · {preview.lessonCount} aula(s) · {formatMinutes(preview.totalMin)} no total</p>
          {preview.warnings.length > 0 && (
            <ul className="alert" role="status" style={{ margin: '8px 0', paddingLeft: 24 }}>
              {preview.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          {preview.existing && (
            <fieldset className="alert" style={{ margin: '8px 0' }}>
              <legend>Já existe um curso com esse nome nessa plataforma (“{preview.existing.title}”). O que fazer?</legend>
              <label style={{ display: 'block' }}><input type="radio" name="tx-mode" checked={mode === 'acrescentar'} onChange={() => setMode('acrescentar')} /> Acrescentar só as aulas que faltam nele</label>
              <label style={{ display: 'block' }}><input type="radio" name="tx-mode" checked={mode === 'novo'} onChange={() => setMode('novo')} /> Criar um curso novo mesmo assim</label>
            </fieldset>
          )}
          <div style={{ maxHeight: 320, overflow: 'auto', margin: '8px 0' }}>
            {preview.modules.map((m, i) => (
              <div key={`${m.title}-${i}`} style={{ marginBottom: 10 }}>
                <h3 style={{ fontSize: 15, margin: '4px 0' }}>{m.title}</h3>
                <ul className="list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {m.lessons.map((l, j) => (
                    <li key={j} style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
                      <span style={{ flex: 1 }}>{l.title}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{l.estimated ? `~${formatMinutes(l.durationMin)} (estimado)` : formatMinutes(l.durationMin)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" disabled={busy !== null} onClick={doImport}>
              {busy === 'import' ? 'Importando…' : preview.existing && mode === 'acrescentar' ? 'Acrescentar aulas' : 'Importar'}
            </button>
            <button className="btn" disabled={busy !== null} onClick={() => setPreview(null)}>Voltar e editar</button>
          </div>
        </section>
      )}
    </div>
  );
}

export default function ImportOther() {
  const [tab, setTab] = useState('youtube');
  const opts = useAsync(() => api.options(), []);

  const tabs = [['youtube', 'Playlist do YouTube'], ['text', 'Colar lista de aulas']];
  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    setTab((t) => (t === 'youtube' ? 'text' : 'youtube'));
    requestAnimationFrame(() => document.querySelector('[role="tab"][aria-selected="true"]')?.focus());
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Importar de outra plataforma</h1>
          <p className="page-sub">Traga um curso de uma playlist do YouTube ou de uma lista de aulas que você colar. Você confere antes de salvar.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn" to="/importar">Importar da Udemy</Link>
          <Link className="btn" to="/cursos">Voltar</Link>
        </div>
      </header>

      <div className="row" role="tablist" aria-label="Como importar" style={{ gap: 8, marginBottom: 14 }} onKeyDown={onKey}>
        {tabs.map(([key, label]) => (
          <button key={key} id={`tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`} tabIndex={tab === key ? 0 : -1}
            className="chip" onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'youtube' ? <YoutubeTab options={opts.data} /> : <TextTab options={opts.data} />}
    </>
  );
}
