import { WorkLocation, UserProfile } from '../types';

// ============================================================================
// LOCAIS DE TRABALHO OFICIAIS DO COLÉGIO CRESCER (GEOFENCING 100M)
// ============================================================================
export const DEFAULT_GEOFENCE_RADIUS_METERS = 100;

export const OFFICIAL_WORK_LOCATIONS: WorkLocation[] = [
  {
    id: 'sede',
    name: 'Colégio Crescer (Sede - Rua Itatiba)',
    address: 'Rua Itatiba, 1427',
    latitude: -22.9288,
    longitude: -47.1065,
    radiusMeters: 100, // Raio padrão de tolerância estrito para 100 metros
    description: 'Unidade oficial central do Colégio Crescer (Padrão para todos os colaboradores)',
  },
  {
    id: 'academia_fit',
    name: 'Academia / Externo',
    address: 'Rua Visconde de Indaiatuba, 340 (Centro de Treinamento Esportivo)',
    latitude: -22.9315,
    longitude: -47.1030,
    radiusMeters: 100, // Raio padrão de tolerância estrito para 100 metros
    description: 'Polo parceiro de esportes e atividades físicas externas (Exclusivo para colaboradores autorizados)',
  },
];

// Alias para compatibilidade com implementações existentes da Sede
export const COLEGIO_CRESCER_GEOFENCE = OFFICIAL_WORK_LOCATIONS[0];

const STORAGE_KEY_CUSTOM_LOCATIONS = 'ponto_custom_work_locations';

/**
 * Gera um ID único e canônico (slug/hash) para evitar duplicatas no Firestore e LocalStorage.
 * Ex: 'Quadra de Tênis' + 'Rua das Flores 120' -> 'ext_quadra_de_tenis_7b3a'
 */
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

/**
 * Carrega locais dinâmicos/personalizados salvos no LocalStorage.
 */
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

/**
 * Salva ou atualiza um local customizado no LocalStorage prevenindo duplicatas.
 */
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

/**
 * Obtém todos os locais de trabalho conhecidos (oficiais + locais customizados globais/usuário),
 * garantindo ausência de IDs ou nomes duplicados.
 */
export function getAllWorkLocations(extraLocations?: WorkLocation[]): WorkLocation[] {
  const map = new Map<string, WorkLocation>();

  // 1. Locais Oficiais sempre prioritários
  for (const loc of OFFICIAL_WORK_LOCATIONS) {
    map.set(loc.id, loc);
  }

  // 2. Locais salvos em LocalStorage
  const stored = loadCustomWorkLocations();
  for (const loc of stored) {
    if (!map.has(loc.id)) {
      map.set(loc.id, loc);
    }
  }

  // 3. Locais extras passados pelo usuário (UserProfile.customLocations)
  if (Array.isArray(extraLocations)) {
    for (const loc of extraLocations) {
      if (loc && loc.id && !map.has(loc.id)) {
        map.set(loc.id, loc);
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Retorna os locais autorizados para o colaborador especificado.
 * Regra Padrão (Default): Se 'allowedLocations' for vazio ou não informado,
 * o usuário possui autorização EXCLUSIVA para a 'sede' (Colégio Crescer - Rua Itatiba).
 */
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

/**
 * Geocodifica um endereço via serviço OpenStreetMap Nominatim com timeout.
 */
export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number; displayName?: string } | null> {
  const clean = address.trim();
  if (!clean) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    // Prioriza contexto de endereço brasileiro
    const query = clean.toLowerCase().includes('brasil') || clean.toLowerCase().includes('brazil')
      ? clean
      : `${clean}, Brasil`;

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`,
      {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        },
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      };
    }
  } catch (err) {
    console.warn('Geocodificação via Nominatim falhou ou sofreu timeout:', err);
  }
  return null;
}

/**
 * Captura as coordenadas do GPS nativo do dispositivo via Geolocation API.
 */
export function getCurrentDeviceLocation(timeoutMs = 10000): Promise<{ latitude: number; longitude: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocalização não é suportada neste navegador ou dispositivo.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
}
