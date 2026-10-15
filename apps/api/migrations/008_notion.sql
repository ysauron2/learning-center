-- Notion: UMA linha com o código da integração (token) e a tabela "Learning Center · Estudos" criada pelo app.
-- NÃO entra no backup (o código é uma credencial). Quem restaura um backup precisa reconectar.
CREATE TABLE lc_notion (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  token          TEXT,
  bot_name       TEXT,
  workspace_name TEXT,
  parent_page_id TEXT,
  database_id    TEXT,
  database_url   TEXT,
  connected_at   TEXT,
  last_sync_at   TEXT,
  last_error     TEXT,
  auto_sync      INTEGER NOT NULL DEFAULT 1 CHECK (auto_sync IN (0, 1)),
  log_sessions   INTEGER NOT NULL DEFAULT 1 CHECK (log_sessions IN (0, 1))
);
INSERT INTO lc_notion (id) VALUES (1);
