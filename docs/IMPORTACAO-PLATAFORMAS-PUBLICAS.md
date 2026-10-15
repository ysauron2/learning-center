# Importar por link: plataformas com dados públicos

Além da Alura e da Fundação Bradesco ([`IMPORTACAO-ALURA-BRADESCO.md`](IMPORTACAO-ALURA-BRADESCO.md)), a tela **Importar → Colar link de um curso** aceita links de quatro plataformas. Não precisa entrar na conta: o Lume lê só o que o site mostra para qualquer pessoa.

## Como usar (igual para todas)

1. Abra o curso no navegador e copie o endereço da página.
2. No Lume, vá em **Importar → Colar link de um curso** e cole.
3. A tela mostra “Site reconhecido: …”. Clique em **Ver prévia**, confira e clique em **Importar curso**.

Importar de novo o mesmo curso **não duplica**: só acrescenta as aulas que faltarem. Nada é apagado nem renomeado. Se uma plataforma não informa a duração de cada aula, a duração fica **0** e a carga horária total aparece na descrição (nada é inventado).

## O que cada plataforma aceita

| Plataforma | Links aceitos | O que entra |
|---|---|---|
| **Microsoft Learn** | `learn.microsoft.com/pt-br` ou `/en-us` + `/training/paths/…` (trilha), `/training/modules/…` (módulo), `/credentials/certifications/…` (certificação) | Título, resumo, nível, duração; trilha = curso com os módulos e as unidades (cada unidade com seus minutos); módulo = curso com as unidades; certificação = título, descrição e as trilhas do guia de estudos (quando o catálogo traz) |
| **freeCodeCamp** | `freecodecamp.org/learn/<curso>` (ex.: `responsive-web-design-v9`) | Título, descrição e os blocos do currículo na ordem (agrupados por capítulo/módulo nos cursos novos). Sem duração |
| **Coursera** | `coursera.org/learn/<curso>` (só cursos; especializações e certificados profissionais não) | Título, descrição, nível, capa, carga total, semanas como módulos, com as videoaulas e as atividades de cada semana (videoaulas com minutos) |
| **Rocketseat** | `rocketseat.com.br/formacao/<nome>` (páginas públicas de formação) | Título, descrição, nível, carga horária (a estimativa em horas do site, ex.: “+181h”), capa e a lista de módulos com a quantidade de aulas. Os **títulos das aulas** não aparecem na página pública |

Os sites aceitos aparecem na própria tela (“Sites aceitos e o que entra de cada um”) e nas mensagens de erro. A lista vem de um registro único na API (`apps/api/src/core/platforms.js`); para acrescentar uma plataforma basta registrar nele e escrever o leitor em `course-sources.js`.

## De onde vêm os dados (e como é feita a leitura)

- **Microsoft Learn**: a página de curso informa o identificador (`uid`) do conteúdo; depois o Lume consulta o **catálogo público oficial** (`learn.microsoft.com/api/catalog/`), em pedidos pequenos (o catálogo recusa mais de ~20 identificadores por pedido). Trilha pt-br/en-us e links antigos que o site redireciona funcionam.
- **freeCodeCamp**: o site só monta a página por JavaScript (o HTML vem vazio), então o Lume lê a **estrutura pública do currículo no repositório oficial** (`raw.githubusercontent.com/freeCodeCamp/freeCodeCamp/…`, só essa pasta) e os títulos em inglês (o currículo traduzido não é usado).
- **Coursera**: o estado que a própria página já carrega (`__APOLLO_STATE__`).
- **Rocketseat**: o HTML da página (título, resumo, lista de módulos).

Segurança: a mesma busca segura da Alura/Bradesco — só https, só os domínios da plataforma (sem IP, porta ou usuário/senha), no máximo ~15 s e 6 MB por pedido, redirecionamentos conferidos um a um, User-Agent de navegador comum, pedidos em sequência (nunca em paralelo). Texto do site é sempre tratado como texto. Não há cache do conteúdo: ele só é lido na hora da prévia/importação.

## O que foi verificado de verdade (rede real, 15/10/2026)

Cada plataforma foi lida do site real com 2 links (as respostas, reduzidas, estão em `apps/api/test/fixtures/publicas/`, com a data da gravação):

- Microsoft Learn: trilhas `get-started-with-artificial-intelligence-on-azure` (IA no Azure; esse endereço antigo passa por duas trocas até a trilha atual, 7 módulos, 49 unidades, 337 min) e `implement-ai-security` (segurança, en-us, 9 módulos, 57 unidades); módulos `get-started-with-ai-in-azure` (8 unidades, 56 min) e `describe-security-concepts-methodologies` (SC-900, 7 unidades, 48 min); certificações `azure-ai-fundamentals` (com 2 trilhas do guia de estudos) e `security-compliance-and-identity-fundamentals` (o catálogo não traz guia: entra só título e descrição).
- freeCodeCamp: `responsive-web-design-v9` (29 módulos, 158 blocos) e `scientific-computing-with-python` (19 blocos).
- Coursera: `learning-how-to-learn` (4 semanas, 70 itens, 15h35) e `python` (7 semanas, 49 itens, 17h02).
- Rocketseat: `formacao/fullstack` (14 módulos, +181h) e `formacao/go` (8 módulos, +50h). O link `/formacao/go` o site redireciona para `/produtos/desenvolvimento/formacao-em-go`; o Lume guarda o link que você colou.

Os testes automáticos usam essas respostas gravadas (não a internet). **Os sites podem mudar a qualquer momento**; se um deles mudar, a importação mostra “Não encontrei os dados de um curso nessa página” e a opção **Colar lista de aulas** continua funcionando.

## O que NÃO foi incluído (e por quê)

- **Domestika**: o site responde **403 (acesso negado)** para leitura automática de páginas de curso. Não contornamos bloqueio. Use **Colar lista de aulas**.
- **DIO**: a página pública (`web.dio.me`) vem **vazia** (só um app JavaScript, sem título, descrição nem aulas no HTML) e os dados ficam atrás de APIs que não são públicas. Não incluída. Use **Colar lista de aulas**.
- **Coursera**: especializações (`/specializations/…`), certificados profissionais e cursos fora do padrão `/learn/…` não foram verificados e são recusados com mensagem clara. A leitura de `/learn/…` usa só a página pública que qualquer visitante vê (o `robots.txt` da Coursera não proíbe `/learn/`). Os termos de uso da Coursera são restritivos para cópia automática de conteúdo; por isso o Lume faz **um** pedido por clique, guarda só o que você importa e não guarda a página.
- **Rocketseat**: cursos soltos e páginas do app logado (`app.rocketseat.com.br`) exigem login e não são aceitos; só as formações públicas.
- **Microsoft Learn**: páginas de curso de instrutor (`/training/courses/…`), exames e “applied skills” não foram verificadas e não são aceitas; outros idiomas além de pt-br e en-us também não.
- **freeCodeCamp**: títulos só em inglês; sem duração por bloco (o site não informa).
