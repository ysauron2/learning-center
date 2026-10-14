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
- `POST /courses` — `{ title*, platform, category, description, url, status, manualProgress, tags[] }`
- `GET /courses/:id` — curso com `modules[].lessons[]`.
- `PATCH /courses/:id` — mesmos campos, todos opcionais.
- `POST /courses/:id/status` — `{ status: planned|active|paused|completed }` (concluir força 100% manual).
- `DELETE /courses/:id`

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
