import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const GUEST_STATE_FILE = path.join(DATA_DIR, 'guest-state.json');

interface GuestState {
  productos: unknown[];
  reparaciones: unknown[];
  historial: unknown[];
  updatedAt: string;
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readGuestState(): GuestState {
  try {
    ensureDataDir();
    if (!fs.existsSync(GUEST_STATE_FILE)) {
      return {
        productos: [],
        reparaciones: [],
        historial: [],
        updatedAt: new Date().toISOString(),
      };
    }
    const raw = fs.readFileSync(GUEST_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GuestState>;
    return {
      productos: Array.isArray(parsed.productos) ? parsed.productos : [],
      reparaciones: Array.isArray(parsed.reparaciones) ? parsed.reparaciones : [],
      historial: Array.isArray(parsed.historial) ? parsed.historial : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return {
      productos: [],
      reparaciones: [],
      historial: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

function writeGuestState(state: GuestState): void {
  ensureDataDir();
  fs.writeFileSync(GUEST_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/api/state', (_req: Request, res: Response) => {
    const state = readGuestState();
    res.json(state);
  });

  app.post('/api/state', (req: Request, res: Response) => {
    const body = req.body as Partial<GuestState> | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    const nextState: GuestState = {
      productos: Array.isArray(body.productos) ? body.productos : [],
      reparaciones: Array.isArray(body.reparaciones) ? body.reparaciones : [],
      historial: Array.isArray(body.historial) ? body.historial : [],
      updatedAt: new Date().toISOString(),
    };

    try {
      writeGuestState(nextState);
      res.json({ ok: true, updatedAt: nextState.updatedAt });
    } catch {
      res.status(500).json({ error: 'No se pudo guardar el estado local en el servidor.' });
    }
  });

  app.put('/api/state', (req: Request, res: Response) => {
    const body = req.body as Partial<GuestState> | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Payload inválido' });
      return;
    }

    const nextState: GuestState = {
      productos: Array.isArray(body.productos) ? body.productos : [],
      reparaciones: Array.isArray(body.reparaciones) ? body.reparaciones : [],
      historial: Array.isArray(body.historial) ? body.historial : [],
      updatedAt: new Date().toISOString(),
    };

    try {
      writeGuestState(nextState);
      res.json({ ok: true, updatedAt: nextState.updatedAt });
    } catch {
      res.status(500).json({ error: 'No se pudo guardar el estado local en el servidor.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EL FACHA CELULARES server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Error al iniciar servidor:', err);
  process.exit(1);
});
