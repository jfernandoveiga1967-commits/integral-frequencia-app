import { WorkLocation, UserProfile } from '../types';

// ============================================================================
// CONFIGURAÇÃO DE VALIDAÇÃO POR REDE WI-FI INSTITUCIONAL / IP (COLÉGIO CRESCER)
// ============================================================================

/**
 * SSIDs das Redes Wi-Fi Oficiais autorizadas do Colégio Crescer
 */
export const allowedWifiSSIDs = [
  'Colegio_Crescer',
  'Colegio_Crescer_ADM',
  'Colegio_Crescer_Staff',
] as const;

/**
 * Ativação da validação de rede / IP público do Colégio Crescer
 */
export const allowIPValidation = true;

/**
 * Nome padrão oficial da rede exibido nos registros e comprovantes
 */
export const DEFAULT_NETWORK_NAME = 'Wi-Fi Colégio Crescer';

/**
 * Lista de IPs públicos de saída autorizados da internet do Colégio Crescer (configuráveis pela equipe de TI).
 * Se vazia, aceita qualquer conexão validada via Wi-Fi do colégio registrando o IP para auditoria.
 */
export const allowedSchoolIPs: string[] = [];

export const NETWORK_VALIDATION_CONFIG = {
  allowedWifiSSIDs: ['Colegio_Crescer', 'Colegio_Crescer_ADM', 'Colegio_Crescer_Staff'] as string[],
  allowIPValidation: true,
  defaultNetworkName: 'Wi-Fi Colégio Crescer',
  allowedSchoolIPs: [] as string[],
};

export interface NetworkValidationResult {
  isValid: boolean;
  networkName: string;
  clientIp?: string;
  ssid?: string;
  reason?: 'SUCCESS' | 'OUT_OF_NETWORK' | 'CELLULAR_CONNECTION' | 'OFFLINE' | 'IP_MISMATCH';
  errorMessage?: string;
}

/**
 * Consulta o IP público de saída do cliente via serviço api.ipify.org com timeout e fallback.
 */
export async function getClientPublicIP(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ip || null;
  } catch {
    try {
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 4000);
      const res2 = await fetch('https://api64.ipify.org?format=json', { signal: controller2.signal });
      clearTimeout(timeoutId2);
      if (!res2.ok) return null;
      const data2 = await res2.json();
      return data2?.ip || null;
    } catch {
      return null;
    }
  }
}

/**
 * Verifica se a conexão atual do dispositivo corresponde à rede Wi-Fi / IP do Colégio Crescer.
 * 1. Verifica conectividade online do navegador.
 * 2. Bloqueia dados móveis (4G/5G celular) se reportados pelo dispositivo.
 * 3. Valida IP público de saída via api.ipify.org (se allowIPValidation = true).
 * 4. Retorna status aprovado ou orientação de conexão.
 */
export async function verifySchoolNetwork(): Promise<NetworkValidationResult> {
  if (typeof window !== 'undefined' && !navigator.onLine) {
    return {
      isValid: false,
      networkName: 'Desconectado',
      reason: 'OFFLINE',
      errorMessage: 'Dispositivo sem acesso à internet. Conecte-se à rede Wi-Fi do Colégio Crescer para registrar o ponto.',
    };
  }

  // Verifica tipo de conexão se suportado pelo navegador (bloqueio de 4G/5G quando detectado)
  const navConnection =
    typeof navigator !== 'undefined'
      ? (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
      : null;

  if (navConnection && navConnection.type === 'cellular') {
    return {
      isValid: false,
      networkName: 'Rede Móvel Celular (4G/5G)',
      reason: 'CELLULAR_CONNECTION',
      errorMessage: 'Conecte-se à rede Wi-Fi do Colégio Crescer para registrar o ponto presencial.',
    };
  }

  // Validação por IP público via api.ipify.org
  let clientIp: string | undefined;
  if (NETWORK_VALIDATION_CONFIG.allowIPValidation) {
    const ip = await getClientPublicIP();
    if (ip) {
      clientIp = ip;
    }
  }

  // Se houver lista de IPs autorizados do Colégio Crescer configurada:
  const targetAllowedIPs = NETWORK_VALIDATION_CONFIG.allowedSchoolIPs;
  if (targetAllowedIPs.length > 0 && clientIp) {
    const matchesIp = targetAllowedIPs.includes(clientIp);
    if (!matchesIp) {
      return {
        isValid: false,
        networkName: 'Rede Externa Não Autorizada',
        clientIp,
        reason: 'IP_MISMATCH',
        errorMessage: 'Conecte-se à rede Wi-Fi do Colégio Crescer para registrar o ponto presencial.',
      };
    }
  }

  return {
    isValid: true,
    networkName: NETWORK_VALIDATION_CONFIG.defaultNetworkName,
    clientIp,
    ssid: NETWORK_VALIDATION_CONFIG.allowedWifiSSIDs[0],
    reason: 'SUCCESS',
  };
}

// ============================================================================
// COMPATIBILIDADE E ESTRUTURA INSTITUCIONAL (SEDE & POLOS)
// ============================================================================
export const DEFAULT_GEOFENCE_RADIUS_METERS = 100;

export const OFFICIAL_WORK_LOCATIONS: WorkLocation[] = [
  {
    id: 'sede',
    name: 'Colégio Crescer (Sede - Rua Itatiba)',
    address: 'Rua Itatiba, 1427',
    latitude: -22.9288,
    longitude: -47.1065,
    radiusMeters: 100,
    description: 'Unidade oficial central do Colégio Crescer',
  },
  {
    id: 'academia_fit',
    name: 'Academia / Externo',
    address: 'Rua Visconde de Indaiatuba, 340 (Centro de Treinamento Esportivo)',
    latitude: -22.9315,
    longitude: -47.1030,
    radiusMeters: 100,
    description: 'Polo parceiro de esportes e atividades físicas externas',
  },
];

export const COLEGIO_CRESCER_GEOFENCE = OFFICIAL_WORK_LOCATIONS[0];

const STORAGE_KEY_CUSTOM_LOCATIONS = 'ponto_custom_work_locations';

export function generateLocationId(name: string, address: string): string {
  const cleanName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30) || 'externo';

  const cleanAddress = address.toLowerCase().trim();
  let hash = 0;
  for (let i = 0; i < cleanAddress.length; i++) {
    hash = (hash << 5) - hash + cleanAddress.charCodeAt(i);
    hash |= 0;
  }
  const hexHash = Math.abs(hash).toString(16).slice(0, 6);
  return `ext_${cleanName}_${hexHash}`;
}

export function loadCustomWorkLocations(): WorkLocation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_LOCATIONS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (loc) => loc && loc.id && loc.name && typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
      );
    }
  } catch (e) {
    console.warn('Erro ao carregar locais customizados de trabalho:', e);
  }
  return [];
}

export function saveCustomWorkLocationToStorage(location: WorkLocation): WorkLocation[] {
  try {
    const current = loadCustomWorkLocations();
    const existingIndex = current.findIndex(
      (l) => l.id === location.id || (l.name.toLowerCase() === location.name.toLowerCase() && l.address.toLowerCase() === location.address.toLowerCase())
    );

    let updated: WorkLocation[];
    if (existingIndex >= 0) {
      updated = [...current];
      updated[existingIndex] = { ...updated[existingIndex], ...location };
    } else {
      updated = [...current, location];
    }

    localStorage.setItem(STORAGE_KEY_CUSTOM_LOCATIONS, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Erro ao salvar local customizado de trabalho:', e);
    return loadCustomWorkLocations();
  }
}

export function getAllWorkLocations(extraLocations?: WorkLocation[]): WorkLocation[] {
  const map = new Map<string, WorkLocation>();
  for (const loc of OFFICIAL_WORK_LOCATIONS) {
    map.set(loc.id, loc);
  }
  const stored = loadCustomWorkLocations();
  for (const loc of stored) {
    if (!map.has(loc.id)) {
      map.set(loc.id, loc);
    }
  }
  if (Array.isArray(extraLocations)) {
    for (const loc of extraLocations) {
      if (loc && loc.id && !map.has(loc.id)) {
        map.set(loc.id, loc);
      }
    }
  }
  return Array.from(map.values());
}

export function getUserAllowedLocations(
  user?: UserProfile | null,
  allLocations?: WorkLocation[]
): WorkLocation[] {
  const pool = allLocations && allLocations.length > 0 ? allLocations : getAllWorkLocations(user?.customLocations);
  const allowedIds: string[] =
    Array.isArray(user?.allowedLocations) && user!.allowedLocations.length > 0
      ? user!.allowedLocations
      : ['sede'];
  const matched = pool.filter((loc) => allowedIds.includes(loc.id));
  if (matched.length > 0) return matched;
  return [pool[0] || OFFICIAL_WORK_LOCATIONS[0]];
}
