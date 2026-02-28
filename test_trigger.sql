CREATE OR REPLACE FUNCTION dev_get_triggers()
RETURNS TABLE(tgname name, relname name) AS $$
BEGIN
    RETURN QUERY SELECT t.tgname, c.relname
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    WHERE c.relname IN ('workers', 'worker_objects');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
