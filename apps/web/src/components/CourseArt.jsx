import { useState } from 'react';
import { thumbFor } from '../lib/format.js';

/**
 * Capa do curso: mostra a imagem se houver; se não houver (ou falhar ao carregar),
 * fica o degradê padrão. A imagem é decorativa (alt vazio) e não envia o endereço do app
 * como origem (referrerPolicy). Filhos ficam por cima da imagem.
 */
export function CourseArt({ id, imageUrl, className, style, children, ...rest }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;
  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', background: thumbFor(id), ...style }} {...rest}>
      {showImage && (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(imageUrl)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {children}
    </div>
  );
}
