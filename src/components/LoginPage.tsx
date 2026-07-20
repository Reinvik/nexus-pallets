import { useState } from 'react';
import { supabase } from '../lib/supabase';
import cialLogo from '../assets/cial-alimentos-logo.png';
import { Mail, Lock, ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, RotateCcw } from 'lucide-react';

type AuthMode = 'login' | 'register' | 'forgot' | 'check_email';

const ALLOWED_DOMAIN = 'cial.cl';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState('');

  const validateDomain = (mail: string): boolean => {
    const domain = mail.split('@')[1]?.toLowerCase();
    return domain === ALLOWED_DOMAIN;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateDomain(email)) {
      setError('Solo se permiten correos corporativos @cial.cl para acceder al sistema.');
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        if (authError.message.includes('Email not confirmed')) {
          setError('Tu correo aún no ha sido verificado. Revisa tu bandeja de entrada de @cial.cl.');
        } else if (authError.message.includes('Invalid login credentials')) {
          setError('Correo o contraseña incorrectos. Verifica tus datos e intenta nuevamente.');
        } else {
          setError(authError.message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateDomain(email)) {
      setError('Solo se permiten correos corporativos @cial.cl para registrarse.');
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            domain_verified: true,
            registered_at: new Date().toISOString()
          }
        }
      });

      if (authError) {
        if (authError.message.includes('User already registered')) {
          setError('Este correo ya tiene una cuenta. Inicia sesión o usa "¿Olvidaste tu contraseña?".');
        } else {
          setError(authError.message);
        }
      } else {
        setPendingEmail(email);
        setMode('check_email');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateDomain(email)) {
      setError('Solo se permiten correos corporativos @cial.cl.');
      return;
    }

    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
      });

      if (authError) {
        setError(authError.message);
      } else {
        setSuccess(`Hemos enviado un enlace de recuperación a ${email}. Revisa tu bandeja de entrada.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
    setShowPassword(false);
  };

  const switchMode = (newMode: AuthMode) => {
    resetForm();
    setMode(newMode);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#0a5c36]">
      
      {/* Fondo con patrón abstracto */}
      <div className="absolute inset-0">
        {/* Gradiente de fondo */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#063d25] via-[#0a5c36] to-[#0d7a49]" />
        
        {/* Círculos decorativos */}
        <div className="absolute top-[-120px] right-[-80px] w-[500px] h-[500px] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-[-100px] left-[-60px] w-[400px] h-[400px] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-[300px] h-[300px] rounded-full bg-white/3 blur-2xl" />
        
        {/* Grid pattern sutil */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />
      </div>

      {/* Card principal */}
      <div className="relative z-10 w-full max-w-md px-4 select-none">
        
        {/* Tarjeta glassmorphism */}
        <div className="bg-white/[0.97] backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/30 border border-white/50 overflow-hidden animate-fade-in">
          
          {/* Header con gradiente */}
          <div className="bg-gradient-to-br from-[#0a5c36] to-[#0d7a49] p-8 text-center relative">
            {/* Brillo superior */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            
            <div className="flex items-center justify-center gap-4 mb-3">
              <img
                src={cialLogo}
                alt="CiAL Alimentos"
                className="w-16 h-18 object-contain drop-shadow-md bg-white rounded-xl p-1"
              />
              <div className="text-left">
                <h1 className="text-white font-extrabold text-lg leading-none tracking-tight">Control</h1>
                <span className="text-emerald-200 font-bold text-xs tracking-widest uppercase leading-none">Despacho CIAL</span>
              </div>
            </div>
            
            <p className="text-emerald-100/80 text-xs font-semibold tracking-wide">
              Sistema de Despacho y Retorno de Pallets
            </p>
          </div>

          {/* Contenido del formulario */}
          <div className="p-8">
            
            {/* === MODO: VERIFICAR CORREO === */}
            {mode === 'check_email' && (
              <div className="text-center space-y-5">
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto border border-emerald-100 shadow-sm">
                  <Mail className="w-8 h-8 text-[#0a5c36]" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900 mb-1">Verifica tu correo</h2>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">
                    Te enviamos un enlace de verificación a:
                  </p>
                  <p className="text-sm font-extrabold text-[#0a5c36] mt-1">{pendingEmail}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-left space-y-2">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Revisa tu bandeja de entrada de @cial.cl
                  </p>
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Haz clic en el enlace de confirmación
                  </p>
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Regresa aquí para iniciar sesión
                  </p>
                </div>
                <button
                  onClick={() => switchMode('login')}
                  className="w-full flex items-center justify-center gap-2 bg-[#0a5c36] hover:bg-[#08482a] text-white py-3 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-md active:scale-95"
                >
                  <ArrowRight className="w-4 h-4" />
                  Ir a Iniciar Sesión
                </button>
              </div>
            )}

            {/* === MODO: LOGIN === */}
            {mode === 'login' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Bienvenido</h2>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Acceso exclusivo para cuentas <span className="text-[#0a5c36] font-extrabold">@cial.cl</span>
                  </p>
                </div>

                {error && <ErrorBanner message={error} />}
                {success && <SuccessBanner message={success} />}

                <form onSubmit={handleLogin} className="space-y-4">
                  <EmailField
                    value={email}
                    onChange={setEmail}
                    placeholder="usuario@cial.cl"
                    disabled={loading}
                  />
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    placeholder="Contraseña"
                    disabled={loading}
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-[#0a5c36] hover:bg-[#08482a] disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-extrabold transition-all cursor-pointer shadow-md active:scale-95 mt-2"
                  >
                    {loading ? (
                      <RotateCcw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <ArrowRight className="w-4 h-4" />
                        Ingresar al Sistema
                      </>
                    )}
                  </button>
                </form>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 mt-2">
                  <button
                    onClick={() => switchMode('forgot')}
                    className="text-slate-400 hover:text-[#0a5c36] font-semibold transition-colors cursor-pointer"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                  <button
                    onClick={() => switchMode('register')}
                    className="text-[#0a5c36] font-extrabold hover:underline transition-colors cursor-pointer"
                  >
                    Crear cuenta CiAL →
                  </button>
                </div>
              </div>
            )}

            {/* === MODO: REGISTRO === */}
            {mode === 'register' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Crear Cuenta</h2>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Solo disponible para colaboradores <span className="text-[#0a5c36] font-extrabold">@cial.cl</span>
                  </p>
                </div>

                {error && <ErrorBanner message={error} />}

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 font-semibold leading-relaxed">
                    Solo se admiten correos corporativos <strong>@cial.cl</strong>. Otros dominios serán rechazados automáticamente.
                  </p>
                </div>

                <form onSubmit={handleRegister} className="space-y-3">
                  <EmailField
                    value={email}
                    onChange={setEmail}
                    placeholder="tu.nombre@cial.cl"
                    disabled={loading}
                    showDomainBadge
                  />
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    show={showPassword}
                    onToggle={() => setShowPassword(!showPassword)}
                    placeholder="Contraseña (mínimo 8 caracteres)"
                    disabled={loading}
                  />
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirmar contraseña"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={loading}
                      required
                      className={`w-full bg-slate-50 border rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 font-semibold placeholder-slate-400 focus:outline-none transition-all disabled:opacity-50 ${
                        confirmPassword && password !== confirmPassword
                          ? 'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-200 bg-red-50/30'
                          : 'border-slate-200 focus:border-[#0a5c36] focus:ring-1 focus:ring-[#0a5c36]/20 focus:bg-white'
                      }`}
                    />
                    {confirmPassword && password === confirmPassword && (
                      <CheckCircle2 className="absolute right-3 top-3 w-4 h-4 text-emerald-500 pointer-events-none" />
                    )}
                  </div>

                  {password.length > 0 && (
                    <PasswordStrength password={password} />
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-[#0a5c36] hover:bg-[#08482a] disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-extrabold transition-all cursor-pointer shadow-md active:scale-95 mt-2"
                  >
                    {loading ? (
                      <RotateCcw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Crear Cuenta y Verificar Correo
                      </>
                    )}
                  </button>
                </form>

                <p className="text-center text-xs text-slate-400 font-semibold">
                  ¿Ya tienes cuenta?{' '}
                  <button
                    onClick={() => switchMode('login')}
                    className="text-[#0a5c36] font-extrabold hover:underline cursor-pointer"
                  >
                    Iniciar sesión
                  </button>
                </p>
              </div>
            )}

            {/* === MODO: RECUPERAR CONTRASEÑA === */}
            {mode === 'forgot' && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-900">Recuperar Acceso</h2>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Te enviaremos un enlace de recuperación a tu correo <span className="text-[#0a5c36] font-extrabold">@cial.cl</span>
                  </p>
                </div>

                {error && <ErrorBanner message={error} />}
                {success && <SuccessBanner message={success} />}

                {!success && (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <EmailField
                      value={email}
                      onChange={setEmail}
                      placeholder="usuario@cial.cl"
                      disabled={loading}
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full flex items-center justify-center gap-2 bg-[#0a5c36] hover:bg-[#08482a] disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-extrabold transition-all cursor-pointer shadow-md active:scale-95"
                    >
                      {loading ? (
                        <RotateCcw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Mail className="w-4 h-4" />
                          Enviar Enlace de Recuperación
                        </>
                      )}
                    </button>
                  </form>
                )}

                <button
                  onClick={() => switchMode('login')}
                  className="w-full text-center text-xs text-slate-400 hover:text-[#0a5c36] font-semibold transition-colors cursor-pointer"
                >
                  ← Volver al inicio de sesión
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 text-center">
            <div className="border-t border-slate-100 pt-4">
              <p className="text-[10px] text-slate-400 font-semibold">
                Sistema restringido a colaboradores CiAL Alimentos S.A. •{' '}
                <span className="text-[#0a5c36] font-bold">@cial.cl</span>
              </p>
            </div>
          </div>
        </div>

        {/* Versión */}
        <p className="text-center text-white/40 text-[10px] font-bold tracking-wider mt-4 uppercase">
          Control Despacho v1.1.0 · Control Rampas
        </p>
      </div>
    </div>
  );
}

// Componentes auxiliares

function EmailField({
  value,
  onChange,
  placeholder,
  disabled,
  showDomainBadge = false
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
  showDomainBadge?: boolean;
}) {
  const isDomainValid = !value || value.split('@')[1]?.toLowerCase() === 'cial.cl';
  const hasAt = value.includes('@');

  return (
    <div className="relative">
      <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type="email"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required
        className={`w-full bg-slate-50 border rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 font-semibold placeholder-slate-400 focus:outline-none transition-all disabled:opacity-50 ${
          !isDomainValid && hasAt
            ? 'border-red-300 focus:border-red-400 focus:ring-1 focus:ring-red-200 bg-red-50/30'
            : 'border-slate-200 focus:border-[#0a5c36] focus:ring-1 focus:ring-[#0a5c36]/20 focus:bg-white'
        }`}
      />
      {showDomainBadge && (
        <span className="absolute right-3 top-2.5 text-[9px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md leading-none">
          @cial.cl
        </span>
      )}
      {!isDomainValid && hasAt && (
        <p className="text-[10px] text-red-500 font-semibold mt-1 pl-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 shrink-0" />
          Solo se permiten correos @cial.cl
        </p>
      )}
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  disabled
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
      <input
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required
        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-10 text-sm text-slate-800 font-semibold placeholder-slate-400 focus:outline-none focus:border-[#0a5c36] focus:ring-1 focus:ring-[#0a5c36]/20 focus:bg-white transition-all disabled:opacity-50"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ caracteres', pass: password.length >= 8 },
    { label: 'Mayúscula', pass: /[A-Z]/.test(password) },
    { label: 'Número', pass: /\d/.test(password) },
  ];
  const strength = checks.filter(c => c.pass).length;
  const colors = ['bg-red-400', 'bg-amber-400', 'bg-emerald-400'];
  const labels = ['Débil', 'Media', 'Fuerte'];

  return (
    <div className="space-y-1.5 font-sans">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < strength ? colors[strength - 1] : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          {checks.map((c) => (
            <span key={c.label} className={`text-[10px] font-semibold flex items-center gap-1 ${c.pass ? 'text-emerald-600' : 'text-slate-400'}`}>
              <CheckCircle2 className="w-2.5 h-2.5" />
              {c.label}
            </span>
          ))}
        </div>
        {strength > 0 && (
          <span className={`text-[10px] font-extrabold ${['text-red-500', 'text-amber-500', 'text-emerald-600'][strength - 1]}`}>
            {labels[strength - 1]}
          </span>
        )}
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
      <p className="text-xs text-red-700 font-semibold leading-relaxed">{message}</p>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
      <p className="text-xs text-emerald-700 font-semibold leading-relaxed">{message}</p>
    </div>
  );
}
