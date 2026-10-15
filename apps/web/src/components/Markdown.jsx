import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Markdown seguro para anotações. O react-markdown não executa HTML cru (aparece como texto) e
 * remove endereços `javascript:`/`data:`. Aqui ainda: links abrem em nova aba sem repassar a
 * origem, e imagens remotas NÃO são carregadas (evita rastreadores); no lugar fica o texto.
 */
const components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>
  ),
  img: ({ alt }) => <span className="md-img-blocked">{alt ? `[imagem: ${alt}]` : '[imagem]'}</span>,
};

export function Markdown({ children }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children ?? ''}</ReactMarkdown>
    </div>
  );
}
