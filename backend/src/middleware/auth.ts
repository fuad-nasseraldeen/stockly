import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

type AuthedUser = {
  id: string;
  email?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __stocklyAuthSupabase:
    | ReturnType<typeof createClient>
    | undefined;
}

function getAuthClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error('חסר SUPABASE_URL בקובץ .env של השרת');
  }
  if (!supabaseAnonKey) {
    throw new Error('חסר SUPABASE_ANON_KEY בקובץ .env של השרת');
  }

  if (!globalThis.__stocklyAuthSupabase) {
    globalThis.__stocklyAuthSupabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return globalThis.__stocklyAuthSupabase;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];

  if (!token) {
    return res.status(401).json({ error: 'נדרש להתחבר כדי לבצע פעולה זו' });
  }

  const supabase = getAuthClient();

  supabase.auth
    .getUser(token)
    .then(({ data, error }) => {
      if (error || !data?.user) {
        return res.status(401).json({ error: 'ההתחברות פגה תוקף, נא להתחבר מחדש' });
      }

      (req as any).user = { id: data.user.id, email: data.user.email } as AuthedUser;
      next();
    })
    .catch(() => res.status(401).json({ error: 'שגיאת אימות, נסה שוב' }));
}

