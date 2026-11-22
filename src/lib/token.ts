// Token del taller guardado en localStorage del navegador.
// Lo introduce cada asistente una sola vez en la web y se reutiliza en todos los retos y demos.
export const TOKEN_STORAGE_KEY = 'taller:token';
export const TOKEN_CHANGE_EVENT = 'taller:token-change';
export const TOKEN_REQUEST_EVENT = 'taller:pedir-token';

export function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): string {
  const limpio = token.trim();
  try {
    if (limpio) localStorage.setItem(TOKEN_STORAGE_KEY, limpio);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(TOKEN_CHANGE_EVENT, { detail: limpio }));
  return limpio;
}

export function clearToken(): void {
  setToken('');
}

export function pedirToken(): void {
  window.dispatchEvent(new CustomEvent(TOKEN_REQUEST_EVENT));
}

export function conToken(headers: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return { ...headers, Authorization: `Bearer ${token}` };
}

export async function validarToken(token: string): Promise<{ ok: boolean; error?: string }> {
  const limpio = token.trim();
  if (!limpio) return { ok: false, error: 'Escribe el token del taller.' };

  try {
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${limpio}` },
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (res.status === 401) return { ok: false, error: 'Token no válido. Comprueba que lo has escrito bien.' };
    return { ok: false, error: data?.error?.message ?? `Error ${res.status} al comprobar el token.` };
  } catch {
    return { ok: false, error: 'No se pudo comprobar el token. Revisa tu conexión.' };
  }
}
