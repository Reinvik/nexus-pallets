import { describe, it, expect } from 'vitest';
import {
  calculatePalletTotals,
  calculateZonalBalances,
  calculateTruckSLA,
  getChileDateString,
  validateDispatchRequirements,
} from '../utils/calculations';

describe('CIS Control 16.12: Pruebas Unitarias de Cálculos Críticos - Nexus Pallets', () => {

  describe('1. Suma Aritmética de Pallets (calculatePalletTotals)', () => {
    it('debe retornar 0 para listas vacías o inválidas', () => {
      expect(calculatePalletTotals([])).toEqual({ totalWood: 0, totalPlastic: 0, grandTotal: 0 });
      // @ts-ignore
      expect(calculatePalletTotals(null)).toEqual({ totalWood: 0, totalPlastic: 0, grandTotal: 0 });
    });

    it('debe sumar correctamente pallets de madera y plástico de múltiples zonales', () => {
      const zonals = [
        { zonal: 'Chillán', wood_pallets: 12, plastic_pallets: 6 },
        { zonal: 'Talca', wood_pallets: 8, plastic_pallets: 4 },
        { zonal: 'San Fernando', wood_pallets: 10, plastic_pallets: 0 },
      ];

      const result = calculatePalletTotals(zonals);

      expect(result.totalWood).toBe(30);
      expect(result.totalPlastic).toBe(10);
      expect(result.grandTotal).toBe(40);
    });

    it('debe ignorar valores negativos o no numéricos para evitar descalces', () => {
      const zonals = [
        // @ts-ignore
        { zonal: 'Antofagasta', wood_pallets: -5, plastic_pallets: 15 },
        // @ts-ignore
        { zonal: 'La Serena', wood_pallets: 'inválido', plastic_pallets: 5 },
      ];

      const result = calculatePalletTotals(zonals as any);

      expect(result.totalWood).toBe(0);
      expect(result.totalPlastic).toBe(20);
      expect(result.grandTotal).toBe(20);
    });
  });

  describe('2. Control de Saldos Zonales (calculateZonalBalances)', () => {
    it('debe calcular el saldo neto (enviados - retornados) correctamente', () => {
      const dispatches = [
        {
          zonals_detail: [
            { zonal: 'Chillán', wood_pallets: 20, plastic_pallets: 10 },
            { zonal: 'Talca', wood_pallets: 15, plastic_pallets: 5 },
          ],
        },
        {
          zonals_detail: [
            { zonal: 'Chillán', wood_pallets: 10, plastic_pallets: 5 },
          ],
        },
      ];

      const returns = [
        { zonal_name: 'Chillán', wood_returned: 12, plastic_returned: 5 },
      ];

      const balance = calculateZonalBalances('Chillán', dispatches, returns);

      expect(balance.woodSent).toBe(30);
      expect(balance.woodReturned).toBe(12);
      expect(balance.woodBalance).toBe(18); // 30 - 12

      expect(balance.plasticSent).toBe(15);
      expect(balance.plasticReturned).toBe(5);
      expect(balance.plasticBalance).toBe(10); // 15 - 5

      expect(balance.totalBalance).toBe(28); // 18 + 10
    });

    it('no debe permitir saldos negativos si los retornos superan los despachos registrados', () => {
      const dispatches = [
        { zonals_detail: [{ zonal: 'Rancagua', wood_pallets: 5, plastic_pallets: 0 }] },
      ];
      const returns = [
        { zonal_name: 'Rancagua', wood_returned: 10, plastic_returned: 0 },
      ];

      const balance = calculateZonalBalances('Rancagua', dispatches, returns);

      expect(balance.woodBalance).toBe(0);
      expect(balance.totalBalance).toBe(0);
    });
  });

  describe('3. Monitoreo de SLA y Minutos de Retraso de Camiones (calculateTruckSLA)', () => {
    it('debe marcar "A Tiempo" cuando la salida coincide con la meta horaria', () => {
      const result = calculateTruckSLA('14:30', '14:30');

      expect(result.delayMinutes).toBe(0);
      expect(result.isOnTime).toBe(true);
      expect(result.status).toBe('A Tiempo');
    });

    it('debe calcular con precisión los minutos de retraso cuando sale después de la meta', () => {
      const result = calculateTruckSLA('15:15', '14:30');

      expect(result.delayMinutes).toBe(45);
      expect(result.isOnTime).toBe(false);
      expect(result.status).toBe('Con Atraso');
      expect(result.formattedDelay).toBe('+45 min atraso');
    });

    it('debe marcar "Anticipado" cuando el camión sale antes de la hora programada', () => {
      const result = calculateTruckSLA('14:10', '14:30');

      expect(result.delayMinutes).toBe(-20);
      expect(result.isOnTime).toBe(true);
      expect(result.status).toBe('Anticipado');
      expect(result.formattedDelay).toBe('20 min antes');
    });

    it('debe respetar la ventana de tolerancia operativa si se especifica', () => {
      // Salió 10 minutos tarde con tolerancia de 15 minutos -> en horario
      const result = calculateTruckSLA('14:40', '14:30', 15);

      expect(result.delayMinutes).toBe(10);
      expect(result.isOnTime).toBe(true);
      expect(result.status).toBe('A Tiempo');
    });
  });

  describe('4. Zona Horaria Oficial de Chile (getChileDateString)', () => {
    it('debe retornar fecha con formato YYYY-MM-DD válido', () => {
      const dateStr = getChileDateString();
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('debe convertir un timestamp UTC a la fecha local de Chile (America/Santiago)', () => {
      // 2026-10-01 01:30:00 UTC corresponde al 2026-09-30 en Chile (UTC-3)
      const utcDate = new Date('2026-10-01T01:30:00Z');
      const chileDate = getChileDateString(utcDate);

      expect(chileDate).toBe('2026-09-30');
    });
  });

  describe('5. Validación de Requisitos de Negocio CIAL (validateDispatchRequirements)', () => {
    it('debe validar exitosamente un despacho con datos completos y dentro de norma', () => {
      const validPayload = {
        truck_number: '1045',
        supervisor_name: 'Nelson Brito',
        zonals_detail: [{ zonal: 'Chillán', wood_pallets: 14, plastic_pallets: 6 }],
        temp_2do: -18,
        positions_occupied: 28,
      };

      const result = validateDispatchRequirements(validPayload);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('debe rechazar despachos sin camión o sin pallets asignados', () => {
      const invalidPayload = {
        truck_number: '',
        supervisor_name: 'Nelson Brito',
        zonals_detail: [{ zonal: 'Chillán', wood_pallets: 0, plastic_pallets: 0 }],
        temp_2do: -18,
      };

      const result = validateDispatchRequirements(invalidPayload);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('El número de camión es obligatorio.');
      expect(result.errors).toContain('Debe registrar al menos 1 pallet (madera o plástico) para despachar.');
    });

    it('debe advertir si la temperatura del 2do termógrafo excede la norma de congelados (-18°C)', () => {
      const warmPayload = {
        truck_number: '2020',
        supervisor_name: 'Walter Sánchez',
        zonals_detail: [{ zonal: 'Talca', wood_pallets: 10, plastic_pallets: 2 }],
        temp_2do: -8, // Fuera de norma congelados
      };

      const result = validateDispatchRequirements(warmPayload);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(e => e.includes('segundo termógrafo excede la norma'))).toBe(true);
    });
  });

});
