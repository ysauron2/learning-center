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
- A importação de cursos só adiciona; não atualiza o progresso de cursos já importados. O conteúdo (aulas) pode ser reimportado a qualquer momento para marcar aulas novas como concluídas.

## Importar o conteúdo de um curso (módulos e aulas)

Um clique por curso, no **player**:

1. Abra o curso na Udemy e entre onde você assiste às aulas, com a barra **Conteúdo do curso** visível.
2. Clique no botão roxo **Importar conteúdo deste curso** (a extensão expande as seções recolhidas sozinha).
3. O app abre em `/importar-conteudo`, sugere o curso de destino (pelo endereço ou pelo título; se não achar, escolha na lista), mostra a prévia e o progresso resultante e pede confirmação.

Regras: só soma (cria módulos/aulas que faltam, preenche duração zerada, marca como concluída); nunca apaga, renomeia nem desmarca. Importar de novo não duplica. Depois da importação o progresso do curso passa a ser calculado pelas aulas concluídas.

O leitor (`apps/web/src/lib/udemy-curriculum.js`) não depende de classes do site: usa `data-purpose`, as caixas de "aula vista" e a ordem dos elementos (cabeçalho de seção → aulas). Se não achar aulas, o botão copia um diagnóstico da estrutura da barra para a área de transferência.

## Capas dos cursos

A extensão lê também a imagem de capa de cada cartão de "Meus cursos". O app guarda só o **endereço** (https, da Udemy) e o navegador carrega a imagem direto da Udemy ao exibir o curso; se falhar, aparece o degradê padrão. Consequências: a Udemy vê essas requisições de imagem (sem enviar o endereço do app como origem) e a capa some se a Udemy mudar ou apagar a imagem.

- Cursos já cadastrados sem capa ganham uma ao reimportar em "Meus cursos" (nunca trocamos uma capa existente).
- Também dá para definir ou limpar a capa manualmente em "Editar curso" (campo "Imagem de capa", só https).

## Sincronização automática

Com o interruptor **"Sincronizar automaticamente"** (canto da página da Udemy, abaixo do botão roxo) ligado, a extensão envia sozinha ao app local o que lê, sem prévia:

- **Em "Meu aprendizado":** cursos novos, progresso atualizado (só sobe, em cursos sem aulas) e capas que faltam.
- **No player de um curso:** módulos e aulas novos e as aulas que você concluiu. Dispara ao abrir o curso, ao mudar de aula e alguns segundos depois de marcar uma aula como vista.

Como é seguro: só soma (nunca apaga, renomeia nem desmarca); se o app não tiver certeza de qual curso é, **não grava** e o aviso pede para usar o botão "Importar conteúdo deste curso" (que pergunta o destino e passa a lembrar). O mesmo conteúdo não é reenviado, e avisos só aparecem quando houve novidade (ou para dizer que o app está fechado, no máximo a cada 10 minutos).

Permissões: a extensão pode falar com o endereço do app (`host_permissions`, por padrão `http://localhost:3000`) e com mais nada; quem fala com o app é o serviço de fundo, e a Udemy nunca recebe nada. O interruptor começa **desligado**. Se o app estiver fechado, abra o atalho "Learning Center" na área de trabalho.
