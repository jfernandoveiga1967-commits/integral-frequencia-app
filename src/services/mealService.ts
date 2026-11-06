import { AttendanceRecord, Student, MealReportConfig, MealDailyEntry } from '../types';
import {
  getRollCallPresencesForDate,
  loadMealConfig,
  saveMealConfig,
  recordMealSnapshotForDate,
  syncMealSnapshotsFromRecords,
  buildMealEntriesForDateRange,
  calculateMealTotals,
} from '../utils/mealFinanceUtils';
import {
  getMealReportFromFirestore,
  saveMealReportToFirestore,
} from '../firebase';

/**
 * Serviço Unificado de Gestão de Refeições & Almoço do Programa Integral
 * Arquitetura "Sacramentado ao Clicar": Conexão direta e instantânea com a chamada de Rotina
 */

/**
 * Calcula a quantidade de refeições apuradas a partir das presenças na Rotina da data
 */
export function calculateDailyMealsFromRecords(
  dateStr: string,
  records: AttendanceRecord[]
): number {
  return getRollCallPresencesForDate(dateStr, records);
}

/**
 * Carrega a configuração local de refeições do mês
 */
export function getStoredMealConfig(monthKey: string): MealReportConfig | null {
  return loadMealConfig(monthKey);
}

/**
 * Salva a configuração local de refeições do mês
 */
export function saveStoredMealConfig(config: MealReportConfig): void {
  saveMealConfig(config);
}

/**
 * Carrega o relatório de refeições do Firestore
 */
export async function fetchMealReport(monthKey: string): Promise<MealReportConfig | null> {
  return getMealReportFromFirestore(monthKey);
}

/**
 * Salva o relatório de refeições no Firestore e no cache local
 */
export async function saveMealReport(config: MealReportConfig): Promise<void> {
  saveMealConfig(config);
  await saveMealReportToFirestore(config);
}

/**
 * Sincroniza o relatório de refeições com as presenças de Rotina do dia
 */
export async function syncMealReportFromAttendance(
  dateStr: string,
  records: AttendanceRecord[],
  students: Student[]
): Promise<number> {
  const presentCount = getRollCallPresencesForDate(dateStr, records);
  const monthKey = dateStr.slice(0, 7);

  // Grava snapshot de refeição
  recordMealSnapshotForDate(dateStr, presentCount);

  // Atualiza relatório do mês se já existir
  try {
    const existing = await getMealReportFromFirestore(monthKey);
    if (existing) {
      const currentEntry = existing.entries[dateStr] || {};
      const updatedEntry = {
        ...currentEntry,
        lastCalculatedMealsCount: presentCount,
        updatedAt: new Date().toISOString(),
      };

      if (!currentEntry.isManualOverride) {
        updatedEntry.manualCount = presentCount;
        updatedEntry.editableStudents = presentCount;
      }

      existing.entries[dateStr] = updatedEntry;
      saveMealConfig(existing);
      await saveMealReportToFirestore(existing);
    }
  } catch (err) {
    console.warn(`[mealService] Aviso ao sincronizar refeições do dia ${dateStr}:`, err);
  }

  return presentCount;
}

export {
  getRollCallPresencesForDate,
  recordMealSnapshotForDate,
  syncMealSnapshotsFromRecords,
  buildMealEntriesForDateRange,
  calculateMealTotals,
};
