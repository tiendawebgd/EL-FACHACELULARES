import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  Box,
  FileSpreadsheet,
  LayoutGrid,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  QrCode,
  ShoppingCart,
  TrendingUp,
  Wrench,
  X,
} from 'lucide-react';
import { BackupImportModal } from './components/BackupImportModal';
import { BalanceView } from './components/BalanceView';
import { BrandLogo } from './components/BrandLogo';
import { ConflictModal } from './components/ConflictModal';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { ParallaxWatermark } from './components/ParallaxWatermark';
import { PosView } from './components/PosView';
import { ReceiptModal, type ReceiptPayload } from './components/ReceiptModal';
import { SalesHistoryView } from './components/SalesHistoryView';
import { ScannerView } from './components/ScannerView';
import { ServiceTechView } from './components/ServiceTechView';
import { ToastContainer } from './components/ToastContainer';
import { UserProfileMenu } from './components/UserProfileMenu';
import { WelcomeModal } from './components/WelcomeModal';
import { useBarcodeGun } from './hooks/useBarcodeGun';
import { auth, googleProvider, testFirestoreConnection } from './lib/firebase';
import {
  createEmptyCloudCache,
  fetchCloudStateSnapshot,
  fetchLatestCloudBackup,
  getLatestCloudBackupMeta,
  saveCloudBackupSnapshot,
  subscribeUserCollections,
  syncStateToFirestore,
  type CloudSnapshotCache,
} from './lib/firestoreSync';
import {
  clearLocalMirror,
  clearLocalSessionData,
  getRememberedGoogleUser,
  getSavedAuthMode,
  loadGuestStateFromServer,
  readLocalMirror,
  saveGuestStateToServer,
  setRememberedGoogleUser,
  setSavedAuthMode,
  writeLocalMirror,
} from './lib/guestStorage';
import type {
  AppSection,
  AppStateData,
  AuthMode,
  PaymentMethod,
  Product,
  RememberedGoogleUser,
  RepairOrder,
  SaleLineItem,
  SaleRecord,
  ScannerMode,
  ToastMessage,
} from './types';
import {
  mergeBackupState,
  parseAndNormalizeBackupJson,
  type ParsedBackupResult,
} from './utils/backupImport';
import { getNowTimestampStr, toSafeFirestoreId } from './utils/format';

interface PendingConflict {
  user: User;
  localState: AppStateData;
  cloudState: AppStateData;
  cloudCache: CloudSnapshotCache;
}

interface PendingBackupImport {
  fileName: string;
  parsed: ParsedBackupResult;
  modalTitle?: string;
  sourceHeading?: string;
}

const NAV_ITEMS: { id: AppSection; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'panel', label: 'Panel Principal', icon: LayoutGrid },
  { id: 'escaner', label: 'Escáner / Movimiento', icon: QrCode },
  { id: 'tecnico', label: 'Servicio Técnico', icon: Wrench },
  { id: 'inventario', label: 'Inventario y Precios', icon: Box },
  { id: 'pos', label: 'Punto de Venta', icon: ShoppingCart },
  { id: 'balance', label: 'Balance y Ganancias', icon: TrendingUp },
  { id: 'excel', label: 'Historial & Exportar', icon: FileSpreadsheet },
];

function hasAnyData(state: AppStateData): boolean {
  return (
    state.productos.length > 0 ||
    state.reparaciones.length > 0 ||
    state.historial.length > 0
  );
}

export default function App() {
  const [section, setSection] = useState<AppSection>('panel');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('ENTRADA');
  const [preloadedCode, setPreloadedCode] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>('pending');
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [rememberedUser, setRememberedUser] = useState<RememberedGoogleUser | null>(() =>
    getRememberedGoogleUser()
  );

  const [productos, setProductos] = useState<Product[]>([]);
  const [reparaciones, setReparaciones] = useState<RepairOrder[]>([]);
  const [historial, setHistorial] = useState<SaleRecord[]>([]);

  const [syncingCloud, setSyncingCloud] = useState(false);
  const [restoringCloud, setRestoringCloud] = useState(false);
  const [lastCloudBackupAt, setLastCloudBackupAt] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<PendingBackupImport | null>(null);
  const [importingBackup, setImportingBackup] = useState(false);

  const [gunDetected, setGunDetected] = useState(false);

  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const criticalStockCount = productos.filter((p) => p.stock < 3).length;

  const cloudCacheRef = useRef<CloudSnapshotCache>(createEmptyCloudCache());
  const unsubFirestoreRef = useRef<(() => void) | null>(null);
  const guestPromptSignInRef = useRef(false);
  const activeUidRef = useRef<string | null>(null);
  const signingOutRef = useRef(false);
  const activeScanHandlerRef = useRef<((code: string) => void) | null>(null);
  const gunToastShownRef = useRef(false);
  const stateRef = useRef<AppStateData>({ productos: [], reparaciones: [], historial: [] });
  stateRef.current = { productos, reparaciones, historial };

  const authModeRef = useRef<AuthMode>(authMode);
  authModeRef.current = authMode;

  const notify = useCallback(
    (type: ToastMessage['type'], title: string, message?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, message }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const registerScanHandler = useCallback((fn: ((code: string) => void) | null) => {
    activeScanHandlerRef.current = fn;
  }, []);

  useBarcodeGun({
    enabled:
      authMode !== 'pending' &&
      !welcomeOpen &&
      !pendingConflict &&
      !pendingBackup &&
      !receipt,
    onGunDetected: () => {
      setGunDetected(true);
      if (!gunToastShownRef.current) {
        gunToastShownRef.current = true;
        notify(
          'success',
          'Pistola lectora detectada',
          'Podés escanear códigos de barras directamente desde cualquier pantalla.'
        );
      }
    },
    onScan: (code) => {
      if (activeScanHandlerRef.current) {
        activeScanHandlerRef.current(code);
        return;
      }
      const exists = stateRef.current.productos.some((p) => String(p.codigo) === code);
      if (!exists) {
        setScannerMode('ENTRADA');
      }
      setPreloadedCode(code);
      setSection('escaner');
      setMobileMenuOpen(false);
    },
  });

  const detachCloudListeners = useCallback(() => {
    if (unsubFirestoreRef.current) {
      unsubFirestoreRef.current();
      unsubFirestoreRef.current = null;
    }
    cloudCacheRef.current = createEmptyCloudCache();
  }, []);

  const attachCloudListeners = useCallback(
    (uid: string, initialCache: CloudSnapshotCache) => {
      detachCloudListeners();
      cloudCacheRef.current = initialCache;
      unsubFirestoreRef.current = subscribeUserCollections(uid, cloudCacheRef.current, {
        onProducts: (items) => setProductos(items),
        onRepairs: (items) => setReparaciones(items),
        onSales: (items) => setHistorial(items),
        onError: (err) => {
          notify('error', 'Sincronización en la nube', err.message);
        },
      });
    },
    [detachCloudListeners, notify]
  );

  // Initialize connection check and Firebase Auth observer
  useEffect(() => {
    void testFirestoreConnection();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (activeUidRef.current && activeUidRef.current !== user.uid) {
          detachCloudListeners();
          clearLocalMirror();
          stateRef.current = { productos: [], reparaciones: [], historial: [] };
          setProductos([]);
          setReparaciones([]);
          setHistorial([]);
        }
        activeUidRef.current = user.uid;
        setFirebaseUser(user);
        const resolvedEmail = user.email || user.providerData?.[0]?.email || '';
        const remembered: RememberedGoogleUser = {
          uid: user.uid,
          displayName: user.displayName || user.providerData?.[0]?.displayName || resolvedEmail || 'Usuario',
          email: resolvedEmail,
          photoURL: user.photoURL || user.providerData?.[0]?.photoURL || '',
        };
        setRememberedGoogleUser(remembered);
        setRememberedUser(remembered);

        try {
          const { state: cloudState, cache } = await fetchCloudStateSnapshot(user.uid);
          const wasGuest =
            authModeRef.current === 'guest' ||
            (getSavedAuthMode() === 'guest' && guestPromptSignInRef.current);
          const localState = wasGuest ? stateRef.current : readLocalMirror();

          const localHas = hasAnyData(localState);
          const cloudHas = hasAnyData(cloudState);

          if (wasGuest && localHas && cloudHas) {
            setPendingConflict({
              user,
              localState,
              cloudState,
              cloudCache: cache,
            });
            setWelcomeOpen(false);
            setAuthLoading(false);
            guestPromptSignInRef.current = false;
            return;
          }

          if (wasGuest && localHas && !cloudHas) {
            await syncStateToFirestore(user, localState, cache, true);
            setProductos(localState.productos);
            setReparaciones(localState.reparaciones);
            setHistorial(localState.historial);
            attachCloudListeners(user.uid, cache);
            notify('success', 'Datos subidos a la nube', 'Tu información local quedó sincronizada.');
          } else {
            setProductos(cloudState.productos);
            setReparaciones(cloudState.reparaciones);
            setHistorial(cloudState.historial);
            writeLocalMirror(cloudState);
            attachCloudListeners(user.uid, cache);
          }

          setAuthMode('google');
          setSavedAuthMode('google');
          setWelcomeOpen(false);
          setAuthError(null);
          void getLatestCloudBackupMeta(user.uid).then((meta) => {
            setLastCloudBackupAt(meta?.savedAt || null);
          });
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'No se pudo cargar la nube.');
          if (authModeRef.current === 'pending') {
            setWelcomeOpen(true);
          }
        } finally {
          setAuthLoading(false);
          guestPromptSignInRef.current = false;
        }
        return;
      }

      // No signed-in Firebase user
      activeUidRef.current = null;
      setFirebaseUser(null);
      setLastCloudBackupAt(null);
      detachCloudListeners();

      const savedMode = getSavedAuthMode();
      if (!signingOutRef.current && savedMode === 'guest') {
        setAuthMode('guest');
        setWelcomeOpen(false);
        const guestData = await loadGuestStateFromServer();
        setProductos(guestData.productos);
        setReparaciones(guestData.reparaciones);
        setHistorial(guestData.historial);
      } else {
        stateRef.current = { productos: [], reparaciones: [], historial: [] };
        setProductos([]);
        setReparaciones([]);
        setHistorial([]);
        setAuthMode('pending');
        setWelcomeOpen(true);
      }
    });

    return () => {
      unsub();
      detachCloudListeners();
    };
  }, [attachCloudListeners, detachCloudListeners, notify]);

  // Persist helper for every business mutation
  const commitState = useCallback(
    (nextState: AppStateData) => {
      setProductos(nextState.productos);
      setReparaciones(nextState.reparaciones);
      setHistorial(nextState.historial);
      writeLocalMirror(nextState);

      if (authModeRef.current === 'google' && auth.currentUser) {
        setSyncingCloud(true);
        void syncStateToFirestore(auth.currentUser, nextState, cloudCacheRef.current)
          .catch((err) => {
            notify(
              'error',
              'Error al guardar en la nube',
              err instanceof Error ? err.message : 'Revisá tu conexión.'
            );
          })
          .finally(() => setSyncingCloud(false));
      } else {
        void saveGuestStateToServer(nextState);
      }
    },
    [notify]
  );

  const handleGoogleLogin = async (forceSelectAccount = true) => {
    setAuthLoading(true);
    setAuthError(null);
    googleProvider.setCustomParameters(
      forceSelectAccount
        ? { prompt: 'select_account' }
        : rememberedUser?.email
        ? { login_hint: rememberedUser.email }
        : { prompt: 'select_account' }
    );
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setAuthError('Inicio de sesión cancelado.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('El navegador bloqueó la ventana de Google. Permití popups e intentá de nuevo.');
      } else if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'este dominio';
        setAuthError(
          `El dominio "${host}" aún no está autorizado en Firebase Authentication. Agregalo en Firebase Console > Authentication > Settings > Authorized domains.`
        );
      } else if (code === 'auth/operation-not-allowed') {
        setAuthError('El inicio de sesión con Google no está habilitado en Firebase Console.');
      } else if (code === 'auth/network-request-failed') {
        setAuthError('Error de red al conectar con Google. Verificá tu conexión.');
      } else {
        setAuthError('No se pudo iniciar sesión con Google.');
      }
      setAuthLoading(false);
    }
  };

  const handleGuestEnter = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const guestState = await loadGuestStateFromServer();
      setProductos(guestState.productos);
      setReparaciones(guestState.reparaciones);
      setHistorial(guestState.historial);
      setAuthMode('guest');
      setSavedAuthMode('guest');
      setWelcomeOpen(false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleConflictUseCloud = async () => {
    if (!pendingConflict) return;
    setResolvingConflict(true);
    try {
      const { user, cloudState, cloudCache } = pendingConflict;
      setProductos(cloudState.productos);
      setReparaciones(cloudState.reparaciones);
      setHistorial(cloudState.historial);
      writeLocalMirror(cloudState);
      attachCloudListeners(user.uid, cloudCache);
      setAuthMode('google');
      setSavedAuthMode('google');
      setPendingConflict(null);
      notify('success', 'Datos de la nube aplicados');
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleConflictUploadLocal = async () => {
    if (!pendingConflict) return;
    setResolvingConflict(true);
    try {
      const { user, localState, cloudCache } = pendingConflict;
      await syncStateToFirestore(user, localState, cloudCache, true);
      const meta = await saveCloudBackupSnapshot(user, localState, cloudCache);
      setLastCloudBackupAt(meta.savedAt);
      setProductos(localState.productos);
      setReparaciones(localState.reparaciones);
      setHistorial(localState.historial);
      writeLocalMirror(localState);
      attachCloudListeners(user.uid, cloudCache);
      setAuthMode('google');
      setSavedAuthMode('google');
      setPendingConflict(null);
      notify('success', 'Datos locales subidos a la nube');
    } catch (err) {
      notify(
        'error',
        'Error al subir datos',
        err instanceof Error ? err.message : 'Intentá nuevamente.'
      );
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleSaveToCloud = async () => {
    if (authMode === 'google' && firebaseUser) {
      setSyncingCloud(true);
      try {
        await syncStateToFirestore(firebaseUser, stateRef.current, cloudCacheRef.current, true);
        const meta = await saveCloudBackupSnapshot(
          firebaseUser,
          stateRef.current,
          cloudCacheRef.current
        );
        setLastCloudBackupAt(meta.savedAt);
        notify(
          'success',
          'Copia guardada en la nube',
          'Todos tus datos quedaron respaldados y listos para restablecer.'
        );
      } catch (err) {
        notify(
          'error',
          'Error al guardar',
          err instanceof Error ? err.message : 'No se pudo sincronizar.'
        );
      } finally {
        setSyncingCloud(false);
      }
      return;
    }
    // Guest user clicked "Guardar en la nube" -> sign in with Google
    guestPromptSignInRef.current = true;
    await handleGoogleLogin(true);
  };

  const handleRestoreFromCloud = async () => {
    if (authMode !== 'google' || !firebaseUser) {
      guestPromptSignInRef.current = true;
      await handleGoogleLogin(true);
      return;
    }

    setRestoringCloud(true);
    try {
      const res = await fetchLatestCloudBackup(firebaseUser.uid);
      if (!res) {
        notify(
          'info',
          'Sin copia en la nube',
          'Todavía no guardaste ninguna copia de seguridad en tu cuenta.'
        );
        return;
      }
      if (res.savedAt) {
        setLastCloudBackupAt(res.savedAt);
      }
      setPendingBackup({
        fileName: res.sourceLabel,
        parsed: res.parsed,
        modalTitle: 'Restablecer copia de la nube',
        sourceHeading: 'Origen de la copia',
      });
    } catch (err) {
      notify(
        'error',
        'No se pudo leer la copia en la nube',
        err instanceof Error ? err.message : 'Revisá tu conexión e intentá nuevamente.'
      );
    } finally {
      setRestoringCloud(false);
    }
  };

  const handleDownloadJson = () => {
    const payload = {
      auth: authMode === 'google' ? firebaseUser?.email || 'Google' : 'Invitado',
      fecha_backup: new Date().toISOString(),
      productos: stateRef.current.productos,
      reparaciones: stateRef.current.reparaciones,
      historial: stateRef.current.historial,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_facha_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('success', 'Respaldo descargado', 'Se guardó el archivo JSON en tu dispositivo.');
  };

  const handleRestoreJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseAndNormalizeBackupJson(text);
      setPendingBackup({
        fileName: file.name,
        parsed,
      });
    } catch (err) {
      notify(
        'error',
        'Archivo inválido',
        err instanceof Error ? err.message : 'No se pudo leer el archivo JSON de respaldo.'
      );
    }
  };

  const applyRestoredBackup = async (mode: 'replace' | 'merge') => {
    if (!pendingBackup) return;
    setImportingBackup(true);
    try {
      const incoming = pendingBackup.parsed.state;
      const nextState =
        mode === 'merge' ? mergeBackupState(stateRef.current, incoming) : incoming;

      setProductos(nextState.productos);
      setReparaciones(nextState.reparaciones);
      setHistorial(nextState.historial);
      writeLocalMirror(nextState);

      if (authModeRef.current === 'google' && auth.currentUser) {
        setSyncingCloud(true);
        try {
          await syncStateToFirestore(auth.currentUser, nextState, cloudCacheRef.current, true);
          notify(
            'success',
            'Copia restaurada y sincronizada',
            `${nextState.productos.length} productos, ${nextState.reparaciones.length} reparaciones y ${nextState.historial.length} ventas.`
          );
        } finally {
          setSyncingCloud(false);
        }
      } else {
        await saveGuestStateToServer(nextState);
        notify(
          'success',
          'Copia de seguridad restaurada',
          `${nextState.productos.length} productos, ${nextState.reparaciones.length} reparaciones y ${nextState.historial.length} ventas.`
        );
      }

      setPendingBackup(null);
    } catch (err) {
      notify(
        'error',
        'Error al restaurar copia',
        err instanceof Error ? err.message : 'Revisá el archivo o tu conexión.'
      );
    } finally {
      setImportingBackup(false);
    }
  };

  const handleSwitchAccount = async () => {
    if (authMode === 'google') {
      await handleGoogleLogin(true);
    } else {
      guestPromptSignInRef.current = true;
      setWelcomeOpen(true);
    }
  };

  const handleSignOut = async () => {
    signingOutRef.current = true;
    setAuthLoading(true);

    try {
      detachCloudListeners();
      setSavedAuthMode(null);
      setRememberedGoogleUser(null);
      setRememberedUser(null);

      await clearLocalSessionData();

      try {
        await signOut(auth);
      } catch {
        // Ensure local sign-out state completes even if offline
      }

      activeUidRef.current = null;
      guestPromptSignInRef.current = false;
      stateRef.current = { productos: [], reparaciones: [], historial: [] };

      setProductos([]);
      setReparaciones([]);
      setHistorial([]);
      setFirebaseUser(null);
      setPendingConflict(null);
      setPendingBackup(null);
      setReceipt(null);
      setToasts([]);
      setPreloadedCode(null);
      setSection('panel');
      setSyncingCloud(false);
      setRestoringCloud(false);
      setLastCloudBackupAt(null);
      setAuthError(null);
      setMobileMenuOpen(false);
      setAuthMode('pending');
      setWelcomeOpen(true);
    } finally {
      signingOutRef.current = false;
      setAuthLoading(false);
    }
  };

  // Business action handlers
  const handleOpenScannerMode = (mode: ScannerMode, codeToPreload?: string) => {
    setScannerMode(mode);
    setPreloadedCode(codeToPreload || null);
    setSection('escaner');
    setMobileMenuOpen(false);
  };

  const handleSaveStockEntry = (incomingProduct: Product, addedQty: number) => {
    const existingIdx = productos.findIndex((p) => p.codigo === incomingProduct.codigo);
    let nextProducts: Product[];
    let finalStock: number;
    if (existingIdx >= 0) {
      const current = productos[existingIdx];
      finalStock = current.stock + addedQty;
      nextProducts = productos.map((p, i) =>
        i === existingIdx
          ? {
              ...incomingProduct,
              stock: finalStock,
            }
          : p
      );
    } else {
      finalStock = addedQty;
      nextProducts = [...productos, { ...incomingProduct, stock: finalStock }];
    }

    commitState({
      ...stateRef.current,
      productos: nextProducts,
    });
    notify(
      'success',
      'Stock actualizado',
      `${incomingProduct.nombre}: ${finalStock} un. disponibles.`
    );
  };

  const handleCompleteSale = (payload: {
    items: SaleLineItem[];
    descuento: number;
    metodoPago: PaymentMethod;
    pagaCon: number;
  }) => {
    const { items, descuento, metodoPago, pagaCon } = payload;
    const subtotal = items.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
    const total = Math.max(0, subtotal - descuento);
    const nRecibo = `REC-${1000 + historial.length + 1}`;
    const fecha = getNowTimestampStr();

    // Update stock & repair statuses
    const nextProducts = productos.map((p) => {
      const soldQty = items
        .filter((it) => !it.es_reparacion && it.codigo === p.codigo)
        .reduce((s, it) => s + it.cantidad, 0);
      if (soldQty <= 0) return p;
      return { ...p, stock: Math.max(0, p.stock - soldQty) };
    });

    const paidRepairIds = new Set(
      items.filter((it) => it.es_reparacion && it.id).map((it) => it.id as number)
    );
    const nextRepairs = reparaciones.map((r) =>
      paidRepairIds.has(r.id)
        ? { ...r, estado: 'Retirado' as const, senia: r.presupuesto }
        : r
    );

    const saleId = toSafeFirestoreId('sale', `${nRecibo}-${Date.now()}`);
    const newSale: SaleRecord = {
      id: saleId,
      n_recibo: nRecibo,
      fecha,
      detalle: items.map((i) => `${i.cantidad}x ${i.nombre}`).join(', '),
      metodo_pago: metodoPago,
      total,
      descuento,
      paga_con: pagaCon,
      items,
    };

    commitState({
      productos: nextProducts,
      reparaciones: nextRepairs,
      historial: [...historial, newSale],
    });

    setReceipt({
      kind: 'sale',
      n_recibo: nRecibo,
      fecha,
      metodo_pago: metodoPago,
      items,
      subtotal,
      descuento,
      total,
      paga_con: pagaCon,
    });
    notify('success', `Venta ${nRecibo} registrada`, `Total cobrado: $${total.toLocaleString('es-AR')}`);

    const droppedToCritical = nextProducts.filter((nextProd) => {
      const prevProd = productos.find((p) => p.codigo === nextProd.codigo);
      return prevProd && nextProd.stock < prevProd.stock && nextProd.stock < 3;
    });

    if (droppedToCritical.length > 0) {
      const hasZero = droppedToCritical.some((p) => p.stock <= 0);
      const summary = droppedToCritical
        .slice(0, 3)
        .map((p) => `${p.nombre} (${p.stock} un.)`)
        .join(', ');
      const extra =
        droppedToCritical.length > 3 ? ` y ${droppedToCritical.length - 3} más` : '';
      notify(
        hasZero ? 'error' : 'warning',
        hasZero ? 'Alerta: stock agotado o crítico' : 'Alerta: stock crítico (< 3 un.)',
        `${summary}${extra}. Revisá el Panel Principal.`
      );
    }
  };

  const handleSaveProduct = (product: Product, previousCode?: string) => {
    const prevProduct = productos.find(
      (p) => p.codigo === (previousCode || product.codigo)
    );
    let nextProducts: Product[];
    if (previousCode) {
      nextProducts = productos.map((p) => (p.codigo === previousCode ? product : p));
    } else if (productos.some((p) => p.codigo === product.codigo)) {
      nextProducts = productos.map((p) => (p.codigo === product.codigo ? product : p));
    } else {
      nextProducts = [...productos, product];
    }
    commitState({ ...stateRef.current, productos: nextProducts });
    notify('success', 'Producto guardado', product.nombre);

    if (product.stock < 3 && (!prevProduct || product.stock < prevProduct.stock)) {
      notify(
        product.stock <= 0 ? 'error' : 'warning',
        product.stock <= 0 ? 'Producto sin stock (0 un.)' : 'Stock crítico (< 3 un.)',
        `${product.nombre}: ${product.stock} un. disponibles.`
      );
    }
  };

  const handleDeleteProduct = (codigo: string) => {
    const nextProducts = productos.filter((p) => p.codigo !== codigo);
    commitState({ ...stateRef.current, productos: nextProducts });
    notify('info', 'Producto eliminado');
  };

  const handleSaveRepair = (
    order: RepairOrder,
    isNew: boolean,
    paymentMethod: PaymentMethod = 'Efectivo'
  ) => {
    const prevOrder = isNew ? null : reparaciones.find((r) => r.id === order.id) ?? null;
    const nextRepairs = isNew
      ? [...reparaciones, order]
      : reparaciones.map((r) => (r.id === order.id ? order : r));

    const becameRetired =
      order.estado === 'Retirado' && (isNew || prevOrder?.estado !== 'Retirado');
    const alreadyInHistory = historial.some((s) =>
      s.items?.some(
        (it) => it.es_reparacion && (it.id === order.id || it.n_orden === order.n_orden)
      )
    );

    let nextHistorial = historial;
    let createdReceipt: ReceiptPayload | null = null;

    if (becameRetired && !alreadyInHistory) {
      const prevSenia = prevOrder ? Math.max(0, Number(prevOrder.senia) || 0) : 0;
      const amountPaidOnPickup = Math.max(0, order.presupuesto - prevSenia);
      const nRecibo = `REC-${1000 + historial.length + 1}`;
      const fecha = getNowTimestampStr();
      const itemLabel = `Retiro Reparación ${order.n_orden} (${order.equipo})`;
      const detailText =
        prevSenia > 0
          ? `${itemLabel} - Cliente: ${order.cliente} (Saldo; seña previa $${prevSenia.toLocaleString('es-AR')})`
          : `${itemLabel} - Cliente: ${order.cliente}`;

      const saleItems: SaleLineItem[] = [
        {
          id: order.id,
          n_orden: order.n_orden,
          nombre: itemLabel,
          precio: amountPaidOnPickup,
          costo: order.costo_repuesto,
          cantidad: 1,
          es_reparacion: true,
        },
      ];

      const newSale: SaleRecord = {
        id: toSafeFirestoreId('sale', `${nRecibo}-${Date.now()}`),
        n_recibo: nRecibo,
        fecha,
        detalle: detailText,
        metodo_pago: paymentMethod,
        total: amountPaidOnPickup,
        descuento: 0,
        paga_con: amountPaidOnPickup,
        items: saleItems,
      };
      nextHistorial = [...historial, newSale];

      if (!isNew) {
        createdReceipt = {
          kind: 'sale',
          n_recibo: nRecibo,
          fecha,
          metodo_pago: paymentMethod,
          items: saleItems,
          subtotal: amountPaidOnPickup,
          descuento: 0,
          total: amountPaidOnPickup,
          paga_con: amountPaidOnPickup,
        };
      }
    }

    commitState({
      ...stateRef.current,
      reparaciones: nextRepairs,
      historial: nextHistorial,
    });

    if (createdReceipt) {
      setReceipt(createdReceipt);
    }

    notify(
      'success',
      isNew ? `Orden ${order.n_orden} creada` : `Orden ${order.n_orden} actualizada`,
      becameRetired && !alreadyInHistory
        ? 'Se registró el retiro de la reparación en el historial.'
        : undefined
    );
  };

  const handleDeleteRepair = (id: number) => {
    const nextRepairs = reparaciones.filter((r) => r.id !== id);
    commitState({ ...stateRef.current, reparaciones: nextRepairs });
    notify('info', 'Orden eliminada');
  };

  const handleUpdateSale = (index: number, updated: SaleRecord) => {
    const nextSales = historial.map((s, i) => (i === index ? updated : s));
    commitState({ ...stateRef.current, historial: nextSales });
    notify('success', `Venta ${updated.n_recibo} actualizada`);
  };

  const handleDeleteSale = (index: number, restoreStock: boolean) => {
    const target = historial[index];
    if (!target) return;

    let nextProducts = productos;
    if (restoreStock) {
      if (Array.isArray(target.items) && target.items.length > 0) {
        nextProducts = productos.map((p) => {
          const qtyToRestore = target.items!
            .filter((it) => !it.es_reparacion && it.codigo === p.codigo)
            .reduce((s, it) => s + it.cantidad, 0);
          return qtyToRestore > 0 ? { ...p, stock: p.stock + qtyToRestore } : p;
        });
      } else if (target.detalle) {
        // Fallback: parse "2x Product Name" segments
        const segments = target.detalle.split(',').map((s) => s.trim());
        const restoreByName = new Map<string, number>();
        for (const seg of segments) {
          const m = /^(\d+)x\s+(.+)$/i.exec(seg);
          if (m) {
            const nameKey = m[2].trim().toLowerCase();
            restoreByName.set(nameKey, (restoreByName.get(nameKey) || 0) + Number(m[1]));
          }
        }
        nextProducts = productos.map((p) => {
          const qty = restoreByName.get(p.nombre.trim().toLowerCase()) || 0;
          return qty > 0 ? { ...p, stock: p.stock + qty } : p;
        });
      }
    }

    const nextSales = historial.filter((_, i) => i !== index);
    commitState({
      ...stateRef.current,
      productos: nextProducts,
      historial: nextSales,
    });
    notify(
      'info',
      `Venta ${target.n_recibo} eliminada`,
      restoreStock ? 'Se devolvió el stock al inventario.' : undefined
    );
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-50 text-slate-900 overflow-x-hidden relative">
      {/* Interactive 3D Parallax Watermark */}
      <ParallaxWatermark />

      {authMode === 'pending' ? (
        <div className="relative z-10 min-h-[100dvh] flex items-center justify-center p-6">
          {!welcomeOpen && !pendingConflict && (
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <div className="w-8 h-8 rounded-full border-2 border-slate-300 border-t-emerald-600 animate-spin" />
              <p className="text-sm font-medium">Cargando...</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Drawer Backdrop */}
          {mobileMenuOpen && (
            <div
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs lg:hidden"
            />
          )}

          {/* Sidebar (Collapsible Desktop + 100dvh Mobile Drawer) */}
          <aside
            className={`fixed top-0 left-0 z-50 h-[100dvh] bg-slate-900 text-white flex flex-col justify-between transition-all duration-200 border-r border-slate-800 ${
              sidebarCollapsed ? 'lg:w-[76px]' : 'lg:w-64'
            } w-64 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
          >
            <div className="flex flex-col min-h-0 flex-1">
              {/* Sidebar Header */}
              <div
                className={`h-[72px] px-3.5 border-b border-slate-800 flex items-center shrink-0 ${
                  sidebarCollapsed ? 'lg:justify-center' : 'justify-between'
                }`}
              >
                {!sidebarCollapsed && (
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BrandLogo variant="mascot" className="w-9 h-9 object-contain shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold tracking-wide text-emerald-400 truncate uppercase">
                        EL FACHA CELULARES
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        Servicio Técnico y Accesorios
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                  className="hidden lg:flex p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                >
                  {sidebarCollapsed ? (
                    <PanelLeftOpen className="w-5 h-5" />
                  ) : (
                    <PanelLeftClose className="w-5 h-5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Cerrar menú"
                  className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Nav Links */}
              <nav className="flex-1 overflow-y-auto px-2.5 py-4 pb-20 space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = section === item.id;
                  const showCriticalCount = item.id === 'panel' && criticalStockCount > 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      title={
                        sidebarCollapsed
                          ? showCriticalCount
                            ? `${item.label} (${criticalStockCount} en stock crítico)`
                            : item.label
                          : undefined
                      }
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
                      } ${
                        active
                          ? 'bg-slate-800 text-white font-semibold'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          active ? 'text-emerald-400' : 'text-slate-400'
                        }`}
                      />
                      <span
                        className={`truncate whitespace-nowrap ${
                          sidebarCollapsed ? 'lg:hidden' : ''
                        }`}
                      >
                        {item.label}
                      </span>
                      {showCriticalCount && !sidebarCollapsed && (
                        <span
                          aria-label={`${criticalStockCount} productos en stock crítico`}
                          className="ml-auto text-xs font-mono font-bold text-red-400 tabular-nums shrink-0"
                        >
                          {criticalStockCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Main Content Area */}
          <div
            className={`relative z-10 min-h-[100dvh] flex flex-col transition-all duration-200 ${
              sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-64'
            }`}
          >
            {/* Mobile Header */}
            <header className="lg:hidden sticky top-0 z-30 bg-slate-900 text-white px-3 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  aria-label="Abrir menú"
                  className="p-2 rounded-lg hover:bg-slate-800 text-slate-200 shrink-0 cursor-pointer"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <BrandLogo variant="mascot" className="w-7 h-7 object-contain shrink-0" />
                  <span className="text-xs font-extrabold tracking-wide text-emerald-400 uppercase truncate">
                    EL FACHA CELULARES
                  </span>
                </div>
              </div>
            </header>

            <main className="flex-1 w-full max-w-[1440px] mx-auto p-4 pb-20 sm:p-6 sm:pb-20 lg:p-8 min-w-0">
              {section === 'panel' && (
                <DashboardView
                  productos={productos}
                  reparaciones={reparaciones}
                  historial={historial}
                  onOpenScannerMode={handleOpenScannerMode}
                />
              )}

              {section === 'escaner' && (
                <ScannerView
                  mode={scannerMode}
                  preloadedCode={preloadedCode}
                  productos={productos}
                  gunDetected={gunDetected}
                  onChangeMode={setScannerMode}
                  onClearPreloadedCode={() => setPreloadedCode(null)}
                  onSaveStockEntry={handleSaveStockEntry}
                  onCompleteScannerSale={handleCompleteSale}
                  onNotify={notify}
                  onRegisterScanHandler={registerScanHandler}
                />
              )}

              {section === 'tecnico' && (
                <ServiceTechView
                  reparaciones={reparaciones}
                  onSaveRepair={handleSaveRepair}
                  onDeleteRepair={handleDeleteRepair}
                  onPrintRepair={(repair) => setReceipt({ kind: 'repair', repair })}
                />
              )}

              {section === 'inventario' && (
                <InventoryView
                  productos={productos}
                  onSaveProduct={handleSaveProduct}
                  onDeleteProduct={handleDeleteProduct}
                  onReplenishProduct={(code) => handleOpenScannerMode('ENTRADA', code)}
                  onNotify={notify}
                />
              )}

              {section === 'pos' && (
                <PosView
                  productos={productos}
                  reparaciones={reparaciones}
                  gunDetected={gunDetected}
                  onCheckout={handleCompleteSale}
                  onNotify={notify}
                  onRegisterScanHandler={registerScanHandler}
                />
              )}

              {section === 'balance' && (
                <BalanceView
                  productos={productos}
                  reparaciones={reparaciones}
                  historial={historial}
                />
              )}

              {section === 'excel' && (
                <SalesHistoryView
                  historial={historial}
                  onUpdateSale={handleUpdateSale}
                  onDeleteSale={handleDeleteSale}
                  onNotify={notify}
                />
              )}
            </main>
          </div>

          <UserProfileMenu
            authMode={authMode}
            firebaseUser={firebaseUser}
            syncingCloud={syncingCloud}
            restoringCloud={restoringCloud}
            lastCloudBackupAt={lastCloudBackupAt}
            onSaveToCloud={() => void handleSaveToCloud()}
            onRestoreFromCloud={() => void handleRestoreFromCloud()}
            onDownloadJson={handleDownloadJson}
            onRestoreJson={(file) => void handleRestoreJson(file)}
            onSwitchAccount={() => void handleSwitchAccount()}
            onSignOut={() => void handleSignOut()}
          />
        </>
      )}

      {/* Modals & Toasts */}
      <WelcomeModal
        open={welcomeOpen}
        loading={authLoading}
        error={authError}
        rememberedUser={rememberedUser}
        onGoogleLogin={(forceSelect) => void handleGoogleLogin(forceSelect)}
        onGuestEnter={() => void handleGuestEnter()}
      />

      <ConflictModal
        open={Boolean(pendingConflict)}
        resolving={resolvingConflict}
        localState={pendingConflict?.localState || { productos: [], reparaciones: [], historial: [] }}
        cloudState={pendingConflict?.cloudState || { productos: [], reparaciones: [], historial: [] }}
        userEmail={pendingConflict?.user.email || ''}
        onUseCloud={() => void handleConflictUseCloud()}
        onUploadLocal={() => void handleConflictUploadLocal()}
      />

      <BackupImportModal
        open={Boolean(pendingBackup)}
        fileName={pendingBackup?.fileName || ''}
        parsed={pendingBackup?.parsed || null}
        hasExistingData={hasAnyData(stateRef.current)}
        isCloudConnected={authMode === 'google' && Boolean(firebaseUser)}
        importing={importingBackup}
        modalTitle={pendingBackup?.modalTitle}
        sourceHeading={pendingBackup?.sourceHeading}
        onReplace={() => void applyRestoredBackup('replace')}
        onMerge={() => void applyRestoredBackup('merge')}
        onClose={() => {
          if (!importingBackup) setPendingBackup(null);
        }}
      />

      <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
