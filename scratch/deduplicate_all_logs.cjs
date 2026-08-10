const { Client } = require('pg');

async function cleanDuplicateDepartureLogs() {
  const client = new Client({
    connectionString: 'postgres://postgres:BNX6C1301708S@db.iuzpgljjfeobxlptmsma.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('=== CLEANING DUPLICATE ZONAL DEPARTURE LOGS ===');

  const res = await client.query(`
    SELECT id, dispatch_id, inspection_date, zonal_name, viaje_numero, target_time, actual_time, is_on_time, diff_minutes, created_at
    FROM zonal_departure_logs
    ORDER BY inspection_date DESC, zonal_name, viaje_numero, created_at DESC;
  `);

  const seenMap = new Map();
  const idsToDelete = [];

  for (const row of res.rows) {
    const dateStr = String(row.inspection_date).slice(0, 10);
    // Standardize zonal name to upper base name
    const cleanZonal = row.zonal_name.toUpperCase().replace(/\s+/g, ' ').trim();
    const key = `${dateStr}-${cleanZonal}-${row.viaje_numero || 1}`;

    if (seenMap.has(key)) {
      idsToDelete.push(row.id);
    } else {
      seenMap.set(key, row);
    }
  }

  console.log(`Found ${idsToDelete.length} duplicate zonal departure logs to delete.`);

  if (idsToDelete.length > 0) {
    const deleteRes = await client.query(`
      DELETE FROM zonal_departure_logs
      WHERE id = ANY($1::uuid[]);
    `, [idsToDelete]);
    console.log(`Successfully deleted ${deleteRes.rowCount} duplicate log rows from Supabase database.`);
  }

  const checkRem = await client.query('SELECT COUNT(*) FROM zonal_departure_logs;');
  console.log('Remaining clean zonal departure logs count:', checkRem.rows[0].count);

  await client.end();
}

cleanDuplicateDepartureLogs().catch(console.error);
