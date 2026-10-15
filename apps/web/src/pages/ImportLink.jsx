import { Link } from 'react-router-dom';
import { ImportTabs } from '../components/ImportTabs.jsx';
import { ImportByLink } from '../components/ImportByLink.jsx';

/** Colar o link público de um curso da Alura ou da Fundação Bradesco (sem login). */
export default function ImportLink() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Colar link de um curso</h1>
          <p className="page-sub">Funciona com cursos da Alura e da Fundação Bradesco. Você confere antes de salvar.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn" to="/cursos">Voltar</Link>
        </div>
      </header>
      <ImportTabs />
      <ImportByLink />
    </>
  );
}
