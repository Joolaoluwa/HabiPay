import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../config/db';

(async () => {
  console.log('DATABASE:', await db.execute(sql`select current_database() as db, current_schema() as schema`));

  console.log('TABLES:', await db.execute(sql`
    select table_schema, table_name
    from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema')
    order by 1, 2`));

  console.log('MIGRATION HISTORY:', await db.execute(sql`
    select id, hash, created_at from drizzle.__drizzle_migrations order by id`));

  process.exit(0);
})();