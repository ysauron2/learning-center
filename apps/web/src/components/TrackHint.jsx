import { useState } from 'react';

const KEY = 'lc-track-hint-hidden';

const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const write = (hidden) => { try { localStorage.setItem(KEY, hidden ? '1' : '0'); } catch { /* sem armazenamento: só vale nesta visita */ } };

/** Explica, em linguagem simples, como a trilha funciona e como ver isso na prática. Pode ser escondido. */
export function TrackHint() {
  const [hidden, setHidden] = useState(read);
  const set = (value) => { write(value); setHidden(value); };

  if (hidden) {
    return <div><button className="btn btn-sm" onClick={() => set(false)}>Como funciona esta trilha?</button></div>;
  }
  return (
    <section className="card track-hint" aria-label="Como funciona esta trilha">
      <h2 className="card-title">Como funciona esta trilha</h2>
      <ul>
        <li>A etapa com a etiqueta <strong>Próxima</strong> é onde você deve continuar.</li>
        <li>Quando você conclui aulas de um curso, a trilha <strong>avança sozinha</strong>. Não precisa marcar nada aqui.</li>
        <li><strong>Etapa avulsa</strong> é o que não é curso, como uma prova ou um projeto. Essa você marca à mão.</li>
        <li>Use <strong>↑ ↓</strong> para mudar a ordem das etapas.</li>
      </ul>
      <p className="track-hint-try">
        <strong>Quer ver funcionando?</strong> Clique em <strong>Abrir o curso</strong> na etapa <strong>Próxima</strong>, marque uma aula como concluída e volte aqui: o progresso sobe.
      </p>
      <button className="btn btn-sm" onClick={() => set(true)}>Entendi, esconder</button>
    </section>
  );
}
