// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: {
    course: vi.fn().mockResolvedValue({ id: 5, title: 'Curso X', platform: 'YouTube', category: 'Geral', description: '', url: null, imageUrl: null, status: 'planned', progress: 0, totalLessons: 0, doneLessons: 0, studiedMinutes: 0, tags: [], modules: [] }),
    sessions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock('../components/CourseNotes.jsx', () => ({ CourseNotes: () => null }));
import CourseDetail from './CourseDetail.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('detalhe do curso · mensagem de quem levou até aqui', () => {
  it('mostra a mensagem recebida em location.state.flash (ex.: depois de importar)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      createRoot(container).render(
        <MemoryRouter initialEntries={[{ pathname: '/cursos/5', state: { flash: 'Pronto! Importei 3 vídeo(s) para o curso.' } }]}>
          <Routes><Route path="/cursos/:id" element={<CourseDetail />} /></Routes>
        </MemoryRouter>,
      );
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(container.querySelector('.toast').textContent).toBe('Pronto! Importei 3 vídeo(s) para o curso.');
  });
});
