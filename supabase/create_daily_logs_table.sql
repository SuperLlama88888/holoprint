-- Not shown here: RPS policy to allow select only for all users

CREATE TABLE public.daily_logs (
	day date NOT NULL DEFAULT now(),
	structure_count smallint NULL,
	pack_count smallint NULL,
	CONSTRAINT daily_logs_pkey PRIMARY KEY (day),
	CONSTRAINT daily_logs_day_key UNIQUE (day)
) tablespace pg_default;