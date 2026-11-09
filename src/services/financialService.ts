import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  Student,
  UserProfile,
  StudentFinancialProfile,
  FinancialMetricSummary,
  FinancialPlanHour,
  FinancialPaymentStatus,
  FinancialExpense,
  ExpenseCategory,
  ExpenseStatus,
  PLANOS_CONTRATUAIS_TABELA,
  getTabelaPlanosPorAno,
} from '../types';
import { loadStudents, saveStudents, loadPontoClosings } from '../utils/storageUtils';
import { loadMealConfig } from '../utils/mealFinanceUtils';
import { isRoutineActivity } from '../utils/frequenciaUtils';
import { formatCurrencyBR } from '../utils/pontoUtils';
import { broadcastSyncEvent } from './syncService';

const FINANCIAL_COLLECTION = 'studentFinancialProfiles';
const EXPENSES_COLLECTION = 'financialExpenses';
const LOCAL_STORAGE_KEY = 'colegio_crescer_financial_profiles_v1';
const LOCAL_EXPENSES_STORAGE_KEY = 'colegio_crescer_financial_expenses_v1';

// Tabela Padrão de Preços das Modalidades Extracurriculares
export const MODALITY_PRICE_TABLE: Record<string, number> = {
  'Natação': 190,
  'Natacao': 190,
  'Balé': 130,
  'Bale': 130,
  'Judô': 130,
  'Judo': 130,
  'Futebol': 120,
  'Ginástica': 120,
  'Ginastica': 120,
  'Dança': 120,
  'Danca': 120,
  'Flauta': 110,
  'Música': 110,
  'Musica': 110,
  'Reforço': 150,
  'Reforco': 150,
  'Rotina': 0,
};

// Mensalidade Base por Plano Contratual
export const BASE_PLAN_PRICES: Record<FinancialPlanHour, number> = {
  'PARCIAL_4H': 1150,
  'INTEGRAL_8H': 1850,
  'EXTENDIDO_12H': 2450,
  'CUSTOMIZADO': 1500,
};

// Categorias de Despesas Operacionais com Rótulos e Cores
export const EXPENSE_CATEGORIES_INFO: Record<
  ExpenseCategory,
  { label: string; shortLabel: string; bgClass: string; textClass: string; borderClass: string }
> = {
  FOLHA_PAGAMENTO: {
    label: 'Folha de Pagamento & Equipe (Livro Ponto)',
    shortLabel: 'Folha / Ponto',
    bgClass: 'bg-indigo-50',
    textClass: 'text-indigo-700',
    borderClass: 'border-indigo-200',
  },
  OFICINAS_TERCEIRIZADAS: {
    label: 'Oficinas Especialistas Terceirizadas',
    shortLabel: 'Oficinas Extras',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200',
  },
  OFICINAS_CULINARIA: {
    label: 'Oficinas de Culinária',
    shortLabel: 'Oficinas de Culinária',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-700',
    borderClass: 'border-orange-200',
  },
  ALIMENTACAO_HORTIFRUTI: {
    label: 'Alimentação Escolar & Insumos (Refeições)',
    shortLabel: 'Alimentação / Refeições',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
  },
  MATERIAIS_DIDATICOS: {
    label: 'Materiais Pedagógicos & Brinquedos',
    shortLabel: 'Materiais',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200',
  },
  MANUTENCAO_INFRA: {
    label: 'Manutenção, Infra & Limpeza',
    shortLabel: 'Manutenção & Infra',
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-200',
  },
  OUTROS: {
    label: 'Outras Despesas Operacionais',
    shortLabel: 'Outros Custos',
    bgClass: 'bg-slate-100',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-200',
  },
};

// Lista Inicial de Despesas (Inicia limpa e recebe exclusivamente despesas reais da operação)
export const INITIAL_DEFAULT_EXPENSES: FinancialExpense[] = [];

/**
 * Calcula a soma das modalidades extras do aluno
 */
export function calculateModalidadesExtrasTotal(activities: string[] = []): number {
  return activities.reduce((acc, act) => {
    const cleanName = act.trim();
    if (cleanName.toLowerCase() === 'rotina') return acc;
    const price = MODALITY_PRICE_TABLE[cleanName] ?? 120;
    return acc + price;
  }, 0);
}

/**
 * Calcula o valor líquido total da mensalidade:
 * valorTotalMensal = (base + extras) * (1 - descontoPercentual / 100)
 */
export function calculateValorTotalMensal(
  base: number,
  extras: number,
  descontoPercentual: number
): number {
  const subtotal = Math.max(0, base + extras);
  const discountFactor = Math.max(0, Math.min(100, descontoPercentual || 0)) / 100;
  const total = subtotal * (1 - discountFactor);
  return Math.round(total * 100) / 100;
}

/**
 * Gera um perfil financeiro padrão para um estudante caso ainda não possua registro no Firestore.
 */
export function buildDefaultFinancialProfile(
  student: Student,
  anoLetivo: number = student.anoLetivo || 2026
): StudentFinancialProfile {
  const isAvulso = student.tipoContrato === 'avulso';
  const plano: FinancialPlanHour = isAvulso ? 'PARCIAL_4H' : 'INTEGRAL_8H';
  const tabela = getTabelaPlanosPorAno(anoLetivo);
  const planoContratual =
    student.planoContratual || (isAvulso ? 'Diária Integral' : 'Integral Semana (18:30h)');
  const planoInfo = tabela[planoContratual as keyof typeof tabela];
  const fallbackBase = anoLetivo === 2027 ? 1250 : 1120;

  // Valor base do plano contratual oficial do estudante
  const base =
    student.valorPlanoBase !== undefined && student.valorPlanoBase > 0
      ? student.valorPlanoBase
      : planoInfo?.valorBase ?? fallbackBase;

  const extras =
    student.valorModalidadesExtras !== undefined
      ? student.valorModalidadesExtras
      : student.valorOficinas !== undefined
      ? student.valorOficinas
      : student.oficinasExtras !== undefined
      ? student.oficinasExtras
      : student.valorExtras !== undefined
      ? student.valorExtras
      : calculateModalidadesExtrasTotal(student.activities || []);

  const descontoBolsa = Number(student.descontoBolsa) || 0;
  const total =
    student.valorMensalidadeFinal !== undefined && student.valorMensalidadeFinal > 0
      ? student.valorMensalidadeFinal
      : Math.max(0, base + extras - descontoBolsa);

  const descontoPercentual = base > 0 ? Math.round((descontoBolsa / base) * 100) : 0;
  const isIsento = (descontoBolsa >= (base + extras) && (base + extras) > 0);

  return {
    id: `${anoLetivo}_${student.id}`,
    studentId: student.id,
    studentName: student.name,
    turma: student.turma,
    anoLetivo,
    planoHora: plano,
    valorMensalidadeBase: base,
    valorModalidadesExtras: extras,
    oficinasExtras: extras,
    valorOficinas: extras,
    valorExtras: extras,
    descontoPercentual,
    valorTotalMensal: total,
    diaVencimento: 10,
    statusPagamento: isIsento ? 'ISENTO' : 'EM_DIA',
    mesReferencia: `${anoLetivo}-08`,
    formaPagamentoPadrao: 'Boleto',
    observacoes: `Plano Contratual: ${planoContratual}`,
    studentStatus: student.status || 'ativo',
    planoContratual,
    descontoBolsa,
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sincronização Contratual Dinâmica',
  };
}

// ---------------------------------------------------------------------------
// GESTÃO DE CONTRATOS (STORAGE & FIRESTORE)
// ---------------------------------------------------------------------------

export function loadLocalFinancialProfiles(): StudentFinancialProfile[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Erro ao ler perfis financeiros locais:', e);
    return [];
  }
}

export function saveLocalFinancialProfiles(profiles: StudentFinancialProfile[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.warn('Erro ao salvar perfis financeiros locais:', e);
  }
}

export async function loadFinancialProfilesFromFirestore(
  anoLetivo?: number
): Promise<StudentFinancialProfile[]> {
  try {
    const colRef = collection(db, FINANCIAL_COLLECTION);
    const q = anoLetivo ? query(colRef, where('anoLetivo', '==', anoLetivo)) : colRef;
    const snap = await getDocs(q);

    const remoteList: StudentFinancialProfile[] = [];
    snap.forEach((d) => {
      remoteList.push({ id: d.id, ...d.data() } as StudentFinancialProfile);
    });

    if (remoteList.length > 0) {
      saveLocalFinancialProfiles(remoteList);
    }
    return remoteList;
  } catch (err) {
    console.warn('Falha ao carregar perfis financeiros do Firestore. Usando cache local:', err);
    const local = loadLocalFinancialProfiles();
    return anoLetivo ? local.filter((p) => p.anoLetivo === anoLetivo) : local;
  }
}

export async function saveFinancialProfileToFirestore(
  profile: StudentFinancialProfile
): Promise<void> {
  const docId = profile.id || `${profile.anoLetivo}_${profile.studentId}`;
  const cleanProfile: StudentFinancialProfile = {
    ...profile,
    id: docId,
    updatedAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, FINANCIAL_COLLECTION, docId);
    await setDoc(docRef, cleanProfile, { merge: true });
  } catch (err) {
    console.warn('Falha na gravação remota do perfil financeiro:', err);
  }

  const current = loadLocalFinancialProfiles();
  const index = current.findIndex(
    (p) => p.id === docId || (p.studentId === profile.studentId && p.anoLetivo === profile.anoLetivo)
  );
  if (index >= 0) {
    current[index] = cleanProfile;
  } else {
    current.push(cleanProfile);
  }
  saveLocalFinancialProfiles(current);
}

export function subscribeFinancialProfiles(
  anoLetivo: number,
  onUpdate: (profiles: StudentFinancialProfile[]) => void
): () => void {
  try {
    const colRef = collection(db, FINANCIAL_COLLECTION);
    const q = query(colRef, where('anoLetivo', '==', anoLetivo));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: StudentFinancialProfile[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as StudentFinancialProfile);
        });
        saveLocalFinancialProfiles(list);
        onUpdate(list);
      },
      (error) => {
        console.warn('Erro no listener de perfis financeiros:', error);
        const local = loadLocalFinancialProfiles().filter((p) => p.anoLetivo === anoLetivo);
        onUpdate(local);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.warn('Falha ao iniciar listener de perfis financeiros:', e);
    const local = loadLocalFinancialProfiles().filter((p) => p.anoLetivo === anoLetivo);
    onUpdate(local);
    return () => {};
  }
}

/**
 * Zera em lote o valor financeiro incremental de oficinas extras (ex: valorModalidadesExtras = 0, valorOficinas = 0, oficinasExtras = 0)
 * para todos os alunos do ano letivo selecionado (2026 ou 2027), recalculando dinamicamente a receita líquida e o total mensal individual
 * (valorTotalMensal = Math.max(0, valorMensalidadeBase - descontoBolsa)).
 *
 * GARANTIA DE IMPACTO E PRESERVAÇÃO PEDAGÓGICA:
 * - Apenas o valor financeiro incremental de oficinas é zerado (R$ 0,00).
 * - As matrículas nas turmas de oficinas (student.activities: Natação, Balé, Judô, Futebol, etc.) NÃO são apagadas.
 * - O histórico de chamadas, listas de frequência e dados cadastrais dos alunos permanecem 100% intactos.
 */
export async function zeroAllExtraWorkshopsValues(
  anoLetivo: number,
  providedStudents?: Student[]
): Promise<{ success: boolean; count: number; profiles: StudentFinancialProfile[]; updatedStudents: Student[] }> {
  // 1. Obter alunos do ano letivo
  const allStudents = loadStudents();
  const targetStudents = (providedStudents && providedStudents.length > 0 ? providedStudents : allStudents).filter(
    (s) => s.anoLetivo === anoLetivo
  );

  // 2. Obter perfis financeiros existentes do ano letivo
  const allProfiles = loadLocalFinancialProfiles();
  const profileMap = new Map<string, StudentFinancialProfile>();
  allProfiles.forEach((p) => {
    if (p.anoLetivo === anoLetivo && p.studentId) {
      profileMap.set(p.studentId, p);
    }
  });

  const updatedProfiles: StudentFinancialProfile[] = [];
  const updatedStudentList: Student[] = [];
  const nowIso = new Date().toISOString();

  // 3. Processar cada estudante do ano letivo
  for (const student of targetStudents) {
    const existing = profileMap.get(student.id);
    const profile = existing ? { ...existing } : buildDefaultFinancialProfile(student, anoLetivo);

    // Zerar explicitamente os campos de oficinas extras no perfil financeiro
    profile.valorModalidadesExtras = 0;
    profile.oficinasExtras = 0;
    profile.valorOficinas = 0;
    profile.valorExtras = 0;

    // Recalcular dinamicamente o valor total mensal: base - descontoBolsa
    const baseVal = profile.valorMensalidadeBase || (anoLetivo === 2027 ? 1250 : 1120);
    const descontoBolsa = Number(profile.descontoBolsa) || 0;
    const newTotal = Math.max(0, baseVal - descontoBolsa);

    profile.valorTotalMensal = newTotal;
    if (descontoBolsa >= baseVal && baseVal > 0) {
      profile.statusPagamento = 'ISENTO';
    } else if (profile.statusPagamento === 'ISENTO') {
      profile.statusPagamento = 'EM_DIA';
    }
    profile.updatedAt = nowIso;
    profile.updatedBy = 'Zeramento Administrativo de Oficinas Extras';

    updatedProfiles.push(profile);

    // Atualizar o objeto do estudante mantendo suas activities (matrículas de oficina) 100% intactas
    const updatedStudent: Student = {
      ...student,
      valorModalidadesExtras: 0,
      oficinasExtras: 0,
      valorOficinas: 0,
      valorExtras: 0,
      valorMensalidadeFinal: newTotal,
    };
    updatedStudentList.push(updatedStudent);
  }

  // 4. Gravação no Firestore em Lote (studentFinancialProfiles, alunos e students)
  try {
    const batchSize = 400; // Limite seguro do Firestore é 500
    for (let i = 0; i < updatedProfiles.length; i += batchSize) {
      const chunkProfiles = updatedProfiles.slice(i, i + batchSize);
      const batch = writeBatch(db);

      chunkProfiles.forEach((p) => {
        const docId = p.id || `${anoLetivo}_${p.studentId}`;
        const ref = doc(db, FINANCIAL_COLLECTION, docId);
        batch.set(
          ref,
          {
            ...p,
            id: docId,
            valorModalidadesExtras: 0,
            oficinasExtras: 0,
            valorOficinas: 0,
            valorExtras: 0,
            valorTotalMensal: p.valorTotalMensal,
            statusPagamento: p.statusPagamento,
            updatedAt: nowIso,
            updatedBy: 'Zeramento Administrativo de Oficinas Extras',
          },
          { merge: true }
        );
      });

      await batch.commit();
    }
  } catch (err) {
    console.warn('Aviso ao persistir perfis financeiros zerados no Firestore (modo offline/resiliente):', err);
  }

  // Gravar atualização dos alunos no Firestore (apenas atualizando valores de oficinas, sem tocar em activities)
  try {
    const studentBatchSize = 200;
    for (let i = 0; i < updatedStudentList.length; i += studentBatchSize) {
      const chunkStudents = updatedStudentList.slice(i, i + studentBatchSize);
      const batch = writeBatch(db);

      chunkStudents.forEach((st) => {
        const alunosRef = doc(db, 'alunos', st.id);
        const studentsRef = doc(db, 'students', st.id);
        const patch = {
          valorModalidadesExtras: 0,
          oficinasExtras: 0,
          valorOficinas: 0,
          valorExtras: 0,
          valorMensalidadeFinal: st.valorMensalidadeFinal,
          updatedAt: nowIso,
        };
        batch.set(alunosRef, patch, { merge: true });
        batch.set(studentsRef, patch, { merge: true });
      });

      await batch.commit();
    }
  } catch (err) {
    console.warn('Aviso ao sincronizar alunos no Firestore após zerar oficinas (modo offline/resiliente):', err);
  }

  // 5. Atualizar Cache Local de Perfis Financeiros
  const mergedProfiles = allProfiles.filter((p) => p.anoLetivo !== anoLetivo);
  mergedProfiles.push(...updatedProfiles);
  saveLocalFinancialProfiles(mergedProfiles);

  // 6. Atualizar Cache Local de Alunos (integral_frequencia_students_v1)
  const studentMap = new Map<string, Student>();
  allStudents.forEach((st) => studentMap.set(st.id, st));
  updatedStudentList.forEach((st) => studentMap.set(st.id, st));
  const finalStudentsList = Array.from(studentMap.values());
  saveStudents(finalStudentsList);

  // 7. Notificar abas / broadcast em tempo real
  try {
    broadcastSyncEvent('SYNC_STUDENTS', { anoLetivo, action: 'ZERO_EXTRA_WORKSHOPS' });
  } catch (e) {
    // broadcast opcional
  }

  return {
    success: true,
    count: updatedProfiles.length,
    profiles: updatedProfiles,
    updatedStudents: finalStudentsList,
  };
}

// ---------------------------------------------------------------------------
// GESTÃO DE DESPESAS (STORAGE & FIRESTORE)
// ---------------------------------------------------------------------------

export function loadLocalFinancialExpenses(): FinancialExpense[] {
  try {
    const raw = localStorage.getItem(LOCAL_EXPENSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Purga completa de quaisquer despesas mock antigas com IDs estáticos ou dados de teste
    const cleaned = parsed.filter(
      (e) =>
        e &&
        !['exp_2026_materiais_pedag', 'exp_2026_manutencao_higiene', 'exp_2026_oficinas_natacao', 'exp_2026_oficinas_artes', 'exp_2027_oficinas_natacao', 'exp_2027_oficinas_artes'].includes(e.id) &&
        !e.id?.includes('mock') &&
        !e.descricao?.toLowerCase().includes('mock') &&
        !e.descricao?.toLowerCase().includes('exemplo')
    );
    return cleaned;
  } catch (e) {
    console.warn('Erro ao ler despesas locais:', e);
    return [];
  }
}

export function saveLocalFinancialExpenses(expenses: FinancialExpense[]): void {
  try {
    localStorage.setItem(LOCAL_EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
  } catch (e) {
    console.warn('Erro ao salvar despesas locais:', e);
  }
}

export async function loadFinancialExpensesFromFirestore(
  anoLetivo?: number
): Promise<FinancialExpense[]> {
  try {
    const colRef = collection(db, EXPENSES_COLLECTION);
    const q = anoLetivo ? query(colRef, where('anoLetivo', '==', anoLetivo)) : colRef;
    const snap = await getDocs(q);

    const remoteList: FinancialExpense[] = [];
    snap.forEach((d) => {
      remoteList.push({ id: d.id, ...d.data() } as FinancialExpense);
    });

    if (remoteList.length > 0) {
      saveLocalFinancialExpenses(remoteList);
      return remoteList;
    }

    // Se a coleção remota estiver vazia, semeia as despesas iniciais
    const local = loadLocalFinancialExpenses();
    const filtered = anoLetivo ? local.filter((e) => e.anoLetivo === anoLetivo) : local;
    if (filtered.length > 0) {
      for (const item of filtered) {
        saveExpenseToFirestore(item).catch(() => {});
      }
    }
    return filtered;
  } catch (err) {
    console.warn('Falha ao buscar despesas do Firestore. Usando cache local:', err);
    const local = loadLocalFinancialExpenses();
    return anoLetivo ? local.filter((e) => e.anoLetivo === anoLetivo) : local;
  }
}

export async function saveExpenseToFirestore(expense: FinancialExpense): Promise<void> {
  const docId = expense.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanExpense: FinancialExpense = {
    ...expense,
    id: docId,
    updatedAt: new Date().toISOString(),
  };

  try {
    const docRef = doc(db, EXPENSES_COLLECTION, docId);
    await setDoc(docRef, cleanExpense, { merge: true });
  } catch (err) {
    console.warn('Falha ao salvar despesa no Firestore:', err);
  }

  const current = loadLocalFinancialExpenses();
  const index = current.findIndex((e) => e.id === docId);
  if (index >= 0) {
    current[index] = cleanExpense;
  } else {
    current.push(cleanExpense);
  }
  saveLocalFinancialExpenses(current);
}

export async function deleteExpenseFromFirestore(expenseId: string): Promise<void> {
  try {
    const docRef = doc(db, EXPENSES_COLLECTION, expenseId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Falha ao excluir despesa no Firestore:', err);
  }

  const current = loadLocalFinancialExpenses().filter((e) => e.id !== expenseId);
  saveLocalFinancialExpenses(current);
}

export function subscribeFinancialExpenses(
  anoLetivo: number,
  onUpdate: (expenses: FinancialExpense[]) => void
): () => void {
  try {
    const colRef = collection(db, EXPENSES_COLLECTION);
    const q = query(colRef, where('anoLetivo', '==', anoLetivo));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: FinancialExpense[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as FinancialExpense);
        });

        if (list.length === 0) {
          const defaults = loadLocalFinancialExpenses().filter((e) => e.anoLetivo === anoLetivo);
          onUpdate(defaults);
        } else {
          saveLocalFinancialExpenses(list);
          onUpdate(list);
        }
      },
      (error) => {
        console.warn('Erro no listener de despesas:', error);
        const local = loadLocalFinancialExpenses().filter((e) => e.anoLetivo === anoLetivo);
        onUpdate(local);
      }
    );

    return unsubscribe;
  } catch (e) {
    console.warn('Falha ao iniciar listener de despesas:', e);
    const local = loadLocalFinancialExpenses().filter((e) => e.anoLetivo === anoLetivo);
    onUpdate(local);
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// CONSOLIDAÇÃO DE FLUXO DE CAIXA E INDICADORES
// ---------------------------------------------------------------------------

export function calculateFinancialMetrics(
  profiles: StudentFinancialProfile[],
  expenses: FinancialExpense[] = []
): FinancialMetricSummary {
  let receitaPrevistaMensal = 0;
  let receitaConfirmada = 0;
  let totalEmAtraso = 0;

  let totalEmDia = 0;
  let totalPendentes = 0;
  let totalAtrasados = 0;
  let totalIsentos = 0;

  let faturamentoBrutoReal = 0;
  let totalDescontoBolsas = 0;
  let totalAlunosPagantes = 0;

  profiles.forEach((p) => {
    // Apenas alunos com matrícula ATIVA contribuem para as receitas do Integral
    if (p.studentStatus && p.studentStatus !== 'ativo') {
      return;
    }

    const valorBase = Number(p.valorMensalidadeBase) || 0;
    const extras = Number(p.valorModalidadesExtras) || 0;
    const desconto =
      p.descontoBolsa !== undefined
        ? Number(p.descontoBolsa) || 0
        : ((Number(p.descontoPercentual) || 0) * (valorBase + extras)) / 100;

    const valorLiquido =
      p.valorTotalMensal !== undefined
        ? Number(p.valorTotalMensal) || 0
        : Math.max(0, valorBase + extras - desconto);

    faturamentoBrutoReal += valorBase + extras;
    totalDescontoBolsas += desconto;

    if (p.statusPagamento === 'ISENTO' || valorLiquido <= 0) {
      totalIsentos++;
      return;
    }

    totalAlunosPagantes++;
    receitaPrevistaMensal += valorLiquido;

    if (p.statusPagamento === 'EM_DIA') {
      receitaConfirmada += valorLiquido;
      totalEmDia++;
    } else if (p.statusPagamento === 'EM_ATRASO') {
      totalEmAtraso += valorLiquido;
      totalAtrasados++;
    } else if (p.statusPagamento === 'PENDENTE') {
      totalPendentes++;
    }
  });

  const ticketMedioPorAluno =
    totalAlunosPagantes > 0
      ? Math.round((receitaPrevistaMensal / totalAlunosPagantes) * 100) / 100
      : 0;

  const baseAdimplencia = receitaConfirmada + totalEmAtraso;
  const taxaAdimplencia =
    baseAdimplencia > 0
      ? Math.round((receitaConfirmada / baseAdimplencia) * 100)
      : receitaPrevistaMensal > 0
      ? 100
      : 0;

  // Totalizadores de Despesas Reais e DRE
  let totalDespesasMes = 0;
  let totalDespesasPagas = 0;
  let totalDespesasPendentes = 0;
  let custoFolhaReal = 0;
  let custoAlimentacaoReal = 0;

  expenses.forEach((exp) => {
    const val = Number(exp.valor) || 0;
    totalDespesasMes += val;
    if (exp.categoria === 'FOLHA_PAGAMENTO' || exp.origemModulo === 'FOLHA_PONTO') {
      custoFolhaReal += val;
    } else if (exp.categoria === 'ALIMENTACAO_HORTIFRUTI' || exp.origemModulo === 'CARDAPIO_REFEICOES') {
      custoAlimentacaoReal += val;
    }
    if (exp.status === 'PAGO') {
      totalDespesasPagas += val;
    } else {
      totalDespesasPendentes += val;
    }
  });

  const totalCustosOperacionaisReais = Math.round((custoFolhaReal + custoAlimentacaoReal) * 100) / 100;
  const resultadoOperacionalLiquidoReal = Math.round((receitaPrevistaMensal - totalCustosOperacionaisReais) * 100) / 100;
  const margemOperacionalLiquida =
    receitaPrevistaMensal > 0
      ? Math.round((resultadoOperacionalLiquidoReal / receitaPrevistaMensal) * 1000) / 10
      : 0;

  // Saldo Líquido Operacional: Receita Confirmada - Total de Despesas do Mês
  const saldoLiquidoOperacional = Math.round((receitaConfirmada - totalDespesasMes) * 100) / 100;

  return {
    receitaPrevistaMensal: Math.round(receitaPrevistaMensal * 100) / 100,
    receitaConfirmada: Math.round(receitaConfirmada * 100) / 100,
    totalEmAtraso: Math.round(totalEmAtraso * 100) / 100,
    taxaAdimplencia,
    totalContratos: profiles.length,
    totalEmDia,
    totalPendentes,
    totalAtrasados,
    totalIsentos,
    totalDespesasMes: Math.round(totalDespesasMes * 100) / 100,
    totalDespesasPagas: Math.round(totalDespesasPagas * 100) / 100,
    totalDespesasPendentes: Math.round(totalDespesasPendentes * 100) / 100,
    saldoLiquidoOperacional,
    faturamentoBrutoReal: Math.round(faturamentoBrutoReal * 100) / 100,
    totalDescontoBolsas: Math.round(totalDescontoBolsas * 100) / 100,
    totalAlunosPagantes,
    ticketMedioPorAluno,
    custoFolhaReal: Math.round(custoFolhaReal * 100) / 100,
    custoAlimentacaoReal: Math.round(custoAlimentacaoReal * 100) / 100,
    totalCustosOperacionaisReais,
    resultadoOperacionalLiquidoReal,
    margemOperacionalLiquida,
  };
}

// ---------------------------------------------------------------------------
// MECANISMO DE SINCRONIZAÇÃO AUTOMÁTICA (AUTO-SYNC FINANCEIRO)
// ---------------------------------------------------------------------------

export const EXPENSE_LAST_SYNC_STORAGE_KEY = 'colegio_crescer_last_expense_sync_v1';

export function getLastExpenseSyncTime(): string | null {
  try {
    return localStorage.getItem(EXPENSE_LAST_SYNC_STORAGE_KEY) || '2026-08-01T06:00:00.000Z';
  } catch {
    return '2026-08-01T06:00:00.000Z';
  }
}

export function saveLastExpenseSyncTime(timestamp: string): void {
  try {
    localStorage.setItem(EXPENSE_LAST_SYNC_STORAGE_KEY, timestamp);
  } catch (err) {
    console.warn('Erro ao salvar timestamp da sincronização:', err);
  }
}

/**
 * Calcula as despesas operacionais automáticas a partir das DUAS fontes reais:
 * 1. Folha de Pagamento & Equipe (Módulo Livro Ponto)
 * 2. Alimentação Escolar & Insumos (Módulo Cardápio & Refeições)
 */
export function calculateModuleExpenses(
  anoLetivo: number,
  students: Student[] = [],
  users: UserProfile[] = []
): FinancialExpense[] {
  // Filtra alunos ativos do ano letivo com igualdade estrita
  const activeStudents = students.filter(
    (s) => s.anoLetivo === anoLetivo && s.status !== 'inativo' && s.status !== 'cancelado'
  );

  // 1. Folha de Pagamento das Monitoras/ADIs e Docentes (Módulo Livro Ponto)
  const activeStaff = (users || []).filter(
    (u) =>
      u.status !== 'DESLIGADO' &&
      u.status !== 'INATIVO' &&
      !['admin'].includes(String(u.role).toLowerCase()) &&
      !(String(u.role).toLowerCase() === 'coordenador' && (Number(u.baseSalary) || 0) === 0)
  );

  const pontoClosings = loadPontoClosings();

  let totalFolha = 0;
  let staffCount = 0;

  activeStaff.forEach((u) => {
    // Verifica se há fechamento de ponto consolidado para o colaborador no ano
    const userClosing = pontoClosings.find((c) => c.userId === u.id && c.year === anoLetivo);

    if (userClosing && userClosing.netTotal > 0) {
      totalFolha += Number(userClosing.netTotal) || 0;
      staffCount++;
    } else {
      const base = Number(u.baseSalary) || Number((u as any).bancaContratual) || 1200;
      const ajuda = Number(u.ajudaDeCusto) || Number((u as any).ajudaCusto) || 150;
      const adicionais = Number((u as any).adicionais) || Number((u as any).horasExtras) || 0;

      let totalColaborador = base + ajuda + adicionais;
      if (u.regimeTrabalho === 'professor_horista') {
        const aulas = u.tetoSemanalAulas ? u.tetoSemanalAulas * 4.5 : 8 * 4.5;
        const salarioAulas = aulas * (u.valorHoraAula || 31.49);
        const horaAtividade = salarioAulas * 0.05;
        const dsr = (salarioAulas + horaAtividade) / 6;
        totalColaborador = salarioAulas + horaAtividade + dsr + ajuda + adicionais;
      }

      if (totalColaborador > 0) {
        totalFolha += Math.round(totalColaborador * 100) / 100;
        staffCount++;
      }
    }
  });

  // 2. Refeições e Lanches (Módulo Cardápio & Refeições)
  // Alunos que frequentam a Rotina no mês
  const rotinaStudents = activeStudents.filter(
    (s) =>
      !s.activities ||
      s.activities.length === 0 ||
      s.activities.some((a) => isRoutineActivity(a) || a.toLowerCase().includes('rotina')) ||
      s.tipoContrato !== 'avulso'
  );
  const totalAlunosRotina = rotinaStudents.length;

  // Custo diário por refeição registrado no módulo Cardápio/Refeições
  const mealConfig =
    loadMealConfig(`${anoLetivo}-08`) ||
    loadMealConfig(`${anoLetivo}-09`) ||
    loadMealConfig(`${anoLetivo}-03`);
  const custoDiarioPorRefeicao =
    mealConfig?.defaultUnitPrice !== undefined && mealConfig.defaultUnitPrice > 0
      ? mealConfig.defaultUnitPrice
      : 9.0;
  const diasLetivosMes = 22;
  const totalAlimentacao =
    totalAlunosRotina > 0
      ? Math.round(totalAlunosRotina * diasLetivosMes * custoDiarioPorRefeicao * 100) / 100
      : 0;

  const nowIso = new Date().toISOString();
  const expensesList: FinancialExpense[] = [];

  if (totalFolha > 0) {
    expensesList.push({
      id: `exp_${anoLetivo}_folha_livro_ponto`,
      anoLetivo,
      categoria: 'FOLHA_PAGAMENTO',
      descricao: `Folha de Pagamento & Equipe (Livro Ponto)`,
      valor: totalFolha,
      dataVencimento: `${anoLetivo}-08-05`,
      dataPagamento: `${anoLetivo}-08-05`,
      status: 'PAGO',
      formaPagamento: 'Transferência Bancária (Folha)',
      fornecedorOuBeneficiario: 'Equipe de Colaboradores e Monitoria do Livro Ponto',
      observacoes: `Auto-Sync: Custo total consolidado de ${staffCount} colaboradores(as) cadastrados no Livro Ponto (Banca Contratual + Ajuda de Custo + Adicionais e Horas Extras).`,
      createdAt: nowIso,
      updatedAt: nowIso,
      isAutoGenerated: true,
      origemModulo: 'FOLHA_PONTO',
      autoSyncKey: `sync_folha_${anoLetivo}`,
    });
  }

  if (totalAlimentacao > 0) {
    expensesList.push({
      id: `exp_${anoLetivo}_alimentacao_refeicoes`,
      anoLetivo,
      categoria: 'ALIMENTACAO_HORTIFRUTI',
      descricao: `Alimentação Escolar & Insumos (Refeições)`,
      valor: totalAlimentacao,
      dataVencimento: `${anoLetivo}-08-10`,
      dataPagamento: `${anoLetivo}-08-10`,
      status: 'PAGO',
      formaPagamento: 'Boleto Bancário',
      fornecedorOuBeneficiario:
        mealConfig?.contractCompany ||
        mealConfig?.providerName ||
        'NutriEscola & Cantina de Refeições Saudáveis',
      observacoes: `Auto-Sync: ${totalAlunosRotina} alunos na Rotina × ${diasLetivosMes} dias letivos × ${formatCurrencyBR(custoDiarioPorRefeicao)}/refeição registrado no Módulo Cardápio/Refeições.`,
      createdAt: nowIso,
      updatedAt: nowIso,
      isAutoGenerated: true,
      origemModulo: 'CARDAPIO_REFEICOES',
      autoSyncKey: `sync_refeicoes_${anoLetivo}`,
    });
  }

  return expensesList;
}

/**
 * Executa a sincronização com Firestore e Cache Local, preservando lançamentos manuais
 * e expurgando antigas despesas automáticas de demonstração.
 */
export async function syncExpensesFromModules(
  anoLetivo: number,
  students: Student[] = [],
  users: UserProfile[] = [],
  currentExpenses: FinancialExpense[] = []
): Promise<{ updatedExpenses: FinancialExpense[]; count: number; timestamp: string }> {
  const generated = calculateModuleExpenses(anoLetivo, students, users);
  const nowIso = new Date().toISOString();

  // Mapeia despesas atuais para mesclagem idempotente
  const mergedList = [...currentExpenses];

  // Purga despesas automáticas legadas (oficinas ou mocks) que foram expurgadas
  const validSyncKeys = new Set(generated.map((g) => g.autoSyncKey));
  const obsoleteAutoExpenses = mergedList.filter(
    (e) =>
      e.anoLetivo === anoLetivo &&
      e.isAutoGenerated &&
      e.autoSyncKey &&
      !validSyncKeys.has(e.autoSyncKey)
  );

  for (const obs of obsoleteAutoExpenses) {
    await deleteExpenseFromFirestore(obs.id);
  }

  const cleanedMergedList = mergedList.filter(
    (e) => !obsoleteAutoExpenses.some((obs) => obs.id === e.id)
  );

  for (const gen of generated) {
    const existingIndex = cleanedMergedList.findIndex(
      (e) =>
        e.anoLetivo === anoLetivo &&
        ((e.autoSyncKey && e.autoSyncKey === gen.autoSyncKey) || e.id === gen.id)
    );

    if (existingIndex >= 0) {
      const prev = cleanedMergedList[existingIndex];
      cleanedMergedList[existingIndex] = {
        ...prev,
        ...gen,
        id: prev.id,
        status: prev.status || gen.status,
        dataPagamento: prev.dataPagamento || gen.dataPagamento,
        formaPagamento: prev.formaPagamento || gen.formaPagamento,
        updatedAt: nowIso,
      };
      await saveExpenseToFirestore(cleanedMergedList[existingIndex]);
    } else {
      cleanedMergedList.push(gen);
      await saveExpenseToFirestore(gen);
    }
  }

  saveLastExpenseSyncTime(nowIso);

  return {
    updatedExpenses: cleanedMergedList,
    count: generated.length,
    timestamp: nowIso,
  };
}

