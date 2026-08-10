const { Client } = require('pg');

async function checkDuplicateLogsByDate() {
  const client = new Client({
    connectionString: 'postgres://postgres:BNX6C1301708S@db.iuzpgljjfeobxlptmsma.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query(`
    SELECT id, dispatch_id, inspection_date, zonal_name, viaje_numero, target_time, actual_time, is_on_time, diff_minutes, created_at
    FROM zonal_departure_logs
    ORDER BY inspection_date DESC, zonal_name, viaje_numero, created_at;
  `);

  const seenMap = new Map();
  const duplicates = [];

  for (const row of res.rows) {
    const dateStr = String(row.inspection_date).slice(0, 10);
    const key = `${dateStr}-${row.zonal_name.toUpperCase()}-${row.viaje_numero || 1}`;
    if (seenMap.has(key)) {
      duplicates.push({ existing: seenMap.get(key), duplicate: row });
    } else {
      seenMap.set(key, row);
    }
  }

  console.log(`Found ${duplicates.length} duplicate zonal departure log entries across dates:`);
  duplicates.forEach((d, i) => {
    console.log(`Duplicate #${i + 1}: Key=${String(d.duplicate.inspection_date).slice(0,10)} ${d.duplicate.zonal_name} v${d.duplicate.viaje_numero || 1}`);
    console.log('  Keep ID:', d.existing.id, 'actual_time:', d.existing.actual_time, 'created_at:', d.existing.created_at);
    console.log('  Delete ID:', d.duplicate.id, 'actual_time:', d.duplicate.actual_time, 'created_at:', d.duplicate.created_at);
  });

  await client.end();
}

checkDuplicateLogsByDate().catch(console.error);
