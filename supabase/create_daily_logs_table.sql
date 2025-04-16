-- Not shown here: RPS policy to allow select only for all users

CREATE TABLE public.daily_logs (
	day date NOT NULL DEFAULT now(),
	structure_count integer NULL,
	structure_combination_count integer NULL,
	pack_count integer NULL,
	CONSTRAINT daily_logs_pkey primary key (day)
) TABLESPACE pg_default;