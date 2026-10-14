import { useState } from 'react';
import { Modal } from './ui.jsx';
import { api } from '../lib/api.js';
import { STATUS_LABEL } from '../lib/format.js';

const PLATFORMS = ['Udemy', 'Alura', 'Coursera', 'YouTube', 'Faculdade', 'NetAcad', 'Livro', 'Outro'];
const CATEGORIES = ['Cibersegurança', 'Redes', 'Linux', 'Desenvolvimento', 'Certificação', 'Geral'];

/** Cadastro/edição manual de curso (não depende de nenhuma API externa). */
export function CourseForm({ course, onClose, onSaved }) {
  const editing = Boolean(course);
  const [form, setForm] = useState({
    title: course?.title ?? '',
    platform: course?.platform ?? 'Udemy',
    category: course?.category ?? 'Geral',
    status: course?.status ?? 'active',
    url: course?.url ?? '',
    imageUrl: course?.imageUrl ?? '',
    description: course?.description ?? '',
    tags: (course?.tags ?? []).join(', '),
    manualProgress: course?.manualProgress ?? 0,
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const fieldError = (name) => error?.details?.find((d) => d.path === name)?.message;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title,
      platform: form.platform,
      category: form.category,
      status: form.status,
      description: form.description,
      url: form.url.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      manualProgress: Number(form.manualProgress) || 0,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    try {
      const saved = editing ? await api.updateCourse(course.id, payload) : await api.createCourse(payload);
      onSaved(saved);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  const hasLessons = (course?.totalLessons ?? 0) > 0;

  return (
    <Modal title={editing ? 'Editar curso' : 'Adicionar curso'} onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'grid', gap: 16 }}>
        <div className="field">
          <label htmlFor="cf-title">Título</label>
          <input id="cf-title" className="input" value={form.title} onChange={set('title')} required
            aria-invalid={Boolean(fieldError('title'))} aria-describedby="cf-title-err" placeholder="Ex.: Redes de Computadores" />
          {fieldError('title') && <span id="cf-title-err" className="error-text">{fieldError('title')}</span>}
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="cf-platform">Plataforma</label>
            <input id="cf-platform" className="input" list="cf-platforms" value={form.platform} onChange={set('platform')} />
            <datalist id="cf-platforms">{PLATFORMS.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="cf-category">Categoria</label>
            <input id="cf-category" className="input" list="cf-categories" value={form.category} onChange={set('category')} />
            <datalist id="cf-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="cf-status">Status</label>
            <select id="cf-status" className="select" value={form.status} onChange={set('status')}>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="cf-progress">Progresso manual: {form.manualProgress}%</label>
            <input id="cf-progress" type="range" min="0" max="100" step="5" value={form.manualProgress}
              onChange={set('manualProgress')} disabled={hasLessons} style={{ minHeight: 46 }}
              aria-describedby="cf-progress-hint" />
            <span id="cf-progress-hint" className="muted" style={{ fontSize: 12 }}>
              {hasLessons ? 'O progresso é calculado pelas aulas concluídas.' : 'Use quando não quiser cadastrar aulas.'}
            </span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="cf-tags">Tags (separadas por vírgula)</label>
          <input id="cf-tags" className="input" value={form.tags} onChange={set('tags')} placeholder="redes, fundamentos" />
        </div>
        <div className="field">
          <label htmlFor="cf-url">Link do curso (opcional)</label>
          <input id="cf-url" className="input" type="url" value={form.url} onChange={set('url')} placeholder="https://" />
          {fieldError('url') && <span className="error-text">Informe um link válido.</span>}
        </div>
        <div className="field">
          <label htmlFor="cf-img">Imagem de capa (opcional)</label>
          <input id="cf-img" className="input" type="url" value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://" />
          {fieldError('imageUrl') && <span className="error-text">Informe um link https de imagem.</span>}
        </div>
        <div className="field">
          <label htmlFor="cf-desc">Descrição (opcional)</label>
          <textarea id="cf-desc" className="textarea" value={form.description} onChange={set('description')} />
        </div>
        {error && !error.details && <div className="alert error" role="alert">{error.message}</div>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar curso'}</button>
        </div>
      </form>
    </Modal>
  );
}
