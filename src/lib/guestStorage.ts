import type { AppStateData, RememberedGoogleUser } from '../types';

const LS_KEY_PRODUCTS = 'facha_productos';
const LS_KEY_REPAIRS = 'facha_reparaciones';
const LS_KEY_SALES = 'facha_historial';
const LS_KEY_REMEMBERED_USER = 'facha_remembered_google_user';
const LS_KEY_AUTH_MODE = 'facha_auth_mode_v2';

export function readLocalMirror(): AppStateData {
  try {
    const productos = JSON.parse(localStorage.getItem(LS_KEY_PRODUCTS) || '[]');
    const reparaciones = JSON.parse(localStorage.getItem(LS_KEY_REPAIRS) || '[]');
    const historial = JSON.parse(localStorage.getItem(LS_KEY_SALES) || '[]');
    return {
      productos: Array.isArray(productos) ? productos : [],
      reparaciones: Array.isArray(reparaciones) ? reparaciones : [],
      historial: Array.isArray(historial) ? historial : [],
    };
  } catch {
    return { productos: [], reparaciones: [], historial: [] };
  }
}

export function writeLocalMirror(state: AppStateData): void {
  try {
    localStorage.setItem(LS_KEY_PRODUCTS, JSON.stringify(state.productos));
    localStorage.setItem(LS_KEY_REPAIRS, JSON.stringify(state.reparaciones));
    localStorage.setItem(LS_KEY_SALES, JSON.stringify(state.historial));
  } catch {
    // Ignore storage quota errors
  }
}

export async function loadGuestStateFromServer(): Promise<AppStateData> {
  const local = readLocalMirror();
  try {
    const res = await fetch('/api/state', { credentials: 'same-origin' });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) return local;
    const remote = (await res.json()) as Partial<AppStateData>;
    const serverState: AppStateData = {
      productos: Array.isArray(remote.productos) ? remote.productos : [],
      reparaciones: Array.isArray(remote.reparaciones) ? remote.reparaciones : [],
      historial: Array.isArray(remote.historial) ? remote.historial : [],
    };
    const serverHasData =
      serverState.productos.length > 0 ||
      serverState.reparaciones.length > 0 ||
      serverState.historial.length > 0;
    const localHasData =
      local.productos.length > 0 ||
      local.reparaciones.length > 0 ||
      local.historial.length > 0;

    if (serverHasData) {
      writeLocalMirror(serverState);
      return serverState;
    }
    if (localHasData) {
      await saveGuestStateToServer(local);
      return local;
    }
    return serverState;
  } catch {
    return local;
  }
}

export async function saveGuestStateToServer(state: AppStateData): Promise<void> {
  writeLocalMirror(state);
  try {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(state),
    });
  } catch {
    // Local mirror already persisted
  }
}

export function getRememberedGoogleUser(): RememberedGoogleUser | null {
  try {
    const raw = localStorage.getItem(LS_KEY_REMEMBERED_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedGoogleUser>;
    if (!parsed.uid || !parsed.email) return null;
    return {
      uid: parsed.uid,
      displayName: parsed.displayName || parsed.email,
      email: parsed.email,
      photoURL: parsed.photoURL || '',
    };
  } catch {
    return null;
  }
}

export function setRememberedGoogleUser(user: RememberedGoogleUser | null): void {
  try {
    if (!user) {
      localStorage.removeItem(LS_KEY_REMEMBERED_USER);
    } else {
      localStorage.setItem(LS_KEY_REMEMBERED_USER, JSON.stringify(user));
    }
  } catch {
    // Ignore
  }
}

export function getSavedAuthMode(): 'google' | 'guest' | null {
  try {
    const v = localStorage.getItem(LS_KEY_AUTH_MODE);
    return v === 'google' || v === 'guest' ? v : null;
  } catch {
    return null;
  }
}

export function setSavedAuthMode(mode: 'google' | 'guest' | null): void {
  try {
    if (!mode) localStorage.removeItem(LS_KEY_AUTH_MODE);
    else localStorage.setItem(LS_KEY_AUTH_MODE, mode);
  } catch {
    // Ignore
  }
}
