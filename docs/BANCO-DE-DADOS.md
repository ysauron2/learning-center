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
`udemy_slug` (endereço do curso no player da Udemy, aprendido na importação; único; migração `003`),
`status` (`planned|active|paused|completed`), `manual_progress` (0–100),
`created_at`, `updated_at`.

**lc_course_tags** — `(course_id, tag)` PK composta; remove em cascata com o curso.

**lc_modules** — `id`, `course_id` → cursos (cascata), `title`, `position`.

**lc_lessons** — `id`, `module_id` → módulos (cascata), `course_id` → cursos (cascata),
`title`, `duration_min`, `position`, `completed_at` (nulo = pendente), `last_position_sec`.

**lc_study_sessions** — `id`, `course_id` / `lesson_id` (`SET NULL` ao excluir, preservando o
histórico), `kind` (`pomodoro|stopwatch|manual`), `planned_min`, `started_at`, `paused_at`,
`paused_total_sec`, `ended_at` (nulo = sessão aberta), `duration_sec`, `focus_rating` (1–5), `notes`.

**lc_notes** — `id`, `title`, `body_md` (Markdown), `course_id` / `lesson_id` (`SET NULL` ao excluir: a anotação fica, sem vínculo), `created_at`, `updated_at` (migração `004`).

**lc_note_tags** — `(note_id, tag)` PK composta; cascata com a anotação.

**lc_tracks** — `id`, `title`, `description`, `created_at`, `updated_at` (migração `005`).

**lc_track_items** — `id`, `track_id` (cascata), `position`, `course_id` (cascata: apagar o curso o tira da trilha; nulo = etapa livre), `title` (só etapa livre), `done_at`. Um curso aparece no máximo uma vez por trilha.

**lc_options** — `(kind 'category'|'platform', name)`: as categorias e plataformas que a pessoa escolhe (migração `006`, já com as sugestões padrão). O nome não diferencia maiúsculas.

**lc_study_once** — blocos de estudo avulsos (uma ocorrência só): `date` 'AAAA-MM-DD', `start_time`, `duration_min`, `course_id` (`SET NULL`), `from_plan_id`/`from_date` (de qual bloco do plano veio, sem chave estrangeira). Entra no backup (migração `009`, aditiva).

**lc_study_plan** — blocos semanais de estudo: `weekday` (0 = segunda), `start_time` 'HH:MM', `duration_min`, `course_id` (`SET NULL`). Entra no backup (migração `007`).

**lc_google** — UMA linha: ID e segredo do app no Google Cloud, tokens, conta, id do calendário de estudos, `last_sync_at`/`last_error`, `auto_sync`, `log_sessions`. **Não entra no backup** (são credenciais).

**lc_notion** — UMA linha (migração `008`): código da integração do Notion, nome do robô e do espaço, página escolhida, `database_id`/`database_url` da tabela criada, `last_sync_at`/`last_error`, `auto_sync`, `log_sessions`. **Não entra no backup** (é credencial); depois de restaurar um backup, reconecte o Notion.

**lc_settings** — `key`, `value`. Hoje guarda `weekly_goal_minutes` (padrão 480).

## Regras de negócio no banco/serviços

- Duração = `(fim − início) − pausas`. Pausas em andamento são descontadas ao finalizar.
- Apenas sessões encerradas (`ended_at` não nulo) contam em metas, gráficos e sequência.
- Excluir um curso apaga módulos, aulas e tags, mas **mantém o tempo registrado** (`course_id` vira nulo).

## Backup

Pela interface: tela **Backup** (baixa/restaura um arquivo `.json` com todas as tabelas `lc_*`, menos a de migrações; veja `docs/API.md`).

Pelo arquivo: pare o app (ou use `sqlite3 data.db ".backup copia.db"`) e copie `data/learning-center.db` junto com os arquivos `-wal` e `-shm` que estiverem ao lado, ou o volume `/data` no Docker.
