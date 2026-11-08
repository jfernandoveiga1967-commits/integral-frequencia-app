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
import { loadStudents, saveStudents } from '../utils/storageUtils';
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
    label: 'Folha de Pagamento & Encargos',
    shortLabel: 'Folha / Salários',
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
    label: 'Alimentação, Cantina & Hortifruti',
    shortLabel: 'Alimentação',
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
    if (!Array.isArray(parsed)) return [];
    // Purga eventuais despesas mock antigas com IDs estáticos
    const cleaned = parsed.filter(
      (e) => e && !['exp_2026_materiais_pedag', 'exp_2026_manutencao_higiene'].includes(e.id)
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

  // Totalizadores de Despesas Reais
  let totalDespesasMes = 0;
  let totalDespesasPagas = 0;
  let totalDespesasPendentes = 0;

  expenses.forEach((exp) => {
    const val = Number(exp.valor) || 0;
    totalDespesasMes += val;
    if (exp.status === 'PAGO') {
      totalDespesasPagas += val;
    } else {
      totalDespesasPendentes += val;
    }
  });

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
 * Calcula as despesas operacionais automáticas a partir dos dados consolidados dos módulos:
 * 1. Folha de Pagamento (Livro Ponto / Equipe Ativa de Monitoria & Docência)
 * 2. Refeições e Lanches (Cardápio e Alimentação Auditada pela Nutricionista)
 * 3. Oficinas Especialistas Terceirizadas (Natação & Especialistas Credenciados)
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
  const totalAlunos = activeStudents.length;

  // 1. Folha de Pagamento das Monitoras/ADIs e Docentes
  const activeStaff = (users || []).filter(
    (u) =>
      u.status !== 'DESLIGADO' &&
      !['admin', 'coordenador'].includes(String(u.role).toLowerCase())
  );
  const staffCount = activeStaff.length;

  const totalFolha = activeStaff.reduce((sum, u) => {
    const base = Number(u.baseSalary) || 0;
    const ajuda = Number(u.ajudaDeCusto) || 0;
    return sum + base + ajuda;
  }, 0);

  // 2. Refeições e Lanches (Alimentação e Hortifruti)
  // Alunos matriculados × 22 dias letivos no mês × R$ 6.00 (lanches saudáveis e frutas frescas)
  const diasLetivosMes = 22;
  const custoUnitarioDiarioAlimentacao = 6.0;
  const totalAlimentacao =
    totalAlunos > 0
      ? Math.round(totalAlunos * diasLetivosMes * custoUnitarioDiarioAlimentacao * 100) / 100
      : 0;

  // 3. Oficinas Especialistas Terceirizadas
  // 3a. Natação (Academia Aquática Fit + Transporte Escolar Autorizado)
  const alunosNatacao = activeStudents.filter(
    (s) =>
      (s.activities || []).some((m) => m.toLowerCase().includes('nata')) ||
      (s.modalidadesEspeciais || []).some((m) => m.toLowerCase().includes('nata'))
  ).length;
  // Repasse de R$ 140,00 por aluno para a infraestrutura aquática + vans credenciadas
  const totalNatacao = Math.round(alunosNatacao * 140.0 * 100) / 100;

  // 3b. Especialistas (Judô, Balé, Flauta, Futebol)
  const alunosEspecialistas = activeStudents.filter((s) => {
    const list = [...(s.activities || []), ...(s.modalidadesEspeciais || [])];
    return list.some((m) => {
      const l = m.toLowerCase();
      return (
        l.includes('jud') ||
        l.includes('bal') ||
        l.includes('flaut') ||
        l.includes('fute') ||
        l.includes('músic')
      );
    });
  }).length;
  // Repasse de R$ 80,00 por aluno para os instrutores especialistas
  const totalEspecialistas = Math.round(alunosEspecialistas * 80.0 * 100) / 100;

  const nowIso = new Date().toISOString();
  const expensesList: FinancialExpense[] = [];

  if (totalFolha > 0) {
    expensesList.push({
      id: `exp_${anoLetivo}_folha_monit`,
      anoLetivo,
      categoria: 'FOLHA_PAGAMENTO',
      descricao: `Folha Salarial — Monitoras e Docentes (${anoLetivo})`,
      valor: totalFolha,
      dataVencimento: `${anoLetivo}-08-05`,
      dataPagamento: `${anoLetivo}-08-05`,
      status: 'PAGO',
      formaPagamento: 'Transferência Bancária (Folha)',
      fornecedorOuBeneficiario: 'Equipe de Monitoria e Docência do Programa Integral',
      observacoes: `Auto-Sync: Calculado a partir de ${staffCount} colaboradores(as) cadastrados no Livro Ponto.`,
      createdAt: nowIso,
      updatedAt: nowIso,
      isAutoGenerated: true,
      origemModulo: 'FOLHA_PONTO',
      autoSyncKey: `sync_folha_${anoLetivo}`,
    });
  }

  if (totalAlimentacao > 0) {
    expensesList.push({
      id: `exp_${anoLetivo}_alimentacao_cantina`,
      anoLetivo,
      categoria: 'ALIMENTACAO_HORTIFRUTI',
      descricao: `Alimentação Escolar, Frutas Frescas e Lanches Nutricionais (${anoLetivo})`,
      valor: totalAlimentacao,
      dataVencimento: `${anoLetivo}-08-12`,
      dataPagamento: `${anoLetivo}-08-12`,
      status: 'PAGO',
      formaPagamento: 'Boleto Bancário',
      fornecedorOuBeneficiario: 'NutriEscola Refeições Saudáveis & Hortifruti',
      observacoes: `Auto-Sync: ${totalAlunos} alunos ativos × ${diasLetivosMes} dias letivos × R$ 6,00/dia.`,
      createdAt: nowIso,
      updatedAt: nowIso,
      isAutoGenerated: true,
      origemModulo: 'CARDAPIO_REFEICOES',
      autoSyncKey: `sync_refeicoes_${anoLetivo}`,
    });
  }

  if (totalNatacao > 0) {
    expensesList.push({
      id: `exp_${anoLetivo}_oficinas_natacao`,
      anoLetivo,
      categoria: 'OFICINAS_TERCEIRIZADAS',
      descricao: `Repasse Academia & Transporte Credenciado — Natação (${anoLetivo})`,
      valor: totalNatacao,
      dataVencimento: `${anoLetivo}-08-10`,
      dataPagamento: `${anoLetivo}-08-10`,
      status: 'PAGO',
      formaPagamento: 'Boleto Bancário',
      fornecedorOuBeneficiario: 'Centro Aquático Fit & Transporte Credenciado',
      observacoes: `Auto-Sync: Repasse mensal de ${alunosNatacao} alunos matriculados na modalidade Natação × R$ 140,00/mês.`,
      createdAt: nowIso,
      updatedAt: nowIso,
      isAutoGenerated: true,
      origemModulo: 'OFICINAS_EXTRAS',
      autoSyncKey: `sync_oficinas_natacao_${anoLetivo}`,
    });
  }

  if (totalEspecialistas > 0) {
    expensesList.push({
      id: `exp_${anoLetivo}_oficinas_artes`,
      anoLetivo,
      categoria: 'OFICINAS_TERCEIRIZADAS',
      descricao: `Honorários Especialistas Terceirizados (Judô, Balé, Flauta, Futebol) (${anoLetivo})`,
      valor: totalEspecialistas,
      dataVencimento: `${anoLetivo}-08-15`,
      dataPagamento: `${anoLetivo}-08-15`,
      status: 'PAGO',
      formaPagamento: 'PIX Institucional',
      fornecedorOuBeneficiario: 'Associação de Especialistas e Instrutores Credenciados',
      observacoes: `Auto-Sync: Repasse de ${alunosEspecialistas} participações em oficinas vespertinas × R$ 80,00/mês.`,
      createdAt: nowIso,
      updatedAt: nowIso,
      isAutoGenerated: true,
      origemModulo: 'OFICINAS_EXTRAS',
      autoSyncKey: `sync_oficinas_especialistas_${anoLetivo}`,
    });
  }

  return expensesList;
}

/**
 * Executa a sincronização com Firestore e Cache Local, preservando lançamentos manuais
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

  for (const gen of generated) {
    const existingIndex = mergedList.findIndex(
      (e) =>
        e.anoLetivo === anoLetivo &&
        ((e.autoSyncKey && e.autoSyncKey === gen.autoSyncKey) || e.id === gen.id)
    );

    if (existingIndex >= 0) {
      const prev = mergedList[existingIndex];
      mergedList[existingIndex] = {
        ...prev,
        ...gen,
        id: prev.id,
        status: prev.status || gen.status,
        dataPagamento: prev.dataPagamento || gen.dataPagamento,
        formaPagamento: prev.formaPagamento || gen.formaPagamento,
        updatedAt: nowIso,
      };
      await saveExpenseToFirestore(mergedList[existingIndex]);
    } else {
      mergedList.push(gen);
      await saveExpenseToFirestore(gen);
    }
  }

  saveLastExpenseSyncTime(nowIso);

  return {
    updatedExpenses: mergedList,
    count: generated.length,
    timestamp: nowIso,
  };
}

