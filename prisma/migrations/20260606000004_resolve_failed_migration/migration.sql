-- Mark the failed migration as rolled back so recovery can proceed
DELETE FROM "_prisma_migrations" 
WHERE migration_name = '20260606000002_add_contact_type';
