-- NULL means an older client did not record the original filename.
ALTER TABLE nihon_private.imports ADD COLUMN kanji_filename boolean;
