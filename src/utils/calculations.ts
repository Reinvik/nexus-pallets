/**
 * NEXUS PALLETS - MÓDULO CENTRAL DE CÁLCULOS Y REGLAS DE NEGOCIO
 * Cumplimiento CIS Control 16.12 (Automated Application Testing)
 * 
 * Centraliza la lógica matemática crítica:
 * - Suma de pallets (madera y plástico) por zonal y total de camión.
 * - Balance zonal de salidas vs retornos al Centro de Distribución.
 * - Cálculo de SLA horario y minutos de retraso en salidas de camiones.
 * - Formateo y validación de fechas/horas en zona horaria oficial de Chile.
 * - Validación de rangos de temperatura de carga frigorífica CIAL (-18°C).
 */

export interface ZonalDispatchItem {
  zonal: string;
  wood_pallets: number;
  plastic_pallets: number;
  total?: number;
}

export interface PalletTotalsResult {
  totalWood: number;
  totalPlastic: number;
  grandTotal: number;
}

export interface ZonalBalanceSummary {
  zonal: string;
  woodSent: number;
  woodReturned: number;
  woodBalance: number;
  plasticSent: number;
  plasticReturned: number;
  plasticBalance: number;
  totalBalance: number;
}

export interface TruckSLAResult {
  delayMinutes: number;
  isOnTime: boolean;
  status: 'A Tiempo' | 'Con Atraso' | 'Anticipado';
  formattedDelay: string;
}

/**
 * 1. Suma aritmética estricta de pallets de madera y plástico por camión.
 */
export function calculatePalletTotals(zonals: ZonalDispatchItem[]): PalletTotalsResult {
  if (!Array.isArray(zonals) || zonals.length === 0) {
    return { totalWood: 0, totalPlastic: 0, grandTotal: 0 };
  }

  const totals = zonals.reduce(
    (acc, item) => {
      const wood = Number.isFinite(item.wood_pallets) && item.wood_pallets > 0 ? Math.floor(item.wood_pallets) : 0;
      const plastic = Number.isFinite(item.plastic_pallets) && item.plastic_pallets > 0 ? Math.floor(item.plastic_pallets) : 0;
      return {
        totalWood: acc.totalWood + wood,
        totalPlastic: acc.totalPlastic + plastic,
        grandTotal: acc.grandTotal + wood + plastic,
      };
    },
    { totalWood: 0, totalPlastic: 0, grandTotal: 0 }
  );

  return totals;
}

/**
 * 2. Cálculo de balance zonal de pallets (Salidas desde CD vs Retornos ingresados).
 */
export function calculateZonalBalances(
  zonalName: string,
  dispatches: Array<{ zonals_detail?: ZonalDispatchItem[] }>,
  returns: Array<{ zonal_name: string; wood_returned?: number; plastic_returned?: number }>
): ZonalBalanceSummary {
  const cleanTarget = (zonalName || '').trim().toLowerCase();

  let woodSent = 0;
  let plasticSent = 0;

  for (const disp of dispatches) {
    if (Array.isArray(disp.zonals_detail)) {
      for (const item of disp.zonals_detail) {
        if ((item.zonal || '').trim().toLowerCase() === cleanTarget) {
          woodSent += Number(item.wood_pallets) || 0;
          plasticSent += Number(item.plastic_pallets) || 0;
        }
      }
    }
  }

  let woodReturned = 0;
  let plasticReturned = 0;

  for (const ret of returns) {
    if ((ret.zonal_name || '').trim().toLowerCase() === cleanTarget) {
      woodReturned += Number(ret.wood_returned) || 0;
      plasticReturned += Number(ret.plastic_returned) || 0;
    }
  }

  const woodBalance = Math.max(0, woodSent - woodReturned);
  const plasticBalance = Math.max(0, plasticSent - plasticReturned);

  return {
    zonal: zonalName,
    woodSent,
    woodReturned,
    woodBalance,
    plasticSent,
    plasticReturned,
    plasticBalance,
    totalBalance: woodBalance + plasticBalance,
  };
}

/**
 * 3. Cálculo de SLA horario y minutos de retraso de un camión respecto a su meta de salida.
 * @param departureTime Hora de salida real en formato "HH:mm" (ej. "14:45")
 * @param scheduledTargetTime Hora meta de salida en formato "HH:mm" (ej. "14:30")
 * @param toleranceMinutes Minutos de tolerancia permitidos antes de clasificar como retraso (default: 0)
 */
export function calculateTruckSLA(
  departureTime: string,
  scheduledTargetTime: string,
  toleranceMinutes = 0
): TruckSLAResult {
  if (!departureTime || !scheduledTargetTime) {
    return {
      delayMinutes: 0,
      isOnTime: true,
      status: 'A Tiempo',
      formattedDelay: 'Sin meta asignada',
    };
  }

  const [depHours, depMins] = departureTime.split(':').map(Number);
  const [schedHours, schedMins] = scheduledTargetTime.split(':').map(Number);

  if (
    !Number.isFinite(depHours) || !Number.isFinite(depMins) ||
    !Number.isFinite(schedHours) || !Number.isFinite(schedMins)
  ) {
    return {
      delayMinutes: 0,
      isOnTime: true,
      status: 'A Tiempo',
      formattedDelay: 'Formato inválido',
    };
  }

  const departureTotalMins = depHours * 60 + depMins;
  const scheduledTotalMins = schedHours * 60 + schedMins;

  const rawDiff = departureTotalMins - scheduledTotalMins;

  if (rawDiff <= toleranceMinutes) {
    const isEarly = rawDiff < 0;
    return {
      delayMinutes: rawDiff,
      isOnTime: true,
      status: isEarly ? 'Anticipado' : 'A Tiempo',
      formattedDelay: isEarly ? `${Math.abs(rawDiff)} min antes` : 'En horario',
    };
  }

  return {
    delayMinutes: rawDiff,
    isOnTime: false,
    status: 'Con Atraso',
    formattedDelay: `+${rawDiff} min atraso`,
  };
}

/**
 * 4. Obtención de fecha actual en formato ISO 'YYYY-MM-DD' bajo la zona horaria oficial de Chile.
 */
export function getChileDateString(inputDate?: Date | string | number): string {
  const d = inputDate ? new Date(inputDate) : new Date();
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(d);
}

/**
 * 5. Validación de reglas de negocio para un despacho de camión CIAL.
 */
export function validateDispatchRequirements(payload: {
  truck_number?: string;
  supervisor_name?: string;
  zonals_detail?: ZonalDispatchItem[];
  temp_2do?: number;
  positions_occupied?: number;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.truck_number || payload.truck_number.trim() === '') {
    errors.push('El número de camión es obligatorio.');
  }

  if (!payload.supervisor_name || payload.supervisor_name.trim() === '') {
    errors.push('El nombre del supervisor es obligatorio.');
  }

  if (!Array.isArray(payload.zonals_detail) || payload.zonals_detail.length === 0) {
    errors.push('Debe registrar al menos un zonal de destino.');
  } else {
    const totals = calculatePalletTotals(payload.zonals_detail);
    if (totals.grandTotal <= 0) {
      errors.push('Debe registrar al menos 1 pallet (madera o plástico) para despachar.');
    }
  }

  if (payload.positions_occupied !== undefined && payload.positions_occupied !== null) {
    if (payload.positions_occupied < 0 || payload.positions_occupied > 36) {
      errors.push('Las posiciones ocupadas deben estar entre 0 y 36.');
    }
  }

  // Temperatura estándar de congelados CIAL: idealmente -18°C o inferior (máximo -12°C permitido en despacho)
  if (payload.temp_2do !== undefined && payload.temp_2do !== null) {
    if (payload.temp_2do > -12) {
      errors.push('La temperatura del segundo termógrafo excede la norma de congelados (-18°C requerido, máx -12°C).');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
