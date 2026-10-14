# Banco de dados (SQLite)

Arquivo único (`DATABASE_FILE`), `journal_mode=WAL`, `foreign_keys=ON`.
Migrações em `apps/api/migrations/*.sql`, aplicadas em ordem na inicialização e
registradas em `lc_schema_migrations`. Para mudar o esquema, **crie um novo arquivo**
(`002_...sql`); nunca edite uma migração já aplicada.

Todas as tabelas usam o prefixo `lc_`, para conviver com o banco do Meu Hub.
Datas são texto ISO 8601 em UTC.

## Tabelas

**lc_courses** — `id`, `title`, `platform`, `category`, `description`, `url`,
`image_url` (capa, https; nulo = degradê padrão; migração `002`),
`status` (`planned|active|paused|completed`), `manual_progress` (0–100),
`created_at`, `updated_at`.

**lc_course_tags** — `(course_id, tag)` PK composta; remove em cascata com o curso.

**lc_modules** — `id`, `course_id` → cursos (cascata), `title`, `position`.

**lc_lessons** — `id`, `module_id` → módulos (cascata), `course_id` → cursos (cascata),
`title`, `duration_min`, `position`, `completed_at` (nulo = pendente), `last_position_sec`.

**lc_study_sessions** — `id`, `course_id` / `lesson_id` (`SET NULL` ao excluir, preservando o
histórico), `kind` (`pomodoro|stopwatch|manual`), `planned_min`, `started_at`, `paused_at`,
`paused_total_sec`, `ended_at` (nulo = sessão aberta), `duration_sec`, `focus_rating` (1–5), `notes`.

**lc_settings** — `key`, `value`. Hoje guarda `weekly_goal_minutes` (padrão 480).

## Regras de negócio no banco/serviços

- Duração = `(fim − início) − pausas`. Pausas em andamento são descontadas ao finalizar.
- Apenas sessões encerradas (`ended_at` não nulo) contam em metas, gráficos e sequência.
- Excluir um curso apaga módulos, aulas e tags, mas **mantém o tempo registrado** (`course_id` vira nulo).

## Backup

Pare o container (ou use `sqlite3 data.db ".backup copia.db"`) e copie o arquivo do volume `/data`.
