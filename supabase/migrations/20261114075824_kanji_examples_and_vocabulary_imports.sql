ALTER TABLE nihon_private.imports
  ADD COLUMN import_kind text CHECK (import_kind IN ('Kanji', 'Vocabulary', 'mixed'));

ALTER TABLE nihon_private.entries
  ADD COLUMN examples jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(examples) = 'array' AND (kind = 'Kanji' OR examples = '[]'::jsonb));
