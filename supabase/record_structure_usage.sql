-- This function is in the public schema, accessible by anyone with the public key.
-- This records the usage of each individual structure file through its hash, as well as usage of the combined file hash (when dealing with multiple structures).
-- It also increments the total count in the private pack_counts table.

CREATE OR REPLACE FUNCTION record_structure_usage_v2 (file_hashes varchar[], combined_file_hash varchar)
RETURNS int AS $$
DECLARE
	combined_file_hash_count int; -- How many times the combined file hash has been recorded
	file_hash varchar;
BEGIN
	-- Validate all file hashes before inserting anything
	IF NOT combined_file_hash ~* '^[0-9a-f]{8}$' THEN
		RAISE EXCEPTION 'Illegal combined file hash; please report this on GitHub!';
	END IF;
	FOREACH file_hash IN ARRAY file_hashes LOOP
		IF NOT file_hash ~* '^[0-9a-f]{8}$' THEN
			RAISE EXCEPTION 'Illegal file hash; please report this on GitHub!';
		END IF;
	END LOOP;
	
	-- Update the combined file hash, and each individual file hash
	UPDATE private.combined_structure_hashes
	SET count = count + 1
	WHERE hash = combined_file_hash
	RETURNING count INTO combined_file_hash_count;
	IF NOT FOUND THEN
		INSERT INTO private.combined_structure_hashes (hash, count)
		VALUES (combined_file_hash, 1);
		combined_file_hash_count := 1;
	END IF;
	
	FOREACH file_hash IN ARRAY file_hashes LOOP
		UPDATE private.structure_hashes
		SET count = count + 1
		WHERE hash = file_hash;
		IF NOT FOUND THEN
			INSERT INTO private.structure_hashes (hash, count)
			VALUES (file_hash, 1);
		END IF;
	END LOOP;
	
	-- Increase total pack counter
	UPDATE private.pack_counts
	SET count = count + 1
	WHERE category = 'total';
	IF NOT FOUND THEN
		INSERT INTO private.pack_counts (category, count)
		VALUES ('total', 1); -- should never happen but can't hurt
	END IF;
	
	RETURN combined_file_hash_count;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '';