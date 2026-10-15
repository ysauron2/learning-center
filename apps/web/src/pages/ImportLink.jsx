import { Link } from 'react-router-dom';
import { ImportTabs } from '../components/ImportTabs.jsx';
import { AutoDetectSwitch } from '../components/AutoDetectSwitch.jsx';
import { ImportByLink } from '../components/ImportByLink.jsx';

/** Colar o link público de um curso (sem login). Os sites aceitos vêm da API. */
export default function ImportLink() {
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Colar link de um curso</h1>
          <p className="page-sub">Cole o endereço de um curso e o Lume reconhece o site. Você confere antes de salvar.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn" to="/cursos">Voltar</Link>
        </div>
      </header>
      <ImportTabs />
      <ImportByLink />
      <AutoDetectSwitch />
    </>
  );
}
