/** `window.lcDesktop` só existe dentro do app desktop (Electron); no navegador é indefinido. */
export const isDesktop = () => typeof window !== 'undefined' && Boolean(window.lcDesktop && window.lcDesktop.isDesktop);

export function openUdemy() {
  if (isDesktop()) window.lcDesktop.openUdemy();
}

/** Passo a passo do app desktop: a janela da Udemy fica dentro do app, sem extensão. */
export function DesktopUdemy() {
  return (
    <section className="card" aria-label="Importar pela janela da Udemy">
      <h2 className="card-title">Importar pela janela da Udemy</h2>
      <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li>Clique em <strong>Abrir a Udemy</strong> e entre na sua conta com e-mail e senha. O login pelo Google costuma não funcionar nesta janela.</li>
        <li>Em <strong>Meu aprendizado</strong>, marque <strong>Sincronizar automaticamente</strong> (no canto da página). Cursos, progresso e capas passam a entrar sozinhos.</li>
        <li>Para trazer as aulas de um curso, abra o curso na Udemy e deixe a barra <strong>Conteúdo do curso</strong> visível. Elas sincronizam sozinhas.</li>
      </ol>
      <p className="page-sub">Se a Udemy pedir uma verificação de segurança, resolva na própria janela. Seus dados ficam só neste computador.</p>
      <button className="btn btn-primary" onClick={openUdemy} style={{ marginTop: 8 }}>Abrir a Udemy</button>
    </section>
  );
}
