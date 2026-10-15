-- Google Agenda.
-- lc_google: UMA linha com o ID/segredo do app no Google Cloud e os tokens da conta conectada.
--   NÃO entra no backup (são credenciais). Quem restaura um backup precisa reconectar.
-- lc_study_plan: blocos fixos de estudo na semana (entram no backup); o app os espelha no Google Agenda.
CREATE TABLE lc_google (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  client_id         TEXT    NOT NULL DEFAULT '',
  client_secret     TEXT    NOT NULL DEFAULT '',
  refresh_token     TEXT,
  access_token      TEXT,
  access_expires_at TEXT,
  account_email     TEXT,
  study_calendar_id TEXT,
  connected_at      TEXT,
  last_sync_at      TEXT,
  last_error        TEXT,
  auto_sync         INTEGER NOT NULL DEFAULT 1 CHECK (auto_sync IN (0, 1)),
  log_sessions      INTEGER NOT NULL DEFAULT 1 CHECK (log_sessions IN (0, 1))
);
INSERT INTO lc_google (id) VALUES (1);

CREATE TABLE lc_study_plan (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday      INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time   TEXT    NOT NULL CHECK (start_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  duration_min INTEGER NOT NULL CHECK (duration_min BETWEEN 5 AND 600),
  course_id    INTEGER REFERENCES lc_courses(id) ON DELETE SET NULL,
  created_at   TEXT    NOT NULL
);
