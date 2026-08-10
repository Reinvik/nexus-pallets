const { Client } = require('pg');

async function updateTargetsAndRecalculate() {
  const client = new Client({
    connectionString: 'postgres://postgres:BNX6C1301708S@db.iuzpgljjfeobxlptmsma.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('=== UPDATING CORRECT TARGET TIMES & RE-EVALUATING LOGS ===');

  const CORRECT_TARGETS = [
    { zonal: 'VIÑA DEL MAR', viaje: 1, time: '23:30' },
    { zonal: 'VIÑA DEL MAR', viaje: 2, time: '23:30' },
    { zonal: 'SAN FERNANDO', viaje: 1, time: '21:30' },
    { zonal: 'RANCAGUA', viaje: 1, time: '21:30' },
    { zonal: 'TALCA', viaje: 1, time: '18:00' },
    { zonal: 'CHILLÁN', viaje: 1, time: '15:00' },
    { zonal: 'CONCEPCIÓN', viaje: 1, time: '13:00' },
    { zonal: 'LOS ÁNGELES', viaje: 1, time: '14:30' },
    { zonal: 'TEMUCO', viaje: 1, time: '12:00' },
    { zonal: 'TEMUCO', viaje: 2, time: '19:30' },
    { zonal: 'VALDIVIA', viaje: 1, time: '18:00' },
    { zonal: 'OSORNO', viaje: 1, time: '10:00' },
    { zonal: 'PUERTO MONTT', viaje: 1, time: '09:00' },
    { zonal: 'ANTOFAGASTA', viaje: 1, time: '23:30' },
    { zonal: 'CALAMA', viaje: 1, time: '21:30' },
    { zonal: 'COPIAPÓ', viaje: 1, time: '23:30' },
    { zonal: 'ARICA', viaje: 1, time: '17:30' },
    { zonal: 'IQUIQUE', viaje: 1, time: '17:30' },
    { zonal: 'LA SERENA', viaje: 1, time: '16:00' },
    { zonal: 'COQUIMBO', viaje: 1, time: '16:00' },
    { zonal: 'LOS VILOS', viaje: 1, time: '19:30' },
    { zonal: 'SAN FELIPE', viaje: 1, time: '20:00' },
    { zonal: 'VALPARAÍSO', viaje: 1, time: '23:30' },
    { zonal: 'COYHAIQUE', viaje: 1, time: '13:30' },
    { zonal: 'PUNTA ARENAS', viaje: 1, time: '15:30' }
  ];

  // 1. Actualizar zonal_target_times
  for (const t of CORRECT_TARGETS) {
    await client.query(`
      INSERT INTO zonal_target_times (zonal_name, viaje_numero, target_time, is_active)
      VALUES ($1, $2, $3, true)
      ON CONFLICT (zonal_name, viaje_numero) DO UPDATE
      SET target_time = EXCLUDED.target_time, is_active = true;
    `, [t.zonal, t.viaje, t.time]);
  }

  console.log('1. Updated zonal_target_times with official closing times.');

  // 2. Actualizar target_time en zonal_departure_logs según la tabla oficial
  for (const t of CORRECT_TARGETS) {
    await client.query(`
      UPDATE zonal_departure_logs
      SET target_time = $3
      WHERE UPPER(zonal_name) = $1 AND COALESCE(viaje_numero, 1) = $2;
    `, [t.zonal, t.viaje, t.time]);
  }

  // Fallback general para Viña, San Fernando y Rancagua si vienen con nombres ligeramente distintos
  await client.query(`
    UPDATE zonal_departure_logs
    SET target_time = '23:30'
    WHERE UPPER(zonal_name) LIKE '%VIÑA%';
  `);

  await client.query(`
    UPDATE zonal_departure_logs
    SET target_time = '21:30'
    WHERE UPPER(zonal_name) LIKE '%SAN FERNANDO%' OR UPPER(zonal_name) LIKE '%RANCAGUA%';
  `);

  // 3. Recalcular is_on_time y diff_minutes en zonal_departure_logs
  await client.query(`
    UPDATE zonal_departure_logs
    SET 
      is_on_time = (actual_time::time <= target_time::time),
      diff_minutes = CASE
        WHEN actual_time::time <= target_time::time THEN 0
        ELSE ROUND(EXTRACT(EPOCH FROM (actual_time::time - target_time::time)) / 60)
      END;
  `);

  const lateLogs = await client.query(`
    SELECT zonal_name, inspection_date, target_time, actual_time, is_on_time, diff_minutes
    FROM zonal_departure_logs
    WHERE is_on_time = false
    ORDER BY inspection_date DESC;
  `);

  console.log('2. Recalculated is_on_time for all departure logs.');
  console.log(`Current total late logs in DB: ${lateLogs.rows.length}`);
  console.log('Sample late logs remaining:', lateLogs.rows.slice(0, 10));

  await client.end();
}

updateTargetsAndRecalculate().catch(console.error);
