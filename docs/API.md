# API · v1

Base: `/api/v1` · JSON · sem autenticação (uso pessoal; proteja pela rede/proxy do ZimaOS).

Sucesso: `{ "data": ... }` (`204` sem corpo em exclusões).
Erro: `{ "error": { "code", "message", "details?" } }`.

| Código HTTP | `code` | Quando |
|---|---|---|
| 400 | `VALIDATION_ERROR` | corpo/consulta inválidos (`details`: `[{path, message}]`) |
| 400 | `INVALID_COURSE`, `INVALID_LESSON` | referência inexistente em sessão |
| 404 | `NOT_FOUND` | recurso ou rota inexistente |
| 409 | `SESSION_ALREADY_ACTIVE` | já há sessão aberta (`details.session` traz a sessão) |
| 409 | `SESSION_ENDED` | pausar/retomar/finalizar sessão já encerrada |

## Saúde
- `GET /health` → `{ status: "ok" }`

## Cursos
- `GET /courses?status=&platform=&category=&q=` — lista com progresso, tags e minutos estudados.
- `GET /courses/summary` — contagens por status + plataformas e categorias existentes.
- `POST /courses` — `{ title*, platform, category, description, url, imageUrl, status, manualProgress, tags[] }` (`imageUrl`: só https, `null` limpa)
- `GET /courses/:id` — curso com `modules[].lessons[]`.
- `PATCH /courses/:id` — mesmos campos, todos opcionais.
- `POST /courses/:id/status` — `{ status: planned|active|paused|completed }` (concluir força 100% manual).
- `DELETE /courses/:id`
- `POST /courses/import/preview` — `{ items: [{ title*, url*, progress (0–100), instructor?, imageUrl? }] }` (1–500 itens). Não grava. Devolve `{ new[], existing[], invalid[], imagesToFill }`.
- `POST /courses/import` — mesmo corpo. Cria só os cursos novos (plataforma `Udemy`; status `planned` com 0%, `active` de 1 a 99%, `completed` com 100%) e devolve `{ created, skipped, invalid, imagesFilled, ids }`. Não altera cursos existentes, exceto preencher a capa (`imageUrl`) dos que ainda não têm. `imageUrl` só vale se for https de `udemycdn.com`/`udemy.com`; qualquer outra é ignorada (o curso é importado sem capa). A identidade do curso é o slug de `/course/<slug>` ou o `course_id` do link do painel; a operação é atômica.

Progresso: com aulas, `aulas concluídas / total`; sem aulas, `manualProgress`.

## Módulos e aulas
- `POST /courses/:id/modules` — `{ title }`
- `DELETE /modules/:id`
- `POST /modules/:id/lessons` — `{ title, durationMin }`
- `PATCH /lessons/:id` — `{ title?, durationMin?, completed?, lastPositionSec? }`
- `DELETE /lessons/:id`

## Sessões de foco
- `GET /sessions/active` — sessão aberta ou `null` (traz `elapsedSec`, já descontando pausas).
- `GET /sessions?from=&to=&courseId=&limit=` — sessões encerradas (ISO 8601).
- `POST /sessions/start` — `{ courseId?, lessonId?, kind: pomodoro|stopwatch, plannedMin }`
- `POST /sessions/:id/pause` · `POST /sessions/:id/resume`
- `POST /sessions/:id/finish` — `{ notes?, focusRating? (1–5), completeLesson? }`
- `DELETE /sessions/:id` — descarta sessão aberta.
- `POST /sessions/manual` — `{ courseId?, lessonId?, durationMin, startedAt?, notes? }`

Só existe uma sessão aberta por vez (retomada rápida de atividades interrompidas).

## Metas
- `GET /goals/weekly` — `{ targetMinutes, studiedMinutes, remainingMinutes, percent, weekStart, weekEnd }`
- `PUT /goals/weekly` — `{ targetMinutes }` (mínimo 15). Padrão: 480 (8 h).

A semana vai de segunda 00:00 a domingo, no fuso do servidor (`TZ`).

## Dashboard
- `GET /dashboard` →
  - `week`: `studiedMinutes`, `previousMinutes`, `deltaPercent` (null sem semana anterior), `chart[7]`
  - `goal`, `streakDays`, `activeCourses`, `totalCourses`
  - `nextAction`: `resume_session` | `next_lesson` | `continue_course` | `add_course`
  - `recentSessions` (5 últimas)

Sequência: dias consecutivos com estudo; se hoje ainda não houve, conta a partir de ontem.

## Analytics
- `GET /analytics?range=7d|30d|90d|all` (padrão `30d`; outro valor → 400) →
  - `summary`: `totalMinutes`, `sessions`, `activeDays`, `avgMinutesPerActiveDay`, `bestDay`, `previousMinutes` e `deltaPercent` (nulos em `all`), `currentStreak`, `longestStreak` (histórico completo)
  - `timeline`: `[{ date, minutes }]` por dia (`7d`, `30d`) ou por semana iniciada na segunda (`90d`, `all`), com zeros nos dias sem estudo; `granularity` informa qual
  - `byCourse`: tempo, `percent` do total, `progress`/`status` atuais e `daysSince`; curso excluído ou sessão sem curso aparecem juntos como "Sem curso"
  - `idleCourses`: cursos ativos sem estudo no período (`daysSince` nulo = nunca estudado)
  - `weekdayPeriods`: matriz 7 (seg–dom) × 4 faixas (`madrugada` 0–6h, `manha` 6–12h, `tarde` 12–18h, `noite` 18–24h), em minutos
  - `focus`: nota média e por faixa, `bestPeriod`, duração média, contagem por tipo de sessão
  - `goalHistory`: últimas 12 semanas com `minutes`, `target`, `hit`

Regras: só sessões encerradas e com duração > 0. Sessões **manuais** não entram em `weekdayPeriods` nem na nota/duração de `focus`, porque o horário delas é inventado ao registrar. Sessão que atravessa a meia-noite conta no dia em que começou (igual ao dashboard). `goalHistory` usa a meta atual em todas as semanas, porque o app não guarda o histórico da meta.

## Importar conteúdo de um curso
- `POST /courses/:id/import-content/preview` — `{ modules: [{ title*, lessons: [{ title*, durationMin, completed }] }] }` (até 200 módulos, 500 aulas por módulo, 3000 no total). Não grava. Devolve `{ modulesCreated, modulesExisting, lessonsCreated, lessonsExisting, lessonsCompleted, after: { total, done, progress } }`.
- `POST /courses/:id/import-content` — mesmo corpo; aplica e devolve o mesmo resumo. 404 se o curso não existe.

Só soma: módulos e aulas são casados pelo título (sem diferenciar maiúsculas, acentos de composição ou espaços; a n-ésima ocorrência do mesmo título casa com a n-ésima). Cria o que falta, preenche duração zerada e marca como concluída. Nunca apaga, renomeia nem desmarca. Duração é limitada a 0–1000 min. A operação é atômica.

## Backup
- `GET /backup` → `{ app: "learning-center", version: 1, exportedAt, data: { courses, courseTags, modules, lessons, sessions, settings } }` (linhas com os nomes de coluna do banco, ids incluídos). Não inclui a tabela de migrações.
- `POST /backup/preview` — `{ backup }`. Valida e devolve `{ exportedAt, counts: { courses, modules, lessons, sessions, tags } }` sem gravar.
- `POST /backup/restore` — `{ confirm: "substituir-tudo", backup }`. **Substitui todos os dados** pelos do backup, em uma transação (ou tudo ou nada). Preserva os ids e reinicia os contadores. Corpo de até 50 MB.

Validação: `app`/`version` corretos, tipos e faixas de cada linha (status, nota 1–5, progresso 0–100, capa só https), ids únicos e referências entre tabelas (tag→curso, módulo→curso, aula→módulo e curso do módulo, sessão→curso/aula). Qualquer falha → 400 `INVALID_BACKUP` e nada muda. Um backup sem `image_url` (anterior à migração 002) é aceito.

O app não tem autenticação (dívida conhecida): quem alcança o servidor consegue baixar e restaurar os dados. Mantenha-o em `localhost` ou na rede de casa.

## Sincronização automática (usada pela extensão)
- `POST /courses/sync-content` — `{ title?, url?, modules: [...] }` (mesmo corpo da importação de conteúdo, mais o título e o endereço do curso na Udemy). O app descobre qual curso é, na ordem: **slug lembrado** (`udemy_slug`) → slug do `url` cadastrado → **título igual** (se único) → título contido em outro (se único, 8+ letras). Se achar, importa e devolve `{ matched: true, courseId, courseTitle, summary }`. Se houver dúvida ou nenhum curso, **não grava nada** e devolve `{ matched: false, candidates: [{ id, title }] }`.
- Ao importar (automático ou manual com `url`), o app **lembra o slug** do curso, para reconhecê-lo mesmo se o título mudar. Dois cursos nunca ficam com o mesmo slug.
- `POST /courses/import` e `/courses/import/preview` aceitam `updateProgress: true`: cursos existentes **sem aulas** têm o progresso elevado quando a Udemy mostra mais (nunca diminui); `planned` vira `active`, e 100% vira `completed`. Resposta: `progressUpdated` / `progressToUpdate`. Cursos com aulas não são tocados (o progresso vem das aulas).

## Anotações
- `GET /notes?q=&courseId=&lessonId=&tag=&limit=` — lista **sem o texto completo**, da editada mais recentemente para a mais antiga. Cada item: `id, title, excerpt` (trecho sem marcas de Markdown), `courseId/courseTitle`, `lessonId/lessonTitle`, `tags[]`, datas. `q` busca em título, texto e tags, **sem diferenciar maiúsculas nem acentos**, como frase contínua.
- `GET /notes/tags` — `[{ tag, count }]`, da mais usada para a menos.
- `GET /notes/:id` — a anotação com `body` (Markdown).
- `POST /notes` — `{ title?, body?, courseId?, lessonId?, tags[] }`. Precisa de título **ou** texto. Título até 200, texto até 100 000, até 10 tags de até 30 letras. Só com `lessonId`, o curso é deduzido; aula de outro curso → 400 `INVALID_LESSON`.
- `PATCH /notes/:id` — mesmos campos, todos opcionais; `null` em `courseId`/`lessonId` limpa o vínculo. Trocar de curso desfaz a aula antiga.
- `DELETE /notes/:id`.

O texto é guardado como veio (inclusive HTML): **quem exibe é que escapa**. A interface usa `react-markdown`, que não executa HTML, remove `javascript:`/`data:` e não carrega imagens remotas. Apagar o curso ou a aula **mantém** a anotação, só sem vínculo.

## Trilhas
Uma trilha é uma sequência ordenada de etapas. A etapa é um **curso** (progresso e título vêm do curso) ou uma **etapa livre** com nome (prova, projeto, livro…), que se marca à mão.

- `GET /tracks` — resumos: `id, title, description, totalItems, doneItems, progress, next: { itemId, title, courseId } | null`.
- `POST /tracks` — `{ title*, description? }` (título até 120, descrição até 1000). Devolve a trilha completa.
- `GET /tracks/:id` — o resumo mais `items[]`: `id, position, kind ('course'|'step'), title, courseId, course {…}, progress, status ('done'|'active'|'todo'), isNext`.
- `PATCH /tracks/:id` — título e/ou descrição. `DELETE /tracks/:id` (os cursos permanecem).
- `POST /tracks/:id/items` — `{ courseId }` ou `{ title }` (etapa livre). Máximo de 100 etapas (`TRACK_FULL`). Curso repetido na mesma trilha → 409 `ALREADY_IN_TRACK`. Devolve a trilha.
- `PATCH /tracks/:id/items/:itemId` — só etapa livre: `{ done?, title? }`. Em etapa de curso → 400 `COURSE_ITEM`. Devolve a trilha.
- `DELETE /tracks/:id/items/:itemId` — fecha o buraco na ordem.
- `PUT /tracks/:id/order` — `{ itemIds: [...] }`: precisa conter **exatamente** as etapas da trilha (400 `INVALID_ORDER`).

Regras: etapa de curso está `done` se o curso está `completed` ou com 100%; `active` se há progresso; senão `todo`. O progresso da trilha é a média do progresso das etapas. A próxima etapa é a primeira que não está `done`. Apagar um curso o tira das trilhas.

## Importação de cursos: categoria
`POST /courses/import` aceita `category` (1–60 letras): vale **só para os cursos novos** (padrão `Geral`); existentes não mudam.

## Categorias e plataformas (opções)
Listas que a pessoa escolhe no cadastro do curso. Já vêm com sugestões padrão; "Geral" (categoria) e "Outro" (plataforma) são **protegidas**.
- `GET /options` — `{ categories: [{ name, count, protected }], platforms: [...] }`.
- `POST /options/categories|platforms` — `{ name }` (até 60 letras). Nome que já existe (ignora maiúsculas e acentos) devolve o existente com `created: false` (200); novo → 201.
- `PATCH /options/categories|platforms` — `{ name, newName }`: renomeia e atualiza os cursos. Se `newName` já existe, **junta** as duas (`merged: true`).
- `DELETE /options/categories|platforms?name=…` — apaga e move os cursos para "Geral"/"Outro" (`{ moved, movedTo }`). Protegida → 400 `PROTECTED_OPTION`.

Cadastrar um curso (ou importar) com categoria ou plataforma nova a registra na lista, e usa a grafia já existente.

## Notion
Detalhes em `docs/NOTION.md`. Autenticação por "integração interna" (um código), sem OAuth.
- `GET /notion/status` — `{ hasToken, botName, workspace, connected, databaseUrl, connectedAt, lastSyncAt, lastError, autoSync, logSessions, planBlocks }` (nunca o código).
- `PUT /notion/token` — `{ token }`: confere o código no Notion (`GET /users/me`) e só então guarda. 400 `NOTION_AUTH` se o Notion recusar. Trocar de código esquece a tabela escolhida.
- `GET /notion/pages` — páginas que o Notion deixou a integração enxergar: `[{ id, title, url }]`. 401 sem código.
- `POST /notion/connect` — `{ pageId }`: cria a tabela "Learning Center · Estudos" (colunas Nome, Quando, Tipo, Curso, Detalhes, Chave) dentro da página. 400 `NOTION_PAGE` se a página não estiver compartilhada com a integração.
- `POST /notion/disconnect` — esquece código e tabela no app (nada é apagado no Notion). `PATCH /notion/settings` — `{ autoSync?, logSessions? }`.
- `POST /notion/sync` — mesmo formato de `/calendar/sync`: `{ planCreated, planUpdated, planDeleted, sessionsCreated, syncedAt }`. 401 `NOT_CONNECTED`; 409 `NOTION_LOST` se a tabela sumiu (o app esquece a tabela e mantém o código); 502 `NOTION_ERROR` para falhas do Notion.

## Google Agenda
Detalhes e limites em `docs/GOOGLE-AGENDA.md`.
- `GET /calendar/status` — `{ configured, connected, clientId, account, hasStudyCalendar, connectedAt, lastSyncAt, lastError, autoSync, logSessions, planBlocks }` (nunca o segredo nem tokens).
- `PUT /calendar/config` — `{ clientId, clientSecret }`. Trocar a chave desconecta.
- `POST /calendar/connect` — `{ url, redirectUri }`: o endereço do Google para onde levar a pessoa. O retorno é montado a partir do endereço da requisição.
- `GET /calendar/callback?code&state` — volta do Google (página HTML). O `state` vale uma vez e 10 minutos.
- `POST /calendar/disconnect`; `PATCH /calendar/settings` — `{ autoSync?, logSessions? }`.
- `GET /calendar/events?days=1..31&refresh=0|1` — `{ connected, events[], fetchedAt, stale, error }`. Cada evento: `id, title, start, end, allDay, calendar ('primary'|'study'), kind ('plan'|'session'|null), url`. Cache de 2 min; se o Google falhar devolve o último conhecido com `stale: true`.
- `GET /calendar/upcoming?days=1..14` (padrão 7) — o que o app já sabe, sem depender de Google/Notion: blocos do plano que ainda vão acontecer e sessões de foco concluídas hoje, no mesmo formato dos eventos acima (`kind` 'plan'|'session') mais `courseId`, `courseTitle`, `lessonTitle`. Alimenta o cartão "Sua agenda" do início.
- `GET|POST /calendar/plan`, `PATCH|DELETE /calendar/plan/:id` — blocos `{ weekday (0 = segunda), startTime 'HH:MM', durationMin 5–600, courseId? }`, até 50.
- `POST /calendar/sync` — sincroniza agora: `{ planCreated, planUpdated, planDeleted, sessionsCreated, syncedAt }`. 401 `NOT_CONNECTED` se não conectado; 502 `GOOGLE_ERROR` se o Google falhar.
- `GET /calendar/feed.ics` — **calendário para assinar** (iCalendar), sem Google e sem login: blocos do plano (4 semanas, lembrete de 10 min) e sessões de foco concluídas (se a opção estiver ligada). Horários em UTC, UIDs estáveis (`plan-<id>-<data>@learning-center`, `session-<id>@learning-center`), texto escapado e linhas dobradas em 75 bytes. `?download=1` baixa como `learning-center-estudos.ics`. Sem autenticação: quem alcança o servidor lê o plano.
