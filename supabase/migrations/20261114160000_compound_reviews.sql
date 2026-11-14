CREATE TABLE nihon_private.compound_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event text NOT NULL,
  owner text NOT NULL REFERENCES nihon_private.accounts ON DELETE CASCADE,
  term text NOT NULL,
  reading text NOT NULL,
  rating text NOT NULL CHECK (rating IN ('Hard', 'Normal', 'Easy')),
  reviewed bigint NOT NULL,
  due bigint NOT NULL,
  UNIQUE (owner, event)
);

CREATE INDEX compound_reviews_latest ON nihon_private.compound_reviews (owner, term, reading, id DESC);

ALTER TABLE nihon_private.compound_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON nihon_private.compound_reviews FROM PUBLIC;
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON nihon_private.compound_reviews FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
