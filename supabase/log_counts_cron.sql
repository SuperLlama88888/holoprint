CREATE OR REPLACE FUNCTION private.log_counts_v2 ()
RETURNS void AS $$
DECLARE
	current_structure_count int;
	current_structure_combination_count int;
	current_pack_count int;
BEGIN
	SELECT count(*) INTO current_structure_count FROM private.structure_hashes;
	SELECT count(*) INTO current_structure_combination_count FROM private.combined_structure_hashes;
	SELECT count INTO current_pack_count FROM private.pack_counts WHERE category = 'total';
	
	INSERT INTO public.daily_logs (structure_count, structure_combination_count, pack_count)
	VALUES (current_structure_count, current_structure_combination_count, current_pack_count);
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';

SELECT cron.schedule('daily_logging', '0 0 * * *', 'SELECT private.log_counts_v2();'); -- every day at 00:00

SELECT * FROM cron.job;