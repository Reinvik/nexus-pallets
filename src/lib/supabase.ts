import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://iuzpgljjfeobxlptmsma.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'Accept-Profile': 'public'
    }
  }
});

// Cliente auxiliar para sincronización instantánea de credenciales con servidores Nexus (PROD / Dock)
export const PROD_SUPABASE_URL = 'https://qtzpzgwyjptbnipvyjdu.supabase.co';
export const PROD_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0enB6Z3d5anB0Ym5pcHZ5amR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NDY4MDAsImV4cCI6MjA4MTQyMjgwMH0.An72d0glXpf6RZR5nwQ9OnLeU00loVqkZkNjUJhICA4';

export const supabaseProd = createClient(PROD_SUPABASE_URL, PROD_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

/**
 * Sincroniza la contraseña unificada del usuario en ambos servidores Supabase (MAIN y PROD)
 * para garantizar que una sola contraseña sirva para todos los sistemas del ecosistema Nexus.
 */
export async function syncUnifiedPasswordAcrossNexus(email: string, password: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password || password.length < 6) return;

  try {
    await Promise.allSettled([
      supabase.rpc('sync_user_credentials', { target_email: cleanEmail, new_password: password }),
      supabaseProd.rpc('sync_user_credentials', { target_email: cleanEmail, new_password: password }),
    ]);
  } catch (err) {
    console.warn('Advertencia en sincronización de contraseña unificada:', err);
  }
}

