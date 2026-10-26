/**
 * NEXUS OUTBOUND - EXPORTADOR OFICIAL DE REPORTES EXCEL (.xlsx)
 * Genera libros Excel corporativos de alta fidelidad para CIAL Alimentos
 * con múltiples hojas, estilos institucionales, congelamiento de paneles y datos numéricos nativos.
 */

import writeXlsxFile from 'write-excel-file/browser';

export interface ExportDispatchRecord {
  id: string;
  truck_number: string;
  truck_plate: string;
  supervisor_name: string;
  inspection_date: string;
  inspection_time: string;
  positions_occupied: number;
  checklist?: Record<string, any>;
  zonals_detail?: any[];
  observations?: string;
  created_at?: string;
  temp_1er?: number;
  temp_2do?: number;
  temp_3er?: number;
  close_time?: string | null;
  truck_kilos?: string | number | null;
  anden_number?: string | null;
  signed_by?: string | null;
  signed_at?: string | null;
  signed_by_name?: string | null;
}

export interface ExportZonalDepartureLog {
  id?: string;
  dispatch_id?: string;
  inspection_date: string;
  zonal_name: string;
  viaje_numero: number;
  target_time: string;
  actual_time: string;
  is_on_time: boolean;
  diff_minutes: number;
  supervisor_name: string;
  signed_by?: string;
  signed_by_name?: string;
}

export interface ExportExcelOptions {
  periodLabel: string;
  startDate?: string;
  endDate?: string;
}

// Estilos corporativos CIAL
const HEADER_STYLE = {
  backgroundColor: '#0a5c36', // Verde Corporativo CIAL
  color: '#ffffff',
  fontWeight: 'bold' as const,
  align: 'center' as const,
  topBorderStyle: 'thin' as const,
  bottomBorderStyle: 'thin' as const,
  leftBorderStyle: 'thin' as const,
  rightBorderStyle: 'thin' as const,
  borderColor: '#064e2c'
};

const CELL_BORDER = {
  topBorderStyle: 'thin' as const,
  bottomBorderStyle: 'thin' as const,
  leftBorderStyle: 'thin' as const,
  rightBorderStyle: 'thin' as const,
  borderColor: '#e2e8f0'
};

/**
 * Calcula totales de pallets y kilos de un zonal
 */
function getZonalMetrics(z: any) {
  const wood = (z?.congelados?.wood_bases || 0) + (z?.congelados?.wood_extra || 0) +
               (z?.estandar?.wood_bases || 0) + (z?.estandar?.wood_extra || 0) +
               (z?.bandejas?.wood_bases || 0) + (z?.bandejas?.wood_extra || 0);

  const plastic = (z?.congelados?.plastic_bases || 0) + (z?.congelados?.plastic_extra || 0) +
                  (z?.estandar?.plastic_bases || 0) + (z?.estandar?.plastic_extra || 0) +
                  (z?.bandejas?.plastic_bases || 0) + (z?.bandejas?.plastic_extra || 0);

  const bandejas = Number(z?.bandejas?.bandejas_count) || 0;

  const kilos = (Number(z?.congelados?.kilos) || 0) +
                (Number(z?.estandar?.kilos) || 0) +
                (Number(z?.bandejas?.kilos) || 0);

  return {
    wood,
    plastic,
    totalPallets: wood + plastic,
    bandejas,
    kilos
  };
}

/**
 * Genera y descarga el archivo Excel oficial de Nexus Outbound
 */
export async function exportKpiToExcel(
  records: ExportDispatchRecord[],
  departureLogs: ExportZonalDepartureLog[],
  options: ExportExcelOptions
): Promise<void> {
  const { periodLabel } = options;

  // -------------------------------------------------------------
  // HOJA 1: DESPACHOS Y CAMIONES (1 fila por camión)
  // -------------------------------------------------------------
  const sheet1Columns = [
    { width: 14 }, // Fecha
    { width: 13 }, // N° Camión
    { width: 13 }, // Patente
    { width: 10 }, // Andén
    { width: 22 }, // Supervisor
    { width: 22 }, // Responsable / Firmante
    { width: 14 }, // Hora Cierre
    { width: 13 }, // Hora Inicio
    { width: 16 }, // Hora Meta SLA
    { width: 18 }, // Cumplimiento SLA
    { width: 16 }, // Minutos Margen
    { width: 16 }, // Kilos Totales
    { width: 14 }, // Total Pallets
    { width: 15 }, // Pallets Madera
    { width: 15 }, // Pallets Plástico
    { width: 14 }, // Total Bandejas
    { width: 18 }, // Posiciones Ocupadas
    { width: 28 }, // Zonales Despachados
    { width: 20 }, // Sellos de Seguridad
    { width: 12 }, // Temp 1°
    { width: 12 }, // Temp 2°
    { width: 12 }, // Temp 3°
    { width: 35 }  // Observaciones
  ];

  const sheet1Headers = [
    { value: 'Fecha Despacho', ...HEADER_STYLE },
    { value: 'N° Camión', ...HEADER_STYLE },
    { value: 'Patente', ...HEADER_STYLE },
    { value: 'Andén', ...HEADER_STYLE },
    { value: 'Supervisor', ...HEADER_STYLE },
    { value: 'Responsable (Firma)', ...HEADER_STYLE },
    { value: 'Hora Cierre Camión', ...HEADER_STYLE },
    { value: 'Hora Inicio', ...HEADER_STYLE },
    { value: 'Hora Meta Salida', ...HEADER_STYLE },
    { value: 'Estado Cumplimiento', ...HEADER_STYLE },
    { value: 'Minutos Margen', ...HEADER_STYLE },
    { value: 'Kilos Totales (kg)', ...HEADER_STYLE },
    { value: 'Total Pallets', ...HEADER_STYLE },
    { value: 'Pallets Madera', ...HEADER_STYLE },
    { value: 'Pallets Plástico', ...HEADER_STYLE },
    { value: 'Total Bandejas', ...HEADER_STYLE },
    { value: 'Posiciones (Cap. 26)', ...HEADER_STYLE },
    { value: 'Zonales Asignados', ...HEADER_STYLE },
    { value: 'Sellos de Seguridad', ...HEADER_STYLE },
    { value: 'Temp 1° (°C)', ...HEADER_STYLE },
    { value: 'Temp 2° (°C)', ...HEADER_STYLE },
    { value: 'Temp 3° (°C)', ...HEADER_STYLE },
    { value: 'Observaciones', ...HEADER_STYLE }
  ];

  const sheet1Data: any[] = [sheet1Headers];

  records.forEach((rec) => {
    const zonals = Array.isArray(rec.zonals_detail) ? rec.zonals_detail : [];

    let totalWood = 0;
    let totalPlastic = 0;
    let totalBandejas = 0;
    let calculatedKilos = 0;
    const zonalNames: string[] = [];
    const sellos: string[] = [];

    zonals.forEach((z) => {
      const m = getZonalMetrics(z);
      totalWood += m.wood;
      totalPlastic += m.plastic;
      totalBandejas += m.bandejas;
      calculatedKilos += m.kilos;

      if (z.zonal_name) {
        zonalNames.push(`${z.zonal_name}${z.viaje_numero > 1 ? ' ' + z.viaje_numero : ''}`);
      }
      if (z.sello) {
        sellos.push(z.sello);
      }
    });

    // Kilos finales
    let kilosNum = 0;
    if (typeof rec.truck_kilos === 'number') {
      kilosNum = rec.truck_kilos;
    } else if (typeof rec.truck_kilos === 'string' && rec.truck_kilos.trim()) {
      const parsed = parseFloat(rec.truck_kilos.replace(/\./g, '').replace(',', '.'));
      kilosNum = isNaN(parsed) ? calculatedKilos : parsed;
    } else {
      kilosNum = calculatedKilos;
    }

    // SLA Matching con zonalDepartureLogs
    const matchingLog = departureLogs.find(
      (l) => l.dispatch_id === rec.id ||
             (l.inspection_date === rec.inspection_date &&
              rec.truck_plate &&
              (l.supervisor_name === rec.supervisor_name))
    );

    let slaStatus = 'Sin Registro';
    let slaColor = '#64748b';
    let targetTimeStr = '-';
    let diffMinutesVal = 0;

    if (matchingLog) {
      targetTimeStr = matchingLog.target_time || '-';
      diffMinutesVal = matchingLog.diff_minutes || 0;
      if (matchingLog.is_on_time) {
        slaStatus = 'A TIEMPO';
        slaColor = '#059669'; // Verde
      } else {
        slaStatus = 'CON RETRASO';
        slaColor = '#dc2626'; // Rojo
      }
    } else if (rec.close_time) {
      slaStatus = 'Cerrado';
      slaColor = '#0f766e';
    } else {
      slaStatus = 'En Carga';
      slaColor = '#d97706';
    }

    const row = [
      { value: rec.inspection_date || '', align: 'center', type: String, ...CELL_BORDER },
      { value: rec.truck_number || '', align: 'center', type: String, ...CELL_BORDER },
      { value: (rec.truck_plate || '').toUpperCase(), align: 'center', fontWeight: 'bold', type: String, ...CELL_BORDER },
      { value: rec.anden_number || '-', align: 'center', type: String, ...CELL_BORDER },
      { value: rec.supervisor_name || '', align: 'left', type: String, ...CELL_BORDER },
      { value: rec.signed_by_name || rec.signed_by || 'Pendiente Firma', align: 'left', type: String, ...CELL_BORDER },
      { value: rec.close_time || 'En curso', align: 'center', fontWeight: rec.close_time ? 'bold' : 'normal', type: String, ...CELL_BORDER },
      { value: rec.inspection_time || '', align: 'center', type: String, ...CELL_BORDER },
      { value: targetTimeStr, align: 'center', type: String, ...CELL_BORDER },
      { value: slaStatus, align: 'center', fontWeight: 'bold', color: slaColor, type: String, ...CELL_BORDER },
      { value: diffMinutesVal, align: 'right', type: Number, ...CELL_BORDER },
      { value: kilosNum, align: 'right', type: Number, fontWeight: 'bold', ...CELL_BORDER },
      { value: totalWood + totalPlastic, align: 'right', fontWeight: 'bold', type: Number, ...CELL_BORDER },
      { value: totalWood, align: 'right', type: Number, ...CELL_BORDER },
      { value: totalPlastic, align: 'right', type: Number, ...CELL_BORDER },
      { value: totalBandejas, align: 'right', type: Number, ...CELL_BORDER },
      { value: rec.positions_occupied ?? 26, align: 'right', type: Number, ...CELL_BORDER },
      { value: zonalNames.join(', ') || '-', align: 'left', type: String, ...CELL_BORDER },
      { value: sellos.join(' | ') || '-', align: 'center', type: String, ...CELL_BORDER },
      { value: rec.temp_1er ?? 0, align: 'right', type: Number, ...CELL_BORDER },
      { value: rec.temp_2do ?? 0, align: 'right', type: Number, ...CELL_BORDER },
      { value: rec.temp_3er ?? 0, align: 'right', type: Number, ...CELL_BORDER },
      { value: rec.observations || '', align: 'left', type: String, ...CELL_BORDER }
    ];

    sheet1Data.push(row);
  });

  // -------------------------------------------------------------
  // HOJA 2: DETALLE POR ZONAL (1 fila por zonal de cada camión)
  // -------------------------------------------------------------
  const sheet2Columns = [
    { width: 14 }, // Fecha
    { width: 13 }, // Patente
    { width: 13 }, // N° Camión
    { width: 22 }, // Zonal
    { width: 10 }, // N° Viaje
    { width: 16 }, // Posición Camión
    { width: 16 }, // Sello Zonal
    { width: 15 }, // Kilos Zonal
    { width: 15 }, // Total Pallets
    { width: 15 }, // Pallets Madera
    { width: 15 }, // Pallets Plástico
    { width: 14 }, // Bandejas
    { width: 15 }, // Hora Estimada
    { width: 14 }, // Hora Cierre
    { width: 18 }, // Estado Cumplimiento
    { width: 16 }, // Minutos Diferencia
    { width: 22 }  // Supervisor
  ];

  const sheet2Headers = [
    { value: 'Fecha Despacho', ...HEADER_STYLE },
    { value: 'Patente Camión', ...HEADER_STYLE },
    { value: 'N° Camión', ...HEADER_STYLE },
    { value: 'Zonal Destino', ...HEADER_STYLE },
    { value: 'Viaje N°', ...HEADER_STYLE },
    { value: 'Posición Camión', ...HEADER_STYLE },
    { value: 'Sello Zonal', ...HEADER_STYLE },
    { value: 'Kilos Zonal (kg)', ...HEADER_STYLE },
    { value: 'Total Pallets Zonal', ...HEADER_STYLE },
    { value: 'Pallets Madera', ...HEADER_STYLE },
    { value: 'Pallets Plástico', ...HEADER_STYLE },
    { value: 'Bandejas', ...HEADER_STYLE },
    { value: 'Hora Meta Estimada', ...HEADER_STYLE },
    { value: 'Hora Cierre Camión', ...HEADER_STYLE },
    { value: 'Cumplimiento Salida', ...HEADER_STYLE },
    { value: 'Minutos Margen', ...HEADER_STYLE },
    { value: 'Supervisor', ...HEADER_STYLE }
  ];

  const sheet2Data: any[] = [sheet2Headers];

  records.forEach((rec) => {
    const zonals = Array.isArray(rec.zonals_detail) ? rec.zonals_detail : [];

    zonals.forEach((z) => {
      const m = getZonalMetrics(z);

      // Buscar log de salida de este zonal específico si existe
      const log = departureLogs.find(
        (l) => l.dispatch_id === rec.id && l.zonal_name.toLowerCase().includes(z.zonal_name.toLowerCase())
      ) || departureLogs.find(
        (l) => l.inspection_date === rec.inspection_date && l.zonal_name.toLowerCase().includes(z.zonal_name.toLowerCase())
      );

      let estado = 'Sin Registro';
      let estadoColor = '#64748b';
      let metaHora = '-';
      let diffMin = 0;

      if (log) {
        metaHora = log.target_time || '-';
        diffMin = log.diff_minutes || 0;
        if (log.is_on_time) {
          estado = 'A TIEMPO';
          estadoColor = '#059669';
        } else {
          estado = 'CON RETRASO';
          estadoColor = '#dc2626';
        }
      } else if (rec.close_time) {
        estado = 'Cerrado';
        estadoColor = '#0f766e';
      }

      sheet2Data.push([
        { value: rec.inspection_date || '', align: 'center', type: String, ...CELL_BORDER },
        { value: (rec.truck_plate || '').toUpperCase(), align: 'center', fontWeight: 'bold', type: String, ...CELL_BORDER },
        { value: rec.truck_number || '', align: 'center', type: String, ...CELL_BORDER },
        { value: z.zonal_name || 'Sin Zonal', align: 'left', fontWeight: 'bold', type: String, ...CELL_BORDER },
        { value: z.viaje_numero || 1, align: 'center', type: Number, ...CELL_BORDER },
        { value: z.lugar_camion || '1° (Fondo)', align: 'center', type: String, ...CELL_BORDER },
        { value: z.sello || '-', align: 'center', type: String, ...CELL_BORDER },
        { value: m.kilos, align: 'right', fontWeight: 'bold', type: Number, ...CELL_BORDER },
        { value: m.totalPallets, align: 'right', fontWeight: 'bold', type: Number, ...CELL_BORDER },
        { value: m.wood, align: 'right', type: Number, ...CELL_BORDER },
        { value: m.plastic, align: 'right', type: Number, ...CELL_BORDER },
        { value: m.bandejas, align: 'right', type: Number, ...CELL_BORDER },
        { value: metaHora, align: 'center', type: String, ...CELL_BORDER },
        { value: rec.close_time || 'En curso', align: 'center', type: String, ...CELL_BORDER },
        { value: estado, align: 'center', fontWeight: 'bold', color: estadoColor, type: String, ...CELL_BORDER },
        { value: diffMin, align: 'right', type: Number, ...CELL_BORDER },
        { value: rec.supervisor_name || '', align: 'left', type: String, ...CELL_BORDER }
      ]);
    });
  });

  // -------------------------------------------------------------
  // HOJA 3: RESUMEN DE KPIS Y CUMPLIMIENTO HORARIO
  // -------------------------------------------------------------
  const sheet3Columns = [
    { width: 28 }, // Categoría / Nombre
    { width: 16 }, // Total Salidas
    { width: 16 }, // A Tiempo
    { width: 16 }, // Con Retraso
    { width: 18 }, // % Cumplimiento
    { width: 22 }  // Margen Promedio
  ];

  // Agrupación por Supervisor
  const supervisorMap = new Map<string, { total: number; onTime: number; late: number; totalDiff: number }>();
  departureLogs.forEach((l) => {
    const sName = l.supervisor_name || 'Sin Asignar';
    if (!supervisorMap.has(sName)) {
      supervisorMap.set(sName, { total: 0, onTime: 0, late: 0, totalDiff: 0 });
    }
    const item = supervisorMap.get(sName)!;
    item.total += 1;
    if (l.is_on_time) item.onTime += 1;
    else item.late += 1;
    item.totalDiff += (l.diff_minutes || 0);
  });

  // Agrupación por Zonal
  const zonalMap = new Map<string, { total: number; onTime: number; late: number; totalDiff: number }>();
  departureLogs.forEach((l) => {
    const zName = (l.zonal_name || 'Sin Zonal').replace(/\s+\d+$/, ''); // Unificar viajes
    if (!zonalMap.has(zName)) {
      zonalMap.set(zName, { total: 0, onTime: 0, late: 0, totalDiff: 0 });
    }
    const item = zonalMap.get(zName)!;
    item.total += 1;
    if (l.is_on_time) item.onTime += 1;
    else item.late += 1;
    item.totalDiff += (l.diff_minutes || 0);
  });

  const sheet3Data: any[] = [
    // Título Principal
    [
      { value: `INFORME GERENCIAL KPI SALIDAS - CIAL ALIMENTOS`, fontWeight: 'bold', fontSize: 13, color: '#0a5c36' }
    ],
    [
      { value: `Período: ${periodLabel} · Generado el ${new Date().toLocaleString('es-CL')}`, color: '#64748b', fontSize: 10 }
    ],
    [], // fila vacía
    // Sección 1: Supervisores
    [
      { value: '1. CUMPLIMIENTO POR SUPERVISOR DE DESPACHO', fontWeight: 'bold', backgroundColor: '#e2e8f0', color: '#1e293b' }
    ],
    [
      { value: 'Supervisor', ...HEADER_STYLE },
      { value: 'Total Salidas', ...HEADER_STYLE },
      { value: 'A Tiempo', ...HEADER_STYLE },
      { value: 'Con Retraso', ...HEADER_STYLE },
      { value: '% Cumplimiento', ...HEADER_STYLE },
      { value: 'Margen Promedio (min)', ...HEADER_STYLE }
    ]
  ];

  Array.from(supervisorMap.entries())
    .map(([name, s]) => ({
      name,
      ...s,
      rate: s.total > 0 ? Math.round((s.onTime / s.total) * 100) : 0,
      avgDiff: s.total > 0 ? Math.round(s.totalDiff / s.total) : 0
    }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
    .forEach((s) => {
      const rateColor = s.rate >= 90 ? '#059669' : s.rate >= 75 ? '#d97706' : '#dc2626';
      sheet3Data.push([
        { value: s.name, align: 'left', fontWeight: 'bold', type: String, ...CELL_BORDER },
        { value: s.total, align: 'right', type: Number, ...CELL_BORDER },
        { value: s.onTime, align: 'right', color: '#059669', type: Number, ...CELL_BORDER },
        { value: s.late, align: 'right', color: '#dc2626', type: Number, ...CELL_BORDER },
        { value: `${s.rate}%`, align: 'right', fontWeight: 'bold', color: rateColor, type: String, ...CELL_BORDER },
        { value: s.avgDiff, align: 'right', type: Number, ...CELL_BORDER }
      ]);
    });

  // Sección 2: Zonales
  sheet3Data.push([]); // fila vacía
  sheet3Data.push([
    { value: '2. CUMPLIMIENTO POR ZONAL DE DESTINO', fontWeight: 'bold', backgroundColor: '#e2e8f0', color: '#1e293b' }
  ]);
  sheet3Data.push([
    { value: 'Zonal Destino', ...HEADER_STYLE },
    { value: 'Total Salidas', ...HEADER_STYLE },
    { value: 'A Tiempo', ...HEADER_STYLE },
    { value: 'Con Retraso', ...HEADER_STYLE },
    { value: '% Cumplimiento', ...HEADER_STYLE },
    { value: 'Margen Promedio (min)', ...HEADER_STYLE }
  ]);

  Array.from(zonalMap.entries())
    .map(([name, z]) => ({
      name,
      ...z,
      rate: z.total > 0 ? Math.round((z.onTime / z.total) * 100) : 0,
      avgDiff: z.total > 0 ? Math.round(z.totalDiff / z.total) : 0
    }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
    .forEach((z) => {
      const rateColor = z.rate >= 90 ? '#059669' : z.rate >= 75 ? '#d97706' : '#dc2626';
      sheet3Data.push([
        { value: z.name, align: 'left', fontWeight: 'bold', type: String, ...CELL_BORDER },
        { value: z.total, align: 'right', type: Number, ...CELL_BORDER },
        { value: z.onTime, align: 'right', color: '#059669', type: Number, ...CELL_BORDER },
        { value: z.late, align: 'right', color: '#dc2626', type: Number, ...CELL_BORDER },
        { value: `${z.rate}%`, align: 'right', fontWeight: 'bold', color: rateColor, type: String, ...CELL_BORDER },
        { value: z.avgDiff, align: 'right', type: Number, ...CELL_BORDER }
      ]);
    });

  // Configuración de las 3 hojas del libro
  const sheets = [
    {
      sheet: 'Despachos y Camiones',
      columns: sheet1Columns,
      stickyRowsCount: 1,
      data: sheet1Data
    },
    {
      sheet: 'Detalle Zonales',
      columns: sheet2Columns,
      stickyRowsCount: 1,
      data: sheet2Data
    },
    {
      sheet: 'Resumen KPIs Salidas',
      columns: sheet3Columns,
      data: sheet3Data
    }
  ];

  // Fecha para nombre de archivo
  const fileDateStr = new Date().toISOString().slice(0, 10);
  const cleanPeriod = periodLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  const fileName = `Nexus_Outbound_KPI_${cleanPeriod}_${fileDateStr}.xlsx`;

  // Generar y descargar el archivo directamente en el navegador
  const excelWriter = writeXlsxFile(sheets);
  await excelWriter.toFile(fileName);
}
