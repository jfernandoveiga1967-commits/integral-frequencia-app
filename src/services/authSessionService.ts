/**
 * authSessionService.ts
 * Gerencia em memória (nunca em localStorage/sessionStorage) o token de sessão
 * emitido e assinado pelo servidor (/api/auth/session), além de limpeza completa
 * do cache/histórico da Sofia quando o usuário deixa de ser administrador ou faz logout.
 */

let inMemoryServerToken: string | null = null;

export function setServerSessionToken(token: string | null): void {
  inMemoryServerToken = token && token.trim() ? token.trim() : null;
}

export function getServerSessionToken(): string | null {
  return inMemoryServerToken;
}

export function getSofiaAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (inMemoryServerToken) {
    headers.Authorization = `Bearer ${inMemoryServerToken}`;
  }
  return headers;
}

/**
 * Estabelece sessão autenticada no servidor (/api/auth/session).
 * O servidor valida as credenciais na fonte autoritativa e devolve cookie HttpOnly + token em memória.
 */
export async function establishServerSession(
  email: string,
  password: string,
  apiBaseUrl = ''
): Promise<{ ok: boolean; isAdmin: boolean }> {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/session`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      setServerSessionToken(null);
      return { ok: false, isAdmin: false };
    }

    const data = await res.json().catch(() => null);
    if (data?.token && typeof data.token === 'string') {
      setServerSessionToken(data.token);
    }
    return {
      ok: Boolean(data?.success),
      isAdmin: Boolean(data?.isAdmin),
    };
  } catch {
    return { ok: false, isAdmin: false };
  }
}

/**
 * Remove qualquer histórico, alerta ou vestígio local da Sofia no navegador.
 */
export function clearSofiaClientMemoryAndStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.toLowerCase().includes('sofia') || key === 'crescer_sofia_history')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    }
  } catch {}

  try {
    if (typeof sessionStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.toLowerCase().includes('sofia')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => sessionStorage.removeItem(k));
    }
  } catch {}
}

/**
 * Encerra a sessão no servidor e limpa memória e armazenamento local da Sofia.
 */
export async function clearServerSession(apiBaseUrl = ''): Promise<void> {
  setServerSessionToken(null);
  clearSofiaClientMemoryAndStorage();
  try {
    await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
  } catch {}
}
