// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

vi.mock('../lib/api.js', () => ({
  api: {
    youtubePreview: vi.fn(), importYoutube: vi.fn(), textPreview: vi.fn(), importText: vi.fn(),
    options: vi.fn().mockResolvedValue({
      categories: ['Geral', 'Design'].map((name) => ({ name, count: 0, protected: false })),
      platforms: ['Outro', 'YouTube', 'Alura'].map((name) => ({ name, count: 0, protected: false })),
    }),
  },
}));
import { api } from '../lib/api.js';
import ImportOther from './ImportOther.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const $ = (sel) => container.querySelector(sel);
const byText = (sel, text) => [...container.querySelectorAll(sel)].find((el) => el.textContent.includes(text));

function Landing() {
  const { state } = useLocation();
  return <p>CURSO PÁGINA · {state?.flash}</p>;
}

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(
      <MemoryRouter initialEntries={['/importar-outras']}>
        <Routes>
          <Route path="/importar-outras" element={<ImportOther />} />
          <Route path="/cursos/:id" element={<Landing />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
}

async function type(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const click = (el) => act(async () => { el.click(); });

beforeEach(() => { document.body.innerHTML = ''; vi.clearAllMocks(); });

const YT_PREVIEW = {
  listId: 'PLabc', title: 'Curso de Redes', channel: 'Canal Bom', videoCount: 2, totalMin: 5, skipped: 1, truncated: false, existing: null,
  videos: [{ id: 'aaaaaaaaaaa', title: 'Intro <b>', durationSec: 61 }, { id: 'bbbbbbbbbbb', title: 'Camadas', durationSec: 200 }],
};

describe('Importar de outra plataforma · estrutura', () => {
  it('mostra o passo a passo, duas abas acessíveis e troca de aba', async () => {
    await mount();
    expect($('h1').textContent).toBe('Importar de outra plataforma');
    const tabs = container.querySelectorAll('[role="tab"]');
    expect([...tabs].map((t) => t.textContent)).toEqual(['Playlist do YouTube', 'Colar lista de aulas']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect($('[role="tabpanel"] ol')).not.toBeNull();
    expect($('label[for="yt-url"]').textContent).toBe('Link da playlist');
    await click(tabs[1]);
    expect($('#tx-text')).not.toBeNull();
    expect(container.textContent).toContain('uma aula por linha');
  });

  it('não usa os nomes antigos do produto', async () => {
    await mount();
    expect(container.textContent).not.toMatch(/Meu Hub|Learning Center/);
  });
});

describe('aba Playlist do YouTube', () => {
  it('botão só libera com link; prévia mostra resumo, avisos e escapa o HTML do título', async () => {
    api.youtubePreview.mockResolvedValue(YT_PREVIEW);
    await mount();
    const btn = () => byText('button', 'Ver prévia');
    expect(btn().disabled).toBe(true);
    await type($('#yt-url'), ' https://www.youtube.com/playlist?list=PLabc ');
    expect(btn().disabled).toBe(false);
    await click(btn());
    await flush();
    expect(api.youtubePreview).toHaveBeenCalledWith({ url: 'https://www.youtube.com/playlist?list=PLabc' });
    expect(container.textContent).toContain('Curso de Redes');
    expect(container.textContent).toContain('Canal Bom · 2 vídeo(s) · 5min');
    expect(container.textContent).toContain('1 vídeo(s) privado(s) ou removido(s) foram pulados');
    expect(container.textContent).toContain('Intro <b>'); // texto puro, sem virar tag
    expect(container.querySelector('li b')).toBeNull();
    expect(document.activeElement.textContent).toBe('Curso de Redes'); // foco no resumo
    expect(byText('button', 'Importar 2 vídeo(s)')).toBeTruthy();
  });

  it('fluxo completo: importa com plataforma/categoria e vai para o curso com mensagem de sucesso', async () => {
    api.youtubePreview.mockResolvedValue(YT_PREVIEW);
    api.importYoutube.mockResolvedValue({ created: true, courseId: 42, lessonsAdded: 2, skipped: 1, truncated: false });
    await mount();
    await type($('#yt-url'), 'https://youtu.be/xxxxxxxxxxx?list=PLabc');
    await click(byText('button', 'Ver prévia'));
    await flush();
    expect($('#yt-platform').value).toBe('YouTube');
    expect($('#yt-category').value).toBe('Geral');
    await click(byText('button', 'Importar 2 vídeo(s)'));
    await flush();
    expect(api.importYoutube).toHaveBeenCalledWith({ url: 'https://youtu.be/xxxxxxxxxxx?list=PLabc', platform: 'YouTube', category: 'Geral' });
    expect(container.textContent).toContain('CURSO PÁGINA · Pronto! Importei 2 vídeo(s) para o curso.');
  });

  it('desmarcar vídeos envia só os marcados', async () => {
    api.youtubePreview.mockResolvedValue(YT_PREVIEW);
    api.importYoutube.mockResolvedValue({ created: true, courseId: 7, lessonsAdded: 1 });
    await mount();
    await type($('#yt-url'), 'https://youtu.be/xxxxxxxxxxx?list=PLabc');
    await click(byText('button', 'Ver prévia'));
    await flush();
    await click(container.querySelectorAll('input[type="checkbox"]')[0]);
    expect(byText('button', 'Importar 1 vídeo(s)')).toBeTruthy();
    await click(byText('button', 'Importar 1 vídeo(s)'));
    await flush();
    expect(api.importYoutube.mock.calls[0][0].selectedVideoIds).toEqual(['bbbbbbbbbbb']);
  });

  it('playlist já importada: avisa, não pede plataforma e só acrescenta o que é novo', async () => {
    api.youtubePreview.mockResolvedValue({ ...YT_PREVIEW, existing: { id: 9, title: 'Curso de Redes', newVideos: 1 } });
    api.importYoutube.mockResolvedValue({ created: false, courseId: 9, lessonsAdded: 1 });
    await mount();
    await type($('#yt-url'), 'https://youtu.be/xxxxxxxxxxx?list=PLabc');
    await click(byText('button', 'Ver prévia'));
    await flush();
    expect(container.textContent).toContain('Você já importou essa playlist');
    expect($('#yt-platform')).toBeNull();
    await click(byText('button', 'Acrescentar vídeos novos'));
    await flush();
    expect(api.importYoutube).toHaveBeenCalledWith({ url: 'https://youtu.be/xxxxxxxxxxx?list=PLabc' });
    expect(container.textContent).toContain('Acrescentei 1 vídeo(s) novo(s)');
  });

  it('sem vídeo novo o botão fica bloqueado', async () => {
    api.youtubePreview.mockResolvedValue({ ...YT_PREVIEW, existing: { id: 9, title: 'X', newVideos: 0 } });
    await mount();
    await type($('#yt-url'), 'https://youtu.be/xxxxxxxxxxx?list=PLabc');
    await click(byText('button', 'Ver prévia'));
    await flush();
    expect(byText('button', 'Nada novo para importar').disabled).toBe(true);
  });

  it('erro da prévia aparece como alerta em português e some ao editar o link', async () => {
    api.youtubePreview.mockRejectedValue(Object.assign(new Error('Não consegui ler essa playlist. Ela é pública?'), { status: 422 }));
    await mount();
    await type($('#yt-url'), 'https://www.youtube.com/playlist?list=PLabc');
    await click(byText('button', 'Ver prévia'));
    await flush();
    expect($('[role="alert"]').textContent).toContain('Ela é pública?');
    expect($('section[aria-label="Prévia da playlist"]')).toBeNull();
  });

  it('erro ao importar mantém a prévia e libera o botão de novo', async () => {
    api.youtubePreview.mockResolvedValue(YT_PREVIEW);
    api.importYoutube.mockRejectedValue(new Error('O YouTube pediu para esperar um pouco.'));
    await mount();
    await type($('#yt-url'), 'https://youtu.be/xxxxxxxxxxx?list=PLabc');
    await click(byText('button', 'Ver prévia'));
    await flush();
    await click(byText('button', 'Importar 2 vídeo(s)'));
    await flush();
    expect($('[role="alert"]').textContent).toContain('esperar um pouco');
    expect(byText('button', 'Importar 2 vídeo(s)').disabled).toBe(false);
  });
});

describe('aba Colar lista de aulas', () => {
  const TEXT_PREVIEW = {
    modules: [{ title: 'Módulo 1', lessons: [{ title: 'Intro', durationMin: 10, estimated: true }, { title: 'Teoria', durationMin: 5, estimated: false }] }],
    moduleCount: 1, lessonCount: 2, estimatedCount: 1, totalMin: 15, warnings: ['1 aula(s) sem duração: usei 10 min como estimativa.'], existing: null,
  };
  async function fill() {
    await mount();
    await click(container.querySelectorAll('[role="tab"]')[1]);
    await type($('#tx-title'), 'Redes do zero');
    await type($('#tx-text'), 'Módulo 1\nIntro\nTeoria | 5 min');
  }

  it('exige título e lista; prévia mostra módulos, estimativas e avisos', async () => {
    api.textPreview.mockResolvedValue(TEXT_PREVIEW);
    await mount();
    await click(container.querySelectorAll('[role="tab"]')[1]);
    expect(byText('button', 'Ver prévia').disabled).toBe(true);
    await type($('#tx-title'), 'Redes do zero');
    expect(byText('button', 'Ver prévia').disabled).toBe(true);
    await type($('#tx-text'), 'Módulo 1\nIntro\nTeoria | 5 min');
    await click(byText('button', 'Ver prévia'));
    await flush();
    expect(api.textPreview).toHaveBeenCalledWith({ title: 'Redes do zero', platform: 'Outro', category: 'Geral', url: undefined, text: 'Módulo 1\nIntro\nTeoria | 5 min' });
    expect(container.textContent).toContain('1 módulo(s) · 2 aula(s) · 15min no total');
    expect(container.textContent).toContain('~10min (estimado)');
    expect(container.textContent).toContain('1 aula(s) sem duração');
  });

  it('fluxo completo: importa e vai para o curso com mensagem', async () => {
    api.textPreview.mockResolvedValue(TEXT_PREVIEW);
    api.importText.mockResolvedValue({ created: true, courseId: 5, lessonsAdded: 2, modulesAdded: 1 });
    await fill();
    await type($('#tx-url'), 'https://exemplo.com/c');
    await click(byText('button', 'Ver prévia'));
    await flush();
    await click(byText('button', 'Importar'));
    await flush();
    expect(api.importText).toHaveBeenCalledWith({ title: 'Redes do zero', platform: 'Outro', category: 'Geral', url: 'https://exemplo.com/c', text: 'Módulo 1\nIntro\nTeoria | 5 min' });
    expect(container.textContent).toContain('CURSO PÁGINA · Pronto! Criei o curso com 2 aula(s).');
  });

  it('curso com mesmo nome: pede decisão e envia o modo escolhido', async () => {
    api.textPreview.mockResolvedValue({ ...TEXT_PREVIEW, existing: { id: 3, title: 'Redes do zero' } });
    api.importText.mockResolvedValue({ created: true, courseId: 6, lessonsAdded: 2 });
    await fill();
    await click(byText('button', 'Ver prévia'));
    await flush();
    expect(container.textContent).toContain('Já existe um curso com esse nome');
    expect(byText('button', 'Acrescentar aulas')).toBeTruthy();
    await click(container.querySelectorAll('input[name="tx-mode"]')[1]);
    await click(byText('button', 'Importar'));
    await flush();
    expect(api.importText.mock.calls[0][0].mode).toBe('novo');
  });

  it('erro da prévia (lista sem aulas) aparece e editar o texto esconde a prévia antiga', async () => {
    api.textPreview.mockRejectedValueOnce(Object.assign(new Error('Não achei nenhuma aula nesse texto.'), { status: 422 }));
    await fill();
    await click(byText('button', 'Ver prévia'));
    await flush();
    expect($('[role="alert"]').textContent).toContain('nenhuma aula');
    api.textPreview.mockResolvedValue(TEXT_PREVIEW);
    await click(byText('button', 'Ver prévia'));
    await flush();
    expect($('section[aria-label="Prévia da lista"]')).not.toBeNull();
    await type($('#tx-text'), 'Outra coisa');
    expect($('section[aria-label="Prévia da lista"]')).toBeNull();
  });
});
