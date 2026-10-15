import { isDesktop } from './DesktopUdemy.jsx';
import { IMPORT_PLATFORMS, UNVERIFIED_NOTE } from '../lib/platforms.js';

/** Abre a janela da plataforma dentro do app desktop (só existe no desktop). */
export function openPlatform(id) {
  if (isDesktop() && typeof window.lcDesktop.openPlatform === 'function') window.lcDesktop.openPlatform(id);
}

/** Passo a passo do app desktop para Alura e Fundação Bradesco: a janela da plataforma fica dentro do app. */
export function DesktopPlatform({ platform }) {
  const p = IMPORT_PLATFORMS[platform];
  return (
    <section className="card" aria-label={`Importar pela janela da ${p.name}`}>
      <h2 className="card-title">Importar pela janela da {p.name}</h2>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Clique em <strong>{p.openLabel}</strong> e entre na sua conta. A janela fica dentro do Lume e guarda o seu login.</li>
        <li>Abra a lista dos <strong>seus cursos</strong> ({platform === 'alura' ? 'Meus cursos' : 'área do aluno'}) e role até o fim.</li>
        <li>Clique no botão roxo <strong>Importar meus cursos da {p.name}</strong>, no canto da página. Esta tela abre com a prévia para você conferir.</li>
      </ol>
      <p className="page-sub">O Lume só lê o que está na tela. Ele nunca pede nem guarda a sua senha. Seus dados ficam só neste computador.</p>
      <p className="page-sub" role="note"><strong>Atenção:</strong> {UNVERIFIED_NOTE}</p>
      <button className="btn btn-primary" onClick={() => openPlatform(platform)} style={{ marginTop: 8 }}>{p.openLabel}</button>
    </section>
  );
}
