const { Client } = require('pg');

async function cleanDatabase() {
  const client = new Client({
    connectionString: 'postgres://postgres:BNX6C1301708S@db.iuzpgljjfeobxlptmsma.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  console.log('--- 1. CLEANING ZONAL_TARGET_TIMES ---');
  await client.query('DELETE FROM zonal_target_times;');

  const OFFICIAL_TARGETS = [
    { zonal: 'ARICA', viaje: 1, time: '17:30' },
    { zonal: 'IQUIQUE', viaje: 1, time: '17:30' },
    { zonal: 'ANTOFAGASTA', viaje: 1, time: '23:30' },
    { zonal: 'CALAMA', viaje: 1, time: '21:30' },
    { zonal: 'COPIAPÓ', viaje: 1, time: '23:30' },
    { zonal: 'LA SERENA', viaje: 1, time: '16:00' },
    { zonal: 'COQUIMBO', viaje: 1, time: '16:00' },
    { zonal: 'LOS VILOS', viaje: 1, time: '19:30' },
    { zonal: 'SAN FELIPE', viaje: 1, time: '20:00' },
    { zonal: 'VALPARAÍSO', viaje: 1, time: '15:30' },
    { zonal: 'VIÑA DEL MAR', viaje: 1, time: '18:00' },
    { zonal: 'VIÑA DEL MAR', viaje: 2, time: '23:30' },
    { zonal: 'RANCAGUA', viaje: 1, time: '20:30' },
    { zonal: 'SAN FERNANDO', viaje: 1, time: '20:30' },
    { zonal: 'TALCA', viaje: 1, time: '18:00' },
    { zonal: 'CHILLÁN', viaje: 1, time: '15:00' },
    { zonal: 'CONCEPCIÓN', viaje: 1, time: '13:00' },
    { zonal: 'LOS ÁNGELES', viaje: 1, time: '14:30' },
    { zonal: 'TEMUCO', viaje: 1, time: '12:00' },
    { zonal: 'TEMUCO', viaje: 2, time: '19:30' },
    { zonal: 'VALDIVIA', viaje: 1, time: '18:00' },
    { zonal: 'OSORNO', viaje: 1, time: '10:00' },
    { zonal: 'PUERTO MONTT', viaje: 1, time: '09:00' },
    { zonal: 'COYHAIQUE', viaje: 1, time: '13:30' },
    { zonal: 'PUNTA ARENAS', viaje: 1, time: '15:30' }
  ];

  for (const t of OFFICIAL_TARGETS) {
    await client.query(`
      INSERT INTO zonal_target_times (zonal_name, viaje_numero, target_time, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (zonal_name, viaje_numero) DO UPDATE
      SET target_time = EXCLUDED.target_time, is_active = true;
    `, [t.zonal, t.viaje, t.time]);
  }

  const newTargets = await client.query('SELECT * FROM zonal_target_times ORDER BY zonal_name, viaje_numero;');
  console.log('Cleaned Zonal Target Times Count:', newTargets.rows.length);

  console.log('--- 2. DEDUPLICATING ZONAL_DEPARTURE_LOGS ---');
  // Remove exact duplicates in zonal_departure_logs (same inspection_date, UPPER(zonal_name), viaje_numero, dispatch_id)
  const dedupQuery = `
    DELETE FROM zonal_departure_logs a
    USING zonal_departure_logs b
    WHERE a.id > b.id
      AND a.dispatch_id = b.dispatch_id
      AND UPPER(a.zonal_name) = UPPER(b.zonal_name)
      AND COALESCE(a.viaje_numero, 1) = COALESCE(b.viaje_numero, 1);
  `;
  const resDedup = await client.query(dedupQuery);
  console.log('Deleted Duplicate Logs:', resDedup.rowCount);

  // Normalize target times in zonal_departure_logs to match official targets
  await client.query(`
    UPDATE zonal_departure_logs
    SET target_time = CASE
      WHEN UPPER(zonal_name) LIKE '%SAN FERNANDO%' THEN '20:30'
      WHEN UPPER(zonal_name) LIKE '%RANCAGUA%' THEN '20:30'
      WHEN UPPER(zonal_name) LIKE '%VIÑA%' AND COALESCE(viaje_numero, 1) = 1 THEN '18:00'
      WHEN UPPER(zonal_name) LIKE '%VIÑA%' AND COALESCE(viaje_numero, 1) = 2 THEN '23:30'
      ELSE target_time
    END;
  `);

  // Recalculate is_on_time and diff_minutes in zonal_departure_logs based on new target_time
  await client.query(`
    UPDATE zonal_departure_logs
    SET 
      is_on_time = (actual_time <= target_time),
      diff_minutes = ABS(
        (EXTRACT(HOUR FROM actual_time::time) * 60 + EXTRACT(MINUTE FROM actual_time::time)) -
        (EXTRACT(HOUR FROM target_time::time) * 60 + EXTRACT(MINUTE FROM target_time::time))
      );
  `);

  console.log('Database target times & logs cleanup completed successfully.');
  await client.end();
}

cleanDatabase().catch(console.error);
