import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/hooks.js';
import { suggestTracks } from '../lib/tracks.js';
import { Icon } from '../components/Icon.jsx';
import { TrackWizard } from '../components/TrackWizard.jsx';
import { ErrorState, ProgressBar, Skeleton } from '../components/ui.jsx';

/** Exemplo estático, só para mostrar o que é uma trilha antes de a pessoa criar a primeira. */
function TrackExample() {
  const steps = [
    { n: 1, title: 'Redes de Computadores', note: 'Concluído', pct: 100, tone: 'green' },
    { n: 2, title: 'Linux para Profissionais', note: 'Próxima etapa', pct: 40, next: true },
    { n: 3, title: 'Prova de certificação', note: 'Etapa avulsa', pct: 0 },
  ];
  return (
    <div className="track-example" role="img" aria-label="Exemplo de trilha com três etapas: um curso concluído, um curso em andamento e uma prova">
      <div className="muted" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.5px' }}>EXEMPLO</div>
      <strong>Caminho para trabalhar com segurança</strong>
      <ol aria-hidden="true">
        {steps.map((s) => (
          <li key={s.n} className={s.next ? 'next' : ''}>
            <span className="step-num">{s.n}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {s.title} <span className="muted" style={{ fontSize: 12 }}>· {s.note}</span>
              <ProgressBar value={s.pct} tone={s.tone ?? ''} label={s.title} />
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function Tracks() {
  const [wizard, setWizard] = useState(null); // null | { preset? }
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const tracks = useAsync(() => api.tracks(), []);
  const courses = useAsync(() => api.courses(), []);

  const list = tracks.data;
  const allCourses = courses.data ?? [];
  const suggestions = suggestTracks(allCourses, list ?? []);
  const titleOf = (id) => allCourses.find((c) => c.id === id)?.title ?? '';

  async function createSuggested(s) {
    setBusy(s.title);
    setError(null);
    try {
      const saved = await api.createTrack({ title: s.title, courseIds: s.courseIds });
      navigate(`/trilhas/${saved.id}`);
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  const openWizard = (preset) => setWizard({ preset });

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Trilhas</h1>
          <p className="page-sub">Escolha a ordem em que quer fazer seus cursos. O app mostra o quanto você já andou e o que fazer agora.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openWizard()}>
          <Icon name="plus" size={16} strokeWidth={2.4} />Criar trilha
        </button>
      </header>

      {(tracks.loading && !list) && <Skeleton height={200} />}
      {tracks.error && <ErrorState error={tracks.error} onRetry={tracks.refetch} />}
      {error && <p className="alert error" role="alert">{error.message}</p>}

      {list && list.length === 0 && (
        <section className="card track-intro" aria-label="O que é uma trilha">
          <div>
            <h2 className="card-title" style={{ fontSize: 20 }}>O que é uma trilha?</h2>
            <p>
              É um <strong>roteiro</strong>: a lista dos seus cursos na ordem em que você quer fazer. Conforme você assiste às aulas, a trilha
              avança <strong>sozinha</strong> e mostra qual é a próxima etapa.
            </p>
            <h3 className="an-sub" style={{ marginTop: 16 }}>Como criar, em 3 passos</h3>
            <ol className="track-howto">
              <li>Clique em <strong>Criar trilha</strong>.</li>
              <li>Dê um nome e <strong>marque os cursos</strong> na ordem em que quer fazer.</li>
              <li>Pronto! A trilha mostra a <strong>Próxima</strong> etapa. Para ver funcionando, marque uma aula como concluída em um dos cursos e volte aqui.</li>
            </ol>
            <button className="btn btn-primary" onClick={() => openWizard()} style={{ marginTop: 8 }}>Criar minha primeira trilha</button>
          </div>
          <TrackExample />
        </section>
      )}

      {suggestions.length > 0 && (
        <section aria-label="Sugestões de trilha">
          <h2 className="card-title" style={{ margin: '4px 0 12px' }}>Sugestões feitas com os seus cursos</h2>
          <div className="course-grid">
            {suggestions.map((s) => (
              <article key={s.title} className="card track-card">
                <h3 className="card-title">{s.title}</h3>
                <p className="muted track-desc">{s.courseIds.map(titleOf).join(' → ')}</p>
                <div className="row" style={{ gap: 8, marginTop: 'auto' }}>
                  <button className="btn btn-primary" disabled={busy !== null} onClick={() => createSuggested(s)}>
                    {busy === s.title ? 'Criando…' : 'Criar esta trilha'}
                  </button>
                  <button className="btn" disabled={busy !== null} onClick={() => openWizard(s)}>Ajustar antes</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {list && list.length > 0 && (
        <section aria-label="Suas trilhas">
          {suggestions.length > 0 && <h2 className="card-title" style={{ margin: '8px 0 12px' }}>Suas trilhas</h2>}
          <div className="course-grid">
            {list.map((t) => (
              <article key={t.id} className="card track-card">
                <h2 className="card-title"><Link to={`/trilhas/${t.id}`}>{t.title}</Link></h2>
                {t.description && <p className="muted track-desc">{t.description}</p>}
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginTop: 'auto' }}>
                  <span>{t.doneItems} de {t.totalItems} {t.totalItems === 1 ? 'etapa' : 'etapas'}</span>
                  <b>{t.progress}%</b>
                </div>
                <ProgressBar value={t.progress} tone={t.progress >= 100 ? 'green' : ''} label={`Progresso da trilha ${t.title}`} />
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {t.totalItems === 0 ? 'Sem etapas ainda.' : t.next ? `Próxima: ${t.next.title}` : 'Trilha concluída!'}
                </p>
                <Link className="btn" to={`/trilhas/${t.id}`}>Abrir</Link>
              </article>
            ))}
          </div>
        </section>
      )}

      {wizard && (
        <TrackWizard
          courses={allCourses}
          suggestions={suggestions}
          preset={wizard.preset}
          onClose={() => setWizard(null)}
          onCreated={(saved) => { setWizard(null); navigate(`/trilhas/${saved.id}`); }}
        />
      )}
    </>
  );
}
