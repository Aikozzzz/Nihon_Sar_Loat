ALTER TABLE nihon_private.entries
  ADD COLUMN parts_of_speech text[] NOT NULL DEFAULT '{}'
  CHECK (
    (kind = 'Vocabulary' OR cardinality(parts_of_speech) = 0)
    AND parts_of_speech <@ ARRAY[
      'noun', 'i-adjective', 'na-adjective', 'verb', 'adverb', 'pronoun',
      'determiner', 'particle', 'conjunction', 'interjection', 'counter',
      'prefix', 'suffix', 'expression', 'other'
    ]::text[]
  );
