CREATE SCHEMA nihon_private;
REVOKE ALL ON SCHEMA nihon_private FROM PUBLIC;

CREATE TABLE nihon_private.accounts (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  onboarded integer NOT NULL DEFAULT 0 CHECK (onboarded IN (0, 1))
);
CREATE TABLE nihon_private.sessions (
  token text PRIMARY KEY,
  owner text NOT NULL REFERENCES nihon_private.accounts ON DELETE CASCADE,
  expires bigint NOT NULL
);
CREATE TABLE nihon_private.auth_attempts (
  client text PRIMARY KEY,
  count integer NOT NULL,
  expires bigint NOT NULL
);
CREATE TABLE nihon_private.verified_accounts (
  owner text PRIMARY KEY REFERENCES nihon_private.accounts ON DELETE CASCADE
);
CREATE TABLE nihon_private.email_tokens (
  token text PRIMARY KEY,
  owner text NOT NULL REFERENCES nihon_private.accounts ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('verify', 'reset')),
  expires bigint NOT NULL,
  return_to text NOT NULL
);
CREATE TABLE nihon_private.entries (
  id text PRIMARY KEY,
  owner text NOT NULL REFERENCES nihon_private.accounts ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('Kanji', 'Vocabulary')),
  identity bytea NOT NULL,
  term text NOT NULL,
  reading text NOT NULL,
  meaning text NOT NULL,
  rating text CHECK (rating IN ('Hard', 'Normal', 'Easy')),
  due bigint,
  studied bigint NOT NULL,
  UNIQUE (owner, kind, identity),
  UNIQUE (owner, id)
);
CREATE TABLE nihon_private.sources (
  entry text NOT NULL REFERENCES nihon_private.entries ON DELETE CASCADE,
  document text NOT NULL,
  title text NOT NULL,
  page integer NOT NULL DEFAULT 0 CHECK (page >= 0),
  PRIMARY KEY (entry, document, page)
);
CREATE TABLE nihon_private.reviews (
  id text PRIMARY KEY,
  entry text NOT NULL REFERENCES nihon_private.entries ON DELETE CASCADE,
  rating text NOT NULL CHECK (rating IN ('Hard', 'Normal', 'Easy')),
  reviewed bigint NOT NULL,
  due bigint NOT NULL
);
CREATE TABLE nihon_private.pairs (
  owner text NOT NULL REFERENCES nihon_private.accounts ON DELETE CASCADE,
  first text NOT NULL,
  second text NOT NULL CHECK (first <> second),
  PRIMARY KEY (owner, first, second),
  FOREIGN KEY (owner, first) REFERENCES nihon_private.entries(owner, id) ON DELETE CASCADE,
  FOREIGN KEY (owner, second) REFERENCES nihon_private.entries(owner, id) ON DELETE CASCADE
);
CREATE TABLE nihon_private.passages (
  id text PRIMARY KEY,
  owner text NOT NULL REFERENCES nihon_private.accounts ON DELETE CASCADE,
  data jsonb NOT NULL,
  created bigint NOT NULL,
  saved integer NOT NULL DEFAULT 0 CHECK (saved IN (0, 1))
);
CREATE TABLE nihon_private.imports (
  id text PRIMARY KEY,
  owner text NOT NULL REFERENCES nihon_private.accounts ON DELETE CASCADE,
  name text NOT NULL,
  document text NOT NULL,
  pdf bytea,
  created bigint NOT NULL,
  expires bigint NOT NULL,
  confirmed bigint,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  layout text NOT NULL DEFAULT 'auto' CHECK (layout IN ('auto', 'horizontal', 'vertical'))
);
CREATE TABLE nihon_private.import_pages (
  job text NOT NULL REFERENCES nihon_private.imports ON DELETE CASCADE,
  page integer NOT NULL CHECK (page > 0),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  ocr integer NOT NULL DEFAULT 0 CHECK (ocr IN (0, 1)),
  error text,
  candidates jsonb,
  lease text,
  until bigint,
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (job, page)
);
CREATE TABLE nihon_private.ai_requests (
  owner text PRIMARY KEY REFERENCES nihon_private.accounts ON DELETE CASCADE,
  token text NOT NULL,
  until bigint NOT NULL
);
CREATE TABLE nihon_private.metrics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation text NOT NULL,
  result text NOT NULL,
  duration bigint NOT NULL,
  tokens integer NOT NULL,
  created bigint NOT NULL
);

CREATE INDEX sessions_owner ON nihon_private.sessions(owner);
CREATE INDEX sessions_expiry ON nihon_private.sessions(expires);
CREATE INDEX auth_attempts_expiry ON nihon_private.auth_attempts(expires);
CREATE INDEX email_tokens_owner_purpose ON nihon_private.email_tokens(owner, purpose);
CREATE INDEX email_tokens_expiry ON nihon_private.email_tokens(expires);
CREATE INDEX entries_owner_studied ON nihon_private.entries(owner, studied DESC, id);
CREATE INDEX reviews_entry ON nihon_private.reviews(entry);
CREATE INDEX pairs_owner_second ON nihon_private.pairs(owner, second);
CREATE INDEX passages_owner ON nihon_private.passages(owner, saved, created DESC);
CREATE INDEX passages_unsaved_expiry ON nihon_private.passages(created) WHERE saved = 0;
CREATE INDEX imports_owner ON nihon_private.imports(owner, created DESC, id);
CREATE INDEX imports_expiry ON nihon_private.imports(expires) WHERE confirmed IS NULL;
CREATE INDEX import_pages_queue ON nihon_private.import_pages(status, until)
  WHERE status IN ('queued', 'processing');
CREATE INDEX metrics_expiry ON nihon_private.metrics(created);

-- The application uses a server connection and app sessions. Browser roles have no access.
DO $$
DECLARE
  table_name text;
  api_role text;
BEGIN
  FOR table_name IN SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'nihon_private' LOOP
    EXECUTE format('ALTER TABLE nihon_private.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA nihon_private FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA nihon_private FROM %I', api_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA nihon_private FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
