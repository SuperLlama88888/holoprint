-- This function is in the public schema, accessible by anyone with the public key.
-- This increments the count of a structure hash in the private structure_hashes table, and returns the new count.
-- It also increments the total count in the private pack_counts table.

CREATE OR REPLACE FUNCTION record_structure_usage (file_hash varchar)
RETURNS int AS $$
DECLARE
	current_count int;
BEGIN
	IF length(file_hash) != 8 OR file_hash ~* '[^0-9a-f]' THEN
		RAISE EXCEPTION 'Illegal file hash; please report this on GitHub!';
	END IF;
	
	UPDATE private.structure_hashes
	SET count = count + 1
	WHERE hash = file_hash
	RETURNING count INTO current_count;
	
	IF NOT FOUND THEN
		INSERT INTO private.structure_hashes (hash, count)
		VALUES (file_hash, 1);
		current_count := 1;
	END IF;
	
	UPDATE private.pack_counts
	SET count = count + 1
	WHERE category = 'total';
	IF NOT FOUND THEN
		INSERT INTO private.pack_counts (category, count)
		VALUES ('total', 1); -- should never happen but can't hurt
	END IF;
	
	RETURN current_count;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';