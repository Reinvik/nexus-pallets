const { Client } = require('pg');

async function fixDrafts() {
  const client = new Client({
    connectionString: 'postgres://postgres:BNX6C1301708S@db.iuzpgljjfeobxlptmsma.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to PostgreSQL. Updating active_truck_drafts temp_2do to 0...');
  
  const result = await client.query(`
    UPDATE active_truck_drafts
    SET temp_2do = 0
    WHERE temp_2do = -18 OR temp_2do = 18;
  `);

  console.log(`Updated ${result.rowCount} active drafts in Supabase.`);
  await client.end();
}

fixDrafts().catch(console.error);
