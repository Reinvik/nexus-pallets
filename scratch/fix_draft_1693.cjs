const { Client } = require('pg');

async function fixDraftSupervisor() {
  const client = new Client({
    connectionString: 'postgres://postgres:BNX6C1301708S@db.iuzpgljjfeobxlptmsma.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  const res = await client.query(
    "UPDATE active_truck_drafts SET supervisor_name = $1, created_by = $2 WHERE truck_number = $3",
    ['Nelson Brito', 'nelson.brito@cial.cl', '1693']
  );
  console.log(`Updated ${res.rowCount} row(s). Draft #1693 supervisor set to Nelson Brito.`);
  await client.end();
}

fixDraftSupervisor().catch(console.error);
