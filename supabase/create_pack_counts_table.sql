CREATE TABLE private.pack_counts (
	category text NOT NULL,
	count integer NOT NULL,
	CONSTRAINT pack_counts_pkey PRIMARY KEY (category),
	CONSTRAINT pack_counts_category_check CHECK ((length(category) < 50))
) tablespace pg_default;