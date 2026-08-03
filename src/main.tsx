import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import LoginPage from './components/LoginPage.tsx';
import { supabase } from './lib/supabase.ts';
import type { User } from '@supabase/supabase-js';

const ALLOWED_DOMAIN = 'cial.cl';

function Root() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Timeout de seguridad máximo (2.5 s) para garantizar que la app nunca quede atascada
    const timer = setTimeout(() => {
      if (mounted) setAuthLoading(false);
    }, 2500);

    // Obtener sesión inicial
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        const u = session?.user ?? null;
        if (u && u.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
          setUser(u);
        } else if (u) {
          supabase.auth.signOut();
          setUser(null);
        }
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setAuthLoading(false);
      });

    // Suscribirse a cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      if (u && u.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
        setUser(u);
      } else {
        if (u) supabase.auth.signOut();
        setUser(null);
      }
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a5c36] flex items-center justify-center font-sans select-none">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          <p className="text-white/60 text-xs font-semibold tracking-wider uppercase">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  return user ? <App user={user} /> : <LoginPage />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
