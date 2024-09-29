CREATE TABLE private.structure_hashes (
	hash character VARYING NOT NULL,
	count smallint NOT NULL,
	CONSTRAINT structure_hashes_pkey PRIMARY KEY (hash),
	CONSTRAINT structure_hashes_hash_check CHECK ((length((hash)::text) = 8))
) tablespace pg_default;