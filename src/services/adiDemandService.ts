import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  AdiDemandPriority,
  AdiDemandRecord,
  AdiDemandStatus,
  TurmaAtribuicao,
  UserProfile,
} from '../types';
import { generateWhatsAppUrl } from '../utils/whatsappUtils';
import { broadcastSyncEvent, subscribeToSyncEvents } from './syncService';

export const ADI_DEMANDS_COLLECTION = 'adiDemands';
export const LOCAL_ADI_DEMANDS_STORAGE_KEY = 'colegio_crescer_adi_demands_v1';

export function normalizeAdiText(value?: string | null): string {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function sortAdiDemands(records: AdiDemandRecord[]): AdiDemandRecord[] {
  const statusWeight: Record<AdiDemandStatus, number> = {
    pendente: 0,
    em_andamento: 1,
    concluido: 2,
  };
  const priorityWeight: Record<AdiDemandPriority, number> = {
    urgente: 0,
    normal: 1,
  };

  return [...records].sort((a, b) => {
    const sDiff = (statusWeight[a.status] ?? 9) - (statusWeight[b.status] ?? 9);
    if (sDiff !== 0) return sDiff;

    if (a.status !== 'concluido') {
      const pDiff = (priorityWeight[a.prioridade] ?? 1) - (priorityWeight[b.prioridade] ?? 1);
      if (pDiff !== 0) return pDiff;

      const dateA = (a.prazoData || '9999-12-31').trim();
      const dateB = (b.prazoData || '9999-12-31').trim();
      if (dateA !== dateB) return dateA.localeCompare(dateB);
    } else {
      const resA = a.resolvedAt || a.updatedAt || a.createdAt || '';
      const resB = b.resolvedAt || b.updatedAt || b.createdAt || '';
      if (resA !== resB) return resB.localeCompare(resA);
    }

    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

function normalizeAdiDemandRecord(raw: Partial<AdiDemandRecord> & { id?: string }): AdiDemandRecord | null {
  if (!raw || !raw.id || !raw.adiName || !raw.titulo) return null;
  const status: AdiDemandStatus =
    raw.status === 'em_andamento' || raw.status === 'concluido' ? raw.status : 'pendente';
  const prioridade: AdiDemandPriority = raw.prioridade === 'urgente' ? 'urgente' : 'normal';

  return {
    id: String(raw.id),
    adiName: String(raw.adiName).trim(),
    ...(raw.adiPhone && String(raw.adiPhone).trim() ? { adiPhone: String(raw.adiPhone).trim() } : {}),
    ...(raw.turma && String(raw.turma).trim() ? { turma: String(raw.turma).trim() } : {}),
    ...(raw.studentName && String(raw.studentName).trim()
      ? { studentName: String(raw.studentName).trim() }
      : {}),
    titulo: String(raw.titulo).trim(),
    descricao: String(raw.descricao || '').trim(),
    prazoData: String(raw.prazoData || '').trim() || new Date().toISOString().slice(0, 10),
    prioridade,
    status,
    ...(raw.observacaoRetorno && String(raw.observacaoRetorno).trim()
      ? { observacaoRetorno: String(raw.observacaoRetorno).trim() }
      : {}),
    createdAt: raw.createdAt || new Date().toISOString(),
    ...(raw.createdBy ? { createdBy: String(raw.createdBy) } : {}),
    ...(raw.updatedAt ? { updatedAt: String(raw.updatedAt) } : {}),
    ...(raw.updatedBy ? { updatedBy: String(raw.updatedBy) } : {}),
    ...(raw.resolvedAt ? { resolvedAt: String(raw.resolvedAt) } : {}),
  };
}

export function loadLocalAdiDemands(): AdiDemandRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_ADI_DEMANDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed
      .map((item) => normalizeAdiDemandRecord(item))
      .filter((item): item is AdiDemandRecord => item !== null);
    return sortAdiDemands(valid);
  } catch {
    return [];
  }
}

export function saveLocalAdiDemands(records: AdiDemandRecord[]): void {
  try {
    localStorage.setItem(LOCAL_ADI_DEMANDS_STORAGE_KEY, JSON.stringify(sortAdiDemands(records)));
  } catch (err) {
    console.warn('Erro ao salvar demandas de ADI localmente:', err);
  }
}

export async function listAdiDemands(): Promise<AdiDemandRecord[]> {
  try {
    const snapshot = await getDocs(collection(db, ADI_DEMANDS_COLLECTION));
    const list: AdiDemandRecord[] = [];
    snapshot.forEach((docSnap) => {
      const normalized = normalizeAdiDemandRecord({
        ...(docSnap.data() as Partial<AdiDemandRecord>),
        id: docSnap.id,
      });
      if (normalized) list.push(normalized);
    });
    const sorted = sortAdiDemands(list);
    saveLocalAdiDemands(sorted);
    return sorted;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, ADI_DEMANDS_COLLECTION);
    return loadLocalAdiDemands();
  }
}

export function subscribeAdiDemands(
  onData: (records: AdiDemandRecord[]) => void,
  onError?: (error: unknown) => void
): () => void {
  // Emite cache local imediatamente para resposta instantânea na interface
  onData(loadLocalAdiDemands());

  const unsubscribeSnapshot = onSnapshot(
    collection(db, ADI_DEMANDS_COLLECTION),
    (snapshot) => {
      const remoteList: AdiDemandRecord[] = [];
      snapshot.forEach((docSnap) => {
        const normalized = normalizeAdiDemandRecord({
          ...(docSnap.data() as Partial<AdiDemandRecord>),
          id: docSnap.id,
        });
        if (normalized) remoteList.push(normalized);
      });
      const sorted = sortAdiDemands(remoteList);
      saveLocalAdiDemands(sorted);
      onData(sorted);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, ADI_DEMANDS_COLLECTION);
      if (onError) onError(error);
    }
  );

  const unsubscribeBroadcast = subscribeToSyncEvents((msg) => {
    if (msg.type === 'SYNC_ADI_DEMANDS') {
      onData(loadLocalAdiDemands());
    }
  });

  return () => {
    unsubscribeSnapshot();
    unsubscribeBroadcast();
  };
}

export interface CreateAdiDemandInput {
  adiName: string;
  adiPhone?: string;
  turma?: string;
  studentName?: string;
  titulo: string;
  descricao: string;
  prazoData: string;
  prioridade?: AdiDemandPriority;
  createdBy?: string;
}

export async function createAdiDemand(input: CreateAdiDemandInput): Promise<AdiDemandRecord> {
  const adiName = (input.adiName || '').trim();
  const titulo = (input.titulo || '').trim();
  const descricao = (input.descricao || '').trim();
  const prazoData = (input.prazoData || '').trim();

  if (!adiName) {
    throw new Error('Selecione ou informe o nome da ADI responsável.');
  }
  if (!titulo) {
    throw new Error('Informe um título objetivo para o lembrete/demanda.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prazoData)) {
    throw new Error('Informe uma data de prazo válida (YYYY-MM-DD).');
  }

  const nowIso = new Date().toISOString();
  const demandId = `adi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const record: AdiDemandRecord = {
    id: demandId,
    adiName,
    ...(input.adiPhone && input.adiPhone.trim() ? { adiPhone: input.adiPhone.trim() } : {}),
    ...(input.turma && input.turma.trim() ? { turma: input.turma.trim() } : {}),
    ...(input.studentName && input.studentName.trim() ? { studentName: input.studentName.trim() } : {}),
    titulo,
    descricao: descricao || titulo,
    prazoData,
    prioridade: input.prioridade === 'urgente' ? 'urgente' : 'normal',
    status: 'pendente',
    createdAt: nowIso,
    createdBy: input.createdBy || 'Coordenação',
    updatedAt: nowIso,
    updatedBy: input.createdBy || 'Coordenação',
  };

  const cleanRecord = Object.fromEntries(
    Object.entries(record).filter(([, v]) => v !== undefined)
  ) as AdiDemandRecord;

  const currentLocal = loadLocalAdiDemands().filter((r) => r.id !== demandId);
  const nextLocal = sortAdiDemands([cleanRecord, ...currentLocal]);
  saveLocalAdiDemands(nextLocal);
  broadcastSyncEvent('SYNC_ADI_DEMANDS', { action: 'create', record: cleanRecord });

  try {
    await setDoc(doc(db, ADI_DEMANDS_COLLECTION, demandId), cleanRecord, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${ADI_DEMANDS_COLLECTION}/${demandId}`);
  }

  return cleanRecord;
}

export async function updateAdiDemandStatus(
  demandId: string,
  status: AdiDemandStatus,
  updatedBy: string = 'Coordenação',
  observacaoRetorno?: string
): Promise<AdiDemandRecord | null> {
  const existing = loadLocalAdiDemands().find((r) => r.id === demandId);
  const nowIso = new Date().toISOString();

  const patch: Partial<AdiDemandRecord> = {
    status,
    updatedAt: nowIso,
    updatedBy,
  };

  if (observacaoRetorno !== undefined) {
    const trimmed = observacaoRetorno.trim();
    if (trimmed) {
      patch.observacaoRetorno = trimmed;
    }
  }

  if (status === 'concluido') {
    patch.resolvedAt = nowIso;
  }

  const updatedRecord: AdiDemandRecord | null = existing
    ? {
        ...existing,
        ...patch,
        ...(status !== 'concluido' ? { resolvedAt: undefined } : {}),
      }
    : null;

  if (updatedRecord) {
    const nextLocal = loadLocalAdiDemands().map((r) => (r.id === demandId ? updatedRecord : r));
    saveLocalAdiDemands(nextLocal);
    broadcastSyncEvent('SYNC_ADI_DEMANDS', { action: 'update', record: updatedRecord });
  }

  const firestorePayload: Record<string, unknown> = { ...patch };
  if (status !== 'concluido') {
    firestorePayload.resolvedAt = null;
  }

  try {
    await setDoc(doc(db, ADI_DEMANDS_COLLECTION, demandId), firestorePayload, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${ADI_DEMANDS_COLLECTION}/${demandId}`);
  }

  return updatedRecord;
}

export async function concludeAdiDemand(
  demandId: string,
  observacaoRetorno?: string,
  updatedBy: string = 'Coordenação'
): Promise<AdiDemandRecord | null> {
  return updateAdiDemandStatus(demandId, 'concluido', updatedBy, observacaoRetorno);
}

export async function updateAdiDemandPhone(
  demandId: string,
  adiPhone: string,
  updatedBy: string = 'Coordenação'
): Promise<void> {
  const cleanPhone = adiPhone.trim();
  if (!cleanPhone) return;
  const nowIso = new Date().toISOString();

  const localList = loadLocalAdiDemands();
  const nextLocal = localList.map((r) =>
    r.id === demandId ? { ...r, adiPhone: cleanPhone, updatedAt: nowIso, updatedBy } : r
  );
  saveLocalAdiDemands(nextLocal);
  broadcastSyncEvent('SYNC_ADI_DEMANDS', { action: 'update_phone', demandId, adiPhone: cleanPhone });

  try {
    await setDoc(
      doc(db, ADI_DEMANDS_COLLECTION, demandId),
      { adiPhone: cleanPhone, updatedAt: nowIso, updatedBy },
      { merge: true }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `${ADI_DEMANDS_COLLECTION}/${demandId}`);
  }
}

export async function deleteAdiDemand(demandId: string): Promise<void> {
  const nextLocal = loadLocalAdiDemands().filter((r) => r.id !== demandId);
  saveLocalAdiDemands(nextLocal);
  broadcastSyncEvent('SYNC_ADI_DEMANDS', { action: 'delete', demandId });

  try {
    await deleteDoc(doc(db, ADI_DEMANDS_COLLECTION, demandId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${ADI_DEMANDS_COLLECTION}/${demandId}`);
  }
}

export function formatAdiPrazoBR(prazoData?: string): string {
  if (!prazoData || !/^\d{4}-\d{2}-\d{2}$/.test(prazoData)) return prazoData || '—';
  const [y, m, d] = prazoData.split('-');
  return `${d}/${m}/${y}`;
}

export function buildAdiDemandWhatsAppMessage(demand: AdiDemandRecord): string {
  const firstName = (demand.adiName || '').trim().split(/\s+/)[0] || 'ADI';
  const priorityTag = demand.prioridade === 'urgente' ? '🚨 *URGENTE* • ' : '📌 ';
  const lines: string[] = [
    `Olá, *${firstName}*! 👋`,
    '',
    `${priorityTag}*Lembrete / Demanda ADI — Programa Integral | Colégio Crescer*`,
    '',
    `📝 *Assunto:* ${demand.titulo}`,
  ];

  if (demand.turma) {
    lines.push(`🏫 *Turma:* ${demand.turma}`);
  }
  if (demand.studentName) {
    lines.push(`🧒 *Aluno(a):* ${demand.studentName}`);
  }
  if (demand.descricao && demand.descricao.trim() !== demand.titulo.trim()) {
    lines.push(`📋 *Detalhes:* ${demand.descricao.trim()}`);
  }

  lines.push(`📅 *Prazo:* ${formatAdiPrazoBR(demand.prazoData)}`);
  lines.push(`📊 *Status:* ${demand.status === 'em_andamento' ? 'Em andamento' : demand.status === 'concluido' ? 'Concluído' : 'Pendente'}`);

  if (demand.observacaoRetorno) {
    lines.push(`💬 *Parecer / Retorno:* ${demand.observacaoRetorno}`);
  }

  lines.push('');
  lines.push('Por favor, nos dê um retorno assim que alinhado. Obrigado(a)!');
  lines.push('Coordenação do Integral — Colégio Crescer');

  return lines.join('\n');
}

export function buildAdiDemandWhatsAppUrl(phone: string, demand: AdiDemandRecord): string {
  return generateWhatsAppUrl(phone, buildAdiDemandWhatsAppMessage(demand));
}

export function resolveAdiPhoneFromDirectory(
  adiName: string,
  atribuicoes: TurmaAtribuicao[] = [],
  users: UserProfile[] = [],
  preferredTurma?: string
): string {
  const normTarget = normalizeAdiText(adiName);
  if (!normTarget) return '';

  if (preferredTurma) {
    const byTurma = atribuicoes.find(
      (a) =>
        normalizeAdiText(a.turma) === normalizeAdiText(preferredTurma) &&
        normalizeAdiText(a.adiName) === normTarget &&
        a.adiPhone
    );
    if (byTurma?.adiPhone) return byTurma.adiPhone;
  }

  const byAtrib = atribuicoes.find(
    (a) => normalizeAdiText(a.adiName) === normTarget && a.adiPhone
  );
  if (byAtrib?.adiPhone) return byAtrib.adiPhone;

  const byUser = users.find(
    (u) => normalizeAdiText(u.name) === normTarget && u.phone
  );
  return byUser?.phone || '';
}

export function getPendingAdiDemandsForTurmaCard(
  demands: AdiDemandRecord[],
  turmaName: string,
  adiName?: string
): AdiDemandRecord[] {
  const normTurma = normalizeAdiText(turmaName);
  const normAdi = normalizeAdiText(adiName);

  return demands.filter((d) => {
    if (!d || d.status === 'concluido') return false;
    const dTurma = normalizeAdiText(d.turma);
    const dAdi = normalizeAdiText(d.adiName);

    const matchesTurma = Boolean(dTurma && normTurma && dTurma === normTurma);
    const matchesAdi = Boolean(normAdi && dAdi === normAdi && (!dTurma || dTurma === normTurma));
    return matchesTurma || matchesAdi;
  });
}

export function getPendingAdiDemandsForUser(
  demands: AdiDemandRecord[],
  user: UserProfile | null
): AdiDemandRecord[] {
  if (!user || !user.name) return [];
  const normUser = normalizeAdiText(user.name);
  if (!normUser) return [];

  return demands.filter(
    (d) => d && d.status !== 'concluido' && normalizeAdiText(d.adiName) === normUser
  );
}
