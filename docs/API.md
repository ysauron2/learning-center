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
