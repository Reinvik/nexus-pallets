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
    { zonal: 'VALPARAÍSO', viaje: 1, time: '23:30' },
    { zonal: 'VIÑA DEL MAR', viaje: 1, time: '23:30' },
    { zonal: 'VIÑA DEL MAR', viaje: 2, time: '23:30' },
    { zonal: 'RANCAGUA', viaje: 1, time: '21:30' },
    { zonal: 'SAN FERNANDO', viaje: 1, time: '21:30' },
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

  await client.end();
}

cleanDatabase().catch(console.error);
