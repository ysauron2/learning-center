import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync, useDebounced, useToast } from '../lib/hooks.js';
import { Icon } from '../components/Icon.jsx';
import { CourseCard } from '../components/CourseCard.jsx';
import { CourseForm } from '../components/CourseForm.jsx';
import { ManageOptions } from '../components/ManageOptions.jsx';
import { EmptyState, ErrorState, Skeleton, Toast } from '../components/ui.jsx';

const STATUS_FILTERS = [
  ['', 'Todos', 'total'],
  ['active', 'Em andamento', 'active'],
  ['paused', 'Pausados', 'paused'],
  ['planned', 'Planejados', 'planned'],
  ['completed', 'Concluídos', 'completed'],
];

export default function Courses() {
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [toast, showToast] = useToast();
  const navigate = useNavigate();
  const dq = useDebounced(q);

  const summary = useAsync(() => api.courseSummary(), []);
  const list = useAsync(() => api.courses({ status, platform, category, q: dq }), [status, platform, category, dq]);

  const total = summary.data?.total ?? 0;
  const filtering = Boolean(status || platform || category || dq);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Cursos</h1>
          <p className="page-sub">Tudo o que você estuda, de qualquer plataforma, em um só lugar.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" onClick={() => setManaging(true)}>Categorias e plataformas</button>
          <Link className="btn" to="/importar">Importar da Udemy</Link>
          <Link className="btn" to="/importar/link">Importar por link</Link>
          <Link className="btn" to="/importar-outras">Importar de outra plataforma</Link>
          <button className="btn btn-primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} strokeWidth={2.4} />Adicionar curso</button>
        </div>
      </header>

      {total > 0 && (
        <section className="filters" aria-label="Filtros">
          <label className="search">
            <Icon name="search" />
            <span className="sr-only">Pesquisar cursos</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar por título, tag ou plataforma" />
          </label>
          <div className="row" role="group" aria-label="Status" style={{ gap: 8 }}>
            {STATUS_FILTERS.map(([value, label, key]) => (
              <button key={label} className="chip" aria-pressed={status === value} onClick={() => setStatus(value)}>
                {label} · {summary.data?.[key] ?? 0}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
            <label className="sr-only" htmlFor="f-platform">Plataforma</label>
            <select id="f-platform" className="select" style={{ width: 'auto' }} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">Plataforma</option>
              {summary.data?.platforms.map((p) => <option key={p}>{p}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-category">Categoria</label>
            <select id="f-category" className="select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Categoria</option>
              {summary.data?.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </section>
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={list.refetch} />
      ) : list.loading && !list.data ? (
        <div className="course-grid"><Skeleton height={320} /><Skeleton height={320} /><Skeleton height={320} /></div>
      ) : list.data.length === 0 ? (
        filtering ? (
          <EmptyState icon="search" title="Nenhum curso encontrado"
            action={<button className="btn" onClick={() => { setStatus(''); setPlatform(''); setCategory(''); setQ(''); }}>Limpar filtros</button>}>
            Tente outra busca ou remova os filtros.
          </EmptyState>
        ) : (
          <EmptyState icon="courses" title="Sua biblioteca está vazia"
            action={<button className="btn btn-primary" onClick={() => setAdding(true)}>Adicionar primeiro curso</button>}>
            Cadastre cursos de qualquer plataforma e acompanhe o progresso manualmente.
          </EmptyState>
        )
      ) : (
        <section className="course-grid" aria-label="Lista de cursos">
          {list.data.map((c) => <CourseCard key={c.id} course={c} />)}
        </section>
      )}

      {adding && (
        <CourseForm onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); showToast('Curso adicionado'); summary.reload(); navigate(`/cursos/${c.id}`); }} />
      )}
      {managing && (
        <ManageOptions
          onClose={() => setManaging(false)}
          onChanged={() => { setPlatform(''); setCategory(''); summary.reload(); list.reload(); }}
        />
      )}
      <Toast message={toast} />
    </>
  );
}
