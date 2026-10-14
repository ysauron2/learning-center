# Importação de cursos da Udemy

A Udemy não oferece API pública para os cursos comprados nem para o progresso (a API de Afiliado
só expõe o catálogo e foi descartada). A importação funciona lendo a página **Meu aprendizado**
que o próprio usuário já abriu, logado, no navegador dele.

## Como usar

1. Gere a extensão: `npm run build:extension` (usa `http://localhost:3000`; para outro endereço:
   `node scripts/build-extension.mjs http://host:porta`).
2. No Brave/Chrome: `brave://extensions` → Modo do desenvolvedor → **Carregar sem compactação** →
   pasta `apps/extension/dist`. (Não use "Compactar extensão": isso só gera `.crx`/`.pem`.)
3. Abra `https://www.udemy.com/home/my-courses/learning/`, role até o fim e clique no botão roxo
   **Importar para o Learning Center**.
4. O app abre em `/importar` com a prévia. Confira e confirme.

Há também um favorito (bookmarklet) em `/importar`, menos confiável: a Udemy ou o navegador podem bloqueá-lo.

## Como funciona

```
página da Udemy ── content-udemy.js (extrai) ──► background.js ──► abre /importar
                                                    │
/importar ◄── content-app.js (entrega a lista) ◄────┘
   │  POST /courses/import/preview  →  usuário confere  →  POST /courses/import
```

- O leitor (`apps/web/src/lib/udemy-extractor.js`) procura links de curso (`/course/<slug>` ou
  `?course_id=<n>`) e sobe até o "cartão" de cada um para achar título e `% concluído`. Não depende
  de nomes de classe do site. Um curso sem `% concluído` visível vale 0%.
- A extensão **não** usa senha, token nem faz chamadas à Udemy. Só tem a permissão `storage`.
- O app só aceita a lista vinda da Udemy (favorito) ou da própria página (extensão), e o servidor
  revalida tudo (zod, limite de 500, links só de udemy.com).
- Importar de novo não duplica nem altera cursos existentes (progresso ajustado no app é preservado).

## Se não achar cursos

O botão copia um diagnóstico para a área de transferência (padrões de link e estrutura em volta do
texto "% concluído"). Com ele dá para ajustar o leitor sem precisar da página.

## Limites conhecidos

- A Udemy carrega a lista aos poucos: role até o fim antes de clicar.
- Ler a página de forma automatizada pode ser contra os termos de uso da Udemy; é uso pessoal e esporádico, por conta do usuário.
- Se a Udemy mudar o layout, o leitor pode precisar de ajuste.
- Só adiciona cursos; não atualiza o progresso de cursos já importados.
