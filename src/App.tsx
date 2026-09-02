import { useState, useEffect, useRef } from 'react';
import { 
  Truck, 
  Check, 
  Plus, 
  Minus, 
  FileText, 
  ClipboardList, 
  RefreshCw, 
  AlertTriangle, 
  ShieldCheck, 
  User, 
  Trash2, 
  Calendar, 
  Clock, 
  Award,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Package,
  LogOut,
  Edit2,
  FileDown,
  Camera,
  Image as ImageIcon,
  Thermometer,
  X,
  Users,
  UserPlus,
  PenTool,
  Eye,
  Search,
  CheckCircle2,
  TrendingUp,
  Save,
  Mail,
  Copy,
  Send
} from 'lucide-react';
import { supabase } from './lib/supabase';
import cialLogo from './assets/cial-alimentos-logo.png';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// Lista oficial de Zonales CIAL proporcionada por el usuario
const ZONALES_LIST = [
  "San Fernando",
  "Chillán",
  "Talca",
  "Rancagua",
  "Osorno",
  "Antofagasta",
  "La Serena",
  "Punta Arenas",
  "Puerto Montt",
  "Temuco",
  "Viña del mar",
  "Iquique",
  "Concepción",
  "Copiapó",
  "Arica",
  "Calama",
  "Los Ángeles",
  "San Felipe",
  "Coyhaique",
  "Los Vilos"
].sort();

interface CategoryData {
  kilos: number;
  wood_bases: number;
  wood_extra: number;
  plastic_bases: number;
  plastic_extra: number;
  bandejas_count?: number; // Solo para categoría bandejas
  bandejas_formula?: string; // Fórmula de desglose (ej: "40x3 + 25x2 + 5")
}

interface ZonalDetail {
  zonal_name: string;
  viaje_numero?: number; // Número de viaje o carga (ej: 2, 3)
  lugar_camion: string;
  congelados: CategoryData;
  estandar: CategoryData;
  bandejas: CategoryData;
  sello: string;
  photos?: string[]; // Fotos adjuntas por zonal
}

interface DispatchRecord {
  id: string;
  truck_number: string;
  truck_plate: string;
  supervisor_name: string;
  inspection_date: string;
  inspection_time: string;
  positions_occupied: number;
  checklist: Record<string, any>;
  zonals_detail: ZonalDetail[];
  observations: string;
  created_at: string;
  temp_1er: number;
  temp_2do: number;
  temp_3er: number;
  close_time?: string | null;
  truck_kilos?: string | number | null;
  anden_number?: string | null;
  signed_by?: string | null;
  signed_at?: string | null;
  signature_b64?: string | null;
  signed_by_title?: string | null;
}

interface PalletReturnRecord {
  id: string;
  zonal_name: string;
  wood_returned: number;
  plastic_returned: number;
  supervisor_name: string;
  created_at: string;
}

interface TruckDraft {
  id: string;
  truckNumber: string;
  truckPlate: string;
  truckAnden: string;
  positionsOccupied: number;
  observations: string;
  temp1er: number;
  temp2do: number;
  temp3er: number;
  closeTime: string;
  truckKilos: string;
  checklist: Record<string, any>;
  selectedZonals: ZonalDetail[];
  photos: string[];
  createdAt: string;
  updatedAt?: string;
  supervisorName?: string;
  createdBy?: string;
}

const INITIAL_CHECKLIST = {
  postura_anden: 'VERDE',
  limpieza_estructura: 'VERDE',
  luces_encendidas: 'VERDE',
  separador_termico: 'VERDE',
  lingas_camion: 'VERDE'
};

export const getChecklistStatus = (val: any): 'GRIS' | 'VERDE' | 'AMARILLO' | 'ROJO' => {
  if (val === true) return 'VERDE';
  if (val === false) return 'ROJO';
  if (val === 'VERDE' || val === 'AMARILLO' || val === 'ROJO' || val === 'GRIS') return val;
  return 'VERDE';
};

export const toggleChecklistStatus = (currentStatus: 'GRIS' | 'VERDE' | 'AMARILLO' | 'ROJO'): 'GRIS' | 'VERDE' | 'AMARILLO' | 'ROJO' => {
  if (currentStatus === 'VERDE') return 'AMARILLO';
  if (currentStatus === 'AMARILLO') return 'ROJO';
  if (currentStatus === 'ROJO') return 'GRIS';
  return 'VERDE';
};

const formatSupervisorName = (email: string | undefined): string => {
  if (!email) return 'Supervisor';
  const username = email.split('@')[0];
  return username
    .split('.')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getSignerName = (rec: DispatchRecord, palletUsers: any[]): string | null => {
  if (!rec.signed_by) return null;
  const signerUser = (palletUsers || []).find(u => u.email.toLowerCase() === (rec.signed_by || '').toLowerCase());
  return signerUser?.display_name || formatSupervisorName(rec.signed_by);
};

/**
 * Retorna la fecha ISO (YYYY-MM-DD) oficial de la jornada logística en Chile ('America/Santiago').
 * El primer camión del día inicia a las 07:00 AM.
 * Todo lo registrado entre 00:00 AM y 06:59 AM corresponde a la jornada del día anterior.
 */
export const getChileDateString = (dateObj: Date = new Date()): string => {
  const chileTimeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = chileTimeFormatter.formatToParts(dateObj);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  let hour = parseInt(getPart('hour'), 10);
  if (hour === 24) hour = 0;

  const localDate = new Date(`${year}-${month}-${day}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`);

  // Si la hora en Chile es antes de las 7:00 AM, pertenece a la jornada del día anterior
  if (hour < 7) {
    localDate.setDate(localDate.getDate() - 1);
  }

  const resYear = localDate.getFullYear();
  const resMonth = (localDate.getMonth() + 1).toString().padStart(2, '0');
  const resDay = localDate.getDate().toString().padStart(2, '0');

  return `${resYear}-${resMonth}-${resDay}`;
};

/**
 * Retorna la hora HH:MM:SS en zona horaria de Santiago de Chile ('America/Santiago').
 */
export const getChileTimeString = (dateObj: Date = new Date()): string => {
  const formatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return formatter.format(dateObj);
};

export const compareTimes = (actualTimeStr: string, targetTimeStr: string) => {
  const [aH, aM] = actualTimeStr.slice(0, 5).split(':').map(Number);
  const [tH, tM] = targetTimeStr.slice(0, 5).split(':').map(Number);
  const actualMin = aH * 60 + aM;
  const targetMin = tH * 60 + tM;
  const diff = targetMin - actualMin;
  return {
    isOnTime: actualMin <= targetMin,
    diffMinutes: Math.abs(diff)
  };
};

/**
 * Retorna el nombre base del zonal sin números al final (ej: "Puerto Montt 1" o "Puerto Montt 2" -> "Puerto Montt").
 */
export const getBaseZonalName = (zonalName: string): string => {
  if (!zonalName) return '—';
  // Eliminar TODOS los números al final (ej: "VIÑA DEL MAR 2 2 2" → "VIÑA DEL MAR")
  return zonalName.replace(/(\s+\d+)+$/i, '').trim();
};

const ADMIN_EMAILS = [
  'ariel.mella@cial.cl',
  'euro.velasquez@cial.cl',
  'francisco.lara@cial.cl',
  'admin@cial.cl'
];

const checkIsAdmin = (user: any): boolean => {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  const role = (user.user_metadata?.role || user.app_metadata?.role || '').toLowerCase();
  if (['admin', 'superadmin'].includes(role)) return true;
  return ADMIN_EMAILS.includes(email);
};

// Emails de Jefes de Turno con acceso de edición sobre todos los despachos
const SHIFT_LEADER_EMAILS = [
  'francisco.lara@cial.cl',
  'euro.velasquez@cial.cl',
  'alejandro.ureta@cial.cl',
];

// Jefes de Turno y Administradores tienen permisos de edición sobre todos los despachos
const checkIsShiftLeaderOrAdmin = (user: any): boolean => {
  if (!user) return false;
  if (checkIsAdmin(user)) return true;
  const email = (user.email || '').toLowerCase();
  if (SHIFT_LEADER_EMAILS.includes(email)) return true;
  const role = (user.user_metadata?.role || user.app_metadata?.role || '').toLowerCase();
  return ['jefe', 'jefe_turno', 'supervisor_jefe'].includes(role);
};

export default function App({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<'nuevo' | 'historial' | 'zonales' | 'salidas' | 'kpi_salidas' | 'bitacora_atrasos' | 'inspeccion_reporte' | 'usuarios'>('salidas');
  const [inspectionPeriod, setInspectionPeriod] = useState<'hoy' | 'semana' | 'mes' | 'todo'>('mes');
  const [inspectionSearch, setInspectionSearch] = useState('');
  const [expandedInspectionPlates, setExpandedInspectionPlates] = useState<{ [plateKey: string]: boolean }>({});
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Estado para Pestaña "KPI Salidas"
  type ZonalDepartureLog = {
    id?: string;
    dispatch_id?: string;
    inspection_date: string;
    zonal_name: string;
    viaje_numero: number;
    target_time: string;
    actual_time: string;
    is_on_time: boolean;
    diff_minutes: number;
    supervisor_name: string;
    signed_by?: string;
    signed_by_name?: string;
    created_at?: string;
  };

  const [zonalDepartureLogs, setZonalDepartureLogs] = useState<ZonalDepartureLog[]>([]);
  const [kpiFilterPeriod, setKpiFilterPeriod] = useState<'7days' | '30days' | 'month' | 'all' | 'custom'>('7days');
  const [kpiStartDate, setKpiStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getChileDateString(d);
  });
  const [kpiEndDate, setKpiEndDate] = useState<string>(() => getChileDateString());
  const [kpiActiveSubTab, setKpiActiveSubTab] = useState<'supervisores' | 'responsables' | 'zonales' | 'detalle'>('supervisores');

  // Estado para modal de detalle de KPI (Salidas A Tiempo vs Retrasadas)
  type KpiDetailModalData = {
    title: string;
    subtitle: string;
    type: 'on_time' | 'late' | 'all';
    logs: ZonalDepartureLog[];
  };
  const [kpiDetailModal, setKpiDetailModal] = useState<KpiDetailModalData | null>(null);
  const [kpiDetailSearch, setKpiDetailSearch] = useState<string>('');

  // Estado para Pestaña "Bitácora de Atrasos"
  type DelayLogEntry = {
    id?: string;
    departure_log_id?: string;
    dispatch_id?: string;
    zonal_name: string;
    viaje_numero: number;
    inspection_date: string;
    target_time: string;
    actual_time: string;
    diff_minutes: number;
    supervisor_name?: string;
    responsible_name?: string;
    category: 'Operación' | 'Transporte' | 'Facturación' | 'Planificación' | 'Otro';
    justification: string;
    photos?: string[];
    created_by?: string;
    created_at?: string;
    updated_at?: string;
  };

  const [delayLogs, setDelayLogs] = useState<DelayLogEntry[]>([]);
  const [bitacoraPeriod, setBitacoraPeriod] = useState<'semana_actual' | 'semana_pasada' | 'ultimas_4_semanas' | 'todo' | 'personalizado'>('semana_actual');
  const [bitacoraStartDate, setBitacoraStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return getChileDateString(d);
  });
  const [bitacoraEndDate, setBitacoraEndDate] = useState<string>(() => getChileDateString());
  const [bitacoraSearchQuery, setBitacoraSearchQuery] = useState<string>('');
  const [bitacoraCategoryFilter, setBitacoraCategoryFilter] = useState<string>('todos');
  const [bitacoraStatusFilter, setBitacoraStatusFilter] = useState<string>('todos');

  // Estado para Modal de Edición de Justificación de Atraso
  const [editingDelayModal, setEditingDelayModal] = useState<{ logItem: ZonalDepartureLog; delayEntry?: DelayLogEntry } | null>(null);
  const [delayCategory, setDelayCategory] = useState<'Operación' | 'Transporte' | 'Facturación' | 'Planificación' | 'Otro'>('Operación');
  const [delayJustification, setDelayJustification] = useState<string>('');
  const [delayPhotos, setDelayPhotos] = useState<string[]>([]);
  const [delaySaveLoading, setDelaySaveLoading] = useState<boolean>(false);

  // Estado para Pestaña "Salidas a Tiempo" (Control Room Dashboard)
  type ZonalTargetTime = {
    id?: string;
    zonal_name: string;
    viaje_numero: number;
    target_time: string;
    is_active?: boolean;
  };

  const [zonalTargetTimes, setZonalTargetTimes] = useState<ZonalTargetTime[]>([]);
  const [departuresDate, setDeparturesDate] = useState<string>(() => getChileDateString());
  const [showConfigTargetsModal, setShowConfigTargetsModal] = useState(false);
  const [isTvMonitorMode, setIsTvMonitorMode] = useState(false);
  const [nowTime, setNowTime] = useState<Date>(new Date());
  const [savingTargetTime, setSavingTargetTime] = useState(false);
  const [newTargetZonalName, setNewTargetZonalName] = useState('Temuco');
  const [newTargetViaje, setNewTargetViaje] = useState<number>(1);
  const [newTargetTimeStr, setNewTargetTimeStr] = useState('18:00');

  // Datos Históricos de Despachos y Devoluciones
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [returnsList, setReturnsList] = useState<PalletReturnRecord[]>([]);
  const [expandedRecords, setExpandedRecords] = useState<{ [key: string]: boolean }>({});
  const [expandedZonalRows, setExpandedZonalRows] = useState<{ [key: string]: boolean }>({});
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [pdfPreviewModal, setPdfPreviewModal] = useState<{ rec: DispatchRecord; blobUrl: string; pdfObj: jsPDF; htmlTemplate?: string } | null>(null);
  const [historySubTab, setHistorySubTab] = useState<'camiones' | 'zonales' | 'saldos'>('camiones');
  const [historyZonalFilter, setHistoryZonalFilter] = useState<string>('ALL');

  // Datos del Formulario actual de Despacho
  const [editingDispatchId, setEditingDispatchId] = useState<string | null>(null);
  const [supervisorName, setSupervisorName] = useState(() => formatSupervisorName(user?.email));
  const [truckNumber, setTruckNumber] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [positionsOccupied, setPositionsOccupied] = useState<number>(26);
  const [observations, setObservations] = useState('');
  const [temp1er, setTemp1er] = useState<number>(0);
  const [temp2do, setTemp2do] = useState<number>(0);
  const [temp3er, setTemp3er] = useState<number>(0);

  // Estado para botón y notificación "Guardar Avance"
  const [saveProgressToast, setSaveProgressToast] = useState<string | null>(null);
  const [saveProgressLoading, setSaveProgressLoading] = useState(false);

  // ── Auto-guardado A+B+C ──────────────────────────────────────────────────
  // 'idle' = sin cambios desde último guardado
  // 'unsaved' = hay cambios sin guardar
  // 'saving' = guardando ahora
  // 'saved' = guardado exitoso
  // 'error' = error al guardar
  type DraftSaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';
  const [draftSaveStatus, setDraftSaveStatus] = useState<DraftSaveStatus>('idle');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  const [autoSaveRetries, setAutoSaveRetries] = useState(0);
  const isHydratingDraftRef = useRef(false);
  // ── Alerta de Fallas en Camiones y Rampas (Aviso por Correo / Reporte) ──
  interface FailureAlertItem {
    itemKey: string;
    itemLabel: string;
    status: 'AMARILLO' | 'ROJO';
    comment?: string;
    photos: string[];
    date: string;
    supervisor: string;
    previousZonals?: string[];
    previousDate?: string | null;
    currentZonals?: string[];
  }
  interface FailureAlertData {
    plate: string;
    truckNumbers: string[];
    records: DispatchRecord[];
    lastZonals?: string[];
    lastDispatchDate?: string;
    failures: FailureAlertItem[];
  }
  const [failureAlertModal, setFailureAlertModal] = useState<FailureAlertData | null>(null);
  const [alertRecipientEmail, setAlertRecipientEmail] = useState<string>(() => localStorage.getItem('nexus_rampas_alert_to') || '');
  const [alertCcEmail, setAlertCcEmail] = useState<string>(() => localStorage.getItem('nexus_rampas_alert_cc') || '');
  const [alertCopiedToast, setAlertCopiedToast] = useState(false);

  // Manejo de Temperaturas Termos: Solo 1 congelado (<= -9°C) a la vez. Si uno se activa, los demás pasan a 0°C (Refrigerado).
  const handleSetTemp1er = (val: number) => {
    setTemp1er(val);
    if (val <= -9) {
      if (temp2do <= -9) setTemp2do(0);
      if (temp3er <= -9) setTemp3er(0);
    }
  };

  const handleSetTemp2do = (val: number) => {
    setTemp2do(val);
    if (val <= -9) {
      if (temp1er <= -9) setTemp1er(0);
      if (temp3er <= -9) setTemp3er(0);
    }
  };

  const handleSetTemp3er = (val: number) => {
    setTemp3er(val);
    if (val <= -9) {
      if (temp1er <= -9) setTemp1er(0);
      if (temp2do <= -9) setTemp2do(0);
    }
  };

  const handleSetEditingTemp1er = (val: number) => {
    setEditingTemp1er(val);
    if (val <= -9) {
      if (editingTemp2do <= -9) setEditingTemp2do(0);
      if (editingTemp3er <= -9) setEditingTemp3er(0);
    }
  };

  const handleSetEditingTemp2do = (val: number) => {
    setEditingTemp2do(val);
    if (val <= -9) {
      if (editingTemp1er <= -9) setEditingTemp1er(0);
      if (editingTemp3er <= -9) setEditingTemp3er(0);
    }
  };

  const handleSetEditingTemp3er = (val: number) => {
    setEditingTemp3er(val);
    if (val <= -9) {
      if (editingTemp1er <= -9) setEditingTemp1er(0);
      if (editingTemp2do <= -9) setEditingTemp2do(0);
    }
  };
  const [closeTime, setCloseTime] = useState<string>('');
  const [truckKilos, setTruckKilos] = useState<string>('');
  const [truckAnden, setTruckAnden] = useState<string>('');

  const isAdmin = checkIsAdmin(user);
  const isShiftLeader = checkIsShiftLeaderOrAdmin(user);
  const isSuperAdmin = (user?.email || '').toLowerCase() === 'ariel.mella@cial.cl';

  // Estado módulo gestión de usuarios
  type PalletUser = { id: string; email: string; display_name: string; role: string; is_active: boolean; can_sign?: boolean; notes: string; };
  const [palletUsers, setPalletUsers] = useState<PalletUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editingUser, setEditingUser] = useState<PalletUser | null>(null);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState('supervisor');
  const [newUserNotes, setNewUserNotes] = useState('');
  const [newUserCanSign, setNewUserCanSign] = useState(true);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  const fetchPalletUsers = async () => {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase
        .from('pallet_users')
        .select('*')
        .order('role')
        .order('display_name');
      if (error) throw error;
      const cialOnlyUsers = (data || []).filter(u => (u.email || '').toLowerCase().endsWith('@cial.cl'));
      setPalletUsers(cialOnlyUsers);
    } catch (err: any) {
      console.error('Error cargando usuarios:', err);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleSaveUser = async (u: PalletUser) => {
    setSavingUser(true);
    try {
      const canSignVal = u.can_sign !== false;
      const { error } = await supabase
        .from('pallet_users')
        .update({ 
          display_name: u.display_name, 
          role: u.role, 
          is_active: u.is_active, 
          can_sign: canSignVal, 
          notes: u.notes, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', u.id);
      if (error) throw error;
      setPalletUsers(prev => prev.map(p => p.id === u.id ? u : p));
      if (u.email.toLowerCase() === (user?.email || '').toLowerCase()) {
        setUserTitle(u.notes?.trim() || null);
        setUserDisplayName(u.display_name);
        setUserCanSign(canSignVal);
      }
      setEditingUser(null);
      setSuccessMsg(`Usuario ${u.display_name} actualizado.`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserActive = async (u: PalletUser) => {
    const updated = { ...u, is_active: !u.is_active };
    await handleSaveUser(updated);
  };

  const handleToggleUserCanSign = async (u: PalletUser) => {
    const newCanSign = u.can_sign === false ? true : false;
    const updated = { ...u, can_sign: newCanSign };
    try {
      const { error } = await supabase
        .from('pallet_users')
        .update({ can_sign: newCanSign, updated_at: new Date().toISOString() })
        .eq('id', u.id);
      if (error) throw error;
      setPalletUsers(prev => prev.map(p => p.id === u.id ? updated : p));
      if (u.email.toLowerCase() === (user?.email || '').toLowerCase()) {
        setUserCanSign(newCanSign);
      }
      setSuccessMsg(`Permiso de firma para ${u.display_name} ${newCanSign ? 'habilitado ✍️' : 'deshabilitado (Facturador) 🚫'}.`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserName) { alert('Email y nombre son requeridos.'); return; }
    if (!newUserEmail.toLowerCase().trim().endsWith('@cial.cl')) {
      alert('Solo se permite registrar correos del dominio corporativo @cial.cl');
      return;
    }
    setSavingUser(true);
    try {
      const { error } = await supabase
        .from('pallet_users')
        .insert({ 
          email: newUserEmail.toLowerCase().trim(), 
          display_name: newUserName.trim(), 
          role: newUserRole, 
          is_active: true, 
          can_sign: newUserCanSign, 
          notes: newUserNotes.trim() 
        });
      if (error) throw error;
      setSuccessMsg(`Usuario ${newUserName} creado exitosamente.`);
      setShowNewUserForm(false);
      setNewUserEmail(''); setNewUserName(''); setNewUserRole('supervisor'); setNewUserNotes(''); setNewUserCanSign(true);
      fetchPalletUsers();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setSavingUser(false);
    }
  };

  // Sub-tab dentro del módulo Usuarios
  const [adminSubTab, setAdminSubTab] = useState<'usuarios' | 'almacenamiento'>('usuarios');

  // ═══════════════════════════════════════════════════
  // SISTEMA DE FIRMA DIGITAL
  // ═══════════════════════════════════════════════════
  // SISTEMA DE FIRMA DIGITAL
  // ═══════════════════════════════════════════════════
  const [signPreviewRecord, setSignPreviewRecord] = useState<DispatchRecord | null>(null);
  const [userSignature, setUserSignature] = useState<string | null>(null); // firma guardada del usuario
  const [userTitle, setUserTitle] = useState<string | null>(null); // cargo (notas de pallet_users)
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [userCanSign, setUserCanSign] = useState<boolean>(true); // Permiso para firmar despachos
  const [signingInProgress, setSigningInProgress] = useState(false);

  // Canvas para dibujar firma en perfil
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [savingSignature, setSavingSignature] = useState(false);

  // Cargar firma y perfil del usuario actual desde BD (con auto-creación al iniciar sesión)
  const loadUserProfile = async () => {
    if (!user?.email) return;
    const userEmail = (user.email || '').toLowerCase().trim();
    try {
      const { data } = await supabase
        .from('pallet_users')
        .select('signature_b64, notes, display_name, role, can_sign')
        .eq('email', userEmail)
        .maybeSingle();

      if (data) {
        if (data.signature_b64) setUserSignature(data.signature_b64);
        if (data.notes && data.notes.trim()) setUserTitle(data.notes.trim());
        else if (data.role) {
          setUserTitle(data.role === 'admin' ? 'Administrador' : data.role === 'jefe_turno' ? 'Jefe de Turno' : 'Supervisor');
        }
        if (data.display_name) setUserDisplayName(data.display_name);
        setUserCanSign(data.can_sign !== false);
      } else if (userEmail.endsWith('@cial.cl')) {
        // Auto-registra el usuario en pallet_users solo si pertenece al dominio @cial.cl
        const meta = user.user_metadata || {};
        const fallbackName = meta.full_name || meta.name || userEmail.split('@')[0].split('.').map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
        
        const { data: newUser } = await supabase
          .from('pallet_users')
          .insert({
            email: userEmail,
            display_name: fallbackName,
            role: 'supervisor',
            is_active: true,
            can_sign: true,
            notes: ''
          })
          .select()
          .single();

        if (newUser) {
          setUserDisplayName(newUser.display_name);
          setUserTitle('Supervisor');
          setUserCanSign(true);
        }
      }
    } catch (err) {
      console.error('Error cargando/auto-registrando perfil:', err);
    }
  };

  const fetchZonalTargetTimes = async () => {
    try {
      const { data, error } = await supabase
        .from('zonal_target_times')
        .select('*')
        .order('zonal_name')
        .order('viaje_numero');
      if (error) throw error;
      if (data && data.length > 0) {
        const seen = new Set<string>();
        const clean: ZonalTargetTime[] = [];
        data.forEach(item => {
          const baseName = getBaseZonalName(item.zonal_name).toUpperCase();
          const key = `${baseName}-${item.viaje_numero || 1}`;
          if (!seen.has(key)) {
            seen.add(key);
            clean.push({
              ...item,
              zonal_name: baseName
            });
          }
        });
        setZonalTargetTimes(clean);
      }
    } catch (err) {
      console.error('Error cargando metas de salidas:', err);
    }
  };

  const getZonalTargetConfig = (zonalName: string, viajeNum: number = 1): { target_time: string } => {
    const cleanSearch = getBaseZonalName(zonalName).toUpperCase();

    // 1. Buscar case-insensitively en las metas cargadas desde Supabase DB
    const match = zonalTargetTimes.find(t => 
      getBaseZonalName(t.zonal_name).toUpperCase() === cleanSearch && (t.viaje_numero || 1) === viajeNum
    ) || zonalTargetTimes.find(t => 
      getBaseZonalName(t.zonal_name).toUpperCase() === cleanSearch
    );

    if (match && match.target_time) return match;

    // 2. Fallback con Horarios Oficiales CIAL Alimentos (evita asignar 18:00 por defecto a Puerto Montt/Osorno)
    const HARDCODED_OFFICIAL_TARGETS: { [key: string]: string } = {
      'PUERTO MONTT': '09:00',
      'OSORNO': '10:00',
      'TEMUCO': viajeNum === 2 ? '19:30' : '12:00',
      'CONCEPCIÓN': '13:00',
      'CHILLÁN': '15:00',
      'LOS ÁNGELES': '14:30',
      'TALCA': '18:00',
      'SAN FERNANDO': '21:30',
      'RANCAGUA': '21:30',
      'VIÑA DEL MAR': '23:30',
      'VALPARAÍSO': '23:30',
      'SAN FELIPE': '20:00',
      'LA SERENA': '16:00',
      'COQUIMBO': '16:00',
      'LOS VILOS': '19:30',
      'ARICA': '17:30',
      'IQUIQUE': '17:30',
      'ANTOFAGASTA': '23:30',
      'CALAMA': '21:30',
      'COPIAPÓ': '23:30',
      'VALDIVIA': '18:00',
      'COYHAIQUE': '13:30',
      'PUNTA ARENAS': '15:30'
    };

    return { target_time: HARDCODED_OFFICIAL_TARGETS[cleanSearch] || '18:00' };
  };

  const fetchZonalDepartureLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('zonal_departure_logs')
        .select('*')
        .order('inspection_date', { ascending: false });

      if (error) throw error;
      if (data) {
        const seen = new Set<string>();
        const clean: ZonalDepartureLog[] = [];
        data.forEach(item => {
          const dateStr = String(item.inspection_date).slice(0, 10);
          const baseZonal = getBaseZonalName(item.zonal_name).toUpperCase();
          const key = `${dateStr}-${baseZonal}-${item.viaje_numero || 1}`;
          if (!seen.has(key)) {
            seen.add(key);
            clean.push({
              ...item,
              zonal_name: baseZonal
            });
          }
        });
        setZonalDepartureLogs(clean);
      }
    } catch (err) {
      console.error('Error cargando logs históricos de salidas:', err);
    }
  };

  const fetchDelayLogbook = async () => {
    try {
      const { data, error } = await supabase
        .from('delay_logbook')
        .select('*')
        .order('inspection_date', { ascending: false });

      if (error) throw error;
      setDelayLogs(data || []);
    } catch (e) {
      console.error('Error cargando bitácora de atrasos:', e);
    }
  };

  const getSignerNameFromLog = (log: ZonalDepartureLog, users: PalletUser[]) => {
    if (log.signed_by_name) return log.signed_by_name;
    if (log.signed_by) {
      const u = users.find(user => (user.email || '').toLowerCase() === log.signed_by?.toLowerCase());
      return u ? u.display_name : log.signed_by;
    }
    return log.supervisor_name;
  };

  const openDelayModal = (logItem: ZonalDepartureLog) => {
    const baseZonal = getBaseZonalName(logItem.zonal_name);
    const viajeNum = logItem.viaje_numero || 1;
    const existing = delayLogs.find(d => 
      d.departure_log_id === logItem.id || 
      (d.zonal_name === baseZonal && d.viaje_numero === viajeNum && d.inspection_date === logItem.inspection_date)
    );

    setEditingDelayModal({ logItem, delayEntry: existing });
    setDelayCategory(existing?.category || 'Operación');
    setDelayJustification(existing?.justification || '');
    setDelayPhotos(existing?.photos || []);
  };

  const handleDelayPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newPhotos: string[] = [];
    for (let i = 0; i < files.length; i++) {
      if (delayPhotos.length + newPhotos.length >= 6) break;
      try {
        const compressed = await compressImage(files[i]);
        newPhotos.push(compressed);
      } catch (err) {
        console.error('Error comprimiendo foto de atraso:', err);
      }
    }
    setDelayPhotos(prev => [...prev, ...newPhotos]);
  };

  const handlePasteDelayPhotos = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          if (delayPhotos.length >= 6) {
            alert('Máximo 6 fotos de evidencia por atraso.');
            break;
          }
          try {
            const compressed = await compressImage(file);
            setDelayPhotos(prev => [...prev, compressed]);
          } catch (err) {
            console.error('Error comprimiendo foto pegada:', err);
          }
        }
      }
    }
  };

  const removeDelayPhoto = (index: number) => {
    setDelayPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handlePasteEquipmentPhotos = (type: 'colchonetas' | 'lingas') => async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          try {
            const compressed = await compressImage(file);
            if (type === 'colchonetas') {
              setColchonetasPhotos(prev => [...prev, compressed]);
            } else {
              setLingasPhotos(prev => [...prev, compressed]);
            }
          } catch (err) {
            console.error('Error comprimiendo foto pegada:', err);
          }
        }
      }
    }
  };

  const handleSaveDelayJustification = async () => {
    if (!editingDelayModal) return;
    if (!delayJustification || !delayJustification.trim()) {
      alert('Por favor ingresa la justificación o motivo del atraso.');
      return;
    }
    if (!delayCategory) {
      alert('Por favor selecciona una categoría de atraso.');
      return;
    }

    const { logItem, delayEntry } = editingDelayModal;
    const baseZonal = getBaseZonalName(logItem.zonal_name);

    setDelaySaveLoading(true);
    try {
      const payload: any = {
        departure_log_id: logItem.id,
        dispatch_id: logItem.dispatch_id || null,
        zonal_name: baseZonal,
        viaje_numero: logItem.viaje_numero || 1,
        inspection_date: logItem.inspection_date,
        target_time: logItem.target_time,
        actual_time: logItem.actual_time,
        diff_minutes: logItem.diff_minutes || 0,
        supervisor_name: logItem.supervisor_name || supervisorName,
        responsible_name: getSignerNameFromLog(logItem, palletUsers) || logItem.signed_by_name || logItem.supervisor_name || 'Sin Especificar',
        category: delayCategory,
        justification: delayJustification.trim(),
        photos: delayPhotos,
        created_by: user?.email || '',
        updated_at: new Date().toISOString()
      };

      if (delayEntry?.id) {
        payload.id = delayEntry.id;
      }

      const { error } = await supabase
        .from('delay_logbook')
        .upsert([payload], { onConflict: 'id' });

      if (error) throw error;

      setSuccessMsg('¡Justificación de atraso registrada en la Bitácora!');
      setEditingDelayModal(null);
      await fetchDelayLogbook();
    } catch (err: any) {
      console.error('Error guardando justificación de atraso:', err);
      alert('Error al guardar: ' + err.message);
    } finally {
      setDelaySaveLoading(false);
    }
  };

  const handleSaveZonalTargetTime = async (zonalName: string, viajeNum: number, timeStr: string) => {
    setSavingTargetTime(true);
    try {
      const cleanZonal = getBaseZonalName(zonalName).toUpperCase();
      const { error } = await supabase
        .from('zonal_target_times')
        .upsert(
          { zonal_name: cleanZonal, viaje_numero: viajeNum, target_time: timeStr, updated_at: new Date().toISOString() },
          { onConflict: 'zonal_name,viaje_numero' }
        );
      if (error) throw error;
      setSuccessMsg(`Meta de cierre guardada: ${cleanZonal} ${viajeNum > 1 ? viajeNum : ''} ➔ ${timeStr} hrs`);
      await fetchZonalTargetTimes();
    } catch (err: any) {
      alert('Error guardando meta: ' + err.message);
    } finally {
      setSavingTargetTime(false);
    }
  };

  useEffect(() => {
    if (user?.email) {
      loadUserProfile();
    }
    fetchZonalTargetTimes();
    const timer = setInterval(() => {
      setNowTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [user]);

  // Funciones del canvas de firma
  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getCanvasPos(e, canvas);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const saveSignatureToProfile = async () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    setSavingSignature(true);
    try {
      const { error } = await supabase
        .from('pallet_users')
        .update({ signature_b64: dataUrl, updated_at: new Date().toISOString() })
        .eq('email', (user?.email || '').toLowerCase());
      if (error) throw error;
      setUserSignature(dataUrl);
      setShowSignaturePad(false);
      setSuccessMsg('Firma guardada correctamente en tu perfil.');
    } catch (err: any) {
      alert('Error guardando firma: ' + err.message);
    } finally {
      setSavingSignature(false);
    }
  };

  // Estampar firma en despacho
  const handleSignDispatch = async () => {
    if (!signPreviewRecord || !userSignature) return;
    setSigningInProgress(true);
    try {
      const signedAt = new Date().toISOString();
      const signedTitle = userTitle || (isAdmin ? 'Administrador' : isShiftLeader ? 'Jefe de Turno' : 'Supervisor');
      const { error } = await supabase
        .from('pallet_dispatches')
        .update({
          signed_by: user?.email || '',
          signed_at: signedAt,
          signature_b64: userSignature,
          signed_by_title: signedTitle,
        })
        .eq('id', signPreviewRecord.id);
      if (error) throw error;
      // Actualizar información del firmante en logs de salidas
      const signerDisplayName = userDisplayName || formatSupervisorName(user?.email);
      await supabase.from('zonal_departure_logs')
        .update({
          signed_by: user?.email || '',
          signed_by_name: signerDisplayName
        })
        .eq('dispatch_id', signPreviewRecord.id);
      fetchZonalDepartureLogs();

      // Actualizar en estado local
      setRecords(prev => prev.map(r =>
        r.id === signPreviewRecord.id
          ? { ...r, signed_by: user?.email || '', signed_at: signedAt, signature_b64: userSignature, signed_by_title: signedTitle }
          : r
      ));
      setSignPreviewRecord(null);
      setSuccessMsg(`✅ Despacho firmado correctamente por ${userDisplayName || supervisorName} (${signedTitle}).`);
    } catch (err: any) {
      alert('Error al firmar: ' + err.message);
    } finally {
      setSigningInProgress(false);
    }
  };


  // Estado del análisis de almacenamiento
  type StorageRecord = { id: string; date: string; supervisor: string; truck: string; photoCount: number; sizeKB: number; isOld: boolean; };
  const [storageRecords, setStorageRecords] = useState<StorageRecord[]>([]);
  const [storageLoading, setStorageLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupDone, setCleanupDone] = useState(false);

  const analyzeStorage = async () => {
    setStorageLoading(true);
    setCleanupDone(false);
    try {
      const { data, error } = await supabase.rpc('get_storage_analysis');
      if (error) throw error;

      const result: StorageRecord[] = (data || []).map((rec: any) => ({
        id: rec.id,
        date: rec.inspection_date,
        supervisor: rec.supervisor_name || '—',
        truck: rec.truck_number && rec.truck_number !== 'N/A' && rec.truck_number !== '—' 
          ? rec.truck_number 
          : (rec.truck_plate || '—'),
        photoCount: rec.photo_count || 0,
        sizeKB: rec.size_kb || 0,
        isOld: !!rec.is_old,
      }));

      setStorageRecords(result);
    } catch (err: any) {
      console.error('Error al analizar almacenamiento:', err);
      alert('Error al analizar almacenamiento: ' + (err.message || 'Error de conexión'));
    } finally {
      setStorageLoading(false);
    }
  };

  const handleCleanOldPhotos = async () => {
    const oldRecords = storageRecords.filter(r => r.isOld);
    if (oldRecords.length === 0) { alert('No hay registros con fotos de más de 30 días.'); return; }
    const totalKB = oldRecords.reduce((sum, r) => sum + r.sizeKB, 0);
    if (!window.confirm(`¿Eliminar fotos de ${oldRecords.length} despachos con más de 30 días?\n\nSe liberarán aprox. ${(totalKB / 1024).toFixed(1)} MB de base de datos.\nLos registros de pallets, zonales, horas y firmas se conservan al 100%, solo se borran las imágenes antiguas.`)) return;

    setCleanupLoading(true);
    try {
      const { data, error } = await supabase.rpc('clean_old_dispatch_photos', { days_threshold: 30 });
      if (error) throw error;

      const cleanedCount = data?.cleaned_dispatches || oldRecords.length;
      setSuccessMsg(`✅ Fotos eliminadas de ${cleanedCount} despachos antiguos. Espacio liberado: ~${(totalKB / 1024).toFixed(1)} MB`);
      setCleanupDone(true);
      await analyzeStorage();
    } catch (err: any) {
      console.error('Error durante la limpieza:', err);
      alert('Error durante la limpieza: ' + (err.message || 'Error de conexión'));
    } finally {
      setCleanupLoading(false);
    }
  };

  // Estados para edición diferida de hora de cierre de camión en historial
  const [editingCloseTimes, setEditingCloseTimes] = useState<{ [key: string]: string }>({});
  const [savingCloseTimeId, setSavingCloseTimeId] = useState<string | null>(null);

  // Estado para el modal de edición completa de despacho (solo admin)
  const [editingDispatchRecord, setEditingDispatchRecord] = useState<DispatchRecord | null>(null);
  const [editingDate, setEditingDate] = useState('');
  const [editingTime, setEditingTime] = useState('');
  const [editingCloseTime, setEditingCloseTime] = useState('');
  const [editingTruckKilos, setEditingTruckKilos] = useState('');
  const [editingTruckAnden, setEditingTruckAnden] = useState('');
  const [editingTruckNumber, setEditingTruckNumber] = useState('');
  const [editingTruckPlate, setEditingTruckPlate] = useState('');
  const [editingSupervisorName, setEditingSupervisorName] = useState('');
  const [editingPositions, setEditingPositions] = useState(26);
  const [editingTemp1er, setEditingTemp1er] = useState(0);
  const [editingTemp2do, setEditingTemp2do] = useState(0);
  const [editingTemp3er, setEditingTemp3er] = useState(0);
  const [editingZonalsDetail, setEditingZonalsDetail] = useState<ZonalDetail[]>([]);
  const [editingObservations, setEditingObservations] = useState('');
  const [editingSaveLoading, setEditingSaveLoading] = useState(false);

  // Checklist de 5 items con Semáforo
  const [checklist, setChecklist] = useState<Record<string, any>>({ ...INITIAL_CHECKLIST });

  // Fotos y comentarios para Inspección de Lingas y Colchonetas/Separador Térmico
  const [lingasPhotos, setLingasPhotos] = useState<string[]>([]);
  const [lingasComment, setLingasComment] = useState<string>('');
  const [colchonetasPhotos, setColchonetasPhotos] = useState<string[]>([]);
  const [colchonetasComment, setColchonetasComment] = useState<string>('');

  const handleLingasPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newPhotos: string[] = [];
    for (let i = 0; i < files.length; i++) {
      if (lingasPhotos.length + newPhotos.length >= 6) break;
      try {
        const compressed = await compressImage(files[i]);
        newPhotos.push(compressed);
      } catch (err) {
        console.error('Error comprimiendo foto de lingas:', err);
      }
    }
    setLingasPhotos(prev => [...prev, ...newPhotos]);
  };

  const removeLingasPhoto = (index: number) => {
    setLingasPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleColchonetasPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newPhotos: string[] = [];
    for (let i = 0; i < files.length; i++) {
      if (colchonetasPhotos.length + newPhotos.length >= 6) break;
      try {
        const compressed = await compressImage(files[i]);
        newPhotos.push(compressed);
      } catch (err) {
        console.error('Error comprimiendo foto de colchonetas:', err);
      }
    }
    setColchonetasPhotos(prev => [...prev, ...newPhotos]);
  };

  const removeColchonetasPhoto = (index: number) => {
    setColchonetasPhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Zonales cargados en el camión actual
  const [selectedZonals, setSelectedZonals] = useState<ZonalDetail[]>([]);

  // State para el modal de registrar retorno táctil
  const [showReturnModal, setShowReturnModal] = useState<string | null>(null); // Nombre del zonal seleccionado
  const [returnSupervisor, setReturnSupervisor] = useState(() => formatSupervisorName(user?.email));
  const [returnWood, setReturnWood] = useState(0);
  const [returnPlastic, setReturnPlastic] = useState(0);

  // Perfil y cambio de contraseña interno
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // State para modal/asistente de sumatoria de bandejas (45, 40, 35, 30, 25, 20 + restante)
  const [showBandejasHelper, setShowBandejasHelper] = useState<number | null>(null); // Index del zonal actual en el asistente
  const [helper45, setHelper45] = useState(0);
  const [helper40, setHelper40] = useState(0);
  const [helper35, setHelper35] = useState(0);
  const [helper30, setHelper30] = useState(0);
  const [helper25, setHelper25] = useState(0);
  const [helper20, setHelper20] = useState(0);
  const [helperRestante, setHelperRestante] = useState(0);

  // Acordeón para colapsar zonales en edición
  const [expandedZonalIndex, setExpandedZonalIndex] = useState<number | null>(0);



  // Fotos adjuntas en observaciones (max 10 fotos)
  const [photos, setPhotos] = useState<string[]>([]);

  // Visor de Galería de fotos en tamaño completo con navegación Siguiente/Anterior
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);

  const openPhotoGallery = (photosList: string | string[], startIndex: number = 0) => {
    const list = Array.isArray(photosList) ? photosList : [photosList];
    if (list.length === 0) return;
    setGalleryPhotos(list);
    setActivePhotoIndex(startIndex >= 0 && startIndex < list.length ? startIndex : 0);
  };

  const closePhotoGallery = () => {
    setGalleryPhotos([]);
    setActivePhotoIndex(0);
  };

  const handleNextPhoto = () => {
    if (galleryPhotos.length <= 1) return;
    setActivePhotoIndex(prev => (prev + 1) % galleryPhotos.length);
  };

  const handlePrevPhoto = () => {
    if (galleryPhotos.length <= 1) return;
    setActivePhotoIndex(prev => (prev - 1 + galleryPhotos.length) % galleryPhotos.length);
  };

  // Helper para comprimir imágenes cargadas a JPEG 800px para mantener rendimiento y peso liviano
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          } else {
            resolve(e.target?.result as string);
          }
        };
        img.onerror = () => reject('Error al procesar la imagen');
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject('Error al leer el archivo');
      reader.readAsDataURL(file);
    });
  };

  // Gestión de Múltiples Borradores de Camiones Abiertos en Paralelo
  const [truckDrafts, setTruckDrafts] = useState<TruckDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string>('');

  const createEmptyDraft = (id?: string): TruckDraft => {
    const nowIso = new Date().toISOString();
    return {
      id: id || `draft_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      truckNumber: '',
      truckPlate: '',
      truckAnden: '',
      positionsOccupied: 26,
      observations: '',
      temp1er: 0,
      temp2do: 0,
      temp3er: 0,
      closeTime: '',
      truckKilos: '',
      checklist: { ...INITIAL_CHECKLIST },
      selectedZonals: [],
      photos: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      supervisorName: supervisorName || '',
      createdBy: user?.email || ''
    };
  };

  const loadDraftIntoState = (draft: TruckDraft) => {
    isHydratingDraftRef.current = true;
    setTruckNumber(draft.truckNumber || '');
    setTruckPlate(draft.truckPlate || '');
    setTruckAnden(draft.truckAnden || '');
    setPositionsOccupied(draft.positionsOccupied ?? 26);
    setObservations(draft.observations || '');
    setTemp1er(draft.temp1er ?? 0);
    setTemp2do(draft.temp2do ?? 0);
    setTemp3er(draft.temp3er ?? 0);
    setCloseTime(draft.closeTime || '');
    setTruckKilos(draft.truckKilos || '');
    setChecklist(draft.checklist || { ...INITIAL_CHECKLIST });
    setLingasPhotos((draft.checklist as any)?.lingas_photos || []);
    setLingasComment((draft.checklist as any)?.lingas_comment || '');
    setColchonetasPhotos((draft.checklist as any)?.colchonetas_photos || []);
    setColchonetasComment((draft.checklist as any)?.colchonetas_comment || '');
    setSelectedZonals(draft.selectedZonals || []);
    setPhotos(draft.photos || []);

    const savedIso = draft.updatedAt || draft.createdAt;
    if (savedIso) {
      const parsedDate = new Date(savedIso);
      if (!isNaN(parsedDate.getTime())) {
        setLastAutoSaveTime(parsedDate);
        setDraftSaveStatus('saved');
      }
    } else {
      setDraftSaveStatus('idle');
    }

    setTimeout(() => {
      isHydratingDraftRef.current = false;
    }, 150);
  };

  // Persistencia de Respaldo Local en LocalStorage para prevenir pérdida de datos
  const saveBackupDraftsToLocalStorage = (drafts: TruckDraft[]) => {
    try {
      localStorage.setItem('nexus_truck_drafts_backup_v2', JSON.stringify(drafts));
    } catch (e) {
      console.error('Error guardando backup de borradores en localStorage:', e);
    }
  };

  const getBackupDraftsFromLocalStorage = (): TruckDraft[] => {
    try {
      const stored = localStorage.getItem('nexus_truck_drafts_backup_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('Error leyendo backup de borradores:', e);
    }
    return [];
  };

  // Cargar y Sincronizar Borradores de Camiones desde Supabase (Multidispositivo Realtime sin sobrescritura forzada)
  const fetchActiveDraftsFromSupabase = async (isInitialLoad = false) => {
    try {
      const { data, error } = await supabase
        .from('active_truck_drafts')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const remoteDrafts: TruckDraft[] = data.map(d => ({
          id: d.id,
          truckNumber: d.truck_number || '',
          truckPlate: d.truck_plate || '',
          truckAnden: d.truck_anden || '',
          positionsOccupied: d.positions_occupied ?? 26,
          observations: d.observations || '',
          temp1er: Number(d.temp_1er) || 0,
          temp2do: d.temp_2do !== undefined && d.temp_2do !== null ? Number(d.temp_2do) : 0,
          temp3er: Number(d.temp_3er) || 0,
          closeTime: d.close_time || '',
          truckKilos: d.truck_kilos || '',
          checklist: d.checklist || { ...INITIAL_CHECKLIST },
          selectedZonals: d.selected_zonals || [],
          photos: d.photos || [],
          createdAt: d.created_at,
          updatedAt: d.updated_at || d.created_at || new Date().toISOString(),
          supervisorName: d.supervisor_name || '',
          createdBy: d.created_by || ''
        }));

        setTruckDrafts(remoteDrafts);
        saveBackupDraftsToLocalStorage(remoteDrafts);

        // NUNCA sobrescribir el formulario activo mientras el usuario escribe, salvo en la carga inicial o si el borrador activo se borró legítimamente
        setActiveDraftId(prevId => {
          const exists = prevId && remoteDrafts.some(rd => rd.id === prevId);
          if (isInitialLoad || !exists) {
            const nextId = exists ? prevId : remoteDrafts[0].id;
            const target = remoteDrafts.find(rd => rd.id === nextId) || remoteDrafts[0];
            loadDraftIntoState(target);
            return nextId;
          }
          return prevId;
        });
      } else {
        // Si Supabase no entrega datos pero hay un backup local válido, restaurarlo sin perder información
        const backup = getBackupDraftsFromLocalStorage();
        if (backup.length > 0 && backup.some(b => b.truckNumber || (b.selectedZonals && b.selectedZonals.length > 0))) {
          console.warn('Restaurando borradores de camiones activos desde backup local...');
          setTruckDrafts(backup);
          if (isInitialLoad || !activeDraftId) {
            setActiveDraftId(backup[0].id);
            loadDraftIntoState(backup[0]);
          }
          backup.forEach(d => syncDraftToSupabase(d));
        } else {
          const initial = createEmptyDraft();
          setTruckDrafts([initial]);
          if (isInitialLoad || !activeDraftId) {
            setActiveDraftId(initial.id);
            loadDraftIntoState(initial);
          }
          syncDraftToSupabase(initial);
          saveBackupDraftsToLocalStorage([initial]);
        }
      }
    } catch (err) {
      console.error('Error cargando borradores de Supabase, activando fallback local:', err);
      const backup = getBackupDraftsFromLocalStorage();
      if (backup.length > 0) {
        setTruckDrafts(backup);
        if (isInitialLoad || !activeDraftId) {
          setActiveDraftId(backup[0].id);
          loadDraftIntoState(backup[0]);
        }
      }
    }
  };

  const syncDraftToSupabase = async (draft: TruckDraft) => {
    if (!draft || !draft.id) return;
    const nowIso = new Date().toISOString();
    try {
      await supabase.from('active_truck_drafts').upsert([{
        id: draft.id,
        truck_number: draft.truckNumber || '',
        truck_plate: draft.truckPlate || '',
        truck_anden: draft.truckAnden || '',
        positions_occupied: draft.positionsOccupied ?? 26,
        observations: draft.observations || '',
        temp_1er: draft.temp1er ?? 0,
        temp_2do: draft.temp2do ?? 0,
        temp_3er: draft.temp3er ?? 0,
        close_time: draft.closeTime || '',
        truck_kilos: draft.truckKilos || '',
        checklist: draft.checklist || {},
        selected_zonals: draft.selectedZonals || [],
        photos: draft.photos || [],
        supervisor_name: draft.supervisorName ? draft.supervisorName : (supervisorName || ''),
        created_by: draft.createdBy ? draft.createdBy : (user?.email || ''),
        updated_at: draft.updatedAt || nowIso
      }], { onConflict: 'id' });
    } catch (e) {
      console.error('Error sincronizando borrador en Supabase:', e);
    }
  };

  const deleteDraftFromSupabase = async (draftId: string) => {
    try {
      await supabase.from('active_truck_drafts').delete().eq('id', draftId);
    } catch (e) {
      console.error('Error borrando borrador en Supabase:', e);
    }
  };

  // Suscripción Realtime para sincronizar camiones en proceso (sin reinicios forzados de formulario)
  useEffect(() => {
    fetchActiveDraftsFromSupabase(true);

    const channel = supabase
      .channel('public:active_truck_drafts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'active_truck_drafts' },
        () => {
          fetchActiveDraftsFromSupabase(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Sincronizar cambios de estado al borrador activo en tiempo real
  useEffect(() => {
    if (!activeDraftId) return;
    setTruckDrafts(prevDrafts => {
      const updated = prevDrafts.map(d => {
        if (d.id === activeDraftId) {
          const fullChecklist = {
            ...checklist,
            lingas_photos: lingasPhotos,
            lingas_comment: lingasComment,
            colchonetas_photos: colchonetasPhotos,
            colchonetas_comment: colchonetasComment
          };
          const updatedDraft = {
            ...d,
            truckNumber,
            truckPlate,
            truckAnden,
            positionsOccupied,
            observations,
            temp1er,
            temp2do,
            temp3er,
            closeTime,
            truckKilos,
            checklist: fullChecklist,
            selectedZonals,
            photos,
            supervisorName: d.supervisorName ? d.supervisorName : (supervisorName || ''),
            createdBy: d.createdBy ? d.createdBy : (user?.email || '')
          };
          syncDraftToSupabase(updatedDraft);
          return updatedDraft;
        }
        return d;
      });
      saveBackupDraftsToLocalStorage(updated);
      return updated;
    });
  }, [activeDraftId, truckNumber, truckPlate, truckAnden, positionsOccupied, observations, temp1er, temp2do, temp3er, closeTime, truckKilos, checklist, lingasPhotos, lingasComment, colchonetasPhotos, colchonetasComment, selectedZonals, photos]);

  // Cambiar entre borradores de camiones activos
  const switchActiveDraft = (newId: string) => {
    if (newId === activeDraftId) return;
    const target = truckDrafts.find(d => d.id === newId);
    if (target) {
      setActiveDraftId(newId);
      loadDraftIntoState(target);
    }
  };

  // Crear nuevo borrador de camión en paralelo
  const addNewTruckDraft = () => {
    const newDraft = createEmptyDraft();
    const updated = [...truckDrafts, newDraft];
    setTruckDrafts(updated);
    setActiveDraftId(newDraft.id);
    loadDraftIntoState(newDraft);
    syncDraftToSupabase(newDraft);
    saveBackupDraftsToLocalStorage(updated);
  };

  // Eliminar o descartar un borrador de camión específico SOLO TRAS CONFIRMACIÓN DEL USUARIO
  const deleteTruckDraft = async (draftId: string) => {
    const target = truckDrafts.find(d => d.id === draftId);
    const label = target?.selectedZonals?.length 
      ? target.selectedZonals.map(z => z.zonal_name).join(' - ')
      : (target?.truckNumber ? `Camión #${target.truckNumber}` : 'este camión en proceso');

    if (!window.confirm(`¿Deseas descartar el borrador para ${label}? Se eliminarán los datos de este camión.`)) return;

    // Ejecutar eliminación en Supabase SOLO si el usuario confirmó explícitamente
    await deleteDraftFromSupabase(draftId);

    const updated = truckDrafts.filter(d => d.id !== draftId);
    if (updated.length > 0) {
      setTruckDrafts(updated);
      saveBackupDraftsToLocalStorage(updated);
      if (activeDraftId === draftId) {
        const nextDraft = updated[0];
        setActiveDraftId(nextDraft.id);
        loadDraftIntoState(nextDraft);
      }
    } else {
      const fresh = createEmptyDraft();
      setTruckDrafts([fresh]);
      setActiveDraftId(fresh.id);
      loadDraftIntoState(fresh);
      syncDraftToSupabase(fresh);
      saveBackupDraftsToLocalStorage([fresh]);
    }
  };

  const clearDraft = (silent = false) => {
    if (!silent) {
      if (!window.confirm('¿Deseas descartar los datos del camión actual y reiniciar su formulario?')) return;
    }
    setEditingDispatchId(null);
    setTruckNumber('');
    setTruckPlate('');
    setTruckAnden('');
    setPositionsOccupied(26);
    setObservations('');
    setTemp1er(0);
    setTemp2do(0);
    setTemp3er(0);
    setCloseTime('');
    setTruckKilos('');
    setChecklist({ ...INITIAL_CHECKLIST });
    setLingasPhotos([]);
    setLingasComment('');
    setColchonetasPhotos([]);
    setColchonetasComment('');
    setSelectedZonals([]);
    setPhotos([]);
  };

  // Función para guardar avance explícitamente sin cerrar el formulario ni despachar
  const handleSaveProgress = async () => {
    if (!activeDraftId) return;

    setSaveProgressLoading(true);
    setDraftSaveStatus('saving');
    try {
      const fullChecklist = {
        ...checklist,
        lingas_photos: lingasPhotos,
        lingas_comment: lingasComment,
        colchonetas_photos: colchonetasPhotos,
        colchonetas_comment: colchonetasComment
      };

      const cleanPlate = (truckPlate || '').trim().toUpperCase();
      let targetId = activeDraftId;

      // Deduplicar de forma inteligente: si ya existe otro borrador con la misma patente, sobreescribir ese borrador
      if (cleanPlate) {
        const duplicateDraft = truckDrafts.find(d => 
          d.id !== activeDraftId && (d.truckPlate || '').trim().toUpperCase() === cleanPlate
        );
        if (duplicateDraft) {
          targetId = duplicateDraft.id;
          await deleteDraftFromSupabase(activeDraftId);
          setActiveDraftId(targetId);
        }
      }

      const nowIso = new Date().toISOString();
      const currentDraft: TruckDraft = {
        id: targetId,
        truckNumber: truckNumber || '',
        truckPlate: cleanPlate || truckPlate || '',
        truckAnden: truckAnden || '',
        positionsOccupied,
        observations,
        temp1er,
        temp2do,
        temp3er,
        closeTime,
        truckKilos,
        checklist: fullChecklist,
        selectedZonals,
        photos,
        createdAt: new Date().toISOString(),
        updatedAt: nowIso,
        supervisorName: supervisorName || '',
        createdBy: user?.email || ''
      };

      await syncDraftToSupabase(currentDraft);

      // Actualizar borradores locales y persistencia
      setTruckDrafts(prev => {
        const updated = prev.map(d => d.id === targetId ? currentDraft : d);
        saveBackupDraftsToLocalStorage(updated);
        return updated;
      });

      const now = new Date();
      setLastAutoSaveTime(now);
      setDraftSaveStatus('saved');

      const timeStr = now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setSaveProgressToast(`Avance guardado a las ${timeStr} hrs. Disponible en el Historial como "EN CARGA".`);

      setTimeout(() => {
        setSaveProgressToast(null);
      }, 5000);
    } catch (err) {
      console.error('Error al guardar avance:', err);
      setDraftSaveStatus('error');
      alert('Ocurrió un error al guardar el avance.');
    } finally {
      setSaveProgressLoading(false);
    }
  };

  // ── C: Guardar sin fotos con reintentos (hasta 3 intentos) ──────────────
  const autoSaveDraftTextOnly = async (retryCount = 0): Promise<boolean> => {
    if (!activeDraftId) return false;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 8000; // 8s entre reintentos
    try {
      // Construir el checklist SIN fotos (solo estados semáforo y comentarios)
      const checklistNoPhotos = {
        postura_anden:       (checklist as any).postura_anden,
        limpieza_estructura: (checklist as any).limpieza_estructura,
        luces_encendidas:    (checklist as any).luces_encendidas,
        separador_termico:   (checklist as any).separador_termico,
        lingas_camion:       (checklist as any).lingas_camion,
        colchonetas_comment: colchonetasComment,
        lingas_comment:      lingasComment,
        // fotos explícitamente excluidas para mantener payload liviano
      };

      // Zonales sin photos array
      const zonalsSinFotos = selectedZonals.map((z: any) => {
        const { photos: _p, ...rest } = z;
        return rest;
      });

      const nowIso = new Date().toISOString();

      await supabase.from('active_truck_drafts').upsert([{
        id: activeDraftId,
        truck_number:       truckNumber || '',
        truck_plate:        (truckPlate || '').trim().toUpperCase(),
        truck_anden:        truckAnden || '',
        positions_occupied: positionsOccupied ?? 26,
        observations:       observations || '',
        temp_1er:           temp1er ?? 0,
        temp_2do:           temp2do ?? 0,
        temp_3er:           temp3er ?? 0,
        close_time:         closeTime || '',
        truck_kilos:        truckKilos || '',
        checklist:          checklistNoPhotos,
        selected_zonals:    zonalsSinFotos,
        photos:             [], // sin fotos globales en auto-save
        supervisor_name:    supervisorName || '',
        created_by:         user?.email || '',
        updated_at:         nowIso
      }], { onConflict: 'id' });

      // Actualizar updatedAt en la copia local
      setTruckDrafts(prev => {
        const updated = prev.map(d => d.id === activeDraftId ? { ...d, updatedAt: nowIso } : d);
        saveBackupDraftsToLocalStorage(updated);
        return updated;
      });

      setAutoSaveRetries(0);
      return true;
    } catch (err) {
      if (retryCount < MAX_RETRIES - 1) {
        setAutoSaveRetries(retryCount + 1);
        await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
        return autoSaveDraftTextOnly(retryCount + 1);
      }
      setAutoSaveRetries(MAX_RETRIES);
      return false;
    }
  };


  // Cargar historial y retornos
  useEffect(() => {
    fetchHistory();
    fetchReturns();
    fetchZonalTargetTimes();
    fetchZonalDepartureLogs();
    fetchDelayLogbook();
  }, []);

  useEffect(() => {
    if (user?.email) {
      setSupervisorName(formatSupervisorName(user.email));
      setReturnSupervisor(formatSupervisorName(user.email));
    }
  }, [user]);

  // ── B: Marcar como "unsaved" cuando el usuario cambia datos del formulario ──
  useEffect(() => {
    if (!activeDraftId || isHydratingDraftRef.current) return;
    setDraftSaveStatus('unsaved');
  }, [
    truckNumber, truckPlate, truckAnden, positionsOccupied, observations,
    temp1er, temp2do, temp3er, closeTime, truckKilos,
    checklist, lingasPhotos, lingasComment, colchonetasPhotos, colchonetasComment,
    selectedZonals, photos, activeDraftId
  ]);

  // ── A: Auto-guardado cada 5 minutos (sin fotos) + C: reintentos ──────────
  useEffect(() => {
    if (!activeDraftId) return;
    const INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

    const run = async () => {
      if (draftSaveStatus === 'saving') return; // no solapar guardados
      setDraftSaveStatus('saving');
      const ok = await autoSaveDraftTextOnly();
      if (ok) {
        setLastAutoSaveTime(new Date());
        setDraftSaveStatus('saved');
      } else {
        setDraftSaveStatus('error');
      }
    };

    const interval = setInterval(run, INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeDraftId, draftSaveStatus]);

  const [historyPeriod, setHistoryPeriod] = useState<'hoy' | 'semana' | 'mes' | 'todo'>('hoy');

  const fetchFullDispatchDetail = async (id: string): Promise<DispatchRecord | null> => {
    try {
      const { data, error } = await supabase
        .from('pallet_dispatches')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) return null;
      setRecords(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
      return data as DispatchRecord;
    } catch (e) {
      console.warn("Error cargando detalle completo del despacho:", e);
      return null;
    }
  };

  const fetchHistory = async (period: 'hoy' | 'semana' | 'mes' | 'todo' = historyPeriod) => {
    setLoading(true);
    setHistoryPeriod(period);
    try {
      let query = supabase
        .from('v_pallet_dispatches')
        .select('*')
        .order('created_at', { ascending: false });

      const now = new Date();
      if (period === 'hoy') {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        query = query.gte('inspection_date', todayStr);
      } else if (period === 'semana') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const y = sevenDaysAgo.getFullYear();
        const m = String(sevenDaysAgo.getMonth() + 1).padStart(2, '0');
        const d = String(sevenDaysAgo.getDate()).padStart(2, '0');
        const weekStartStr = `${y}-${m}-${d}`;
        query = query.gte('inspection_date', weekStartStr);
      } else if (period === 'mes') {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const startOfMonth = `${year}-${month}-01`;
        query = query.gte('inspection_date', startOfMonth);
      } else {
        query = query.limit(500);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRecords(data || []);
    } catch (err: any) {
      console.error('Error cargando historial:', err);
      setErrorMsg('No se pudo cargar el historial de despachos.');
    } finally {
      setLoading(false);
    }
  };

  const fetchReturns = async () => {
    try {
      const { data, error } = await supabase
        .from('pallet_returns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReturnsList(data || []);
    } catch (err) {
      console.error('Error cargando retornos:', err);
    }
  };

  // Mapa para expandir/ocultar pallets de madera y plástico en congelados, estándar y bandejas
  const [showWoodMap, setShowWoodMap] = useState<{ [key: string]: boolean }>({});
  const toggleWoodShow = (zonalIndex: number, catName: string) => {
    const key = `${zonalIndex}_${catName}`;
    setShowWoodMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const [showPlasticMap, setShowPlasticMap] = useState<{ [key: string]: boolean }>({});
  const togglePlasticShow = (zonalIndex: number, catName: string) => {
    const key = `${zonalIndex}_${catName}`;
    setShowPlasticMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddZonalPhoto = async (zonalIndex: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const updated = [...selectedZonals];
    const currentPhotos = [...(updated[zonalIndex].photos || [])];
    const remaining = 10 - currentPhotos.length;
    const toProcess = fileArray.slice(0, remaining);

    for (const f of toProcess) {
      try {
        const compressed = await compressImage(f);
        currentPhotos.push(compressed);
      } catch (err) {
        console.error('Error al procesar foto:', err);
      }
    }

    updated[zonalIndex] = {
      ...updated[zonalIndex],
      photos: currentPhotos
    };
    setSelectedZonals(updated);
  };

  const handleRemoveZonalPhoto = (zonalIndex: number, photoIndex: number) => {
    const updated = [...selectedZonals];
    const currentPhotos = [...(updated[zonalIndex].photos || [])];
    currentPhotos.splice(photoIndex, 1);
    updated[zonalIndex] = {
      ...updated[zonalIndex],
      photos: currentPhotos
    };
    setSelectedZonals(updated);
  };

  const handleAddZonal = () => {
    if (selectedZonals.length >= 4) {
      alert("Un camión puede llevar un máximo de 4 zonales (según planilla de despacho).");
      return;
    }

    const availableZonal = ZONALES_LIST[0]; // Primer zonal de la lista por defecto
    const posiciones = ["1° (Fondo)", "2°", "3°", "4° (Puerta)"];
    const newZonal: ZonalDetail = {
      zonal_name: availableZonal,
      viaje_numero: 1,
      lugar_camion: posiciones[selectedZonals.length] || '1° (Fondo)',
      congelados: { kilos: 0, wood_bases: 0, wood_extra: 0, plastic_bases: 0, plastic_extra: 0 },
      estandar: { kilos: 0, wood_bases: 0, wood_extra: 0, plastic_bases: 0, plastic_extra: 0 },
      bandejas: { kilos: 0, wood_bases: 0, wood_extra: 0, plastic_bases: 0, plastic_extra: 0, bandejas_count: 0 },
      sello: '',
      photos: []
    };

    setSelectedZonals([...selectedZonals, newZonal]);
    setExpandedZonalIndex(selectedZonals.length);
  };

  const handleRemoveZonal = (index: number) => {
    const zonal = selectedZonals[index];
    const zName = zonal?.zonal_name || `Zonal #${index + 1}`;
    const t = getZonalTotals(zonal);
    const hasData = t.wood > 0 || t.plastic > 0 || t.bandejas > 0 || !!zonal?.sello || (zonal?.photos && zonal.photos.length > 0);

    const confirmMsg = hasData
      ? `⚠️ ¿Eliminar Zonal "${zName}"?\n\nEste zonal ya tiene datos cargados (${t.wood} madera, ${t.plastic} plástico, ${t.bandejas} bandejas, ${(zonal.photos || []).length} fotos). Si continúas se borrarán.`
      : `¿Estás seguro de quitar el zonal "${zName}" de la lista de carga?`;

    if (!window.confirm(confirmMsg)) return;

    const updated = selectedZonals.filter((_, i) => i !== index);
    setSelectedZonals(updated);
    if (expandedZonalIndex === index) {
      setExpandedZonalIndex(updated.length > 0 ? 0 : null);
    } else if (expandedZonalIndex !== null && expandedZonalIndex > index) {
      setExpandedZonalIndex(expandedZonalIndex - 1);
    }
  };

  const handleUpdateZonal = (index: number, field: keyof ZonalDetail, value: any) => {
    const updated = [...selectedZonals];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setSelectedZonals(updated);
  };

  const handleUpdateCategory = (
    zonalIndex: number, 
    category: 'congelados' | 'estandar' | 'bandejas', 
    field: keyof CategoryData, 
    value: number
  ) => {
    const updated = [...selectedZonals];
    const catData = { ...updated[zonalIndex][category] };
    
    // Evitar valores negativos
    const safeValue = Math.max(0, value);
    (catData as any)[field] = safeValue;
    
    updated[zonalIndex] = {
      ...updated[zonalIndex],
      [category]: catData as CategoryData
    };
    setSelectedZonals(updated);
  };

  // Asistente de Bandejas (45, 40, 35, 30, 25, 20 + restante)
  const openBandejasHelper = (index: number) => {
    setShowBandejasHelper(index);
    setHelper45(0);
    setHelper40(0);
    setHelper35(0);
    setHelper30(0);
    setHelper25(0);
    setHelper20(0);
    setHelperRestante(0);
  };

  const applyBandejasHelper = () => {
    if (showBandejasHelper === null) return;
    const parts = [];
    if (helper45 > 0) parts.push(`45x${helper45}`);
    if (helper40 > 0) parts.push(`40x${helper40}`);
    if (helper35 > 0) parts.push(`35x${helper35}`);
    if (helper30 > 0) parts.push(`30x${helper30}`);
    if (helper25 > 0) parts.push(`25x${helper25}`);
    if (helper20 > 0) parts.push(`20x${helper20}`);
    if (helperRestante > 0) parts.push(`${helperRestante}`);
    const formulaText = parts.length > 0 ? parts.join(' + ') : '0';
    const totalBandejas = (helper45 * 45) + (helper40 * 40) + (helper35 * 35) + (helper30 * 30) + (helper25 * 25) + (helper20 * 20) + Math.max(0, Number(helperRestante || 0));
    const totalPallets = helper45 + helper40 + helper35 + helper30 + helper25 + helper20;
    
    const updated = [...selectedZonals];
    const bandejasData = { ...updated[showBandejasHelper].bandejas };
    bandejasData.bandejas_count = totalBandejas;
    bandejasData.bandejas_formula = formulaText;
    if (totalPallets > 0) {
      bandejasData.plastic_bases = totalPallets;
    }
    
    updated[showBandejasHelper] = {
      ...updated[showBandejasHelper],
      bandejas: bandejasData
    };
    
    setSelectedZonals(updated);
    setShowBandejasHelper(null);
  };

  // Helper para formatear automáticamente conteos simples a formato de fórmula (ej: 400 -> 40x10)
  const formatBandejasCount = (count: number, formula?: string) => {
    if (formula && formula.trim() && formula !== '0') return formula;
    if (!count || count <= 0) return '';
    if (count % 40 === 0) return `40x${count / 40}`;
    if (count % 45 === 0) return `45x${count / 45}`;
    if (count % 35 === 0) return `35x${count / 35}`;
    if (count % 30 === 0) return `30x${count / 30}`;
    if (count % 25 === 0) return `25x${count / 25}`;
    const full40 = Math.floor(count / 40);
    const rem = count % 40;
    if (full40 > 0) {
      return rem > 0 ? `40x${full40} + ${rem}` : `40x${full40}`;
    }
    return `${count}`;
  };

  // Helper para obtener el nombre base absoluto de un zonal (ej: "CHILLÁN 2 (2)" -> "CHILLÁN")
  const getBaseZonalName = (fullName: string): string => {
    if (!fullName) return '';
    let clean = fullName.replace(/\s*\(\d+\)\s*/g, '').trim();
    // Eliminar TODOS los números al final (ej: "VIÑA DEL MAR 2 2" → "VIÑA DEL MAR")
    clean = clean.replace(/(\s+\d+)+$/g, '').trim();
    const matched = ZONALES_LIST.find(z => z.toLowerCase() === clean.toLowerCase());
    return matched || clean.toUpperCase();
  };

  // Cálculo de balances agregados por Zonal
  const getZonalBalances = () => {
    const balances: { [key: string]: { wood_sent: number; plastic_sent: number; wood_ret: number; plastic_ret: number; last_dispatch_date?: string | null } } = {};

    ZONALES_LIST.forEach(z => {
      balances[z] = { wood_sent: 0, plastic_sent: 0, wood_ret: 0, plastic_ret: 0, last_dispatch_date: null };
    });

    records.forEach(rec => {
      rec.zonals_detail.forEach(zd => {
        const rawName = (zd.zonal_name || '').replace(/\s+\d+$/, '').trim();
        const name = ZONALES_LIST.find(z => z.toLowerCase() === rawName.toLowerCase()) || zd.zonal_name;

        if (balances[name]) {
          const wood = 
            (zd.congelados?.wood_bases || 0) + (zd.congelados?.wood_extra || 0) +
            (zd.estandar?.wood_bases || 0) + (zd.estandar?.wood_extra || 0) +
            (zd.bandejas?.wood_bases || 0) + (zd.bandejas?.wood_extra || 0);

          const plastic = 
            (zd.congelados?.plastic_bases || 0) + (zd.congelados?.plastic_extra || 0) +
            (zd.estandar?.plastic_bases || 0) + (zd.estandar?.plastic_extra || 0) +
            (zd.bandejas?.plastic_bases || 0) + (zd.bandejas?.plastic_extra || 0);

          balances[name].wood_sent += wood;
          balances[name].plastic_sent += plastic;

          if (!balances[name].last_dispatch_date && rec.inspection_date) {
            balances[name].last_dispatch_date = rec.inspection_date;
          }
        }
      });
    });

    returnsList.forEach(ret => {
      const name = ret.zonal_name;
      if (balances[name]) {
        balances[name].wood_ret += (ret.wood_returned || 0);
        balances[name].plastic_ret += (ret.plastic_returned || 0);
      }
    });

    return balances;
  };

  // Cálculo de totales por Zonal (Formulario actual)
  const getZonalTotals = (zonal: ZonalDetail) => {
    const wood = 
      zonal.congelados.wood_bases + zonal.congelados.wood_extra +
      zonal.estandar.wood_bases + zonal.estandar.wood_extra +
      zonal.bandejas.wood_bases + zonal.bandejas.wood_extra;

    const plastic = 
      zonal.congelados.plastic_bases + zonal.congelados.plastic_extra +
      zonal.estandar.plastic_bases + zonal.estandar.plastic_extra +
      zonal.bandejas.plastic_bases + zonal.bandejas.plastic_extra;

    const bandejas = zonal.bandejas.bandejas_count || 0;

    return { wood, plastic, bandejas };
  };

  // Totales de todo el Camión (Formulario actual)
  const getCamionTotals = () => {
    return selectedZonals.reduce(
      (acc, zonal) => {
        const t = getZonalTotals(zonal);
        const bases = (zonal.congelados.wood_bases || 0) + (zonal.congelados.plastic_bases || 0) +
                      (zonal.estandar.wood_bases || 0) + (zonal.estandar.plastic_bases || 0) +
                      (zonal.bandejas.wood_bases || 0) + (zonal.bandejas.plastic_bases || 0);
        return {
          wood: acc.wood + t.wood,
          plastic: acc.plastic + t.plastic,
          bandejas: acc.bandejas + t.bandejas,
          bases: acc.bases + bases
        };
      },
      { wood: 0, plastic: 0, bandejas: 0, bases: 0 }
    );
  };

  // Helper para convertir imagen a Base64 y evitar problemas de renderizado en html2canvas
  const getLogoBase64 = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => resolve(url);
        reader.readAsDataURL(blob);
      });
    } catch {
      return url;
    }
  };

  // Generar, Previsualizar e Imprimir / Descargar PDF de Despacho usando html2canvas + jsPDF
  const handleProcessPDF = async (rec: DispatchRecord, mode: 'preview' | 'download' = 'preview') => {
    if (generatingPdfId) return;
    setGeneratingPdfId(rec.id);

    let container: HTMLDivElement | null = null;
    try {
      // Cargar la firma base64 y datos completos (incluyendo sellos) si no están presentes
      const needsFullDetail = (rec.signed_by && !rec.signature_b64) ||
        rec.zonals_detail?.some((z: any) => z.sello === undefined || z.sello === null);
      if (needsFullDetail) {
        const detail = await fetchFullDispatchDetail(rec.id);
        if (detail) {
          rec = {
            ...rec,
            signature_b64: detail.signature_b64 ?? rec.signature_b64,
            // zonals_detail del registro completo incluye el sello y photos
            zonals_detail: detail.zonals_detail ?? rec.zonals_detail,
          };
        }
      }

      // Convertir el logo a Base64 para incrustación directa sin llamadas de red
      const logoBase64 = await getLogoBase64(cialLogo);

      // Datos del firmante para el PDF
      const signerUser = palletUsers.find(u => u.email.toLowerCase() === (rec.signed_by || '').toLowerCase());
      const signerName = signerUser?.display_name || (rec.signed_by ? formatSupervisorName(rec.signed_by) : 'JEFE DE TURNO');
      const signerTitle = rec.signed_by_title || signerUser?.notes?.trim() || (signerUser?.role === 'admin' ? 'Administrador' : signerUser?.role === 'jefe_turno' ? 'Jefe de Turno' : 'Supervisor');

      // 1. Obtener los renglones correspondientes a los 4 zonales (con vacíos si son menos de 4)
      const rows: string[] = [];
      for (let i = 0; i < 4; i++) {
        const z = rec.zonals_detail[i];
        if (z) {
          const wood = z.congelados.wood_bases + z.congelados.wood_extra +
                       z.estandar.wood_bases + z.estandar.wood_extra +
                       z.bandejas.wood_bases + z.bandejas.wood_extra;
          const plastic = z.congelados.plastic_bases + z.congelados.plastic_extra +
                          z.estandar.plastic_bases + z.estandar.plastic_extra +
                          z.bandejas.plastic_bases + z.bandejas.plastic_extra;
          const bandejas = z.bandejas.bandejas_count || 0;
          
          rows.push(`
            <tr style="text-align: center; font-size: 11px; height: 30px;">
              <td style="border: 1px solid #000; padding: 4px 5px; font-weight: bold; font-family: monospace;">${i + 1}</td>
              <td style="border: 1px solid #000; padding: 4px 5px; text-align: left; font-weight: bold; text-transform: uppercase; font-family: sans-serif;">
                ${z.zonal_name} 
                <span style="font-size: 8px; color: #555; font-weight: normal; margin-left: 4px;">(${z.lugar_camion})</span>
              </td>
              <td style="border: 1px solid #000; padding: 4px 5px; font-weight: bold; font-family: monospace; font-size: 11px;">${bandejas > 0 ? bandejas : '—'}</td>
              <td style="border: 1px solid #000; padding: 4px 5px; font-weight: bold; font-family: monospace; font-size: 11px;">${wood > 0 ? wood : 'X'}</td>
              <td style="border: 1px solid #000; padding: 4px 5px; font-weight: bold; font-family: monospace; font-size: 11px;">${plastic > 0 ? plastic : 'X'}</td>
              <td style="border: 1px solid #000; padding: 4px 5px; font-weight: bold; font-family: monospace; font-size: 11px;">${z.sello || ''}</td>
            </tr>
          `);
        } else {
          rows.push(`
            <tr style="text-align: center; font-size: 11px; height: 30px;">
              <td style="border: 1px solid #000; padding: 4px 5px; font-weight: bold; font-family: monospace; color: #ccc;">${i + 1}</td>
              <td style="border: 1px solid #000; padding: 4px 5px; text-align: left; color: #ccc;">—</td>
              <td style="border: 1px solid #000; padding: 4px 5px; color: #ccc;">—</td>
              <td style="border: 1px solid #000; padding: 4px 5px; color: #ccc;">—</td>
              <td style="border: 1px solid #000; padding: 4px 5px; color: #ccc;">—</td>
              <td style="border: 1px solid #000; padding: 4px 5px; color: #ccc;">—</td>
            </tr>
          `);
        }
      }

      // Totales agregados
      const totalW = rec.zonals_detail.reduce((sum, z) => sum + z.congelados.wood_bases + z.congelados.wood_extra + z.estandar.wood_bases + z.estandar.wood_extra + z.bandejas.wood_bases + z.bandejas.wood_extra, 0);
      const totalP = rec.zonals_detail.reduce((sum, z) => sum + z.congelados.plastic_bases + z.congelados.plastic_extra + z.estandar.plastic_bases + z.estandar.plastic_extra + z.bandejas.plastic_bases + z.bandejas.plastic_extra, 0);
      const totalB = rec.zonals_detail.reduce((sum, z) => sum + (z.bandejas.bandejas_count || 0), 0);

      const altoBandejasFormulas = rec.zonals_detail
        .filter(z => (z.bandejas.bandejas_count || 0) > 0 || z.bandejas.bandejas_formula)
        .map(z => {
          const formulaStr = formatBandejasCount(z.bandejas.bandejas_count || 0, z.bandejas.bandejas_formula);
          return formulaStr ? `(${formulaStr} ${z.zonal_name})` : null;
        })
        .filter(Boolean)
        .join(' ');

      const pdfHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 9.5px; width: 750px; padding: 18px 22px; box-sizing: border-box; background-color: #ffffff; color: #000000; margin: 0 auto; line-height: 1.25;">
          
          <!-- Header -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 7px;">
            <tr>
              <td style="width: 25%; border: 1px solid #000; text-align: center; padding: 5px; vertical-align: middle;">
                <img src="${logoBase64}" style="height: 44px; width: auto; object-fit: contain;" />
              </td>
              <td style="width: 50%; border: 1px solid #000; text-align: center; padding: 5px; vertical-align: middle;">
                <div style="font-size: 13px; font-weight: 900; letter-spacing: 0.5px; font-family: sans-serif;">CHECK LIST CAMIONES SUR Y NORTE</div>
                <div style="font-size: 8.5px; margin-top: 2px; font-weight: bold; color: #444; font-family: sans-serif;">(Archivados) En oficina del Jefe de turno</div>
              </td>
              <td style="width: 25%; border: 1px solid #000; text-align: center; padding: 5px; vertical-align: middle; background-color: #fafafa;">
                <div style="font-size: 7.5px; font-weight: 800; color: #666; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;">NUMERO CAMIÓN</div>
                <div style="font-size: 18px; font-weight: 900; margin-top: 2px; font-family: monospace; color: #000;">${rec.truck_number !== 'N/A' ? rec.truck_number : 'S/A'}</div>
              </td>
            </tr>
          </table>

          <!-- Datos generales -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 7px; font-size: 9px;">
            <tr style="height: 24px;">
              <td style="width: 65%; border: 1px solid #000; padding: 4px 6px;"><strong>ZONALES:</strong> <span style="font-weight: 900; text-transform: uppercase; font-size: 12.5px; color: #000;">${rec.zonals_detail.map(z => z.zonal_name).join(' - ')}</span></td>
              <td style="width: 35%; border: 1px solid #000; padding: 4px 6px;"><strong>PATENTE:</strong> <span style="font-family: monospace; font-weight: 900; font-size: 12.5px; color: #000;">${rec.truck_plate !== 'N/A' ? rec.truck_plate : 'S/A'}</span></td>
            </tr>
            <tr style="height: 24px;">
              <td style="border: 1px solid #000; padding: 4px 6px;"><strong>Hora Inspección:</strong> <span style="font-family: monospace; font-weight: 900; font-size: 12.5px; color: #000;">${rec.inspection_time}</span></td>
              <td style="border: 1px solid #000; padding: 4px 6px;"><strong>FECHA:</strong> <span style="font-family: monospace; font-weight: 900; font-size: 12.5px; color: #000;">${getFormatDate(rec.inspection_date)}</span></td>
            </tr>
          </table>

          <!-- Checklist de rampa -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 7px; font-size: 9px;">
            <thead>
              <tr style="background-color: #f3f4f6; font-weight: 900; text-align: center; height: 21px;">
                <th style="border: 1px solid #000; padding: 3px 6px; text-align: left; width: 70%; font-size: 8.5px; letter-spacing: 0.5px;">ITEMS DE INSPECCIÓN</th>
                <th style="border: 1px solid #000; padding: 3px 6px; width: 15%; font-size: 8px;">CUMPLE</th>
                <th style="border: 1px solid #000; padding: 3px 6px; width: 15%; font-size: 8px;">NO CUMPLE</th>
              </tr>
            </thead>
            <tbody>
              <tr style="height: 22px;">
                <td style="border: 1px solid #000; padding: 2px 6px; font-weight: bold; vertical-align: middle;">1. Horario de postura en el Andén</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.postura_anden ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.postura_anden ? 'X' : ''}</td>
              </tr>
              <tr style="height: 22px;">
                <td style="border: 1px solid #000; padding: 2px 6px; font-weight: bold; vertical-align: middle;">2. Estado de camión a Cargar (Limpieza, Daño estructural)</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.limpieza_estructura ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.limpieza_estructura ? 'X' : ''}</td>
              </tr>
              <tr style="height: 22px;">
                <td style="border: 1px solid #000; padding: 2px 6px; font-weight: bold; vertical-align: middle;">3. Estado de Luces (ENCENDIDAS)</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.luces_encendidas ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.luces_encendidas ? 'X' : ''}</td>
              </tr>
              <tr style="height: 22px;">
                <td style="border: 1px solid #000; padding: 2px 6px; font-weight: bold; vertical-align: middle;">4. Verificación Separador Térmico</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.separador_termico ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.separador_termico ? 'X' : ''}</td>
              </tr>
              <tr style="height: 22px;">
                <td style="border: 1px solid #000; padding: 2px 6px; font-weight: bold; vertical-align: middle;">5. Verificación Lingas por camión</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.lingas_camion ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 12.5px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.lingas_camion ? 'X' : ''}</td>
              </tr>
            </tbody>
          </table>

          <!-- Posiciones ocupadas -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 7px; font-size: 9px;">
            <tr style="height: 23px;">
              <td style="width: 40%; border: 1px solid #000; padding: 4px 6px;"><strong>Posiciones ocupadas dentro del camión:</strong> <span style="font-family: monospace; font-weight: 900; font-size: 12.5px; color: #000;">${rec.positions_occupied}</span></td>
              <td style="width: 60%; border: 1px solid #000; padding: 4px 6px; font-size: 8.5px;"><strong>Alto de Bandejas:</strong> <span style="font-family: monospace; font-weight: 900; font-size: 11px; color: #000;">${altoBandejasFormulas || ''}</span></td>
            </tr>
            <tr style="height: 23px;">
              <td colspan="2" style="border: 1px solid #000; padding: 4px 6px;"><strong>Motivos del alto:</strong> </td>
            </tr>
          </table>

          <!-- Tabla principal de carga -->
          <div style="font-size: 10px; font-weight: 900; text-align: center; margin-top: 8px; margin-bottom: 4px; letter-spacing: 0.5px; text-transform: uppercase; font-family: sans-serif;">CARGA DE ZONALES</div>
          <div style="display: flex; width: 100%; margin-bottom: 7px; gap: 0; box-sizing: border-box; align-items: stretch;">
            
            <!-- Tabla de Zonales (6 celdas por fila, ancho 86%) -->
            <table style="width: 86%; border-collapse: collapse; border: 2px solid #000; border-right: none; font-size: 9px; box-sizing: border-box; table-layout: fixed;">
              <thead>
                <tr style="background-color: #f3f4f6; font-weight: 900; text-align: center; font-size: 8px; height: 22px;">
                  <th style="border: 1px solid #000; padding: 3px; width: 6%;">N°</th>
                  <th style="border: 1px solid #000; padding: 3px; width: 34%; text-align: left;">ZONAL</th>
                  <th style="border: 1px solid #000; padding: 3px; width: 15%;">BANDEJAS</th>
                  <th style="border: 1px solid #000; padding: 3px; width: 15%;">PALLETS MADERA</th>
                  <th style="border: 1px solid #000; padding: 3px; width: 15%;">PALLETS PLÁSTICO</th>
                  <th style="border: 1px solid #000; padding: 3px; width: 15%;">N° DE SELLO</th>
                </tr>
              </thead>
              <tbody>
                ${rows.join('')}
              </tbody>
            </table>

            <!-- Cuadro de Temperaturas de Termos (ancho 14%, acoplado) -->
            <div style="width: 14%; border: 2px solid #000; display: flex; flex-direction: column; box-sizing: border-box; background-color: #fff;">
              <div style="background-color: #f3f4f6; border-bottom: 1px solid #000; padding: 3px; text-align: center; font-weight: 900; font-size: 7.5px; height: 22px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; line-height: 1.1;">
                TEMPERATURA TERMO / °C
              </div>
              
              <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; height: 120px; box-sizing: border-box;">
                
                <!-- 1ER -->
                <div style="display: flex; height: 33.3%; align-items: center; border-bottom: 1px solid #000; box-sizing: border-box;">
                  <div style="width: 45%; font-weight: bold; font-size: 7.5px; text-align: center; background-color: #f9f9f9; height: 100%; display: flex; align-items: center; justify-content: center; border-right: 1px solid #000;">1ER</div>
                  <div style="width: 55%; font-weight: 900; font-family: monospace; font-size: 12px; text-align: center; color: #000;">${rec.temp_1er}°C</div>
                </div>
                
                <!-- 2DO -->
                <div style="display: flex; height: 33.3%; align-items: center; border-bottom: 1px solid #000; box-sizing: border-box;">
                  <div style="width: 45%; font-weight: bold; font-size: 7.5px; text-align: center; background-color: #f9f9f9; height: 100%; display: flex; align-items: center; justify-content: center; border-right: 1px solid #000;">2DO</div>
                  <div style="width: 55%; font-weight: 900; font-family: monospace; font-size: 12px; text-align: center; color: #000;">${rec.temp_2do}°C</div>
                </div>
                
                <!-- 3ER -->
                <div style="display: flex; height: 33.3%; align-items: center; box-sizing: border-box;">
                  <div style="width: 45%; font-weight: bold; font-size: 7.5px; text-align: center; background-color: #f9f9f9; height: 100%; display: flex; align-items: center; justify-content: center; border-right: 1px solid #000;">3ER</div>
                  <div style="width: 55%; font-weight: 900; font-family: monospace; font-size: 12px; text-align: center; color: #000;">${rec.temp_3er}°C</div>
                </div>

              </div>
            </div>

          </div>

          <!-- Observaciones y firmas -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 9px;">
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 5px 6px; height: 28px; vertical-align: top; font-size: 8.5px;">
                <strong>OBSERVACIONES:</strong> <span style="font-weight: 600;">${rec.observations || ''}</span>
              </td>
            </tr>
            ${(() => {
              const zonalPhotos = rec.zonals_detail.flatMap(z => z.photos || []);
              const legacyPhotos = (rec.checklist as any)?.photos || [];
              const allPhotos = [...zonalPhotos, ...legacyPhotos];
              if (allPhotos.length === 0) return '';

              // Tamaño dinámico balanceado de fotos para aprovechar el espacio de forma óptima
              let photoHeight = '65px';
              if (allPhotos.length > 8) {
                photoHeight = '50px';
              } else if (allPhotos.length > 4) {
                photoHeight = '56px';
              }

              return `
                <tr>
                  <td colspan="2" style="border: 1px solid #000; padding: 4px 6px; background-color: #fafafa;">
                    <div style="font-size: 8px; font-weight: 900; text-transform: uppercase; margin-bottom: 3px; color: #111;">RESPALDOS FOTOGRÁFICOS (${allPhotos.length}):</div>
                    <div style="display: flex; gap: 5px; margin-top: 2px; flex-wrap: wrap; align-items: center;">
                      ${allPhotos.map((pUrl: string) => `<img src="${pUrl}" style="height: ${photoHeight}; width: auto; max-width: 24%; object-fit: cover; border: 1.5px solid #000; border-radius: 4px;" />`).join('')}
                    </div>
                  </td>
                </tr>
              `;
            })()}
            <tr>
              <td style="width: 55%; border: 1px solid #000; padding: 4px 6px; vertical-align: top; height: 30px;">
                <strong>SUP. ENCARGADO:</strong> <span style="font-weight: 900; text-transform: uppercase; font-size: 12.5px; color: #000;">${rec.supervisor_name}</span>
              </td>
              <td rowspan="2" style="width: 45%; border: 1px solid #000; padding: 4px 6px; text-align: center; vertical-align: middle; height: 66px; background-color: #fafafa;">
                ${rec.signature_b64 ? `
                  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; box-sizing: border-box; padding: 1px;">
                    <img src="${rec.signature_b64}" style="height: 34px; width: auto; max-width: 95%; object-fit: contain; margin-top: -2px; margin-bottom: 2px;" />
                    <div style="font-size: 8px; font-weight: 900; color: #000; text-transform: uppercase; line-height: 1;">${signerName}</div>
                    <div style="font-size: 7px; font-weight: 800; color: #333; text-transform: uppercase; line-height: 1.1; margin-top: 1px;">${signerTitle}</div>
                    <div style="font-size: 6.5px; color: #666; margin-top: 1px; line-height: 1;">Firma Digital: ${rec.signed_at ? new Date(rec.signed_at).toLocaleDateString('es-CL') : ''}</div>
                  </div>
                ` : `
                  <div style="font-size: 7.5px; color: #555; font-weight: bold; text-transform: uppercase; margin-bottom: 22px; letter-spacing: 0.5px;">Timbre y Firma</div>
                  <div style="border-top: 1.5px dashed #000; width: 85%; margin: 0 auto;"></div>
                `}
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 4px 6px; height: 30px;">
                <strong>HORA CIERRE DE CAMION:</strong> <span style="font-family: monospace; font-weight: 900; font-size: 12.5px; color: #000; margin-left: 2px;">${rec.close_time ? `${rec.close_time} hrs` : 'Pendiente'}</span>
              </td>
            </tr>
            <tr style="height: 24px;">
              <td colspan="2" style="border: 1px solid #000; padding: 4px 6px; background-color: #fcfcfc;">
                <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 8.5px; text-transform: uppercase;">
                  <span>KILOS TOTALES DEL CAMIÓN: <strong style="font-family: monospace; font-size: 12.5px; font-weight: 900; color: #000; margin-left: 2px;">${rec.truck_kilos ? (typeof rec.truck_kilos === 'number' ? rec.truck_kilos.toLocaleString('es-CL') : rec.truck_kilos) + ' kg' : '___________________________'}</strong></span>
                  <span style="font-family: monospace; padding-right: 10px; font-size: 12.5px; font-weight: 900; color: #000;">TOTALES DESPACHO: M:${totalW} | P:${totalP} | B:${totalB}</span>
                </div>
              </td>
            </tr>
          </table>
          
          <div style="font-size: 7.5px; font-weight: bold; color: #666; text-align: center; margin-top: 8px; letter-spacing: 0.5px; text-transform: uppercase;">CONTROL UNIDADES LOGÍSTICAS — CIAL ALIMENTOS</div>
        </div>
      `;

      // Crear un nodo contenedor visible
      container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.top = '0';
      container.style.left = '0';
      container.style.width = '750px';
      container.style.backgroundColor = '#ffffff';
      container.style.zIndex = '999999';
      container.style.boxSizing = 'border-box';
      container.innerHTML = pdfHtml;
      document.body.appendChild(container);

      // Esperar decodificación total de imágenes
      const imgs = Array.from(container.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((res) => {
            img.onload = res;
            img.onerror = res;
          });
        })
      );

      // Capturar usando html2canvas optimizado
      const canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 800
      });

      // Convertir el canvas resultante a Data URL (JPEG calidad 0.92)
      const imgData = canvas.toDataURL('image/jpeg', 0.92);

      // Crear documento jsPDF de página 'letter' en milímetros
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter'
      });

      // Dimensiones de hoja Letter: 215.9 x 279.4 mm
      const pageWidth = 215.9;
      const pageHeight = 279.4;
      const minMarginX = 7;
      const minMarginY = 6;
      const maxPrintWidth = pageWidth - (minMarginX * 2);
      const maxPrintHeight = pageHeight - (minMarginY * 2);

      // Escalar para ocupar el máximo espacio disponible en la hoja Letter
      let printWidth = maxPrintWidth;
      let printHeight = (canvas.height * printWidth) / canvas.width;

      if (printHeight > maxPrintHeight) {
        printHeight = maxPrintHeight;
        printWidth = (canvas.width * printHeight) / canvas.height;
      }

      // Centrar perfectamente tanto en horizontal como en vertical
      const posX = minMarginX + (maxPrintWidth - printWidth) / 2;
      const posY = Math.max(minMarginY, (pageHeight - printHeight) / 2);

      pdf.addImage(imgData, 'JPEG', posX, posY, printWidth, printHeight);

      const filename = `Despacho_Camion_${rec.truck_plate || 'SinPatente'}_${rec.inspection_date}.pdf`;

      if (mode === 'download') {
        pdf.save(filename);
      } else {
        const blobUrl = String(pdf.output('bloburl'));
        setPdfPreviewModal({ rec, blobUrl, pdfObj: pdf, htmlTemplate: pdfHtml });
      }

    } catch (err: any) {
      console.error("Error al generar PDF:", err);
      alert("Ocurrió un inconveniente al generar el PDF. Inténtalo nuevamente.");
    } finally {
      if (container && document.body.contains(container)) {
        document.body.removeChild(container);
      }
      setGeneratingPdfId(null);
    }
  };

  // Cargar un despacho guardado desde el historial directamente a la pantalla de Despacho Camión para reeditarlo
  const openEditDispatchInForm = async (rec: DispatchRecord) => {
    const today = getChileDateString();
    const isToday = rec.inspection_date === today;
    if (!isAdmin && !isToday) {
      alert("⚠️ Acción no permitida:\n\nLos supervisores y jefes de turno solo pueden editar despachos del mismo día en horario de Chile.\n\nSolo los administradores pueden modificar registros históricos de días anteriores.");
      return;
    }

    let fullRec = rec;
    const clCheck = (rec.checklist as any) || {};
    if (!clCheck.photos && !clCheck.colchonetas_photos && !clCheck.lingas_photos) {
      const detail = await fetchFullDispatchDetail(rec.id);
      if (detail) fullRec = detail;
    }

    setEditingDispatchId(fullRec.id);
    setSupervisorName(fullRec.supervisor_name || formatSupervisorName(user?.email));
    setTruckNumber(fullRec.truck_number !== 'N/A' ? fullRec.truck_number : '');
    setTruckPlate(fullRec.truck_plate !== 'N/A' ? fullRec.truck_plate : '');
    setTruckAnden(fullRec.anden_number || '');
    setPositionsOccupied(fullRec.positions_occupied || 26);
    setObservations(fullRec.observations || '');
    setTemp1er(fullRec.temp_1er ?? 0);
    setTemp2do(fullRec.temp_2do ?? 0);
    setTemp3er(fullRec.temp_3er ?? 0);
    setCloseTime(fullRec.close_time || '');
    setTruckKilos(fullRec.truck_kilos ? String(fullRec.truck_kilos) : '');

    const cl = (fullRec.checklist as any) || {};
    setChecklist({
      postura_anden: cl.postura_anden !== false,
      limpieza_estructura: cl.limpieza_estructura !== false,
      luces_encendidas: cl.luces_encendidas !== false,
      separador_termico: cl.separador_termico !== false,
      lingas_camion: cl.lingas_camion !== false
    });
    setLingasPhotos(cl.lingas_photos || []);
    setLingasComment(cl.lingas_comment || '');
    setColchonetasPhotos(cl.colchonetas_photos || []);
    setColchonetasComment(cl.colchonetas_comment || '');
    setPhotos(cl.photos || []);

    setSelectedZonals(JSON.parse(JSON.stringify(fullRec.zonals_detail || [])));

    setActiveTab('nuevo');
  };

  const cancelEditDispatch = () => {
    setEditingDispatchId(null);
    clearDraft();
  };

  // Guardar edición completa de despacho
  const handleSaveEditDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDispatchRecord) return;

    const today = getChileDateString();
    const isToday = editingDispatchRecord.inspection_date === today;
    if (!isAdmin && !isToday) {
      alert("⚠️ Solo los administradores pueden guardar modificaciones en despachos de días anteriores.");
      return;
    }

    setEditingSaveLoading(true);

    try {
      const { error } = await supabase
        .from('pallet_dispatches')
        .update({
          inspection_date: editingDate,
          inspection_time: editingTime,
          close_time: editingCloseTime || null,
          truck_kilos: editingTruckKilos || null,
          anden_number: editingTruckAnden || null,
          truck_number: editingTruckNumber || 'N/A',
          truck_plate: editingTruckPlate || 'N/A',
          supervisor_name: editingSupervisorName,
          positions_occupied: editingPositions,
          temp_1er: editingTemp1er,
          temp_2do: editingTemp2do,
          temp_3er: editingTemp3er,
          zonals_detail: editingZonalsDetail,
          observations: editingObservations
        })
        .eq('id', editingDispatchRecord.id);

      if (error) throw error;

      setSuccessMsg('¡Despacho corregido y guardado con éxito!');
      setEditingDispatchRecord(null);
      fetchHistory();
      fetchReturns();
    } catch (err: any) {
      console.error('Error al editar despacho:', err);
      alert('Error al actualizar despacho: ' + (err.message || 'Error de conexión'));
    } finally {
      setEditingSaveLoading(false);
    }
  };

  // Helpers para modificar la lista de zonales en edición
  const handleUpdateEditingZonal = (index: number, field: string, value: any) => {
    setEditingZonalsDetail(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy[index][field] = value;
      return copy;
    });
  };

  const handleUpdateEditingZonalCategory = (index: number, category: 'congelados' | 'estandar' | 'bandejas', field: string, value: any) => {
    setEditingZonalsDetail(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy[index][category][field] = value;
      return copy;
    });
  };

  const handleAddEditingZonal = () => {
    const emptyZonal: ZonalDetail = {
      zonal_name: ZONALES_LIST[0] || 'San Fernando',
      viaje_numero: 1,
      lugar_camion: '1° (FONDO)',
      congelados: { kilos: 0, wood_bases: 0, wood_extra: 0, plastic_bases: 0, plastic_extra: 0 },
      estandar: { kilos: 0, wood_bases: 0, wood_extra: 0, plastic_bases: 0, plastic_extra: 0 },
      bandejas: { kilos: 0, wood_bases: 0, wood_extra: 0, plastic_bases: 0, plastic_extra: 0, bandejas_count: 0 },
      sello: ''
    };
    setEditingZonalsDetail(prev => [...prev, emptyZonal]);
  };

  const handleRemoveEditingZonal = (index: number) => {
    setEditingZonalsDetail(prev => prev.filter((_, i) => i !== index));
  };

  // Eliminar despacho (Admin para cualquier fecha, Supervisores/Jefes de Turno solo para el mismo día en horario Chile)
  const handleDeleteDispatch = async (rec: DispatchRecord) => {
    const today = getChileDateString();
    const isToday = rec.inspection_date === today;
    if (!isAdmin && !isToday) {
      alert("⚠️ Acción no permitida:\n\nLos supervisores y jefes de turno solo pueden eliminar despachos del mismo día en horario de Chile.\n\nSolo los administradores pueden eliminar registros históricos de días anteriores.");
      return;
    }

    const confirmMsg = `¿Estás seguro de eliminar permanentemente el despacho de ${rec.supervisor_name} (Camión: ${rec.truck_number}, Patente: ${rec.truck_plate})?\n\nEsta acción eliminará el registro y recalculará los saldos y monitores de salida.`;
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      // 1. Eliminar logs de salida asociados
      await supabase
        .from('zonal_departure_logs')
        .delete()
        .eq('dispatch_id', rec.id);

      // 2. Eliminar el despacho
      const { error } = await supabase
        .from('pallet_dispatches')
        .delete()
        .eq('id', rec.id);

      if (error) throw error;

      setSuccessMsg('Despacho y registros asociados eliminados correctamente.');
      fetchHistory();
      fetchReturns();
      fetchZonalDepartureLogs();
    } catch (err: any) {
      console.error('Error eliminando despacho:', err);
      setErrorMsg(err.message || 'Error al eliminar el despacho.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCloseTime = async (recordId: string, time: string) => {
    setSavingCloseTimeId(recordId);
    try {
      const { error } = await supabase
        .from('pallet_dispatches')
        .update({ close_time: time || null })
        .eq('id', recordId);

      if (error) throw error;
      
      // Actualizar estado local para evitar recarga completa
      setRecords(prev => prev.map(r => r.id === recordId ? { ...r, close_time: time || null } : r));
      
      // Sincronizar zonal_departure_logs para que KPI Salidas y Salidas a Tiempo usen la nueva Hora de Cierre
      const targetRecord = records.find(r => r.id === recordId);
      if (targetRecord && time && time.trim()) {
        const actualTime = time.trim().slice(0, 5);
        for (const sz of (targetRecord.zonals_detail || [])) {
          const baseName = getBaseZonalName(sz.zonal_name);
          const viajeNum = sz.viaje_numero || 1;
          const targetConfig = getZonalTargetConfig(baseName, viajeNum);

          const targetTime = targetConfig.target_time;
          const comp = compareTimes(actualTime, targetTime);

          await supabase.from('zonal_departure_logs').upsert([{
            dispatch_id: recordId,
            inspection_date: targetRecord.inspection_date,
            zonal_name: baseName,
            viaje_numero: viajeNum,
            target_time: targetTime,
            actual_time: actualTime,
            is_on_time: comp.isOnTime,
            diff_minutes: comp.diffMinutes,
            supervisor_name: targetRecord.supervisor_name
          }], { onConflict: 'dispatch_id,zonal_name,viaje_numero' });
        }
        await fetchZonalDepartureLogs();
      }

      setSuccessMsg('¡Hora de cierre guardada con éxito en la base de datos!');
      
      // Salir del modo edición
      setEditingCloseTimes(prev => {
        const copy = { ...prev };
        delete copy[recordId];
        return copy;
      });
    } catch (err: any) {
      alert("Error al actualizar la hora de cierre: " + err.message);
    } finally {
      setSavingCloseTimeId(null);
    }
  };

  // Estado Poka-Yoke: Advertencia por datos faltantes del camión
  const [missingFieldsAlert, setMissingFieldsAlert] = useState<string[] | null>(null);
  // Advertencia al intentar firmar desde el Historial
  const [signWarningAlert, setSignWarningAlert] = useState<{ fields: string[]; rec: DispatchRecord } | null>(null);

  const getMissingSignFields = (rec: DispatchRecord): string[] => {
    const missing: string[] = [];
    if (!rec.truck_number || !String(rec.truck_number).trim()) missing.push('N° de Camión');
    if (!rec.truck_plate || !rec.truck_plate.trim() || rec.truck_plate === 'N/A') missing.push('Patente del Camión');
    if (!rec.anden_number || !String(rec.anden_number).trim()) missing.push('N° de Andén');
    if (!rec.truck_kilos || Number(rec.truck_kilos) === 0) missing.push('Kilos Totales del Camión');
    if (!rec.close_time || !rec.close_time.trim()) missing.push('Hora de Cierre del Camión');
    rec.zonals_detail?.forEach(z => {
      if (!z.sello || !String(z.sello).trim()) missing.push(`N° de Sello en Zonal "${z.zonal_name}"`);
      const bCount = z.bandejas?.bandejas_count || 0;
      const bPallets = (z.bandejas?.plastic_bases || 0) + 
                       (z.bandejas?.wood_bases || 0) + 
                       (z.bandejas?.plastic_extra || 0) + 
                       (z.bandejas?.wood_extra || 0);
      if (bCount === 0 && bPallets === 0) {
        missing.push(`Sin Bandejas ingresadas en Zonal "${z.zonal_name}" (0 bandejas)`);
      }
    });
    return missing;
  };

  // ── Helpers para Alerta de Fallas a Supervisor de Rampas/Camiones & Trazabilidad Zonales ──
  const ITEM_CHECKLIST_LABELS: { [key: string]: string } = {
    postura_anden: '1. Horario Postura en Andén',
    limpieza_estructura: '2. Estado Camión / Limpieza / Daño Estructural',
    luces_encendidas: '3. Estado de Luces (Encendidas)',
    separador_termico: '4. Verificación Separador Térmico / Colchonetas',
    lingas_camion: '5. Verificación Lingas por Camión'
  };

  // Obtener la Zonal previa visitada antes de un despacho específico (para saber dónde se dañó el separador)
  const getPreviousZonalForRecord = (currentRecord: DispatchRecord, allRecords: DispatchRecord[]) => {
    const normPlate = (currentRecord.truck_plate || '').trim().toUpperCase();
    const normNum = (currentRecord.truck_number || '').trim().toUpperCase();

    const truckRecords = allRecords.filter(r => {
      const p = (r.truck_plate || '').trim().toUpperCase();
      const n = (r.truck_number || '').trim().toUpperCase();
      return (p && p !== 'N/A' && p === normPlate) || (normNum && normNum !== 'N/A' && n === normNum);
    }).sort((a, b) => {
      const timeA = `${a.inspection_date || ''} ${a.close_time || a.inspection_time || '00:00'}`;
      const timeB = `${b.inspection_date || ''} ${b.close_time || b.inspection_time || '00:00'}`;
      return timeB.localeCompare(timeA);
    });

    const currIdx = truckRecords.findIndex(r => r.id === currentRecord.id);
    if (currIdx >= 0 && currIdx < truckRecords.length - 1) {
      const prev = truckRecords[currIdx + 1];
      const previousZonals = prev.zonals_detail?.map(z => z.zonal_name).filter(Boolean) || [];
      return {
        previousRecord: prev,
        previousZonals,
        previousDate: prev.inspection_date,
        previousSupervisor: prev.supervisor_name
      };
    }

    return {
      previousRecord: null,
      previousZonals: [],
      previousDate: null,
      previousSupervisor: null
    };
  };

  const openFailureAlertModalForPlate = (group: { plate: string; truckNumbers: Set<string> | string[]; records: DispatchRecord[] }) => {
    const truckNums = Array.isArray(group.truckNumbers) ? group.truckNumbers : Array.from(group.truckNumbers);
    const failures: FailureAlertItem[] = [];

    // Ordenar despachos del grupo cronológicamente descendente
    const sortedGroupRecords = [...group.records].sort((a, b) => {
      const timeA = `${a.inspection_date || ''} ${a.close_time || a.inspection_time || '00:00'}`;
      const timeB = `${b.inspection_date || ''} ${b.close_time || b.inspection_time || '00:00'}`;
      return timeB.localeCompare(timeA);
    });

    // Buscar si hay daño en separador térmico
    const latestThermalDamage = sortedGroupRecords.find(r => {
      const st = getChecklistStatus(r.checklist?.separador_termico);
      return st === 'AMARILLO' || st === 'ROJO';
    });

    let targetLastZonals: string[] = [];
    let targetLastDate: string | undefined = undefined;

    if (latestThermalDamage) {
      const prevInfo = getPreviousZonalForRecord(latestThermalDamage, records);
      if (prevInfo.previousZonals.length > 0) {
        targetLastZonals = prevInfo.previousZonals;
        targetLastDate = prevInfo.previousDate || undefined;
      }
    }

    if (targetLastZonals.length === 0) {
      const lastRecord = sortedGroupRecords[0];
      targetLastZonals = lastRecord?.zonals_detail?.map(z => z.zonal_name).filter(Boolean) || [];
      targetLastDate = lastRecord?.inspection_date;
    }

    sortedGroupRecords.forEach(r => {
      const chk = r.checklist || {};
      const items = ['postura_anden', 'limpieza_estructura', 'luces_encendidas', 'separador_termico', 'lingas_camion'];
      const prevInfo = getPreviousZonalForRecord(r, records);
      const currZonals = r.zonals_detail?.map(z => z.zonal_name).filter(Boolean) || [];

      items.forEach(key => {
        const st = getChecklistStatus(chk[key]);
        if (st === 'AMARILLO' || st === 'ROJO') {
          let comment = '';
          let photos: string[] = [];

          if (key === 'separador_termico') {
            comment = chk.colchonetas_comment || '';
            photos = chk.colchonetas_photos || [];
          } else if (key === 'lingas_camion') {
            comment = chk.lingas_comment || '';
            photos = chk.lingas_photos || [];
          } else {
            photos = chk.photos || [];
          }

          failures.push({
            itemKey: key,
            itemLabel: ITEM_CHECKLIST_LABELS[key] || key,
            status: st,
            comment,
            photos,
            date: r.inspection_date,
            supervisor: r.supervisor_name,
            previousZonals: prevInfo.previousZonals,
            previousDate: prevInfo.previousDate,
            currentZonals: currZonals
          });
        }
      });
    });

    setFailureAlertModal({
      plate: group.plate,
      truckNumbers: truckNums,
      records: sortedGroupRecords,
      lastZonals: targetLastZonals,
      lastDispatchDate: targetLastDate,
      failures
    });
  };

  const openFailureAlertModalForRecord = (rec: DispatchRecord) => {
    const plate = (rec.truck_plate && rec.truck_plate !== 'N/A') ? rec.truck_plate.trim().toUpperCase() : `CAMIÓN #${rec.truck_number || 'S/A'}`;
    const truckNums = rec.truck_number && rec.truck_number !== 'N/A' ? [rec.truck_number] : [];
    openFailureAlertModalForPlate({ plate, truckNumbers: truckNums, records: [rec] });
  };

  const buildFailureReportPlainText = (data: FailureAlertData): string => {
    const truckNumStr = data.truckNumbers.length > 0 ? ` (N° ${data.truckNumbers.join(', ')})` : '';
    let text = `Estimado,\n\n`;
    text += `Por medio del presente se notifica que durante la inspección operativa del camión patente ${data.plate}${truckNumStr}, se han detectado anomalías y/o daños en los equipos de rampa.\n\n`;

    text += `═══════════════════════════════════════════════\n`;
    text += `DETALLE DE OBSERVACIONES Y TRAZABILIDAD DE DAÑOS:\n`;
    text += `═══════════════════════════════════════════════\n\n`;

    if (data.failures.length === 0) {
      text += `• Sin observaciones críticas registradas en este período.\n\n`;
    } else {
      data.failures.forEach((f, idx) => {
        const icono = f.status === 'ROJO' ? '🔴 [RECHAZADO / CRÍTICO]' : '🟡 [OBSERVACIÓN MENOR]';
        text += `${idx + 1}. ${icono} ${f.itemLabel}\n`;
        text += `• Fecha Detección en Andén: ${f.date} | Inspector Planta: ${f.supervisor}\n\n`;
        
        if (f.itemKey === 'separador_termico') {
          if (f.previousZonals && f.previousZonals.length > 0) {
            text += `• 🚨 TRAZABILIDAD: Daño originado en Zonal previa: ${f.previousZonals.join(', ')} (${f.previousDate || 'Viaje anterior'})\n`;
          } else if (f.currentZonals && f.currentZonals.length > 0) {
            text += `• Zonal asignada en este despacho: ${f.currentZonals.join(', ')}\n`;
          }
        }

        if (f.comment) {
          text += `• Detalle / Observación: ${f.comment}\n`;
        }
        
        const photoCount = f.photos?.length || 0;
        text += `• Evidencias Fotográficas: ${photoCount} foto(s) registradas en plataforma Nexus Outbound.\n\n`;

        if (photoCount > 0) {
          text += ` (Evidencias fotográficas registradas: ${photoCount} foto(s) adjuntas)\n\n`;
        }
      });
    }

    text += `═══════════════════════════════════════════════\n`;
    text += `Favor coordinar las acciones correctivas con la sucursal zonal y el equipo de rampas.\n\n`;
    text += `Saludos cordiales,`;
    return text;
  };

  const handleSendFailureEmail = () => {
    if (!failureAlertModal) return;
    const to = alertRecipientEmail.trim();
    const cc = alertCcEmail.trim();
    if (to) localStorage.setItem('nexus_rampas_alert_to', to);
    if (cc) localStorage.setItem('nexus_rampas_alert_cc', cc);

    const subject = `🚨 ALERTA INSPECCIÓN: Fallas detectadas en Camión ${failureAlertModal.plate}`;
    const body = buildFailureReportPlainText(failureAlertModal);

    const mailtoUrl = `mailto:${encodeURIComponent(to)}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  const handleCopyFailureReport = () => {
    if (!failureAlertModal) return;
    const body = buildFailureReportPlainText(failureAlertModal);
    navigator.clipboard.writeText(body);
    setAlertCopiedToast(true);
    setTimeout(() => setAlertCopiedToast(false), 3000);
  };

  const handleDownloadAllFailurePhotos = () => {
    if (!failureAlertModal) return;
    let count = 0;
    const plateClean = (failureAlertModal.plate || 'Camion').replace(/[^a-zA-Z0-9]/g, '_');
    failureAlertModal.failures.forEach((f) => {
      (f.photos || []).forEach((photoUrl, pIdx) => {
        count++;
        const a = document.createElement('a');
        a.href = photoUrl;
        const itemClean = (f.itemKey || 'evidencia').replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `Evidencia_${plateClean}_${itemClean}_${pIdx + 1}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    });
    if (count === 0) {
      alert('No hay fotos de evidencia registradas para esta patente.');
    }
  };

  const handleCopyImageToClipboard = async (photoUrl: string) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = photoUrl;
      await new Promise((resolve, reject) => {
        img.onload = () => resolve(true);
        img.onerror = () => reject(new Error('Error al cargar imagen'));
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(async (blob) => {
          if (blob && navigator.clipboard && (window as any).ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            alert('¡Foto copiada al portapapeles! Puedes pegarla directamente en tu correo con Ctrl + V.');
          } else {
            const a = document.createElement('a');
            a.href = photoUrl;
            a.download = 'foto_evidencia.jpg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }
        }, 'image/png');
      }
    } catch (e) {
      const a = document.createElement('a');
      a.href = photoUrl;
      a.download = 'foto_evidencia.jpg';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const getMissingDispatchData = (): string[] => {
    const missing: string[] = [];

    if (!truckNumber || !truckNumber.trim()) {
      missing.push('N° de Camión');
    }
    if (!truckPlate || !truckPlate.trim()) {
      missing.push('Patente del Camión');
    }
    if (!truckAnden || !truckAnden.trim()) {
      missing.push('N° de Andén');
    }
    if (!truckKilos || (typeof truckKilos === 'string' && !truckKilos.trim())) {
      missing.push('Kilos Totales del Camión');
    }

    selectedZonals.forEach((z) => {
      if (!z.sello || !z.sello.trim()) {
        missing.push(`N° de Sello en Zonal "${z.zonal_name}"`);
      }

      // Validar si una zonal no tiene bandejas ingresadas
      const bCount = z.bandejas?.bandejas_count || 0;
      const bPallets = (z.bandejas?.plastic_bases || 0) + 
                       (z.bandejas?.wood_bases || 0) + 
                       (z.bandejas?.plastic_extra || 0) + 
                       (z.bandejas?.wood_extra || 0);
      if (bCount === 0 && bPallets === 0) {
        missing.push(`Sin Bandejas ingresadas en Zonal "${z.zonal_name}" (0 bandejas / 0 pallets de bandejas)`);
      }
    });

    const currentTotals = getCamionTotals();
    if (currentTotals.bases > positionsOccupied) {
      missing.push(`Exceso de Capacidad: La suma de pallets base (${currentTotals.bases}) supera la cantidad de posiciones del camión (${positionsOccupied} pos).`);
    }

    return missing;
  };

  const handleSubmit = async (e?: React.FormEvent, forceConfirm = false) => {
    if (e) e.preventDefault();
    if (!supervisorName) {
      alert("Por favor ingresa el nombre del Supervisor.");
      return;
    }
    if (selectedZonals.length === 0) {
      alert("Por favor agrega al menos un Zonal.");
      return;
    }

    // Validar que NINGÚN ítem del checklist esté en GRIS (Sin revisar)
    const unreviewedChecklistItems = [
      { key: 'postura_anden', label: '1. Horario de postura en Andén' },
      { key: 'limpieza_estructura', label: '2. Estado camión (Limpieza, Sin daños)' },
      { key: 'luces_encendidas', label: '3. Estado de Luces (ENCENDIDAS)' },
      { key: 'separador_termico', label: '4. Verificación Separador Térmico' },
      { key: 'lingas_camion', label: '5. Verificación Lingas por camión' }
    ].filter(item => getChecklistStatus((checklist as any)[item.key]) === 'GRIS');

    if (unreviewedChecklistItems.length > 0) {
      alert(`⚠️ NO ES POSIBLE CONFIRMAR EL DESPACHO:\n\nHay ítems del Check List de Inspección sin evaluar (en estado GRIS):\n- ${unreviewedChecklistItems.map(i => i.label).join('\n- ')}\n\nDebes asignar a cada ítem: Verde (Aprobado), Amarillo (Problema Menor) o Rojo (Rechazado).`);
      return;
    }

    // Poka-Yoke: Advertencia por datos faltantes del camión
    if (!forceConfirm) {
      const missing = getMissingDispatchData();
      if (missing.length > 0) {
        setMissingFieldsAlert(missing);
        return;
      }
    }

    setMissingFieldsAlert(null);

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const now = new Date();
    const dateStr = getChileDateString(now);
    const timeStr = getChileTimeString(now);

    try {
      // Mapear zonales preservando el nombre limpio del zonal
      const formattedZonals = selectedZonals.map(sz => {
        return {
          ...sz,
          zonal_name: sz.zonal_name
        };
      });

      let insertedDispatch: any = null;

      if (editingDispatchId) {
        // MODO EDICIÓN EXPLÍCITA (El usuario vino de EDITAR en el historial)
        const { data: updatedData, error } = await supabase
          .from('pallet_dispatches')
          .update({
            truck_number: truckNumber || 'N/A',
            truck_plate: truckPlate || 'N/A',
            supervisor_name: supervisorName,
            positions_occupied: positionsOccupied,
            checklist: {
              ...checklist,
              lingas_photos: lingasPhotos.length > 0 ? lingasPhotos : undefined,
              lingas_comment: lingasComment ? lingasComment : undefined,
              colchonetas_photos: colchonetasPhotos.length > 0 ? colchonetasPhotos : undefined,
              colchonetas_comment: colchonetasComment ? colchonetasComment : undefined,
              photos: photos.length > 0 ? photos : undefined
            },
            zonals_detail: formattedZonals,
            observations: observations,
            temp_1er: temp1er,
            temp_2do: temp2do,
            temp_3er: temp3er,
            close_time: closeTime || null,
            truck_kilos: truckKilos || null,
            anden_number: truckAnden || null,
            // Al modificar el contenido de un despacho, se anula la firma previa para requerir nueva firma
            signed_by: null,
            signed_at: null,
            signature_b64: null,
            signed_by_title: null
          })
          .eq('id', editingDispatchId)
          .select();

        if (error) throw error;
        insertedDispatch = updatedData ? updatedData[0] : null;
        setSuccessMsg(`¡Despacho Camión #${truckNumber || ''} actualizado correctamente! (Requiere nueva firma)`);
      } else {
        // MODO NUEVO DESPACHO (SIEMPRE INSERT NUEVO E INDEPENDIENTE)
        const { data: insertedData, error } = await supabase
          .from('pallet_dispatches')
          .insert([{
            truck_number: truckNumber || 'N/A',
            truck_plate: truckPlate || 'N/A',
            supervisor_name: supervisorName,
            inspection_date: dateStr,
            inspection_time: timeStr,
            positions_occupied: positionsOccupied,
            checklist: {
              ...checklist,
              lingas_photos: lingasPhotos.length > 0 ? lingasPhotos : undefined,
              lingas_comment: lingasComment ? lingasComment : undefined,
              colchonetas_photos: colchonetasPhotos.length > 0 ? colchonetasPhotos : undefined,
              colchonetas_comment: colchonetasComment ? colchonetasComment : undefined,
              photos: photos.length > 0 ? photos : undefined
            },
            zonals_detail: formattedZonals,
            observations: observations,
            completed_at: now.toISOString(),
            temp_1er: temp1er,
            temp_2do: temp2do,
            temp_3er: temp3er,
            close_time: closeTime || null,
            truck_kilos: truckKilos || null,
            anden_number: truckAnden || null
          }])
          .select();

        if (error) throw error;
        insertedDispatch = insertedData ? insertedData[0] : null;
        setSuccessMsg("¡Despacho confirmado y registrado con éxito!");
      }

      // Upsert logs de salida por zonal en zonal_departure_logs
      if (insertedDispatch) {
        const signerDisplayName = userDisplayName || supervisorName;
        const targetDate = insertedDispatch.inspection_date || dateStr;

        for (const sz of selectedZonals) {
          const baseName = getBaseZonalName(sz.zonal_name);
          const viajeNum = sz.viaje_numero || 1;
          const targetConfig = getZonalTargetConfig(baseName, viajeNum);

          const targetTime = targetConfig.target_time;
          // Hora de Cierre Camión manda por sobre la hora de confirmación de despacho
          const actualTime = (closeTime && closeTime.trim()) ? closeTime.trim().slice(0, 5) : timeStr.slice(0, 5);
          const comp = compareTimes(actualTime, targetTime);

          await supabase.from('zonal_departure_logs').upsert([{
            dispatch_id: insertedDispatch.id,
            inspection_date: targetDate,
            zonal_name: baseName,
            viaje_numero: viajeNum,
            target_time: targetTime,
            actual_time: actualTime,
            is_on_time: comp.isOnTime,
            diff_minutes: comp.diffMinutes,
            supervisor_name: supervisorName,
            signed_by: insertedDispatch.signed_by || null,
            signed_by_name: insertedDispatch.signed_by ? signerDisplayName : null
          }], { onConflict: 'dispatch_id,zonal_name,viaje_numero' });
        }
        fetchZonalDepartureLogs();
        fetchHistory(historyPeriod);
      }

      setEditingDispatchId(null);
      
      // Borrar el borrador de Supabase para que desaparezca en todos los dispositivos
      await deleteDraftFromSupabase(activeDraftId);

      // Remover el camión completado de la lista de borradores abiertos
      const remainingDrafts = truckDrafts.filter(d => d.id !== activeDraftId);
      if (remainingDrafts.length > 0) {
        setTruckDrafts(remainingDrafts);
        setActiveDraftId(remainingDrafts[0].id);
        loadDraftIntoState(remainingDrafts[0]);
      } else {
        const fresh = createEmptyDraft();
        setTruckDrafts([fresh]);
        setActiveDraftId(fresh.id);
        loadDraftIntoState(fresh);
        syncDraftToSupabase(fresh);
      }
      
      setExpandedZonalIndex(null);
      
      // Actualizar datos
      fetchHistory();
      fetchReturns();
      
      // Scroll arriba
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err: any) {
      console.error('Error insertando despacho:', err);
      setErrorMsg(err.message || 'Error al guardar el despacho.');
    } finally {
      setLoading(false);
    }
  };

  // Enviar Retorno a Supabase
  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showReturnModal) return;
    if (!returnSupervisor) {
      alert("Por favor ingresa el nombre del Supervisor que recibe.");
      return;
    }
    if (returnWood === 0 && returnPlastic === 0) {
      alert("Debes ingresar al menos 1 pallet retornado.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const { error } = await supabase
        .from('pallet_returns')
        .insert([{
          zonal_name: showReturnModal,
          wood_returned: returnWood,
          plastic_returned: returnPlastic,
          supervisor_name: returnSupervisor
        }]);

      if (error) throw error;

      setSuccessMsg(`¡Retorno de pallets de ${showReturnModal} registrado con éxito!`);
      setShowReturnModal(null);
      setReturnSupervisor(formatSupervisorName(user?.email));
      setReturnWood(0);
      setReturnPlastic(0);

      // Recargar datos
      fetchHistory();
      fetchReturns();

    } catch (err: any) {
      console.error('Error insertando retorno:', err);
      setErrorMsg(err.message || 'Error al guardar el retorno.');
    } finally {
      setLoading(false);
    }
  };

  const getFormatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  };

  const totals = getCamionTotals();
  const balances = getZonalBalances();

  return (
    <div className="min-h-screen bg-[#f1f5f9] text-slate-800 flex flex-col font-sans antialiased">
      
      {/* HEADER DE MARCA CIAL (Estilo Nexus Dock) */}
      <header className="bg-brand-primary text-white shadow-md select-none shrink-0 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img 
              src={cialLogo} 
              alt="CiAL Alimentos" 
              className="w-12 h-12 object-contain bg-white rounded-lg p-0.5 shadow-sm" 
            />
            <div>
              <h1 className="text-lg font-black tracking-wider leading-none">CONTROL OUTBOUND</h1>
              <span className="text-[10px] text-emerald-300 font-bold tracking-widest uppercase">
                Control de Despacho Táctil — Outbound
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right text-xs text-emerald-100 hidden lg:block mr-2 select-none">
              <div className="font-semibold flex items-center gap-1 justify-end">
                {supervisorName}
                {isAdmin && (
                  <span className="text-[9px] bg-amber-400 text-amber-950 font-extrabold px-1.5 py-0.2 rounded uppercase">
                    ADMIN
                  </span>
                )}
              </div>
              <div className="font-mono text-[9px] opacity-80 mt-0.5">
                {user?.email}
              </div>
            </div>
            
            <button
              onClick={() => {
                setShowProfileModal(true);
                setPasswordSuccess(null);
                setPasswordError(null);
                setNewPassword('');
                setConfirmNewPassword('');
              }}
              className="bg-white/10 hover:bg-white/20 border border-white/20 p-2.5 rounded-xl transition-all active:scale-95 text-white cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
              title="Mi Perfil / Configuración"
            >
              <User className="w-4.5 h-4.5" />
              <span className="text-xs font-bold hidden md:inline">Perfil</span>
            </button>

            {user && (
              <button
                type="button"
                onClick={() => setShowSignaturePad(true)}
                className={`border p-2.5 rounded-xl transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 ${userSignature ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
                title={userSignature ? 'Actualizar mi firma' : 'Configurar mi firma digital'}
              >
                <PenTool className="w-4.5 h-4.5" />
                <span className="text-xs font-bold hidden md:inline">{userSignature ? 'Mi Firma ✓' : 'Mi Firma'}</span>
              </button>
            )}

            <button
              onClick={() => supabase.auth.signOut()}
              className="bg-white/10 hover:bg-white/20 border border-white/20 p-2.5 rounded-xl transition-all active:scale-95 text-white cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4.5 h-4.5" />
              <span className="text-xs font-bold hidden md:inline">Salir</span>
            </button>
          </div>
        </div>
      </header>

      {/* TABS DE NAVEGACIÓN */}
      <div className="bg-white border-b border-slate-200 sticky top-[68px] z-30 select-none">
        <div className="max-w-4xl mx-auto flex">
          <button 
            onClick={() => { setActiveTab('salidas'); fetchHistory(); fetchZonalTargetTimes(); }}
            className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${activeTab === 'salidas' ? 'border-brand-primary text-brand-primary bg-emerald-50/20' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Clock className="w-4.5 h-4.5 text-amber-500" />
              Salidas a Tiempo
            </span>
          </button>
          <button 
            onClick={() => setActiveTab('nuevo')}
            className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${activeTab === 'nuevo' ? 'border-brand-primary text-brand-primary bg-emerald-50/20' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <span className="flex items-center justify-center gap-2">
              <ClipboardList className="w-4.5 h-4.5" />
              Despacho Camión
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab('historial'); fetchHistory(); }}
            className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${activeTab === 'historial' ? 'border-brand-primary text-brand-primary bg-emerald-50/20' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <span className="flex items-center justify-center gap-2">
              <FileText className="w-4.5 h-4.5" />
              Historial Cargas
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab('kpi_salidas'); fetchZonalDepartureLogs(); }}
            className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${activeTab === 'kpi_salidas' ? 'border-amber-500 text-amber-700 bg-amber-50/20' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <TrendingUp className="w-4.5 h-4.5 text-amber-600" />
              KPI Salidas
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab('bitacora_atrasos'); fetchZonalDepartureLogs(); fetchDelayLogbook(); }}
            className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${activeTab === 'bitacora_atrasos' ? 'border-rose-500 text-rose-700 bg-rose-50/20' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-4.5 h-4.5 text-rose-600" />
              Bitácora Atrasos
            </span>
          </button>
          <button 
            onClick={() => { setActiveTab('inspeccion_reporte'); fetchHistory(inspectionPeriod); }}
            className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${activeTab === 'inspeccion_reporte' ? 'border-amber-500 text-amber-700 bg-amber-50/20' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <span className="text-base">🚥</span>
              Reporte Inspección
            </span>
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => { setActiveTab('usuarios'); fetchPalletUsers(); }}
              className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${activeTab === 'usuarios' ? 'border-amber-500 text-amber-600 bg-amber-50/20' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <span className="flex items-center justify-center gap-2">
                <Users className="w-4.5 h-4.5" />
                Usuarios
              </span>
            </button>
          )}
        </div>
      </div>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 pb-24">
        
        {/* MENSAJES DE ESTADO */}
        {successMsg && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start gap-3 shadow-sm">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">¡Operación Exitosa!</p>
              <p className="text-xs text-emerald-700 mt-0.5">{successMsg}</p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3 shadow-sm">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Error del Sistema</p>
              <p className="text-xs text-rose-700 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* TOAST DE CONFIRMACIÓN DE GUARDAR AVANCE */}
        {saveProgressToast && (
          <div className="mb-4 p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-fade-in border border-emerald-400">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-200 shrink-0" />
              <div>
                <p className="font-extrabold text-sm">¡Avance Guardado con Éxito!</p>
                <p className="text-xs text-emerald-100 font-medium">{saveProgressToast}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSaveProgressToast(null)}
              className="text-emerald-200 hover:text-white text-xs font-bold px-2 py-1 rounded-lg hover:bg-emerald-700/50 transition-all cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {activeTab === 'nuevo' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* BANNER MODO EDICIÓN DE DESPACHO */}
            {editingDispatchId && (
              <div className="bg-amber-500 text-white p-4 rounded-2xl shadow-lg flex items-center justify-between animate-fade-in select-none border-2 border-amber-400">
                <div className="flex items-center gap-3">
                  <Edit2 className="w-6 h-6 shrink-0" />
                  <div>
                    <span className="font-black uppercase text-xs tracking-wider block">
                      ✏️ MODO EDICIÓN — MODIFICANDO DESPACHO GUARDADO #{truckNumber || 'S/N'} {truckPlate ? `(${truckPlate})` : ''}
                    </span>
                    <span className="text-[11px] opacity-90 font-medium">
                      Modifica los datos necesarios en este formulario y presiona "GUARDAR CAMBIOS DE DESPACHO" al final para actualizar.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cancelEditDispatch}
                  className="bg-white/20 hover:bg-white/30 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all cursor-pointer shrink-0 active:scale-95 border border-white/30"
                >
                  ✕ Cancelar Edición
                </button>
              </div>
            )}
            
            {/* BARRA MULTI-CAMIÓN: PESTAÑAS DE CAMIONES EN PROCESO EN PARALELO */}
            <div className="bg-slate-900 rounded-2xl p-4 shadow-md text-white space-y-3 select-none">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-white/10 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Truck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span className="text-sm font-black uppercase tracking-wider text-emerald-400">
                    Camiones en Carga ({truckDrafts.length})
                  </span>
                  <span className="text-[10px] text-slate-300 font-bold bg-white/10 px-2 py-0.5 rounded-full border border-white/10">
                    Carga Múltiple en Paralelo
                  </span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleSaveProgress}
                    disabled={saveProgressLoading}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                    title="Guarda tu avance en la nube sin salir del formulario"
                  >
                    {saveProgressLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    <span>GUARDAR AVANCE</span>
                  </button>

                  {/* ── B: Badge de estado del guardado ── */}
                  {activeDraftId && (() => {
                    if (draftSaveStatus === 'saving') return (
                      <span className="flex items-center gap-1.5 text-[11px] font-black text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1.5 rounded-xl animate-pulse select-none shadow-2xs">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-700" />
                        <span>Guardando...</span>
                      </span>
                    );
                    if (draftSaveStatus === 'error') return (
                      <button
                        type="button"
                        title="Error al guardar automáticamente. Clic para reintentar."
                        onClick={async () => {
                          setDraftSaveStatus('saving');
                          const ok = await autoSaveDraftTextOnly();
                          if (ok) { setLastAutoSaveTime(new Date()); setDraftSaveStatus('saved'); }
                          else setDraftSaveStatus('error');
                        }}
                        className="flex items-center gap-1.5 text-[11px] font-black text-rose-800 bg-rose-50 border border-rose-300 px-2.5 py-1.5 rounded-xl cursor-pointer hover:bg-rose-100 transition-all select-none shadow-2xs"
                      >
                        <span>⚠️ Error{autoSaveRetries > 0 ? ` (intento ${autoSaveRetries}/3)` : ''} · Reintentar</span>
                      </button>
                    );
                    if (lastAutoSaveTime) {
                      const timeStr = lastAutoSaveTime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                      if (draftSaveStatus === 'saved' || draftSaveStatus === 'idle') {
                        return (
                          <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-900 bg-emerald-100 border border-emerald-300 px-2.5 py-1.5 rounded-xl select-none shadow-2xs" title={`Último avance guardado con éxito a las ${timeStr} hrs`}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                            <span>Guardado {timeStr} hrs</span>
                          </span>
                        );
                      }
                      return (
                        <span className="flex items-center gap-1.5 text-[11px] font-black text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-1.5 rounded-xl select-none shadow-2xs" title={`Hay cambios sin guardar. Último guardado registrado: ${timeStr} hrs`}>
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                          <span>Último guardado: {timeStr} hrs</span>
                        </span>
                      );
                    }
                    if (draftSaveStatus === 'unsaved') return (
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xl select-none">
                        🟡 Sin guardar
                      </span>
                    );
                    return null;
                  })()}

                  <button
                    type="button"
                    onClick={addNewTruckDraft}
                    className="bg-brand-emerald hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nuevo Camión</span>
                  </button>
                </div>
              </div>

              {/* Pestañas / Píldoras de Camiones Abiertos */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {truckDrafts.map((d, idx) => {
                  const isActive = d.id === activeDraftId;
                  const zonalNames = (d.selectedZonals || []).map(z => (z.viaje_numero || 1) > 1 ? `${z.zonal_name} ${z.viaje_numero}` : z.zonal_name);
                  const displayZonalNames = zonalNames.length > 0 ? zonalNames.join(' - ') : null;
                  const truckLabel = displayZonalNames || (d.truckNumber ? `Camión #${d.truckNumber}` : `Camión #${idx + 1}`);
                  const plateLabel = d.truckPlate ? ` (${d.truckPlate})` : '';
                  const zonalCount = (d.selectedZonals || []).length;

                  return (
                    <div
                      key={d.id}
                      onClick={() => switchActiveDraft(d.id)}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer shrink-0 shadow-sm ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black scale-[1.01]'
                          : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/15'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>🚚</span>
                        <span>{truckLabel}{plateLabel}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${isActive ? 'bg-slate-950 text-emerald-300 font-bold' : 'bg-black/30 text-slate-300'}`}>
                          {zonalCount} zonales
                        </span>
                      </span>
                      {truckDrafts.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTruckDraft(d.id);
                          }}
                          className={`p-0.5 rounded-full hover:bg-black/20 text-slate-400 hover:text-white transition-colors cursor-pointer ${isActive ? 'text-slate-900 hover:text-slate-950' : ''}`}
                          title="Descartar borrador de este camión"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* CARD 1: DATOS DEL SUPERVISOR Y CAMIÓN */}
            <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-4">
              <h2 className="text-sm font-black text-brand-primary uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <User className="w-4.5 h-4.5" />
                1. Datos del Camión & Supervisor
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Supervisor</label>
                  <input 
                    type="text" 
                    value={supervisorName} 
                    disabled
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 cursor-not-allowed select-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Patente</label>
                  <input 
                    type="text" 
                    placeholder="Ej. DRCX-73" 
                    value={truckPlate} 
                    onChange={(e) => setTruckPlate(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">N° Camión</label>
                  <input 
                    type="text" 
                    placeholder="Ej. 1951" 
                    value={truckNumber} 
                    onChange={(e) => setTruckNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">N° de Andén</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Andén 4" 
                    value={truckAnden} 
                    onChange={(e) => setTruckAnden(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-mono font-bold"
                  />
                </div>
              </div>

              {/* TEMPERATURAS TERMO - VISTA CENITAL DEL CAMIÓN */}
              <div className="border-t border-slate-100 pt-4 space-y-2 select-none">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-sky-500" />
                    <span>Temperaturas Termos del Camión (Vista Cenital)</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-semibold hidden sm:inline">
                    Haz clic en cada posición para alternar entre 0°C y -18°C (solo 1 congelado activo)
                  </span>
                </div>

                {/* Diagrama Camión Cenital Compacto y Realista */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-1.5 sm:p-3 overflow-hidden">
                  <div className="w-full flex items-center justify-center">
                    
                    {/* CABINA DE CAMIÓN REALISTA (Izquierda) */}
                    <div className="relative w-10 sm:w-16 h-28 sm:h-34 bg-gradient-to-r from-slate-400 via-slate-300 to-slate-200 rounded-l-[1.2rem] sm:rounded-l-[2rem] border-2 border-r-0 border-slate-500 shadow-sm flex items-center justify-center shrink-0">
                      {/* Faros delanteros superiores e inferiores */}
                      <div className="absolute top-1 left-1.5 w-1.5 sm:w-2 h-1 bg-amber-300 rounded-full shadow-[0_0_4px_rgba(252,211,77,0.9)]"></div>
                      <div className="absolute bottom-1 left-1.5 w-1.5 sm:w-2 h-1 bg-amber-300 rounded-full shadow-[0_0_4px_rgba(252,211,77,0.9)]"></div>

                      {/* Parabrisas y reflejo cristal */}
                      <div className="w-3 sm:w-5 h-16 sm:h-22 bg-slate-900 rounded-r-lg border border-cyan-500/40 relative overflow-hidden flex items-center justify-center shadow-inner">
                        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 via-transparent to-white/10"></div>
                        <span className="text-[5.5px] sm:text-[7.5px] font-black text-slate-300 transform -rotate-90 tracking-wider uppercase select-none">
                          CABINA
                        </span>
                      </div>

                      {/* Espejos retrovisores realistas */}
                      <div className="absolute -top-2 left-2 sm:left-4 w-2 sm:w-3 h-1.5 sm:h-2 bg-slate-700 border border-slate-500 rounded-t-md shadow-2xs"></div>
                      <div className="absolute -bottom-2 left-2 sm:left-4 w-2 sm:w-3 h-1.5 sm:h-2 bg-slate-700 border border-slate-500 rounded-b-md shadow-2xs"></div>
                    </div>

                    {/* CONECTOR / FUELLE ENTRE CABINA Y CARROCERÍA */}
                    <div className="w-1 h-20 sm:h-24 bg-slate-600 rounded-xs shrink-0 z-10 shadow-inner"></div>

                    {/* CARROCERÍA / FURGÓN TÉRMICO (Derecha con 3 zonas) */}
                    <div className="flex-1 h-28 sm:h-34 bg-slate-300 border-2 border-slate-400 rounded-r-xl p-1 sm:p-2 flex gap-1 sm:gap-2.5 shadow-inner relative min-w-0">
                      
                      {/* POSICIÓN 1 (Izquierda / 1er Termo) */}
                      <button
                        type="button"
                        onClick={() => handleSetTemp1er(temp1er <= -9 ? 0 : -18)}
                        className={`flex-1 min-w-0 rounded-lg sm:rounded-xl border-2 transition-all cursor-pointer p-1 sm:p-2 flex flex-col items-center justify-between shadow-sm active:scale-95 ${
                          temp1er <= -9
                            ? 'bg-sky-500 border-sky-400 text-white shadow-sky-500/30'
                            : 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-500/30'
                        }`}
                        title="Haz clic para alternar entre 0°C y -18°C"
                      >
                        <span className="text-[7.5px] sm:text-[9.5px] font-black uppercase tracking-tight truncate w-full text-center">
                          Pos. 1 (Frente)
                        </span>
                        
                        <div className="text-center my-0.5">
                          <span className="text-sm sm:text-2xl font-black font-mono tracking-tight block leading-none">
                            {temp1er > 0 ? `+${temp1er}` : temp1er}°C
                          </span>
                          <span className="text-[7px] sm:text-[8.5px] font-extrabold uppercase px-1 sm:px-2 py-0.5 rounded-full bg-white/20 inline-block mt-0.5">
                            {temp1er <= -9 ? '❄️ Congel' : '🥬 Refri'}
                          </span>
                        </div>

                        {/* Direct input option */}
                        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5 sm:gap-1 bg-black/20 rounded px-1 py-0.5">
                          <input
                            type="number"
                            value={temp1er}
                            onChange={(e) => handleSetTemp1er(parseInt(e.target.value) || 0)}
                            className="w-7 sm:w-10 bg-white text-slate-900 text-[9px] sm:text-xs font-mono font-black text-center rounded py-0 focus:outline-none"
                          />
                          <span className="text-[7.5px] sm:text-[9px] font-bold">°C</span>
                        </div>
                      </button>

                      {/* POSICIÓN 2 (Centro / 2do Termo) */}
                      <button
                        type="button"
                        onClick={() => handleSetTemp2do(temp2do <= -9 ? 0 : -18)}
                        className={`flex-1 min-w-0 rounded-lg sm:rounded-xl border-2 transition-all cursor-pointer p-1 sm:p-2 flex flex-col items-center justify-between shadow-sm active:scale-95 ${
                          temp2do <= -9
                            ? 'bg-sky-500 border-sky-400 text-white shadow-sky-500/30'
                            : 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-500/30'
                        }`}
                        title="Haz clic para alternar entre 0°C y -18°C"
                      >
                        <span className="text-[7.5px] sm:text-[9.5px] font-black uppercase tracking-tight truncate w-full text-center">
                          Pos. 2 (Centro)
                        </span>
                        
                        <div className="text-center my-0.5">
                          <span className="text-sm sm:text-2xl font-black font-mono tracking-tight block leading-none">
                            {temp2do > 0 ? `+${temp2do}` : temp2do}°C
                          </span>
                          <span className="text-[7px] sm:text-[8.5px] font-extrabold uppercase px-1 sm:px-2 py-0.5 rounded-full bg-white/20 inline-block mt-0.5">
                            {temp2do <= -9 ? '❄️ Congel' : '🥬 Refri'}
                          </span>
                        </div>

                        {/* Direct input option */}
                        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5 sm:gap-1 bg-black/20 rounded px-1 py-0.5">
                          <input
                            type="number"
                            value={temp2do}
                            onChange={(e) => handleSetTemp2do(parseInt(e.target.value) || 0)}
                            className="w-7 sm:w-10 bg-white text-slate-900 text-[9px] sm:text-xs font-mono font-black text-center rounded py-0 focus:outline-none"
                          />
                          <span className="text-[7.5px] sm:text-[9px] font-bold">°C</span>
                        </div>
                      </button>

                      {/* POSICIÓN 3 (Derecha / 3er Termo) */}
                      <button
                        type="button"
                        onClick={() => handleSetTemp3er(temp3er <= -9 ? 0 : -18)}
                        className={`flex-1 min-w-0 rounded-lg sm:rounded-xl border-2 transition-all cursor-pointer p-1 sm:p-2 flex flex-col items-center justify-between shadow-sm active:scale-95 ${
                          temp3er <= -9
                            ? 'bg-sky-500 border-sky-400 text-white shadow-sky-500/30'
                            : 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-500/30'
                        }`}
                        title="Haz clic para alternar entre 0°C y -18°C"
                      >
                        <span className="text-[7.5px] sm:text-[9.5px] font-black uppercase tracking-tight truncate w-full text-center">
                          Pos. 3 (Atrás)
                        </span>
                        
                        <div className="text-center my-0.5">
                          <span className="text-sm sm:text-2xl font-black font-mono tracking-tight block leading-none">
                            {temp3er > 0 ? `+${temp3er}` : temp3er}°C
                          </span>
                          <span className="text-[7px] sm:text-[8.5px] font-extrabold uppercase px-1 sm:px-2 py-0.5 rounded-full bg-white/20 inline-block mt-0.5">
                            {temp3er <= -9 ? '❄️ Congel' : '🥬 Refri'}
                          </span>
                        </div>

                        {/* Direct input option */}
                        <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-0.5 sm:gap-1 bg-black/20 rounded px-1 py-0.5">
                          <input
                            type="number"
                            value={temp3er}
                            onChange={(e) => handleSetTemp3er(parseInt(e.target.value) || 0)}
                            className="w-7 sm:w-10 bg-white text-slate-900 text-[9px] sm:text-xs font-mono font-black text-center rounded py-0 focus:outline-none"
                          />
                          <span className="text-[7.5px] sm:text-[9px] font-bold">°C</span>
                        </div>
                      </button>

                    </div>

                  </div>
                </div>
              </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                {/* Columna Izquierda: Check list + Fotos Colchonetas */}
                <div className="space-y-4">
                  {/* Check List de Inspección con Semáforo Compacto (4 Estados) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="block text-xs font-bold text-slate-500 uppercase">Check List de Inspección (Semáforo)</span>
                      <span className="text-[10px] text-slate-500 font-semibold italic">
                        Haz clic en el estado para cambiar
                      </span>
                    </div>

                    <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      {[
                        { key: 'postura_anden', label: '1. Horario de postura en el Andén' },
                        { key: 'limpieza_estructura', label: '2. Estado camión (Limpieza, Sin daños)' },
                        { key: 'luces_encendidas', label: '3. Estado de Luces (ENCENDIDAS)' },
                        { key: 'separador_termico', label: '4. Verificación Separador Térmico' },
                        { key: 'lingas_camion', label: '5. Verificación Lingas por camión' }
                      ].map((item) => {
                        const currentStatus = getChecklistStatus((checklist as any)[item.key]);
                        return (
                          <div key={item.key} className="flex items-center justify-between text-xs font-extrabold text-slate-800 py-1.5 border-b border-slate-200/60 last:border-0 select-none gap-2">
                            <span className="truncate">{item.label}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const nextStatus = toggleChecklistStatus(currentStatus);
                                setChecklist({ ...checklist, [item.key]: nextStatus });
                              }}
                              className={`px-3 py-1 rounded-full text-[10.5px] font-black border transition-all cursor-pointer shadow-2xs active:scale-95 flex items-center gap-1.5 shrink-0 ${
                                currentStatus === 'GRIS' ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300' :
                                currentStatus === 'VERDE' ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/30' :
                                currentStatus === 'AMARILLO' ? 'bg-amber-400 hover:bg-amber-500 text-amber-950 border-amber-500 shadow-amber-500/30' :
                                'bg-rose-600 hover:bg-rose-700 text-white border-rose-700 shadow-rose-600/30 animate-pulse'
                              }`}
                              title="Haz clic para alternar: Sin revisar ➔ Aprobado ➔ Problema ➔ Rechazado"
                            >
                              {currentStatus === 'GRIS' && <span>⚪ SIN REVISAR</span>}
                              {currentStatus === 'VERDE' && <span>🟢 APROBADO</span>}
                              {currentStatus === 'AMARILLO' && <span>🟡 PROBLEMA</span>}
                              {currentStatus === 'ROJO' && <span>🔴 RECHAZADO</span>}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* FOTOS & COMENTARIO DE COLCHONETAS / SEPARADOR TÉRMICO (IZQUIERDA) */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        📸 Fotos Colchonetas ({colchonetasPhotos.length})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <label className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 active:scale-95 shadow-2xs" title="Tomar foto directa con la cámara">
                          <Camera className="w-3.5 h-3.5 text-amber-600" />
                          <span>Tomar Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            onChange={handleColchonetasPhotoUpload}
                            className="hidden"
                          />
                        </label>
                        <label className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 active:scale-95 shadow-2xs" title="Elegir fotos guardadas desde la galería">
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Galería</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleColchonetasPhotoUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {colchonetasPhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {colchonetasPhotos.map((pUrl, pIdx) => (
                          <div key={pIdx} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100 group">
                            <img
                              src={pUrl}
                              alt={`Colchoneta ${pIdx + 1}`}
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => openPhotoGallery(colchonetasPhotos, pIdx)}
                            />
                            <button
                              type="button"
                              onClick={() => removeColchonetasPhoto(pIdx)}
                              className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-0.5 opacity-90 hover:opacity-100 shadow-sm cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder="Comentario sobre colchonetas / separador térmico..."
                      value={colchonetasComment}
                      onChange={(e) => setColchonetasComment(e.target.value)}
                      onPaste={handlePasteEquipmentPhotos('colchonetas')}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:border-amber-500 transition-all shadow-2xs"
                    />
                  </div>
                </div>

                {/* Columna Derecha: Posiciones, Kilos y Fotos Lingas */}
                <div className="space-y-4">
                  {/* POSICIONES OCUPADAS DENTRO DEL CAMIÓN */}
                  <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-black text-slate-700 uppercase tracking-wide">
                        Posiciones del Camión (Capacidad)
                      </label>
                      <span className="text-[10px] font-mono font-bold text-slate-500">
                        Total bases: {totals.bases} / {positionsOccupied}
                      </span>
                    </div>

                    {/* Botones Rápidos de Capacidad Estándar CIAL */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9.5px] font-bold text-slate-400 uppercase mr-1">Rápido:</span>
                      {[14, 24, 26, 28, 30, 32].map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setPositionsOccupied(pos)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-black font-mono transition-all cursor-pointer ${
                            positionsOccupied === pos
                              ? 'bg-brand-primary text-white shadow-xs scale-105 ring-2 ring-emerald-400/40'
                              : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs mt-1">
                      <button 
                        type="button"
                        onClick={() => setPositionsOccupied(Math.max(1, positionsOccupied - 1))}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer border border-slate-200"
                        title="Disminuir 1 posición"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      
                      <div className="flex-1 text-center flex items-center justify-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={positionsOccupied}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 1) {
                              setPositionsOccupied(Math.min(40, val));
                            } else if (e.target.value === '') {
                              setPositionsOccupied(0);
                            }
                          }}
                          onBlur={() => {
                            if (positionsOccupied < 1) setPositionsOccupied(26);
                          }}
                          className="w-16 text-center text-2xl font-black text-brand-primary font-mono bg-slate-50 border border-slate-200 rounded-lg py-0.5 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:bg-white"
                        />
                        <span className="text-[10px] text-slate-500 font-bold uppercase">POS</span>
                      </div>

                      <button 
                        type="button"
                        onClick={() => setPositionsOccupied(Math.min(40, positionsOccupied + 1))}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 w-9 h-9 rounded-lg flex items-center justify-center font-bold text-lg active:scale-95 transition-all cursor-pointer border border-slate-200"
                        title="Aumentar 1 posición"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* KILOS TOTALES DEL CAMIÓN */}
                  <div className="bg-amber-50/70 p-3.5 rounded-xl border border-amber-200/80 space-y-1.5 shadow-2xs">
                    <label className="block text-xs font-black text-amber-900 uppercase tracking-wider flex items-center justify-between">
                      <span>Kilos Totales del Camión (kg)</span>
                      <span className="text-[9px] font-mono bg-amber-200/60 text-amber-950 px-1.5 py-0.5 rounded font-extrabold">SEGÚN GUÍA DE RUTA</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        placeholder="Ej. 21.116" 
                        value={truckKilos} 
                        onChange={(e) => setTruckKilos(e.target.value)}
                        className="w-full bg-white border border-amber-300 rounded-xl px-3.5 py-2 text-base focus:outline-none focus:border-amber-600 font-mono font-black text-amber-950 shadow-2xs placeholder:text-amber-300/80"
                      />
                      <span className="text-xs font-black text-amber-900 font-mono pr-1">KG</span>
                    </div>
                  </div>

                  {/* FOTOS & COMENTARIO DE LINGAS (DERECHA) */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                        📸 Fotos Lingas ({lingasPhotos.length})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <label className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 active:scale-95 shadow-2xs" title="Tomar foto directa con la cámara">
                          <Camera className="w-3.5 h-3.5 text-amber-600" />
                          <span>Tomar Foto</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            multiple
                            onChange={handleLingasPhotoUpload}
                            className="hidden"
                          />
                        </label>
                        <label className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 active:scale-95 shadow-2xs" title="Elegir fotos guardadas desde la galería">
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Galería</span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleLingasPhotoUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {lingasPhotos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {lingasPhotos.map((pUrl, pIdx) => (
                          <div key={pIdx} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100 group">
                            <img
                              src={pUrl}
                              alt={`Linga ${pIdx + 1}`}
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => openPhotoGallery(lingasPhotos, pIdx)}
                            />
                            <button
                              type="button"
                              onClick={() => removeLingasPhoto(pIdx)}
                              className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-0.5 opacity-90 hover:opacity-100 shadow-sm cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <input
                      type="text"
                      placeholder="Comentario sobre estado de lingas..."
                      value={lingasComment}
                      onChange={(e) => setLingasComment(e.target.value)}
                      onPaste={handlePasteEquipmentPhotos('lingas')}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 font-medium focus:outline-none focus:border-amber-500 transition-all shadow-2xs"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* CARD 2: CARGA POR ZONALES */}
            <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-sm font-black text-brand-primary uppercase tracking-wider flex items-center gap-2">
                  <Truck className="w-4.5 h-4.5" />
                  2. Carga por Zonal ({selectedZonals.length})
                </h2>
                <button
                  type="button"
                  onClick={handleAddZonal}
                  className="bg-brand-primary hover:bg-brand-secondary text-white px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  AGREGAR ZONAL
                </button>
              </div>

              {selectedZonals.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                  <Truck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-400">No has agregado ningún zonal a este camión.</p>
                  <button
                    type="button"
                    onClick={handleAddZonal}
                    className="mt-3 bg-brand-primary hover:bg-brand-secondary text-white px-4 py-2 rounded-xl text-xs font-black inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    AGREGAR PRIMER ZONAL
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedZonals.map((zonal, zonalIndex) => {
                    const zTotals = getZonalTotals(zonal);
                    const isExpanded = expandedZonalIndex === zonalIndex;

                    return (
                      <div 
                        key={zonalIndex}
                        className={`border rounded-2xl overflow-hidden shadow-sm transition-all ${isExpanded ? 'border-brand-primary bg-white' : 'border-slate-200 bg-slate-50/30'}`}
                      >
                        {/* Cabecera del Acordeón del Zonal */}
                        <div 
                          className={`px-4 py-3 flex items-center justify-between cursor-pointer select-none ${isExpanded ? 'bg-brand-primary text-white' : 'bg-slate-100/50 hover:bg-slate-100 text-slate-800'}`}
                          onClick={() => setExpandedZonalIndex(isExpanded ? null : zonalIndex)}
                        >
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-black uppercase font-mono px-2 py-0.5 rounded bg-black/10">
                              #{zonalIndex + 1}
                            </span>
                            <span className="font-extrabold text-sm tracking-wide">
                              {zonal.zonal_name || "Seleccionar Zonal..."} {zonal.viaje_numero && zonal.viaje_numero > 1 ? `${zonal.viaje_numero}` : ''}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isExpanded ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'}`}>
                              {zonal.lugar_camion}
                            </span>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-[11px] font-bold text-right hidden sm:block">
                              <span className={isExpanded ? 'text-emerald-100' : 'text-slate-500'}>Madera: </span>
                              <span className="font-mono">{zTotals.wood}</span>
                              <span className="mx-1.5">|</span>
                              <span className={isExpanded ? 'text-emerald-100' : 'text-slate-500'}>Plástico: </span>
                              <span className="font-mono">{zTotals.plastic}</span>
                              <span className="mx-1.5">|</span>
                              <span className={isExpanded ? 'text-emerald-100' : 'text-slate-500'}>Bandejas: </span>
                              <span className="font-mono text-emerald-600 dark:text-emerald-400">{zTotals.bandejas}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleRemoveZonal(zonalIndex); }}
                                className={`p-1.5 rounded-lg transition-all ${isExpanded ? 'hover:bg-white/10 text-white/80 hover:text-white' : 'hover:bg-slate-200 text-slate-400 hover:text-rose-600'} cursor-pointer`}
                                title="Eliminar Zonal"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              {isExpanded ? <ChevronUp className="w-4.5 h-4.5" /> : <ChevronDown className="w-4.5 h-4.5" />}
                            </div>
                          </div>
                        </div>

                        {/* Detalle del Zonal (Cuerpo del Acordeón) */}
                        {isExpanded && (
                          <div className="p-4 space-y-5 border-t border-slate-100">
                            {/* Selector de Zonal, N° Viaje y Andén */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Zonal</label>
                                <select
                                  value={zonal.zonal_name}
                                  onChange={(e) => handleUpdateZonal(zonalIndex, 'zonal_name', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold"
                                >
                                  {ZONALES_LIST.map((z, idx) => (
                                    <option key={idx} value={z}>{z}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">N° Viaje / Carga</label>
                                <div className="flex items-center gap-1.5 select-none bg-white border border-slate-200 rounded-lg p-1 justify-between">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateZonal(zonalIndex, 'viaje_numero', Math.max(1, (zonal.viaje_numero || 1) - 1))}
                                    className="bg-slate-100 active:bg-slate-200 text-slate-700 w-7.5 h-7.5 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-mono text-xs font-black text-slate-800 w-6 text-center">{zonal.viaje_numero || 1}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateZonal(zonalIndex, 'viaje_numero', (zonal.viaje_numero || 1) + 1)}
                                    className="bg-slate-100 active:bg-slate-200 text-slate-700 w-7.5 h-7.5 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Lugar en el Camión (1° = Fondo)</label>
                                <select
                                  value={zonal.lugar_camion}
                                  onChange={(e) => handleUpdateZonal(zonalIndex, 'lugar_camion', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold"
                                >
                                  {["1° (Fondo)", "2°", "3°", "4° (Puerta)"].map((pos, idx) => (
                                    <option key={idx} value={pos}>{pos}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* TABLA DE CATEGORÍAS */}
                            <div className="space-y-4">
                              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-widest border-b pb-1">
                                Categorías de Pallet
                              </h3>

                              {(['congelados', 'estandar', 'bandejas'] as const).map((catName) => {
                                const catData = zonal[catName];
                                const catLabel = catName === 'congelados' ? 'CONGELADOS' : catName === 'estandar' ? 'ESTÁNDAR (CAJAS)' : 'BANDEJAS';
                                const hasWoodValue = (catData.wood_bases || 0) > 0 || (catData.wood_extra || 0) > 0;
                                const isWoodVisible = hasWoodValue || !!showWoodMap[`${zonalIndex}_${catName}`];

                                const hasPlasticValue = (catData.plastic_bases || 0) > 0 || (catData.plastic_extra || 0) > 0;
                                const isPlasticVisible = hasPlasticValue || !!showPlasticMap[`${zonalIndex}_${catName}`];

                                return (
                                  <div 
                                    key={catName} 
                                    className="p-3.5 border border-slate-200/80 rounded-xl space-y-3.5 bg-slate-50/20"
                                  >
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                      <span className="text-xs font-black text-brand-primary tracking-wide">
                                        {catLabel}
                                      </span>
                                    </div>

                                    {/* CONTADORES DE PALLETS (MADERA Y PLÁSTICO DESPLEGABLES) */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      
                                      {/* COLUMNA: PALLETS MADERA (CON OPCIÓN DE OCULTAR POR DEFECTO) */}
                                      {!isWoodVisible ? (
                                        <div className="bg-slate-100/60 border border-dashed border-slate-300 p-2.5 rounded-xl flex items-center justify-between text-xs">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase">Pallet Madera (No usado)</span>
                                          <button
                                            type="button"
                                            onClick={() => toggleWoodShow(zonalIndex, catName)}
                                            className="text-[10px] font-extrabold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                          >
                                            <Plus className="w-3 h-3" />
                                            Desplegar Madera
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="bg-amber-50/20 border border-amber-100 p-2.5 rounded-xl space-y-2">
                                          <div className="flex justify-between items-center select-none">
                                            <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                                              Pallet Madera
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[11px] font-black text-amber-950 font-mono bg-amber-100/50 px-1.5 py-0.5 rounded">
                                                {catData.wood_bases}+{catData.wood_extra} ({catData.wood_bases + catData.wood_extra})
                                              </span>
                                              {!hasWoodValue && (
                                                <button
                                                  type="button"
                                                  onClick={() => toggleWoodShow(zonalIndex, catName)}
                                                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer ml-1"
                                                  title="Ocultar Pallet Madera"
                                                >
                                                  Ocultar X
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          <div className="space-y-1.5 bg-white p-2 rounded-lg border border-slate-100/60">
                                            {/* Base */}
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-[10px] font-bold text-slate-400">Base</span>
                                              <div className="flex items-center gap-2 select-none">
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateCategory(zonalIndex, catName, 'wood_bases', catData.wood_bases - 1)}
                                                  className="bg-slate-100 active:bg-slate-200 text-slate-600 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                                >
                                                  -
                                                </button>
                                                <span className="font-mono text-xs font-black w-6 text-center">{catData.wood_bases}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateCategory(zonalIndex, catName, 'wood_bases', catData.wood_bases + 1)}
                                                  className="bg-slate-100 active:bg-slate-200 text-slate-600 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                                >
                                                  +
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Extra */}
                                            <div className="flex items-center justify-between text-xs border-t border-slate-50 pt-1.5">
                                              <span className="text-[10px] font-bold text-slate-400">2da Base (Extra)</span>
                                              <div className="flex items-center gap-2 select-none">
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateCategory(zonalIndex, catName, 'wood_extra', catData.wood_extra - 1)}
                                                  className="bg-slate-100 active:bg-slate-200 text-slate-600 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                                >
                                                  -
                                                </button>
                                                <span className="font-mono text-xs font-black w-6 text-center">{catData.wood_extra}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateCategory(zonalIndex, catName, 'wood_extra', catData.wood_extra + 1)}
                                                  className="bg-slate-100 active:bg-slate-200 text-slate-600 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                                >
                                                  +
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* COLUMNA: PALLETS PLÁSTICOS (CON OPCIÓN DE OCULTAR POR DEFECTO) */}
                                      {!isPlasticVisible ? (
                                        <div className="bg-slate-100/60 border border-dashed border-slate-300 p-2.5 rounded-xl flex items-center justify-between text-xs">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase">Pallet Plástico (No usado)</span>
                                          <button
                                            type="button"
                                            onClick={() => togglePlasticShow(zonalIndex, catName)}
                                            className="text-[10px] font-extrabold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                          >
                                            <Plus className="w-3 h-3" />
                                            Desplegar Plástico
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="bg-emerald-50/20 border border-emerald-100 p-2.5 rounded-xl space-y-2">
                                          <div className="flex justify-between items-center select-none">
                                            <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                                              Pallet Plástico
                                            </span>
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-[11px] font-black text-emerald-950 font-mono bg-emerald-100/50 px-1.5 py-0.5 rounded">
                                                {catData.plastic_bases}+{catData.plastic_extra} ({catData.plastic_bases + catData.plastic_extra})
                                              </span>
                                              {!hasPlasticValue && (
                                                <button
                                                  type="button"
                                                  onClick={() => togglePlasticShow(zonalIndex, catName)}
                                                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer ml-1"
                                                  title="Ocultar Pallet Plástico"
                                                >
                                                  Ocultar X
                                                </button>
                                              )}
                                            </div>
                                          </div>

                                          <div className="space-y-1.5 bg-white p-2 rounded-lg border border-slate-100/60">
                                            {/* Base */}
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-[10px] font-bold text-slate-400">Base</span>
                                              <div className="flex items-center gap-2 select-none">
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateCategory(zonalIndex, catName, 'plastic_bases', catData.plastic_bases - 1)}
                                                  className="bg-slate-100 active:bg-slate-200 text-slate-600 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                                >
                                                  -
                                                </button>
                                                <span className="font-mono text-xs font-black w-6 text-center">{catData.plastic_bases}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateCategory(zonalIndex, catName, 'plastic_bases', catData.plastic_bases + 1)}
                                                  className="bg-slate-100 active:bg-slate-200 text-slate-600 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                                >
                                                  +
                                                </button>
                                              </div>
                                            </div>
                                            
                                            {/* Extra */}
                                            <div className="flex items-center justify-between text-xs border-t border-slate-50 pt-1.5">
                                              <span className="text-[10px] font-bold text-slate-400">2da Base (Extra)</span>
                                              <div className="flex items-center gap-2 select-none">
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateCategory(zonalIndex, catName, 'plastic_extra', catData.plastic_extra - 1)}
                                                  className="bg-slate-100 active:bg-slate-200 text-slate-600 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                                >
                                                  -
                                                </button>
                                                <span className="font-mono text-xs font-black w-6 text-center">{catData.plastic_extra}</span>
                                                <button
                                                  type="button"
                                                  onClick={() => handleUpdateCategory(zonalIndex, catName, 'plastic_extra', catData.plastic_extra + 1)}
                                                  className="bg-slate-100 active:bg-slate-200 text-slate-600 w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs cursor-pointer"
                                                >
                                                  +
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Si es categoría BANDEJAS, agregar el contador de bandejas físicas */}
                                    {catName === 'bandejas' && (
                                      <div className="bg-slate-100/50 p-3 rounded-lg border border-slate-200/50 space-y-2">
                                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] font-black text-slate-500 uppercase">Cantidad de Bandejas:</span>
                                            <span className="text-lg font-black text-brand-primary font-mono bg-white px-3 py-1 rounded border shadow-2xs">
                                              {catData.bandejas_count || 0}
                                            </span>
                                            {(!catData.bandejas_count && !catData.plastic_bases && !catData.wood_bases) && (
                                              <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-200">
                                                ⚠️ Sin bandejas ingresadas
                                              </span>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => openBandejasHelper(zonalIndex)}
                                              className="bg-brand-primary hover:bg-brand-secondary text-white px-4 py-2 rounded-xl text-xs font-black cursor-pointer transition-all shadow-md flex items-center gap-1.5 active:scale-95"
                                            >
                                              <Award className="w-4 h-4" />
                                              Usar Asistente de Bandejas
                                            </button>
                                          </div>
                                        </div>

                                        {/* MOSTRAR DESGLOSE DE FÓRMULA SI EXISTE */}
                                        {catData.bandejas_formula && (
                                          <div className="text-[11px] font-mono font-bold text-slate-600 bg-amber-50/70 border border-amber-200/80 px-2.5 py-1 rounded-lg flex items-center gap-1.5 flex-wrap">
                                            <span className="text-[10px] text-amber-900 font-extrabold uppercase tracking-wide">Cálculo del Conteo:</span>
                                            <span className="text-amber-950 font-black">{catData.bandejas_formula}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}

                                  </div>
                                );
                              })}
                            </div>

                            {/* SECCIÓN SELLOS Y FOTOS DEL ZONAL */}
                            <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                              <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider border-b pb-1">
                                Control Adicional & Respaldos Fotográficos del Zonal
                              </h3>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nº de Sello</label>
                                  <input
                                    type="text"
                                    placeholder="Ej. 017315"
                                    value={zonal.sello}
                                    onChange={(e) => handleUpdateZonal(zonalIndex, 'sello', e.target.value)}
                                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                    Fotos de Respaldo Zonal ({(zonal.photos || []).length}/10)
                                  </label>
                                  {(!zonal.photos || zonal.photos.length < 10) && (
                                    <div className="flex items-center gap-2 select-none">
                                      <label className="flex-1 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200 shadow-2xs active:scale-95" title="Tomar foto directa con la cámara">
                                        <Camera className="w-4 h-4 text-brand-primary shrink-0" />
                                        <span>Tomar Foto</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          capture="environment"
                                          className="hidden"
                                          onChange={(e) => handleAddZonalPhoto(zonalIndex, e.target.files)}
                                        />
                                      </label>
                                      <label className="flex-1 bg-white hover:bg-slate-100 text-slate-700 px-3 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-200 shadow-2xs active:scale-95" title="Seleccionar fotos guardadas desde la galería">
                                        <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <span>Galería</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          className="hidden"
                                          onChange={(e) => handleAddZonalPhoto(zonalIndex, e.target.files)}
                                        />
                                      </label>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* FOTOS EN MINIATURA DEL ZONAL */}
                              {zonal.photos && zonal.photos.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200/60">
                                  {zonal.photos.map((imgSrc, pIdx) => (
                                    <div key={pIdx} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100 shadow-sm">
                                      <img
                                        src={imgSrc}
                                        alt={`Zonal ${zonalIndex + 1} Foto ${pIdx + 1}`}
                                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => openPhotoGallery(zonal.photos || [], pIdx)}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveZonalPhoto(zonalIndex, pIdx)}
                                        className="absolute top-1 right-1 bg-rose-600 hover:bg-rose-700 text-white p-1 rounded-full shadow-md cursor-pointer transition-all active:scale-90"
                                        title="Eliminar foto"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* CARD 3: OBSERVACIONES */}
            <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-4">
              <h2 className="text-sm font-black text-brand-primary uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <FileText className="w-4.5 h-4.5" />
                3. Observaciones
              </h2>
              <textarea
                rows={3}
                placeholder="Observaciones adicionales, estado del camión, motivos de no cumplimiento, etc..."
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-semibold"
              />
            </section>

            {/* CARD RESUMEN Y BOTÓN CONFIRMAR */}
            <section className="bg-slate-900 text-white rounded-2xl p-5 shadow-md space-y-4 select-none">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/10 pb-2.5">
                <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5" />
                  Resumen de Carga del Camión
                </h2>

                {/* HORA CIERRE DE CAMIÓN EN EL RESUMEN DE CONFIRMACIÓN */}
                <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 w-full sm:w-auto">
                  <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-black text-slate-300 uppercase shrink-0">Hora Cierre:</span>
                  <input 
                    type="time" 
                    value={closeTime} 
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="bg-white/20 border border-white/20 text-white rounded-lg px-2.5 py-1 text-xs font-mono font-black focus:outline-none focus:bg-white/30 text-center w-24"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const pad = (n: number) => n.toString().padStart(2, '0');
                      setCloseTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
                    }}
                    className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-2.5 py-1 rounded-lg text-[10px] font-black transition-all active:scale-95 cursor-pointer shadow-sm shrink-0"
                    title="Establecer Hora Actual"
                  >
                    Ahora
                  </button>
                </div>
              </div>

              {/* DESGLOSE SEPARADO POR CADA ZONAL */}
              {selectedZonals.length === 0 ? (
                <div className="text-center py-4 bg-white/5 rounded-xl border border-dashed border-white/10">
                  <p className="text-xs font-bold text-slate-400">Agrega al menos un Zonal arriba para ver la separación de carga.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Desglose por Zonal ({selectedZonals.length}):
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {selectedZonals.map((z, idx) => {
                      const zt = getZonalTotals(z);
                      const zonalDisplayName = z.zonal_name;
                      return (
                        <div key={idx} className="bg-white/5 border border-white/10 p-3 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between border-b border-white/10 pb-1">
                            <span className="text-xs font-black text-emerald-300 uppercase truncate" title={zonalDisplayName}>
                              📍 {zonalDisplayName}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 font-bold bg-white/10 px-1.5 py-0.5 rounded">
                              {z.lugar_camion}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-center pt-0.5 text-xs font-mono font-bold">
                            <div className="bg-amber-400/10 border border-amber-400/20 rounded py-1">
                              <span className="text-[9px] text-amber-300/80 block font-sans font-bold">Madera</span>
                              <span className="text-amber-400 font-black">{zt.wood}</span>
                            </div>
                            <div className="bg-emerald-400/10 border border-emerald-400/20 rounded py-1">
                              <span className="text-[9px] text-emerald-300/80 block font-sans font-bold">Plástico</span>
                              <span className="text-emerald-400 font-black">{zt.plastic}</span>
                            </div>
                            <div className="bg-white/10 border border-white/20 rounded py-1">
                              <span className="text-[9px] text-slate-300 block font-sans font-bold">Bandejas</span>
                              <span className="text-white font-black">{zt.bandejas}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TOTALES CONSOLIDADOS DEL CAMIÓN */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="block text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Totales Consolidados del Camión:
                  </span>
                  <div className={`px-2.5 py-1 rounded-lg text-xs font-black flex items-center gap-1.5 border transition-all ${
                    totals.bases > positionsOccupied
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 animate-pulse'
                      : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  }`}>
                    <span>Posiciones Ocupadas (Bases):</span>
                    <span className="font-mono text-sm font-black">{totals.bases} / {positionsOccupied}</span>
                    {totals.bases > positionsOccupied && <span>⚠️ Excede capacidad</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                    <span className="text-[10px] text-amber-300/80 font-bold block uppercase">Pallets Madera</span>
                    <span className="text-2xl font-mono font-black text-amber-400 mt-0.5 block">{totals.wood}</span>
                  </div>
                  <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                    <span className="text-[10px] text-emerald-300/80 font-bold block uppercase">Pallets Plástico</span>
                    <span className="text-2xl font-mono font-black text-emerald-400 mt-0.5 block">{totals.plastic}</span>
                  </div>
                  <div className="bg-white/10 p-3 rounded-xl border border-white/20">
                    <span className="text-[10px] text-slate-300 font-bold block uppercase">Bandejas Totales</span>
                    <span className="text-2xl font-mono font-black text-white mt-0.5 block">{totals.bandejas}</span>
                  </div>
                  <div className={`p-3 rounded-xl border transition-all ${
                    totals.bases > positionsOccupied
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      : 'bg-violet-500/10 border-violet-500/20 text-violet-300'
                  }`}>
                    <span className="text-[10px] font-bold block uppercase opacity-80">Posiciones (Bases)</span>
                    <span className="text-2xl font-mono font-black mt-0.5 block">{totals.bases} / {positionsOccupied}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <div className="flex-1 text-xs text-slate-400 font-semibold">
                  Al presionar <span className="text-emerald-400 font-bold">{editingDispatchId ? '"Guardar Cambios de Despacho"' : '"Confirmar Despacho"'}</span>, se confirmará la salida del camión. Para guardar sin despachar, usa <span className="text-amber-400 font-bold">"Guardar Avance"</span>.
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleSaveProgress}
                    disabled={saveProgressLoading}
                    className="w-full sm:w-auto px-6 py-4 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md bg-amber-500 hover:bg-amber-600 text-white cursor-pointer"
                    title="Guarda tu avance actual sin confirmar el despacho"
                  >
                    {saveProgressLoading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-5 h-5" />
                        <span>GUARDAR AVANCE</span>
                      </>
                    )}
                  </button>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full sm:w-auto px-8 py-4 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg disabled:opacity-50 cursor-pointer ${
                      editingDispatchId
                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                        : 'bg-brand-emerald hover:bg-emerald-600 text-white'
                    }`}
                  >
                    {loading ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : editingDispatchId ? (
                      <>
                        <Edit2 className="w-5 h-5" />
                        GUARDAR CAMBIOS DE DESPACHO
                      </>
                    ) : (
                      <>
                        <Check className="w-5 h-5" />
                        CONFIRMAR DESPACHO
                      </>
                    )}
                  </button>
                </div>
              </div>
            </section>

          </form>
        )}

        {activeTab === 'historial' && (
          <div className="space-y-6">
            {/* Cabecera y Subpestañas del Historial */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3 select-none">
              <div>
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-brand-primary" />
                  <span>Historial de Despachos Ingresados</span>
                </h2>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Visualiza los despachos en vista general o desglosados individualmente por Zonal.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Selector de Período Rápido */}
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => fetchHistory('hoy')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      historyPeriod === 'hoy'
                        ? 'bg-brand-primary text-white shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ⚡ Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchHistory('semana')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      historyPeriod === 'semana'
                        ? 'bg-brand-primary text-white shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🗓️ Esta Semana
                  </button>
                  <button
                    type="button"
                    onClick={() => fetchHistory('todo')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      historyPeriod === 'todo'
                        ? 'bg-brand-primary text-white shadow-sm font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🗂️ Ver Todo
                  </button>
                </div>

                {/* Subpestañas */}
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setHistorySubTab('camiones')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      historySubTab === 'camiones'
                        ? 'bg-white text-slate-800 shadow-sm font-black'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Truck className="w-3.5 h-3.5 text-brand-primary" />
                    Vista Camiones
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistorySubTab('zonales')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      historySubTab === 'zonales'
                        ? 'bg-white text-slate-800 shadow-sm font-black'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5 text-brand-emerald" />
                    Reporte por Zonal
                  </button>
                  <button
                    type="button"
                    onClick={() => { setHistorySubTab('saldos'); fetchReturns(); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      historySubTab === 'saldos'
                        ? 'bg-white text-slate-800 shadow-sm font-black'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5 text-amber-600" />
                    Saldos Zonales
                  </button>
                </div>

                <button 
                  onClick={() => fetchHistory(historyPeriod)}
                  className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all active:scale-95 text-slate-600 cursor-pointer shadow-sm"
                  title="Actualizar Historial"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* VISTA 1: POR CAMIONES (Tarjeta tradicional) */}
            {historySubTab === 'camiones' && (
              <div className="space-y-4">
                {/* SECCIÓN DE AVANCES GUARDADOS (BORRADORES EN CARGA) */}
                {truckDrafts.filter(d => d.truckNumber || d.truckPlate || (d.selectedZonals && d.selectedZonals.length > 0) || (d.photos && d.photos.length > 0)).length > 0 && (
                  <div className="space-y-3 bg-amber-50/60 p-4 rounded-2xl border-2 border-amber-300 shadow-2xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h3 className="text-xs font-black uppercase text-amber-950 tracking-wider flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping inline-block" />
                        🟡 Avances Guardados — Camiones en Carga (Abiertos)
                      </h3>
                      <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                        {truckDrafts.filter(d => d.truckNumber || d.truckPlate || (d.selectedZonals && d.selectedZonals.length > 0) || (d.photos && d.photos.length > 0)).length} avance(s) en proceso
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {truckDrafts
                        .filter(d => d.truckNumber || d.truckPlate || (d.selectedZonals && d.selectedZonals.length > 0) || (d.photos && d.photos.length > 0))
                        .map(draft => (
                          <div key={draft.id} className="bg-white border border-amber-300 rounded-xl p-3.5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[9px] font-black bg-amber-100 text-amber-950 border border-amber-300 px-2 py-0.5 rounded-md uppercase">
                                  🟡 EN CARGA (AVANCE GUARDADO)
                                </span>
                                <span className="text-xs font-black text-slate-900">
                                  🚚 Camión #{draft.truckNumber || 'S/N'} {draft.truckPlate ? `| Patente: ${draft.truckPlate}` : ''} {draft.truckAnden ? `| Andén ${draft.truckAnden}` : ''}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600 font-bold flex items-center gap-3 flex-wrap pt-0.5">
                                <span>Supervisor: <strong className="text-slate-800">{draft.supervisorName || 'S/I'}</strong></span>
                                <span>Zonales: <strong className="text-amber-900">{(draft.selectedZonals || []).map(z => z.zonal_name).join(', ') || 'Sin Zonales'}</strong></span>
                                {draft.photos && draft.photos.length > 0 && (
                                  <span className="text-emerald-700 font-mono">📷 {draft.photos.length} fotos</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('nuevo');
                                  switchActiveDraft(draft.id);
                                  window.scrollTo({ top: 0, behavior: 'smooth' });
                                }}
                                className="bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5"
                              >
                                <span>✏️ Recuperar / Editar</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTruckDraft(draft.id)}
                                className="bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-200"
                                title="Descartar borrador de avance"
                              >
                                <span>✕ Descartar</span>
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {records.length === 0 ? (
                  <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl">
                    <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-bold text-slate-400">Aún no se han registrado despachos cerrados en este día.</p>
                  </div>
                ) : (
                  <>
                    {records.map((rec) => {
                    const zTotals = rec.zonals_detail.reduce(
                      (acc, z) => {
                        const w = 
                          z.congelados.wood_bases + z.congelados.wood_extra +
                          z.estandar.wood_bases + z.estandar.wood_extra +
                          z.bandejas.wood_bases + z.bandejas.wood_extra;
                        const p = 
                          z.congelados.plastic_bases + z.congelados.plastic_extra +
                          z.estandar.plastic_bases + z.estandar.plastic_extra +
                          z.bandejas.plastic_bases + z.bandejas.plastic_extra;
                        const b = z.bandejas.bandejas_count || 0;
                        return { w: acc.w + w, p: acc.p + p, b: acc.b + b };
                      },
                      { w: 0, p: 0, b: 0 }
                    );

                    return (
                      <div key={rec.id} className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all space-y-3">
                        {/* Cabecera */}
                        <div className="flex items-start justify-between flex-wrap gap-2 border-b border-slate-100 pb-2.5 select-none">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-black bg-emerald-50 text-brand-primary border border-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                SUPERVISOR: {rec.supervisor_name}
                              </span>
                              <span className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
                                <Truck className="w-4 h-4 text-slate-400" />
                                N° Camión: {rec.truck_number !== 'N/A' ? rec.truck_number : 'S/A'} 
                                {rec.truck_plate !== 'N/A' && ` | Patente: ${rec.truck_plate}`}
                                {rec.anden_number && ` | Andén: ${rec.anden_number}`}
                              </span>
                            </div>

                            {/* Badges de Termos, Kilos y Hora de Cierre */}
                            <div className="flex items-center gap-2 flex-wrap pt-0.5">
                              <div className="text-[10px] text-slate-600 font-bold font-mono bg-slate-50 border border-slate-200/70 px-2 py-0.5 rounded-md">
                                Termos: 1er: {rec.temp_1er}°C | 2do: {rec.temp_2do}°C | 3er: {rec.temp_3er}°C
                              </div>

                              {rec.truck_kilos && (
                                <div className="text-[10px] text-amber-900 font-extrabold font-mono bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                                  <span>⚖️</span>
                                  <span>{typeof rec.truck_kilos === 'number' ? rec.truck_kilos.toLocaleString('es-CL') : rec.truck_kilos} kg</span>
                                </div>
                              )}

                              {/* Hora Cierre Camión */}
                              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/70 px-2 py-0.5 rounded-md text-[10px] font-bold">
                                <Clock className="w-3 h-3 text-brand-primary" />
                                <span className="text-slate-500 uppercase">Cierre:</span>
                                {editingCloseTimes[rec.id] !== undefined ? (
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="time"
                                      value={editingCloseTimes[rec.id]}
                                      onChange={(e) => setEditingCloseTimes(prev => ({ ...prev, [rec.id]: e.target.value }))}
                                      className="bg-white border border-slate-300 rounded px-1 py-0 text-[10px] font-mono font-bold focus:outline-none focus:border-brand-primary"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const now = new Date();
                                        const pad = (n: number) => n.toString().padStart(2, '0');
                                        setEditingCloseTimes(prev => ({ ...prev, [rec.id]: `${pad(now.getHours())}:${pad(now.getMinutes())}` }));
                                      }}
                                      className="bg-slate-200 text-slate-700 px-1 py-0 rounded text-[9px] font-bold cursor-pointer"
                                    >
                                      Ahora
                                    </button>
                                    <button
                                      type="button"
                                      disabled={savingCloseTimeId === rec.id}
                                      onClick={() => handleSaveCloseTime(rec.id, editingCloseTimes[rec.id])}
                                      className="bg-emerald-600 text-white px-1.5 py-0 rounded text-[9px] font-black cursor-pointer disabled:opacity-50"
                                    >
                                      {savingCloseTimeId === rec.id ? '...' : 'OK'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingCloseTimes(prev => {
                                        const copy = { ...prev };
                                        delete copy[rec.id];
                                        return copy;
                                      })}
                                      className="text-slate-400 text-[9px] font-bold cursor-pointer"
                                    >
                                      X
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span className={`font-mono font-black ${rec.close_time ? 'text-brand-primary' : 'text-slate-400 italic'}`}>
                                      {rec.close_time ? `${rec.close_time} hrs` : 'Pendiente'}
                                    </span>
                                    {(isAdmin || rec.inspection_date === getChileDateString()) && (
                                      <button
                                        type="button"
                                        onClick={() => setEditingCloseTimes(prev => ({ ...prev, [rec.id]: rec.close_time || '' }))}
                                        className="text-slate-400 hover:text-brand-primary p-0.5 cursor-pointer"
                                        title="Editar Hora de Cierre"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right text-[11px] text-slate-400 font-mono select-none">
                            <div className="flex items-center gap-1 justify-end font-bold text-slate-600">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {getFormatDate(rec.inspection_date)}
                            </div>
                            <div className="flex items-center gap-1 justify-end mt-0.5">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {rec.inspection_time}
                            </div>
                          </div>
                        </div>

                        {/* ZONALES INVOLUCRADOS EN ESTE CAMIÓN */}
                        <div className="flex items-center gap-1.5 flex-wrap bg-slate-50/80 p-2 rounded-xl border border-slate-100 text-xs">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                            Zonales ({rec.zonals_detail.length}):
                          </span>
                          {rec.zonals_detail.map((z, idx) => (
                            <span 
                              key={idx} 
                              className="inline-flex items-center gap-1 bg-white border border-slate-200 text-slate-800 text-[11px] font-extrabold px-2 py-0.5 rounded-lg shadow-2xs"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-brand-primary"></span>
                              {z.zonal_name}
                              <span className="text-[9px] text-slate-400 font-mono font-normal">({z.lugar_camion})</span>
                            </span>
                          ))}
                        </div>

                        {/* BARRA COMPACTA: TOTALES Y BOTONES DE ACCIÓN */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-slate-100 select-none">
                          {/* Resumen Compacto de Pallets */}
                          <div className="flex items-center gap-2 font-mono text-xs font-black bg-slate-100/70 border border-slate-200/60 p-1.5 rounded-xl justify-around sm:justify-start">
                            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
                              <span className="text-[10px] font-bold text-amber-800 uppercase">Madera:</span>
                              <span className="text-amber-900">{zTotals.w}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
                              <span className="text-[10px] font-bold text-emerald-800 uppercase">Plástico:</span>
                              <span className="text-emerald-900">{zTotals.p}</span>
                            </div>
                            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-2xs">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Bandejas:</span>
                              <span className="text-slate-800">{zTotals.b}</span>
                            </div>
                          </div>

                          {/* Botones de Acción PDF */}
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              disabled={generatingPdfId === rec.id}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleProcessPDF(rec, 'preview');
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border border-emerald-600 bg-brand-emerald text-white flex items-center gap-1 hover:bg-emerald-600 disabled:opacity-60"
                              title="Ver vista previa interactiva del PDF e imprimir"
                            >
                              {generatingPdfId === rec.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                              VER PDF
                            </button>

                            <button
                              type="button"
                              disabled={generatingPdfId === rec.id}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleProcessPDF(rec, 'download');
                              }}
                              className="px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 disabled:opacity-60"
                              title="Descargar PDF directamente"
                            >
                              <FileDown className="w-3.5 h-3.5 text-slate-600" />
                              <span className="hidden sm:inline">Descargar</span>
                            </button>

                            {(() => {
                              const today = getChileDateString();
                              const isToday = rec.inspection_date === today;
                              // Supervisores y Jefes de Turno SOLO pueden editar/eliminar despachos del MISMO DÍA (Horario Chile). Solo Administradores pueden modificar días pasados.
                              const canEdit = isAdmin || isToday;
                              return canEdit ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditDispatchInForm(rec)}
                                    className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border border-amber-500 bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1"
                                    title={isAdmin ? "Editar Despacho (Modo Admin)" : "Editar Despacho de Hoy (Horario Chile)"}
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                    EDITAR
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDispatch(rec)}
                                    className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border border-rose-600 bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1"
                                    title={isAdmin ? "Eliminar Despacho (Modo Admin)" : "Eliminar Despacho de Hoy (Horario Chile)"}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    ELIMINAR
                                  </button>
                                </>
                                ) : null;
                              })()}

                            {/* BOTÓN REPORTE DE FALLAS A RAMPAS SI HAY OBSERVACIONES */}
                            {(() => {
                              const chk = rec.checklist || {};
                              const hasFaults = ['postura_anden', 'limpieza_estructura', 'luces_encendidas', 'separador_termico', 'lingas_camion'].some(k => {
                                const st = getChecklistStatus(chk[k]);
                                return st === 'AMARILLO' || st === 'ROJO';
                              });
                              if (!hasFaults) return null;
                              return (
                                <button
                                  type="button"
                                  onClick={() => openFailureAlertModalForRecord(rec)}
                                  className="px-2.5 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 flex items-center gap-1"
                                  title="Enviar aviso por correo sobre las fallas de este camión"
                                >
                                  <Mail className="w-3.5 h-3.5 text-rose-600" />
                                  <span className="hidden sm:inline">Aviso Falla</span>
                                </button>
                              );
                            })()}

                            {/* BOTÓN FIRMAR (Sujeto a permiso can_sign) */}
                            {rec.signed_by ? (
                              <span className="px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 select-none" title={`Firmado por ${rec.signed_by} (${rec.signed_by_title || 'Supervisor'}) el ${rec.signed_at ? new Date(rec.signed_at).toLocaleString('es-CL') : ''}`}>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                FIRMADO
                              </span>
                            ) : userCanSign !== false ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const missing = getMissingSignFields(rec);
                                  if (missing.length > 0) {
                                    setSignWarningAlert({ fields: missing, rec });
                                  } else {
                                    setSignPreviewRecord(rec);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border border-violet-500 bg-violet-500 hover:bg-violet-600 text-white flex items-center gap-1"
                                title="Firmar este despacho digitalmente"
                              >
                                <PenTool className="w-3.5 h-3.5" />
                                FIRMAR
                              </button>
                            ) : (
                              <span className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed select-none flex items-center gap-1" title="Tu usuario no tiene permiso para firmar despachos (Facturador)">
                                🚫 Sin Permiso Firma
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                const isOpening = !expandedRecords[rec.id];
                                setExpandedRecords(prev => ({ ...prev, [rec.id]: !prev[rec.id] }));
                                // Si se está abriendo y aún no se han cargado las fotos (la vista las excluye),
                                // cargamos el registro completo desde pallet_dispatches
                                if (isOpening) {
                                  const cl = rec.checklist as any;
                                  const hasPhotos = cl?.colchonetas_photos?.length > 0 || cl?.lingas_photos?.length > 0;
                                  const hasZonalPhotos = rec.zonals_detail?.some((z: any) => z.photos?.length > 0);
                                  if (!hasPhotos && !hasZonalPhotos) {
                                    fetchFullDispatchDetail(rec.id);
                                  }
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border flex items-center gap-1 ${
                                expandedRecords[rec.id] 
                                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' 
                                  : 'bg-brand-primary hover:bg-brand-secondary border-brand-primary text-white'
                              }`}
                            >
                              {expandedRecords[rec.id] ? (
                                <>
                                  <ChevronUp className="w-3.5 h-3.5" />
                                  OCULTAR
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3.5 h-3.5" />
                                  VER DETALLES
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Desglose Condicional de Zonales */}
                        {expandedRecords[rec.id] && (
                          <div className="space-y-4 pt-3.5 border-t border-slate-100">
                            <div className="space-y-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block select-none">
                                Detalle de Zonales cargados:
                              </span>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {rec.zonals_detail.map((z, idx) => {
                                  const zT = z.congelados.wood_bases + z.congelados.wood_extra +
                                            z.estandar.wood_bases + z.estandar.wood_extra +
                                            z.bandejas.wood_bases + z.bandejas.wood_extra;
                                  const zP = z.congelados.plastic_bases + z.congelados.plastic_extra +
                                            z.estandar.plastic_bases + z.estandar.plastic_extra +
                                            z.bandejas.plastic_bases + z.bandejas.plastic_extra;

                                  return (
                                    <div key={idx} className="bg-slate-50/50 p-3 rounded-xl border border-slate-100 text-xs">
                                      <div className="flex justify-between items-center font-extrabold text-slate-700 mb-1.5 border-b border-slate-200/50 pb-1">
                                        <span>{z.zonal_name} ({z.lugar_camion})</span>
                                        {z.sello && <span className="text-[9px] bg-slate-200 px-1.5 py-0.5 rounded font-mono font-bold">Sello: {z.sello}</span>}
                                      </div>
                                      <div className="space-y-1 font-semibold text-slate-500 font-mono">
                                        <div className="flex justify-between">
                                          <span>Congelados:</span>
                                          <span>M:{z.congelados.wood_bases}+{z.congelados.wood_extra} | P:{z.congelados.plastic_bases}+{z.congelados.plastic_extra}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Estándar:</span>
                                          <span>M:{z.estandar.wood_bases}+{z.estandar.wood_extra} | P:{z.estandar.plastic_bases}+{z.estandar.plastic_extra}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span>Bandejas:</span>
                                          <span>{z.bandejas.bandejas_count}B {z.bandejas.bandejas_formula ? `(${z.bandejas.bandejas_formula})` : ''} | M:{z.bandejas.wood_bases}+{z.bandejas.wood_extra} | P:{z.bandejas.plastic_bases}+{z.bandejas.plastic_extra}</span>
                                        </div>
                                        <div className="flex justify-between text-brand-primary font-bold border-t border-dashed border-slate-200 pt-1 mt-1 text-[11px]">
                                          <span>Totales Zonal:</span>
                                          <span>M:{zT} | P:{zP}</span>
                                        </div>
                                      </div>
                                      {z.photos && z.photos.length > 0 && (
                                        <div className="pt-2 border-t border-slate-200/60 mt-1.5 space-y-1">
                                          <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                                            <Camera className="w-3 h-3 text-brand-primary" />
                                            Fotos Zonal ({z.photos.length}):
                                          </span>
                                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                            {z.photos.map((pUrl, pIdx) => (
                                              <div key={pIdx} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-200">
                                                <img
                                                  src={pUrl}
                                                  alt={`Foto Zonal ${pIdx + 1}`}
                                                  className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                  onClick={() => openPhotoGallery(z.photos || [], pIdx)}
                                                />
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* INSPECCIÓN DE EQUIPAMIENTO DEL CAMIÓN (LINGAS & COLCHONETAS) */}
                            {((rec.checklist as any)?.colchonetas_photos?.length > 0 ||
                              (rec.checklist as any)?.colchonetas_comment ||
                              (rec.checklist as any)?.lingas_photos?.length > 0 ||
                              (rec.checklist as any)?.lingas_comment) && (
                              <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200/70 space-y-2 text-xs select-none">
                                <div className="font-extrabold text-amber-900 flex items-center gap-1.5 uppercase text-[10px] tracking-wider">
                                  <span>📦</span> Inspección de Equipamiento (Colchonetas & Lingas)
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {/* Colchonetas */}
                                  {((rec.checklist as any)?.colchonetas_photos?.length > 0 || (rec.checklist as any)?.colchonetas_comment) && (
                                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80 space-y-1.5">
                                      <span className="font-extrabold text-slate-800 block text-[11px]">
                                        Separador Térmico / Colchonetas
                                      </span>
                                      {(rec.checklist as any)?.colchonetas_comment && (
                                        <p className="text-slate-600 text-[11px] font-medium bg-slate-50 p-1.5 rounded border border-slate-100 italic">
                                          "{ (rec.checklist as any).colchonetas_comment }"
                                        </p>
                                      )}
                                      {(rec.checklist as any)?.colchonetas_photos?.length > 0 && (
                                        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                                          {(rec.checklist as any).colchonetas_photos.map((pUrl: string, pIdx: number) => (
                                            <div key={pIdx} className="relative rounded overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                              <img
                                                src={pUrl}
                                                alt={`Colchoneta ${pIdx + 1}`}
                                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                onClick={() => openPhotoGallery((rec.checklist as any).colchonetas_photos, pIdx)}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Lingas */}
                                  {((rec.checklist as any)?.lingas_photos?.length > 0 || (rec.checklist as any)?.lingas_comment) && (
                                    <div className="bg-white p-2.5 rounded-lg border border-amber-200/80 space-y-1.5">
                                      <span className="font-extrabold text-slate-800 block text-[11px]">
                                        Lingas de Seguridad
                                      </span>
                                      {(rec.checklist as any)?.lingas_comment && (
                                        <p className="text-slate-600 text-[11px] font-medium bg-slate-50 p-1.5 rounded border border-slate-100 italic">
                                          "{ (rec.checklist as any).lingas_comment }"
                                        </p>
                                      )}
                                      {(rec.checklist as any)?.lingas_photos?.length > 0 && (
                                        <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                                          {(rec.checklist as any).lingas_photos.map((pUrl: string, pIdx: number) => (
                                            <div key={pIdx} className="relative rounded overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                                              <img
                                                src={pUrl}
                                                alt={`Linga ${pIdx + 1}`}
                                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                                onClick={() => openPhotoGallery((rec.checklist as any).lingas_photos, pIdx)}
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Observaciones y Fotos adjuntas */}
                            {(rec.observations || (rec.checklist as any)?.photos?.length > 0) && (
                              <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                                {rec.observations && (
                                  <div className="font-semibold text-slate-600">
                                    <span className="font-bold text-slate-700">Observaciones: </span>
                                    {rec.observations}
                                  </div>
                                )}
                                {(rec.checklist as any)?.photos?.length > 0 && (
                                  <div className="space-y-1.5 border-t border-slate-200/60 pt-2">
                                    <span className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
                                      <Camera className="w-3.5 h-3.5 text-brand-primary" />
                                      Fotos de Respaldo ({(rec.checklist as any).photos.length}):
                                    </span>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                      {(rec.checklist as any).photos.map((pUrl: string, pIdx: number) => (
                                        <div key={pIdx} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-200">
                                          <img
                                            src={pUrl}
                                            alt={`Respaldo ${pIdx + 1}`}
                                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                            onClick={() => openPhotoGallery((rec.checklist as any)?.photos || [], pIdx)}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

                  {historyPeriod !== 'todo' && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-2 mt-6">
                      <p className="text-xs font-bold text-slate-500">
                        {historyPeriod === 'hoy'
                          ? 'Mostrando despachos de hoy.'
                          : 'Mostrando despachos de esta semana.'}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {historyPeriod === 'hoy' && (
                          <button
                            type="button"
                            onClick={() => fetchHistory('semana')}
                            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-black cursor-pointer shadow-sm transition-all active:scale-95"
                          >
                            🗓️ Cargar Esta Semana (7 días)
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => fetchHistory('todo')}
                          className="px-4 py-2 bg-brand-primary hover:bg-blue-700 text-white rounded-xl text-xs font-black cursor-pointer shadow-sm transition-all active:scale-95"
                        >
                          🗂️ Ver Todo el Historial Completo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

            {/* VISTA 2: REPORTE POR ZONAL (Desglose directo por Zonal) */}
            {historySubTab === 'zonales' && (() => {
              // Aplanar registros por Zonal
              const allZonalRows = records.flatMap((rec) => {
                return rec.zonals_detail.map((z) => {
                  const wood = (z.congelados?.wood_bases || 0) + (z.congelados?.wood_extra || 0) +
                               (z.estandar?.wood_bases || 0) + (z.estandar?.wood_extra || 0) +
                               (z.bandejas?.wood_bases || 0) + (z.bandejas?.wood_extra || 0);
                  const plastic = (z.congelados?.plastic_bases || 0) + (z.congelados?.plastic_extra || 0) +
                                  (z.estandar?.plastic_bases || 0) + (z.estandar?.plastic_extra || 0) +
                                  (z.bandejas?.plastic_bases || 0) + (z.bandejas?.plastic_extra || 0);
                  const bandejas = z.bandejas?.bandejas_count || 0;
                  const baseZonalName = getBaseZonalName(z.zonal_name);

                  return {
                    id: `${rec.id}-${z.zonal_name}-${z.viaje_numero || 1}`,
                    dispatchId: rec.id,
                    date: rec.inspection_date,
                    time: rec.inspection_time,
                    truckNumber: rec.truck_number,
                    truckPlate: rec.truck_plate,
                    supervisor: rec.supervisor_name,
                    zonalName: z.zonal_name,
                    baseZonalName,
                    viajeNumero: z.viaje_numero || 1,
                    lugarCamion: z.lugar_camion,
                    wood,
                    plastic,
                    bandejas,
                    sello: z.sello || '-',
                    congelados: z.congelados,
                    estandar: z.estandar,
                    bandejasData: z.bandejas,
                    photos: z.photos || []
                  };
                });
              });

              // Aplicar filtro por Zonal base absoluta (ej. La Serena, Chillán, etc.)
              const filteredRows = historyZonalFilter === 'ALL' 
                ? allZonalRows 
                : allZonalRows.filter(r => r.baseZonalName === historyZonalFilter || r.zonalName === historyZonalFilter);

              // Totales agregados para el reporte filtrado
              const reportTotals = filteredRows.reduce(
                (acc, r) => ({
                  wood: acc.wood + r.wood,
                  plastic: acc.plastic + r.plastic,
                  bandejas: acc.bandejas + r.bandejas
                }),
                { wood: 0, plastic: 0, bandejas: 0 }
              );

              // Lista de zonales base absolutos únicos para el selector
              const uniqueBaseZonals = Array.from(new Set(allZonalRows.map(r => r.baseZonalName))).sort();

              return (
                <div className="space-y-4">
                  {/* Tarjetas KPI Resumen del Reporte */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none">
                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Envíos</span>
                      <span className="text-xl font-black text-slate-800 mt-1">{filteredRows.length} <span className="text-xs font-semibold text-slate-400">zonales</span></span>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl shadow-sm flex flex-col justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Pallet Madera</span>
                      <span className="text-xl font-black text-amber-800 mt-1">{reportTotals.wood}</span>
                    </div>

                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-3.5 rounded-2xl shadow-sm flex flex-col justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Pallet Plástico</span>
                      <span className="text-xl font-black text-emerald-800 mt-1">{reportTotals.plastic}</span>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/20 p-3.5 rounded-2xl shadow-sm flex flex-col justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-blue-700">Bandejas</span>
                      <span className="text-xl font-black text-blue-800 mt-1">{reportTotals.bandejas}</span>
                    </div>
                  </div>

                  {/* Barra de Filtro rápido por Zonal */}
                  <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex-wrap select-none">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">Filtrar Zonal:</span>
                      <select
                        value={historyZonalFilter}
                        onChange={(e) => setHistoryZonalFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary cursor-pointer"
                      >
                        <option value="ALL">Todos los Zonales ({allZonalRows.length})</option>
                        {uniqueBaseZonals.map(z => {
                          const count = allZonalRows.filter(r => r.baseZonalName === z).length;
                          return (
                            <option key={z} value={z}>{z} ({count})</option>
                          );
                        })}
                      </select>
                    </div>

                    {historyZonalFilter !== 'ALL' && (
                      <button
                        onClick={() => setHistoryZonalFilter('ALL')}
                        className="text-xs font-bold text-brand-primary hover:underline cursor-pointer"
                      >
                        Mostrar todos
                      </button>
                    )}
                  </div>

                  {/* Tabla de Reporte por Zonal */}
                  {filteredRows.length === 0 ? (
                    <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl">
                      <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-bold text-slate-400">No se encontraron entregas para el zonal seleccionado.</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 select-none uppercase text-[10px] tracking-wider">
                            <tr>
                              <th className="p-3.5">Fecha / Hora</th>
                              <th className="p-3.5">Zonal</th>
                              <th className="p-3.5 text-center">Pallet Madera</th>
                              <th className="p-3.5 text-center">Pallet Plástico</th>
                              <th className="p-3.5 text-center">Bandejas</th>
                              <th className="p-3.5">Camión / Patente</th>
                              <th className="p-3.5">Sello</th>
                              <th className="p-3.5">Supervisor</th>
                              <th className="p-3.5 text-right">Detalle / Fotos</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                            {filteredRows.map((row) => {
                              const isExpanded = !!expandedZonalRows[row.id];
                              return (
                                <>
                                  <tr 
                                    key={row.id} 
                                    onClick={() => setExpandedZonalRows(prev => ({ ...prev, [row.id]: !prev[row.id] }))}
                                    className={`hover:bg-slate-50/90 cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50/80' : ''}`}
                                  >
                                    <td className="p-3.5 font-mono text-[11px] whitespace-nowrap">
                                      <div>{getFormatDate(row.date)}</div>
                                      <div className="text-[10px] text-slate-400 font-normal">{row.time} hrs</div>
                                    </td>

                                    <td className="p-3.5">
                                      <div className="font-bold text-slate-800 uppercase text-xs">
                                        {getBaseZonalName(row.zonalName)}{row.viajeNumero > 1 ? ` ${row.viajeNumero}` : ''}
                                      </div>
                                      <div className="text-[10px] text-slate-400 font-normal">{row.lugarCamion}</div>
                                    </td>

                                    <td className="p-3.5 text-center">
                                      <span className={`inline-block px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                                        row.wood > 0 
                                          ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                          : 'text-slate-300 font-normal'
                                      }`}>
                                        {row.wood > 0 ? row.wood : '0'}
                                      </span>
                                    </td>

                                    <td className="p-3.5 text-center">
                                      <span className={`inline-block px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                                        row.plastic > 0 
                                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                          : 'text-slate-300 font-normal'
                                      }`}>
                                        {row.plastic > 0 ? row.plastic : '0'}
                                      </span>
                                    </td>

                                    <td className="p-3.5 text-center">
                                      <span className={`inline-block px-2.5 py-1 rounded-lg font-mono font-bold text-xs ${
                                        row.bandejas > 0 
                                          ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                                          : 'text-slate-300 font-normal'
                                      }`}>
                                        {row.bandejas > 0 ? row.bandejas : '0'}
                                      </span>
                                    </td>

                                    <td className="p-3.5 text-xs whitespace-nowrap">
                                      <div className="font-bold text-slate-700">Camión: {row.truckNumber}</div>
                                      <div className="text-[10px] font-mono text-slate-400 uppercase">{row.truckPlate}</div>
                                    </td>

                                    <td className="p-3.5 font-mono text-xs text-slate-600">
                                      {row.sello !== '-' ? (
                                        <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{row.sello}</span>
                                      ) : (
                                        <span className="text-slate-300">—</span>
                                      )}
                                    </td>

                                    <td className="p-3.5 text-xs text-slate-500 uppercase font-medium whitespace-nowrap">
                                      {row.supervisor}
                                    </td>

                                    <td className="p-3.5 text-right whitespace-nowrap">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedZonalRows(prev => ({ ...prev, [row.id]: !prev[row.id] }));
                                        }}
                                        className={`px-2.5 py-1 rounded-xl text-[10px] font-black transition-all active:scale-95 cursor-pointer border flex items-center gap-1 ml-auto ${
                                          isExpanded 
                                            ? 'bg-brand-primary text-white border-brand-primary' 
                                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        {row.photos.length > 0 && <Camera className="w-3 h-3 text-amber-500" />}
                                        <span>{isExpanded ? 'Ocultar' : 'Detalles'}</span>
                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                      </button>
                                    </td>
                                  </tr>

                                  {/* FILA DESPLEGABLE CON DETALLES Y FOTOS DEL ZONAL */}
                                  {isExpanded && (
                                    <tr key={`${row.id}-details`} className="bg-slate-50/90 border-b border-slate-200">
                                      <td colSpan={9} className="p-4">
                                        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
                                          
                                          {/* ENCABEZADO DETALLE ZONAL */}
                                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-black uppercase text-brand-primary">
                                                📍 Zonal: {getBaseZonalName(row.zonalName)}{row.viajeNumero > 1 ? ` ${row.viajeNumero}` : ''}
                                              </span>
                                              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                                                Lugar: {row.lugarCamion}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs font-mono font-bold text-slate-500">
                                              <span>Sello: <strong className="text-slate-800">{row.sello}</strong></span>
                                              <span>Camión N°: <strong className="text-slate-800">{row.truckNumber} ({row.truckPlate})</strong></span>
                                            </div>
                                          </div>

                                          {/* TABLA DESGLOSE DE CATEGORÍAS */}
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 select-none">
                                            {/* CONGELADOS */}
                                            <div className="bg-sky-50/70 border border-sky-100 rounded-xl p-3 space-y-1.5">
                                              <div className="flex items-center justify-between text-xs font-black text-sky-900 uppercase border-b border-sky-200/60 pb-1">
                                                <span>❄️ Congelados</span>
                                                <span className="font-mono font-black">{(row.congelados?.kilos || 0).toLocaleString('es-CL')} kg</span>
                                              </div>
                                              <div className="text-[11px] text-slate-700 space-y-1 font-semibold pt-1">
                                                <div className="flex justify-between items-center">
                                                  <span>Pallet Madera:</span>
                                                  <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-sky-200 text-sky-900">
                                                    {(row.congelados?.wood_bases || 0) + (row.congelados?.wood_extra || 0)} <span className="text-[9px] text-slate-500 font-normal">(Base: {row.congelados?.wood_bases || 0}, Extra: {row.congelados?.wood_extra || 0})</span>
                                                  </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                  <span>Pallet Plástico:</span>
                                                  <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-sky-200 text-sky-900">
                                                    {(row.congelados?.plastic_bases || 0) + (row.congelados?.plastic_extra || 0)} <span className="text-[9px] text-slate-500 font-normal">(Base: {row.congelados?.plastic_bases || 0}, Extra: {row.congelados?.plastic_extra || 0})</span>
                                                  </span>
                                                </div>
                                              </div>
                                            </div>

                                            {/* ESTÁNDAR */}
                                            <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 space-y-1.5">
                                              <div className="flex items-center justify-between text-xs font-black text-emerald-900 uppercase border-b border-emerald-200/60 pb-1">
                                                <span>📦 Estándar</span>
                                                <span className="font-mono font-black">{(row.estandar?.kilos || 0).toLocaleString('es-CL')} kg</span>
                                              </div>
                                              <div className="text-[11px] text-slate-700 space-y-1 font-semibold pt-1">
                                                <div className="flex justify-between items-center">
                                                  <span>Pallet Madera:</span>
                                                  <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-emerald-200 text-emerald-900">
                                                    {(row.estandar?.wood_bases || 0) + (row.estandar?.wood_extra || 0)} <span className="text-[9px] text-slate-500 font-normal">(Base: {row.estandar?.wood_bases || 0}, Extra: {row.estandar?.wood_extra || 0})</span>
                                                  </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                  <span>Pallet Plástico:</span>
                                                  <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-emerald-200 text-emerald-900">
                                                    {(row.estandar?.plastic_bases || 0) + (row.estandar?.plastic_extra || 0)} <span className="text-[9px] text-slate-500 font-normal">(Base: {row.estandar?.plastic_bases || 0}, Extra: {row.estandar?.plastic_extra || 0})</span>
                                                  </span>
                                                </div>
                                              </div>
                                            </div>

                                            {/* BANDEJAS */}
                                            <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-3 space-y-1.5">
                                              <div className="flex items-center justify-between text-xs font-black text-blue-900 uppercase border-b border-blue-200/60 pb-1">
                                                <span>🍞 Bandejas</span>
                                                <span className="font-mono font-black">{row.bandejas} un.</span>
                                              </div>
                                              <div className="text-[11px] text-slate-700 space-y-1 font-semibold pt-1">
                                                <div className="flex justify-between items-center">
                                                  <span>Pallet Madera:</span>
                                                  <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-900">
                                                    {(row.bandejasData?.wood_bases || 0) + (row.bandejasData?.wood_extra || 0)}
                                                  </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                  <span>Pallet Plástico:</span>
                                                  <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-blue-200 text-blue-900">
                                                    {(row.bandejasData?.plastic_bases || 0) + (row.bandejasData?.plastic_extra || 0)}
                                                  </span>
                                                </div>
                                                {row.bandejasData?.bandejas_formula && (
                                                  <div className="text-[10px] text-blue-800 font-mono pt-0.5 bg-white/80 p-1 rounded border border-blue-200/60">
                                                    Fórmula: {row.bandejasData.bandejas_formula}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>

                                          {/* GALERÍA DE FOTOS ADJUNTAS DEL ZONAL */}
                                          <div className="border-t border-slate-100 pt-3">
                                            <div className="flex items-center justify-between mb-2">
                                              <span className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5 select-none">
                                                <Camera className="w-3.5 h-3.5 text-brand-primary" />
                                                Fotos Adjuntas de Zonal "{row.zonalName}" ({row.photos.length}):
                                              </span>
                                            </div>

                                            {row.photos.length > 0 ? (
                                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                                {row.photos.map((pUrl, pIdx) => (
                                                  <div 
                                                    key={pIdx} 
                                                    className="relative rounded-xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 group cursor-pointer shadow-sm hover:shadow-md transition-all"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      openPhotoGallery(row.photos, pIdx);
                                                    }}
                                                  >
                                                    <img
                                                      src={pUrl}
                                                      alt={`Foto ${pIdx + 1} ${row.zonalName}`}
                                                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                                      <span className="text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 bg-black/60 px-2 py-0.5 rounded-full transition-opacity">
                                                        Ampliar 🔍
                                                      </span>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <p className="text-xs text-slate-400 italic">No se adjuntaron fotos para este zonal en la carga del camión.</p>
                                            )}
                                          </div>

                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {historySubTab === 'saldos' && (
              <div className="space-y-6">
                <h2 className="text-lg font-black text-slate-800 flex items-center justify-between border-b pb-2 select-none">
                  <span>Saldos y Retornos de Pallets por Zonal</span>
                  <button 
                    onClick={() => { fetchHistory(); fetchReturns(); }}
                    className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all active:scale-95 text-slate-600 cursor-pointer shadow-sm"
                    title="Actualizar Saldos"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </h2>

                {/* LISTA COMPACTA DE SALDOS POR ZONAL CON FECHA DE ÚLTIMO DESPACHO */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden select-none">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="p-3.5">Zonal / Región</th>
                          <th className="p-3.5">Último Despacho Camión</th>
                          <th className="p-3.5 text-center">Madera Neto</th>
                          <th className="p-3.5 text-center">Plástico Neto</th>
                          <th className="p-3.5 text-center">Estado</th>
                          <th className="p-3.5 text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {ZONALES_LIST.map((zonalName) => {
                          const bal = balances[zonalName] || { wood_sent: 0, plastic_sent: 0, wood_ret: 0, plastic_ret: 0, last_dispatch_date: null };
                          const woodSaldo = bal.wood_sent - bal.wood_ret;
                          const plasticSaldo = bal.plastic_sent - bal.plastic_ret;
                          const hasBalance = woodSaldo > 0 || plasticSaldo > 0;
                          const lastDateStr = bal.last_dispatch_date ? getFormatDate(bal.last_dispatch_date) : 'Sin envíos';

                          return (
                            <tr key={zonalName} className={`hover:bg-slate-50/80 transition-colors ${hasBalance ? 'bg-emerald-50/20' : ''}`}>
                              <td className="p-3.5">
                                <div className="font-extrabold text-slate-800 uppercase text-xs flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${hasBalance ? 'bg-emerald-500 shadow-2xs' : 'bg-slate-300'}`}></span>
                                  {zonalName}
                                </div>
                              </td>

                              <td className="p-3.5 font-mono text-[11px] whitespace-nowrap">
                                {bal.last_dispatch_date ? (
                                  <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200/80 font-bold">
                                    <Calendar className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                                    {lastDateStr}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 font-normal italic">Sin envíos</span>
                                )}
                              </td>

                              <td className="p-3.5 text-center">
                                <div className="inline-flex flex-col items-center">
                                  <span className={`px-2.5 py-0.5 rounded-lg font-mono font-black text-xs ${woodSaldo > 0 ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'text-slate-400 font-normal'}`}>
                                    {woodSaldo}
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-400 font-normal">({bal.wood_sent} - {bal.wood_ret})</span>
                                </div>
                              </td>

                              <td className="p-3.5 text-center">
                                <div className="inline-flex flex-col items-center">
                                  <span className={`px-2.5 py-0.5 rounded-lg font-mono font-black text-xs ${plasticSaldo > 0 ? 'bg-emerald-100 text-emerald-900 border border-emerald-200' : 'text-slate-400 font-normal'}`}>
                                    {plasticSaldo}
                                  </span>
                                  <span className="text-[9px] font-mono text-slate-400 font-normal">({bal.plastic_sent} - {bal.plastic_ret})</span>
                                </div>
                              </td>

                              <td className="p-3.5 text-center whitespace-nowrap">
                                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-extrabold uppercase ${hasBalance ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>
                                  {hasBalance ? 'Saldo Activo' : 'Sin Pallets'}
                                </span>
                              </td>

                              <td className="p-3.5 text-right whitespace-nowrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowReturnModal(zonalName);
                                    setReturnSupervisor(formatSupervisorName(user?.email));
                                    setReturnWood(0);
                                    setReturnPlastic(0);
                                  }}
                                  className="bg-brand-primary hover:bg-brand-secondary text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Registrar Retorno CD
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* BITÁCORA DE RETORNOS RECIENTES */}
                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <FileText className="w-4.5 h-4.5" />
                    Bitácora de Retornos al CD
                  </h3>

                  {returnsList.length === 0 ? (
                    <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <p className="text-xs font-bold text-slate-400">No se han registrado retornos desde zonales aún.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y">
                      {returnsList.slice(0, 10).map((ret) => (
                        <div key={ret.id} className="p-3.5 flex justify-between items-center text-xs">
                          <div>
                            <span className="font-extrabold text-slate-700 block">{ret.zonal_name}</span>
                            <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                              Recibe: {ret.supervisor_name}
                            </span>
                          </div>
                          <div className="text-right flex items-center gap-4">
                            <div className="font-mono text-xs font-black space-x-3">
                              {ret.wood_returned > 0 && <span className="text-amber-800">M: +{ret.wood_returned}</span>}
                              {ret.plastic_returned > 0 && <span className="text-emerald-800">P: +{ret.plastic_returned}</span>}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {new Date(ret.created_at).toLocaleDateString('es-CL')} 
                              <span className="ml-1 text-[9px]">{new Date(ret.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {activeTab === 'usuarios' && isSuperAdmin && (
          <div className="space-y-5">
            {/* ENCABEZADO */}
            <div className="flex items-center justify-between border-b pb-3 select-none">
              <div>
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-500" />
                  Gestión de Usuarios
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Solo visible para Administrador del Sistema</p>
              </div>
              <div className="flex items-center gap-2">
                {adminSubTab === 'usuarios' && (
                  <>
                    <button
                      type="button"
                      onClick={() => fetchPalletUsers()}
                      className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer shadow-sm"
                      title="Actualizar"
                    >
                      <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowNewUserForm(v => !v)}
                      className="px-3 py-2 bg-brand-primary text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm hover:bg-emerald-700 active:scale-95"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar Usuario
                    </button>
                  </>
                )}
                {adminSubTab === 'almacenamiento' && (
                  <button
                    type="button"
                    onClick={analyzeStorage}
                    className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50 cursor-pointer shadow-sm"
                    title="Analizar almacenamiento"
                  >
                    <RefreshCw className={`w-4 h-4 ${storageLoading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {/* SUB-TABS: Usuarios / Almacenamiento */}
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1 select-none">
              <button
                type="button"
                onClick={() => setAdminSubTab('usuarios')}
                className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${adminSubTab === 'usuarios' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Users className="w-3.5 h-3.5" /> Usuarios
              </button>
              <button
                type="button"
                onClick={() => { setAdminSubTab('almacenamiento'); analyzeStorage(); }}
                className={`flex-1 py-2 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${adminSubTab === 'almacenamiento' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Package className="w-3.5 h-3.5" /> Almacenamiento
              </button>
            </div>

            {/* FORMULARIO NUEVO USUARIO */}
            {adminSubTab === 'usuarios' && showNewUserForm && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 shadow-sm">
                <h3 className="text-xs font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4" />
                  Nuevo Usuario
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={e => setNewUserEmail(e.target.value)}
                      placeholder="usuario@cial.cl"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre Completo</label>
                    <input
                      type="text"
                      value={newUserName}
                      onChange={e => setNewUserName(e.target.value)}
                      placeholder="Nombre Apellido"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rol</label>
                    <select
                      value={newUserRole}
                      onChange={e => setNewUserRole(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-400 cursor-pointer"
                    >
                      <option value="admin">🔴 Administrador</option>
                      <option value="jefe_turno">🟡 Jefe de Turno</option>
                      <option value="supervisor">🟢 Supervisor</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cargo para Firma (Notas)</label>
                    <input
                      type="text"
                      value={newUserNotes}
                      onChange={e => setNewUserNotes(e.target.value)}
                      placeholder="Ej: Facturador, Supervisor"
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={newUserCanSign}
                        onChange={e => setNewUserCanSign(e.target.checked)}
                        className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                      />
                      <span>Permitido Firmar Despachos (Marcar si el usuario firma en la app)</span>
                    </label>
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowNewUserForm(false); setNewUserEmail(''); setNewUserName(''); }}
                    className="flex-1 bg-white border border-slate-200 text-slate-600 py-2 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-50"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateUser}
                    disabled={savingUser}
                    className="flex-1 bg-amber-500 text-white py-2 rounded-xl text-xs font-black cursor-pointer hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {savingUser ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'CREAR USUARIO'}
                  </button>
                </div>
              </div>
            )}

            {/* TABLA DE USUARIOS */}
            {adminSubTab === 'usuarios' && (usersLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando usuarios...
              </div>
            ) : (
              <div className="space-y-2">
                {/* Buscador de usuarios y Leyenda de roles */}
                <div className="space-y-2 select-none">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Buscar por nombre o correo electrónico..."
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-primary text-slate-700 shadow-2xs"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase px-1">
                    <div className="flex gap-3">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>Admin</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>Jefe Turno</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>Supervisor</span>
                    </div>
                    <span>Total: {palletUsers.filter(u => u.display_name.toLowerCase().includes(userSearchQuery.toLowerCase()) || u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) || (u.notes && u.notes.toLowerCase().includes(userSearchQuery.toLowerCase()))).length} usuarios</span>
                  </div>
                </div>

                {palletUsers
                  .filter(u => 
                    u.display_name.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                    u.email.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                    (u.notes && u.notes.toLowerCase().includes(userSearchQuery.toLowerCase()))
                  )
                  .map(u => (
                  <div
                    key={u.id}
                    className={`bg-white border rounded-2xl p-4 shadow-sm transition-all ${!u.is_active ? 'opacity-50 border-slate-100' : 'border-slate-200'}`}
                  >
                    {editingUser?.id === u.id ? (
                      /* MODO EDICIÓN */
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nombre</label>
                            <input
                              type="text"
                              value={editingUser.display_name}
                              onChange={e => setEditingUser({ ...editingUser, display_name: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-400"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Rol</label>
                            <select
                              value={editingUser.role}
                              onChange={e => setEditingUser({ ...editingUser, role: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-400 cursor-pointer"
                            >
                              <option value="admin">🔴 Administrador</option>
                              <option value="jefe_turno">🟡 Jefe de Turno</option>
                              <option value="supervisor">🟢 Supervisor</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cargo para Firma (Notas)</label>
                            <input
                              type="text"
                              value={editingUser.notes}
                              onChange={e => setEditingUser({ ...editingUser, notes: e.target.value })}
                              placeholder="Ej: Supervisor de Despacho, Facturador"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-amber-400"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Permiso para Firmar</label>
                            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700">
                              <input
                                type="checkbox"
                                checked={editingUser.can_sign !== false}
                                onChange={e => setEditingUser({ ...editingUser, can_sign: e.target.checked })}
                                className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                              />
                              <span>Permitido Firmar</span>
                            </label>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingUser(null)}
                            className="flex-1 bg-slate-100 text-slate-600 py-2 rounded-xl text-xs font-black cursor-pointer hover:bg-slate-200"
                          >
                            CANCELAR
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveUser(editingUser)}
                            disabled={savingUser}
                            className="flex-1 bg-amber-500 text-white py-2 rounded-xl text-xs font-black cursor-pointer hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1"
                          >
                            {savingUser ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'GUARDAR'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* MODO VISTA */
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${u.role === 'admin' ? 'bg-rose-500' : u.role === 'jefe_turno' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-black text-slate-800">{u.display_name}</span>
                              {!u.is_active && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">INACTIVO</span>}
                            </div>
                            <span className="text-xs text-slate-400 font-mono">{u.email}</span>
                            {u.notes ? (
                              <p className="text-[11px] text-violet-600 font-bold mt-0.5">Cargo: {u.notes}</p>
                            ) : (
                              <p className="text-[10px] text-slate-400 italic mt-0.5">Sin cargo asignado</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase ${u.role === 'admin' ? 'bg-rose-100 text-rose-700' : u.role === 'jefe_turno' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {u.role === 'admin' ? 'Admin' : u.role === 'jefe_turno' ? 'Jefe Turno' : 'Supervisor'}
                          </span>

                          {/* BOTÓN CONCEDER / QUITAR PERMISO FIRMA */}
                          <button
                            type="button"
                            onClick={() => handleToggleUserCanSign(u)}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black cursor-pointer active:scale-95 flex items-center gap-1 border transition-all ${
                              u.can_sign !== false 
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600' 
                                : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700'
                            }`}
                            title={u.can_sign !== false ? 'Clic para quitar permiso de firma (Facturador)' : 'Clic para conceder permiso de firma'}
                          >
                            {u.can_sign !== false ? (
                              <><PenTool className="w-3 h-3 text-emerald-600" /> Puede Firmar</>
                            ) : (
                              <><PenTool className="w-3 h-3 text-slate-400 opacity-50" /> 🚫 Sin Firma</>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditingUser({ ...u })}
                            className="px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-[10px] font-black cursor-pointer hover:bg-amber-100 active:scale-95 flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" /> Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleUserActive(u)}
                            className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black cursor-pointer active:scale-95 flex items-center gap-1 border ${u.is_active ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}
                            title={u.is_active ? 'Desactivar usuario' : 'Activar usuario'}
                          >
                            {u.is_active ? <><ShieldCheck className="w-3 h-3" /> Activo</> : <><ShieldCheck className="w-3 h-3" /> Activar</>}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {palletUsers.length === 0 && (
                  <div className="text-center py-10 text-slate-400 text-sm">No hay usuarios registrados.</div>
                )}
              </div>
            ))}

            {/* SUB-TAB: ALMACENAMIENTO */}
            {adminSubTab === 'almacenamiento' && (() => {
              const totalPhotos = storageRecords.reduce((s, r) => s + r.photoCount, 0);
              const totalKB = storageRecords.reduce((s, r) => s + r.sizeKB, 0);
              const oldRecs = storageRecords.filter(r => r.isOld);
              const oldKB = oldRecs.reduce((s, r) => s + r.sizeKB, 0);
              return (
                <div className="space-y-4">
                  {storageLoading && (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Analizando almacenamiento...
                    </div>
                  )}

                  {!storageLoading && storageRecords.length === 0 && (
                    <div className="text-center py-12 text-slate-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Presiona ↻ para analizar el almacenamiento</p>
                    </div>
                  )}

                  {!storageLoading && storageRecords.length > 0 && (
                    <>
                      {/* RESUMEN */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase">Despachos con fotos</p>
                          <p className="text-xl font-black text-slate-800 mt-1">{storageRecords.length}</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm">
                          <p className="text-[10px] font-black text-slate-400 uppercase">Total fotos</p>
                          <p className="text-xl font-black text-slate-800 mt-1">{totalPhotos}</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 shadow-sm">
                          <p className="text-[10px] font-black text-blue-600 uppercase">Espacio usado</p>
                          <p className="text-xl font-black text-blue-800 mt-1">{totalKB >= 1024 ? `${(totalKB/1024).toFixed(1)} MB` : `${totalKB} KB`}</p>
                        </div>
                        <div className={`${oldRecs.length > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'} border rounded-2xl p-3.5 shadow-sm`}>
                          <p className={`text-[10px] font-black uppercase ${oldRecs.length > 0 ? 'text-rose-600' : 'text-slate-400'}`}>Fotos +30 días</p>
                          <p className={`text-xl font-black mt-1 ${oldRecs.length > 0 ? 'text-rose-800' : 'text-slate-500'}`}>
                            {oldKB >= 1024 ? `${(oldKB/1024).toFixed(1)} MB` : `${oldKB} KB`}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{oldRecs.length} despachos</p>
                        </div>
                      </div>

                      {/* BOTÓN DE LIMPIEZA */}
                      {oldRecs.length > 0 && (
                        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
                          <div>
                            <p className="text-sm font-black text-rose-800">🗑️ Limpiar fotos de más de 30 días</p>
                            <p className="text-xs text-rose-600 mt-0.5">{oldRecs.length} despachos · ~{(oldKB/1024).toFixed(1)} MB por liberar · Los registros de pallets se conservan</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleCleanOldPhotos}
                            disabled={cleanupLoading}
                            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black cursor-pointer active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                          >
                            {cleanupLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            {cleanupLoading ? 'Limpiando...' : 'LIMPIAR FOTOS ANTIGUAS'}
                          </button>
                        </div>
                      )}

                      {cleanupDone && oldRecs.length === 0 && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
                          <ShieldCheck className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                          <p className="text-sm font-black text-emerald-800">Almacenamiento limpio</p>
                          <p className="text-xs text-emerald-600">No quedan fotos de más de 30 días.</p>
                        </div>
                      )}

                      {/* LISTA DETALLADA */}
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Detalle por despacho (con fotos)</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="border-b border-slate-100">
                              <tr className="text-[10px] font-black text-slate-400 uppercase">
                                <th className="p-3 text-left">Fecha</th>
                                <th className="p-3 text-left">Supervisor</th>
                                <th className="p-3 text-left">Camión</th>
                                <th className="p-3 text-center">Fotos</th>
                                <th className="p-3 text-right">Tamaño</th>
                                <th className="p-3 text-center">Estado</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {storageRecords.map(r => (
                                <tr key={r.id} className={`${r.isOld ? 'bg-rose-50/40' : ''} hover:bg-slate-50 transition-colors`}>
                                  <td className="p-3 font-mono font-bold text-slate-700">{r.date}</td>
                                  <td className="p-3 text-slate-600">{r.supervisor}</td>
                                  <td className="p-3 text-slate-600 font-mono">{r.truck}</td>
                                  <td className="p-3 text-center">
                                    <span className="bg-slate-100 text-slate-700 font-black px-2 py-0.5 rounded-lg">{r.photoCount}</span>
                                  </td>
                                  <td className="p-3 text-right font-mono text-slate-600">
                                    {r.sizeKB >= 1024 ? `${(r.sizeKB/1024).toFixed(1)} MB` : `${r.sizeKB} KB`}
                                  </td>
                                  <td className="p-3 text-center">
                                    {r.isOld
                                      ? <span className="text-[10px] bg-rose-100 text-rose-700 font-black px-2 py-0.5 rounded-full">+30 días</span>
                                      : <span className="text-[10px] bg-emerald-100 text-emerald-700 font-black px-2 py-0.5 rounded-full">Reciente</span>
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* PESTAÑA: SALIDAS A TIEMPO (CONTROL ROOM MONITOR) */}
        {activeTab === 'salidas' && (() => {
          const compareTimes = (actualTimeStr: string, targetTimeStr: string) => {
            if (!actualTimeStr || !targetTimeStr) return { isOnTime: true, diffMinutes: 0 };
            const [aH, aM] = actualTimeStr.slice(0, 5).split(':').map(Number);
            const [tH, tM] = targetTimeStr.slice(0, 5).split(':').map(Number);
            const actualMin = aH * 60 + aM;
            const targetMin = tH * 60 + tM;
            const diff = targetMin - actualMin;
            return {
              isOnTime: actualMin <= targetMin,
              diffMinutes: Math.abs(diff)
            };
          };

          const formatCountdown = (targetTimeStr: string, targetDateStr: string, now: Date) => {
            if (!targetTimeStr) return { status: 'IN_PROGRESS', text: '--:--:--', isOverdue: false };
            const [h, m] = targetTimeStr.split(':').map(Number);
            const targetDate = new Date(targetDateStr + 'T00:00:00');
            targetDate.setHours(h, m, 0, 0);

            const diffMs = targetDate.getTime() - now.getTime();
            const diffSec = Math.floor(Math.abs(diffMs) / 1000);

            const hours = Math.floor(diffSec / 3600);
            const minutes = Math.floor((diffSec % 3600) / 60);
            const seconds = diffSec % 60;

            const formatted = [
              hours.toString().padStart(2, '0'),
              minutes.toString().padStart(2, '0'),
              seconds.toString().padStart(2, '0')
            ].join(':');

            if (diffMs < 0) {
              return { status: 'OVERDUE', text: `+${formatted}`, isOverdue: true };
            } else {
              return { status: 'IN_PROGRESS', text: formatted, isOverdue: false };
            }
          };

          const dayDispatches = records.filter(r => r.inspection_date === departuresDate);

          // Extraer únicamente las zonales agregadas a camiones de despacho para el día seleccionado
          const activeZonalEntries = new Map<string, {
            zonalName: string;
            viajeNumero: number;
            matchedDispatch: DispatchRecord | null;
            matchedZonalDetail: any;
            isOpenDraft?: boolean;
            draftTruckNumber?: string;
            draftTruckPlate?: string;
            draftSupervisor?: string;
          }>();

          // 1. Zonas ya despachadas y confirmadas definitivamente
          dayDispatches.forEach(rec => {
            (rec.zonals_detail || []).forEach(z => {
              const baseName = getBaseZonalName(z.zonal_name);
              const viajeNum = z.viaje_numero || 1;
              const key = `${baseName}-${viajeNum}`;
              if (!activeZonalEntries.has(key)) {
                activeZonalEntries.set(key, {
                  zonalName: baseName,
                  viajeNumero: viajeNum,
                  matchedDispatch: rec,
                  matchedZonalDetail: z
                });
              }
            });
          });

          // 2. Zonas agregadas en camiones en carga activos (Borradores Abiertos) para el día de hoy
          if (departuresDate === getChileDateString()) {
            truckDrafts.forEach(draft => {
              (draft.selectedZonals || []).forEach(sz => {
                const baseName = getBaseZonalName(sz.zonal_name);
                const viajeNum = sz.viaje_numero || 1;
                const key = `${baseName}-${viajeNum}`;
                
                // Si la zonal de este borrador no ha sido cerrada en un despacho definitivo:
                if (!activeZonalEntries.has(key)) {
                  activeZonalEntries.set(key, {
                    zonalName: baseName,
                    viajeNumero: viajeNum,
                    matchedDispatch: null,
                    matchedZonalDetail: sz,
                    isOpenDraft: true,
                    draftTruckNumber: draft.truckNumber,
                    draftTruckPlate: draft.truckPlate,
                    draftSupervisor: draft.supervisorName || supervisorName
                  });
                }
              });
            });
          }

          const departureCards = Array.from(activeZonalEntries.values()).map(({ zonalName, viajeNumero, matchedDispatch, matchedZonalDetail, isOpenDraft, draftTruckNumber, draftTruckPlate, draftSupervisor }) => {
            const targetConfig = getZonalTargetConfig(zonalName, viajeNumero);

            const targetTime = targetConfig.target_time;
            const isClosed = !!matchedDispatch;
            // Hora de Cierre Camión manda por sobre la hora de confirmación de despacho
            const actualTime = matchedDispatch 
              ? ((matchedDispatch.close_time && matchedDispatch.close_time.trim()) 
                  ? matchedDispatch.close_time.trim().slice(0, 5) 
                  : (matchedDispatch.inspection_time || matchedDispatch.created_at.slice(11, 16))) 
              : null;

            let status: 'ON_TIME' | 'LATE' | 'IN_PROGRESS' | 'OVERDUE' = 'IN_PROGRESS';
            let diffMinutes = 0;
            let countdownText = '';

            if (isClosed && actualTime) {
              const comp = compareTimes(actualTime, targetTime);
              status = comp.isOnTime ? 'ON_TIME' : 'LATE';
              diffMinutes = comp.diffMinutes;
            } else {
              const cd = formatCountdown(targetTime, departuresDate, nowTime);
              status = cd.status as any;
              countdownText = cd.text;
            }

            return {
              id: `${zonalName}-${viajeNumero}`,
              zonalName,
              viajeNumero,
              targetTime,
              isClosed,
              actualTime,
              status,
              diffMinutes,
              countdownText,
              dispatch: matchedDispatch,
              zonalDetail: matchedZonalDetail,
              isOpenDraft: !!isOpenDraft,
              draftTruckNumber,
              draftTruckPlate,
              draftSupervisor
            };
          });

          // Ordenar tarjetas: Zonales en proceso / abiertas primero (al inicio de la lista superior), luego zonales cerradas
          const sortedDepartureCards = [...departureCards].sort((a, b) => {
            const aActive = !a.isClosed || a.isOpenDraft;
            const bActive = !b.isClosed || b.isOpenDraft;

            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;

            if (aActive && bActive) {
              if (a.status === 'OVERDUE' && b.status !== 'OVERDUE') return -1;
              if (a.status !== 'OVERDUE' && b.status === 'OVERDUE') return 1;
              return a.targetTime.localeCompare(b.targetTime);
            }

            return a.targetTime.localeCompare(b.targetTime);
          });

          const totalScheduled = departureCards.length;
          const onTimeCount = departureCards.filter(c => c.status === 'ON_TIME').length;
          const lateCount = departureCards.filter(c => c.status === 'LATE').length;
          const inProgressCount = departureCards.filter(c => c.status === 'IN_PROGRESS').length;
          const overdueCount = departureCards.filter(c => c.status === 'OVERDUE').length;

          const closedTotal = onTimeCount + lateCount;
          const complianceRate = closedTotal > 0 ? Math.round((onTimeCount / closedTotal) * 100) : (totalScheduled > 0 ? 100 : 0);

          return (
            <div className="space-y-6">
              {/* HEADER PESTAÑA */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 select-none">
                <div>
                  <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    Monitor de Salidas a Tiempo (Cierre Camiones)
                  </h2>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Seguimiento en tiempo real de metas de cierre y cuenta regresiva por zonal
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="date"
                    value={departuresDate}
                    onChange={(e) => setDeparturesDate(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer"
                  />

                  <button
                    type="button"
                    onClick={() => { fetchHistory(); fetchZonalTargetTimes(); }}
                    className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer shadow-sm active:scale-95"
                    title="Actualizar datos"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  {isShiftLeader && (
                    <button
                      type="button"
                      onClick={() => setShowConfigTargetsModal(true)}
                      className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                    >
                      ⚙️ Metas Cierre
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsTvMonitorMode(true)}
                    className="px-3.5 py-2 bg-slate-900 hover:bg-black text-amber-400 border border-amber-400/40 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md active:scale-95"
                  >
                    🖥️ Modo Monitor TV
                  </button>
                </div>
              </div>

              {/* TARJETAS RESUMEN KPI */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none">
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">A Tiempo</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black text-emerald-800">{onTimeCount}</span>
                    <span className="text-xs font-bold text-emerald-600">zonales</span>
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider">Retrasados / Expirados</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black text-rose-800">{lateCount + overdueCount}</span>
                    <span className="text-xs font-bold text-rose-600">zonales</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">En Proceso</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black text-amber-800">{inProgressCount}</span>
                    <span className="text-xs font-bold text-amber-600">zonales</span>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md text-white flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Cumplimiento Metas</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black text-amber-400 font-mono">{complianceRate}%</span>
                    <span className="text-[10px] text-slate-400">Meta: 95%</span>
                  </div>
                </div>
              </div>

              {/* GRID DE ZONALES / TARJETAS DE SALIDA */}
              {sortedDepartureCards.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-8 text-center space-y-3 select-none">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                    <Clock className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-black text-slate-800">
                    No hay zonales asignadas a camiones para la fecha {departuresDate}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
                    Las zonales se activarán automáticamente en este monitor con su cuenta regresiva una vez que se agreguen en un despacho en la pestaña <strong>"Despacho Camión"</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('nuevo')}
                    className="px-4 py-2 bg-brand-primary hover:bg-brand-secondary text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm active:scale-95 inline-flex items-center gap-1.5"
                  >
                    <ClipboardList className="w-4 h-4" /> IR A REGISTRAR DESPACHO
                  </button>
                </div>
              ) : (
                <div className="space-y-3 select-none">
                  {sortedDepartureCards.map((card) => {
                    return (
                      <div
                        key={card.id}
                        className={`bg-white border rounded-2xl p-4 shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          card.status === 'ON_TIME'
                            ? 'border-emerald-300 ring-1 ring-emerald-200/80 bg-emerald-50/15'
                            : card.status === 'LATE'
                            ? 'border-rose-300 ring-1 ring-rose-200/80 bg-rose-50/15'
                            : card.status === 'OVERDUE'
                            ? 'border-rose-400 ring-2 ring-rose-400/80 animate-pulse bg-rose-50/40'
                            : 'border-slate-200 hover:border-amber-400 bg-white'
                        }`}
                      >
                        {/* COLUMNA 1: NOMBRE ZONAL Y META CIERRE */}
                        <div className="flex items-center gap-3 min-w-[200px]">
                          <div className={`w-3 h-10 rounded-full shrink-0 ${
                            card.status === 'ON_TIME' ? 'bg-emerald-500' : card.status === 'LATE' ? 'bg-rose-500' : card.status === 'OVERDUE' ? 'bg-rose-600 animate-pulse' : 'bg-amber-400'
                          }`} />
                          <div>
                            <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
                              {card.zonalName} {card.viajeNumero > 1 ? card.viajeNumero : ''}
                            </h3>
                            <span className="text-xs text-slate-500 font-bold block">
                              Meta Cierre: <strong className="text-slate-800 font-mono">{card.targetTime} hrs</strong>
                            </span>
                          </div>
                        </div>

                        {/* COLUMNA 2: BADGE DE ESTADO */}
                        <div className="flex items-center min-w-[140px]">
                          {card.status === 'ON_TIME' && (
                            <span className="px-3 py-1.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-2xs">
                              🟢 A TIEMPO
                            </span>
                          )}
                          {card.status === 'LATE' && (
                            <span className="px-3 py-1.5 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1.5 shadow-2xs">
                              🔴 RETRASADO
                            </span>
                          )}
                          {card.status === 'OVERDUE' && (
                            <span className="px-3 py-1.5 rounded-full text-xs font-black bg-rose-600 text-white animate-bounce flex items-center gap-1.5 shadow-md">
                              🚨 FUERA DE TIEMPO
                            </span>
                          )}
                          {card.status === 'IN_PROGRESS' && (
                            <span className="px-3 py-1.5 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1.5 shadow-2xs">
                              🟡 EN CARGA
                            </span>
                          )}
                        </div>

                        {/* COLUMNA 3: HORA REAL DE CIERRE O CUENTA REGRESIVA EN VIVO */}
                        <div className="text-left md:text-center min-w-[200px]">
                          {card.isClosed ? (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase block">Hora Cierre Real</span>
                              <div className="flex items-baseline justify-start md:justify-center gap-2">
                                <span className="text-2xl font-mono font-black text-slate-800">
                                  {card.actualTime?.slice(0, 5)} <span className="text-xs font-normal text-slate-400">hrs</span>
                                </span>
                                <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                                  card.status === 'ON_TIME' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                                }`}>
                                  {card.status === 'ON_TIME' ? `+${card.diffMinutes}m a favor` : `-${card.diffMinutes}m retraso`}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                                {card.status === 'OVERDUE' ? 'Tiempo Expirado Hace' : 'Cuenta Regresiva'}
                              </span>
                              <span className={`text-2xl font-mono font-black block tracking-wider ${
                                card.status === 'OVERDUE' ? 'text-rose-600 animate-pulse' : 'text-amber-600'
                              }`}>
                                {card.countdownText}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* COLUMNA 4: DETALLES DEL CAMIÓN Y SUPERVISOR */}
                        <div className="min-w-[220px]">
                          {card.dispatch ? (
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-0.5">
                              <div className="flex items-center justify-between font-extrabold text-slate-900">
                                <span>🚛 Camión #{card.dispatch.truck_number}</span>
                                <span className="font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">{card.dispatch.truck_plate}</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-semibold truncate">
                                Supervisor: <strong className="text-slate-700">{card.dispatch.supervisor_name}</strong>
                              </div>
                              {card.dispatch.signed_by && (
                                <div className="text-[11px] text-slate-500 font-semibold truncate">
                                  Responsable: <strong className="text-emerald-700">{getSignerName(card.dispatch, palletUsers) || card.dispatch.supervisor_name}</strong>
                                </div>
                              )}
                            </div>
                          ) : card.isOpenDraft ? (
                            <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200/90 text-xs text-slate-700 space-y-0.5 shadow-2xs">
                              <div className="flex items-center justify-between font-extrabold text-amber-950">
                                <span className="flex items-center gap-1">
                                  <span>🚚</span>
                                  <span>Camión #{card.draftTruckNumber || 'En Carga'}</span>
                                </span>
                                {card.draftTruckPlate && (
                                  <span className="font-mono text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 text-[10px]">
                                    {card.draftTruckPlate}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-amber-900 font-bold truncate flex items-center justify-between pt-0.5">
                                <span>Supervisor: <strong>{card.draftSupervisor}</strong></span>
                                <span className="text-[9px] font-black uppercase text-amber-800 bg-amber-200/80 px-2 py-0.5 rounded-full border border-amber-300 animate-pulse">
                                  🟡 EN CARGA
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-slate-50/60 p-2.5 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400 italic">
                              Cierre de camión pendiente
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
            )}
          </div>
          );
        })()}

        {activeTab === 'kpi_salidas' && (() => {
          // Filtrar logs según el rango de fechas seleccionado
          let filteredLogs = [...zonalDepartureLogs];

          if (kpiFilterPeriod === '7days') {
            const minDate = new Date();
            minDate.setDate(minDate.getDate() - 7);
            const minDateStr = getChileDateString(minDate);
            filteredLogs = filteredLogs.filter(l => l.inspection_date >= minDateStr);
          } else if (kpiFilterPeriod === '30days') {
            const minDate = new Date();
            minDate.setDate(minDate.getDate() - 30);
            const minDateStr = getChileDateString(minDate);
            filteredLogs = filteredLogs.filter(l => l.inspection_date >= minDateStr);
          } else if (kpiFilterPeriod === 'month') {
            const currentMonthStr = getChileDateString().slice(0, 7); // YYYY-MM
            filteredLogs = filteredLogs.filter(l => l.inspection_date.startsWith(currentMonthStr));
          } else if (kpiFilterPeriod === 'custom') {
            filteredLogs = filteredLogs.filter(l => l.inspection_date >= kpiStartDate && l.inspection_date <= kpiEndDate);
          }

          // Métricas Generales KPI
          const totalLogs = filteredLogs.length;
          const onTimeLogs = filteredLogs.filter(l => l.is_on_time);
          const lateLogs = filteredLogs.filter(l => !l.is_on_time);
          const globalComplianceRate = totalLogs > 0 ? Math.round((onTimeLogs.length / totalLogs) * 100) : 0;
          const avgDiffMinutes = totalLogs > 0 ? Math.round(filteredLogs.reduce((acc, l) => acc + (l.diff_minutes || 0), 0) / totalLogs) : 0;

          // Agrupación por Supervisor
          const supervisorMap = new Map<string, { name: string; total: number; onTime: number; late: number; totalDiff: number }>();
          filteredLogs.forEach(l => {
            const supName = l.supervisor_name || 'Sin Supervisor';
            if (!supervisorMap.has(supName)) {
              supervisorMap.set(supName, { name: supName, total: 0, onTime: 0, late: 0, totalDiff: 0 });
            }
            const item = supervisorMap.get(supName)!;
            item.total += 1;
            if (l.is_on_time) item.onTime += 1;
            else item.late += 1;
            item.totalDiff += (l.diff_minutes || 0);
          });
          const supervisorStats = Array.from(supervisorMap.values())
            .map(s => ({
              ...s,
              rate: s.total > 0 ? Math.round((s.onTime / s.total) * 100) : 0,
              avgDiff: s.total > 0 ? Math.round(s.totalDiff / s.total) : 0
            }))
            .sort((a, b) => b.rate - a.rate || b.total - a.total);

          // Agrupación por Responsable (Firmante)
          const signerMap = new Map<string, { email: string; name: string; total: number; onTime: number; late: number; totalDiff: number }>();
          filteredLogs.filter(l => l.signed_by || l.signed_by_name).forEach(l => {
            const key = (l.signed_by || l.signed_by_name || 'Sin Nombre').toLowerCase();
            const name = l.signed_by_name || l.signed_by || 'Sin Nombre';
            if (!signerMap.has(key)) {
              signerMap.set(key, { email: l.signed_by || '', name, total: 0, onTime: 0, late: 0, totalDiff: 0 });
            }
            const item = signerMap.get(key)!;
            item.total += 1;
            if (l.is_on_time) item.onTime += 1;
            else item.late += 1;
            item.totalDiff += (l.diff_minutes || 0);
          });
          const signerStats = Array.from(signerMap.values())
            .map(s => ({
              ...s,
              rate: s.total > 0 ? Math.round((s.onTime / s.total) * 100) : 0,
              avgDiff: s.total > 0 ? Math.round(s.totalDiff / s.total) : 0
            }))
            .sort((a, b) => b.rate - a.rate || b.total - a.total);

          // Agrupación por Zonal (Unificando viajes/números como "Puerto Montt 1" y "Puerto Montt 2" en una sola entidad)
          const zonalMap = new Map<string, { name: string; total: number; onTime: number; late: number; totalDiff: number }>();
          filteredLogs.forEach(l => {
            const zName = getBaseZonalName(l.zonal_name);
            if (!zonalMap.has(zName)) {
              zonalMap.set(zName, { name: zName, total: 0, onTime: 0, late: 0, totalDiff: 0 });
            }
            const item = zonalMap.get(zName)!;
            item.total += 1;
            if (l.is_on_time) item.onTime += 1;
            else item.late += 1;
            item.totalDiff += (l.diff_minutes || 0);
          });
          const zonalStats = Array.from(zonalMap.values())
            .map(z => ({
              ...z,
              rate: z.total > 0 ? Math.round((z.onTime / z.total) * 100) : 0,
              avgDiff: z.total > 0 ? Math.round(z.totalDiff / z.total) : 0
            }))
            .sort((a, b) => b.rate - a.rate || b.total - a.total);

          return (
            <div className="space-y-6 select-none">
              {/* ENCABEZADO Y FILTROS DE PERÍODO */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-amber-600" />
                      Indicadores de Cumplimiento de Salidas (KPIs)
                    </h2>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      Historial guardado en Supabase: Análisis de desempeño por Supervisor, Responsables (Firmantes) y Zonales.
                    </p>
                  </div>

                  <button
                    onClick={() => fetchZonalDepartureLogs()}
                    className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-all active:scale-95 text-slate-700 cursor-pointer shadow-2xs flex items-center gap-1.5 text-xs font-bold shrink-0"
                    title="Actualizar KPIs desde Supabase"
                  >
                    <RefreshCw className="w-4 h-4" /> Actualizar Datos
                  </button>
                </div>

                {/* BOTONES DE FILTRO DE PERÍODO */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Filtrar Período:</span>
                  
                  <button
                    type="button"
                    onClick={() => setKpiFilterPeriod('7days')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      kpiFilterPeriod === '7days' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Últimos 7 Días
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiFilterPeriod('30days')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      kpiFilterPeriod === '30days' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Últimos 30 Días
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiFilterPeriod('month')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      kpiFilterPeriod === 'month' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Este Mes
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiFilterPeriod('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      kpiFilterPeriod === 'all' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Todo el Historial
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiFilterPeriod('custom')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      kpiFilterPeriod === 'custom' ? 'bg-amber-500 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Personalizado
                  </button>

                  {kpiFilterPeriod === 'custom' && (
                    <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                      <input
                        type="date"
                        value={kpiStartDate}
                        onChange={(e) => setKpiStartDate(e.target.value)}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
                      />
                      <span className="text-xs text-slate-400 font-bold">hasta</span>
                      <input
                        type="date"
                        value={kpiEndDate}
                        onChange={(e) => setKpiEndDate(e.target.value)}
                        className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* TARJETAS RESUMEN KPI PRINCIPALES */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900 border border-slate-800 text-white p-4 rounded-2xl shadow-md flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">% Cumplimiento Global</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-3xl font-black text-amber-400 font-mono">{globalComplianceRate}%</span>
                    <span className="text-xs text-slate-400 font-bold">Meta 95%</span>
                  </div>
                </div>

                <div 
                  onClick={() => setKpiDetailModal({
                    title: 'Salidas A Tiempo',
                    subtitle: `${onTimeLogs.length} salidas a tiempo de ${totalLogs} totales en el período`,
                    type: 'on_time',
                    logs: onTimeLogs
                  })}
                  className="bg-emerald-50 border border-emerald-200 hover:border-emerald-400 p-4 rounded-2xl shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md transition-all active:scale-95 group"
                  title="Haz clic para ver la lista completa de salidas a tiempo"
                >
                  <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider flex items-center justify-between">
                    Salidas A Tiempo
                    <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600" />
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-3xl font-black text-emerald-800 font-mono">{onTimeLogs.length}</span>
                    <span className="text-xs text-emerald-600 font-bold underline">ver detalle →</span>
                  </div>
                </div>

                <div 
                  onClick={() => setKpiDetailModal({
                    title: 'Salidas Retrasadas',
                    subtitle: `${lateLogs.length} salidas con retraso de ${totalLogs} totales en el período`,
                    type: 'late',
                    logs: lateLogs
                  })}
                  className="bg-rose-50 border border-rose-200 hover:border-rose-400 p-4 rounded-2xl shadow-sm flex flex-col justify-between cursor-pointer hover:shadow-md transition-all active:scale-95 group"
                  title="Haz clic para ver la lista completa de salidas retrasadas"
                >
                  <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider flex items-center justify-between">
                    Salidas Retrasadas
                    <Eye className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-rose-600" />
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-3xl font-black text-rose-800 font-mono">{lateLogs.length}</span>
                    <span className="text-xs text-rose-600 font-bold underline">ver detalle →</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">Promedios de Margen</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-3xl font-black text-amber-800 font-mono">{avgDiffMinutes} <span className="text-xs font-normal">min</span></span>
                    <span className="text-xs text-amber-600 font-bold">diferencia</span>
                  </div>
                </div>
              </div>

              {/* NAVEGACIÓN SECUNDARIA DE TABLAS DE ANÁLISIS */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-5">
                <div className="flex flex-wrap border-b border-slate-200 pb-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setKpiActiveSubTab('supervisores')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                      kpiActiveSubTab === 'supervisores' ? 'bg-slate-900 text-amber-400 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <User className="w-4 h-4" /> % Cumplimiento por Supervisor ({supervisorStats.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiActiveSubTab('responsables')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                      kpiActiveSubTab === 'responsables' ? 'bg-slate-900 text-amber-400 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <PenTool className="w-4 h-4" /> % Cumplimiento por Responsables / Firmantes ({signerStats.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiActiveSubTab('zonales')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                      kpiActiveSubTab === 'zonales' ? 'bg-slate-900 text-amber-400 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Package className="w-4 h-4" /> Cumplimiento por Zonal ({zonalStats.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setKpiActiveSubTab('detalle')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 ${
                      kpiActiveSubTab === 'detalle' ? 'bg-slate-900 text-amber-400 shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <FileText className="w-4 h-4" /> Detalle de Registros ({filteredLogs.length})
                  </button>
                </div>

                {/* SUBTAB 1: SUPERVISORES */}
                {kpiActiveSubTab === 'supervisores' && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      Desempeño de Cierre a Tiempo por Supervisor
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-700 font-black uppercase tracking-wider border-b">
                          <tr>
                            <th className="p-3">Supervisor</th>
                            <th className="p-3 text-center">Total Cierres</th>
                            <th className="p-3 text-center">A Tiempo</th>
                            <th className="p-3 text-center">Retrasados</th>
                            <th className="p-3 text-center">Margen Promedio</th>
                            <th className="p-3 text-right">% Cumplimiento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {supervisorStats.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-slate-400 italic">No hay registros de supervisores para este período.</td>
                            </tr>
                          ) : (
                            supervisorStats.map((sup, idx) => (
                              <tr key={sup.name} className="hover:bg-slate-50/80 transition-all">
                                <td className="p-3 font-extrabold flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
                                    #{idx + 1}
                                  </span>
                                  {sup.name}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setKpiDetailModal({
                                      title: `Despachos — Supervisor ${sup.name}`,
                                      subtitle: `${sup.total} cierres registrados en el período`,
                                      type: 'all',
                                      logs: filteredLogs.filter(l => (l.supervisor_name || 'Sin Supervisor') === sup.name)
                                    })}
                                    className="font-bold font-mono text-slate-800 hover:text-amber-600 hover:underline cursor-pointer"
                                    title="Ver todos los despachos de este supervisor"
                                  >
                                    {sup.total}
                                  </button>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setKpiDetailModal({
                                      title: `Salidas A Tiempo — Supervisor ${sup.name}`,
                                      subtitle: `${sup.onTime} de ${sup.total} salidas a tiempo en el período`,
                                      type: 'on_time',
                                      logs: filteredLogs.filter(l => (l.supervisor_name || 'Sin Supervisor') === sup.name && l.is_on_time)
                                    })}
                                    className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200 hover:scale-105 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center gap-1"
                                    title="Haz clic para ver el detalle de salidas a tiempo"
                                  >
                                    🟢 {sup.onTime}
                                  </button>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setKpiDetailModal({
                                      title: `Salidas Retrasadas — Supervisor ${sup.name}`,
                                      subtitle: `${sup.late} de ${sup.total} salidas con retraso en el período`,
                                      type: 'late',
                                      logs: filteredLogs.filter(l => (l.supervisor_name || 'Sin Supervisor') === sup.name && !l.is_on_time)
                                    })}
                                    className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200 hover:scale-105 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center gap-1"
                                    title="Haz clic para ver el detalle de salidas retrasadas"
                                  >
                                    🔴 {sup.late}
                                  </button>
                                </td>
                                <td className="p-3 text-center font-mono text-slate-600">
                                  {sup.avgDiff} min
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200 hidden sm:block">
                                      <div
                                        className={`h-full rounded-full ${
                                          sup.rate >= 95 ? 'bg-emerald-500' : sup.rate >= 85 ? 'bg-amber-500' : 'bg-rose-500'
                                        }`}
                                        style={{ width: `${sup.rate}%` }}
                                      />
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-black font-mono ${
                                      sup.rate >= 95 ? 'bg-emerald-500 text-white' : sup.rate >= 85 ? 'bg-amber-500 text-white' : 'bg-rose-600 text-white'
                                    }`}>
                                      {sup.rate}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUBTAB 2: RESPONSABLES (FIRMANTES) */}
                {kpiActiveSubTab === 'responsables' && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      Desempeño de Cierre a Tiempo por Responsable (Usuario Firmante)
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-700 font-black uppercase tracking-wider border-b">
                          <tr>
                            <th className="p-3">Responsable (Firmante)</th>
                            <th className="p-3 text-center">Despachos Firmados</th>
                            <th className="p-3 text-center">A Tiempo</th>
                            <th className="p-3 text-center">Retrasados</th>
                            <th className="p-3 text-center">Margen Promedio</th>
                            <th className="p-3 text-right">% Cumplimiento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {signerStats.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-6 text-center text-slate-400 italic">No hay cierres firmados registrados en este período.</td>
                            </tr>
                          ) : (
                            signerStats.map((sig, idx) => (
                              <tr key={sig.name} className="hover:bg-slate-50/80 transition-all">
                                <td className="p-3 font-extrabold">
                                  <div className="flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center justify-center border border-emerald-300">
                                      #{idx + 1}
                                    </span>
                                    <div>
                                      <span className="block font-black text-slate-900">{sig.name}</span>
                                      {sig.email && <span className="text-[10px] text-slate-400 font-normal">{sig.email}</span>}
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setKpiDetailModal({
                                      title: `Despachos Firmados — ${sig.name}`,
                                      subtitle: `${sig.total} cierres firmados en el período`,
                                      type: 'all',
                                      logs: filteredLogs.filter(l => (l.signed_by || l.signed_by_name || 'Sin Nombre').toLowerCase() === (sig.email || sig.name).toLowerCase() || l.signed_by_name === sig.name)
                                    })}
                                    className="font-bold font-mono text-slate-800 hover:text-amber-600 hover:underline cursor-pointer"
                                    title="Ver todos los despachos firmados por este responsable"
                                  >
                                    {sig.total}
                                  </button>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setKpiDetailModal({
                                      title: `Salidas A Tiempo — Responsable ${sig.name}`,
                                      subtitle: `${sig.onTime} de ${sig.total} salidas a tiempo en el período`,
                                      type: 'on_time',
                                      logs: filteredLogs.filter(l => ((l.signed_by || l.signed_by_name || 'Sin Nombre').toLowerCase() === (sig.email || sig.name).toLowerCase() || l.signed_by_name === sig.name) && l.is_on_time)
                                    })}
                                    className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200 hover:scale-105 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center gap-1"
                                    title="Haz clic para ver el detalle de salidas a tiempo"
                                  >
                                    🟢 {sig.onTime}
                                  </button>
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setKpiDetailModal({
                                      title: `Salidas Retrasadas — Responsable ${sig.name}`,
                                      subtitle: `${sig.late} de ${sig.total} salidas con retraso en el período`,
                                      type: 'late',
                                      logs: filteredLogs.filter(l => ((l.signed_by || l.signed_by_name || 'Sin Nombre').toLowerCase() === (sig.email || sig.name).toLowerCase() || l.signed_by_name === sig.name) && !l.is_on_time)
                                    })}
                                    className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200 hover:scale-105 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center gap-1"
                                    title="Haz clic para ver el detalle de salidas retrasadas"
                                  >
                                    🔴 {sig.late}
                                  </button>
                                </td>
                                <td className="p-3 text-center font-mono text-slate-600">
                                  {sig.avgDiff} min
                                </td>
                                <td className="p-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200 hidden sm:block">
                                      <div
                                        className={`h-full rounded-full ${
                                          sig.rate >= 95 ? 'bg-emerald-500' : sig.rate >= 85 ? 'bg-amber-500' : 'bg-rose-500'
                                        }`}
                                        style={{ width: `${sig.rate}%` }}
                                      />
                                    </div>
                                    <span className={`px-3 py-1 rounded-full text-xs font-black font-mono ${
                                      sig.rate >= 95 ? 'bg-emerald-500 text-white' : sig.rate >= 85 ? 'bg-amber-500 text-white' : 'bg-rose-600 text-white'
                                    }`}>
                                      {sig.rate}%
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUBTAB 3: ZONALES */}
                {kpiActiveSubTab === 'zonales' && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      Desempeño de Cierre a Tiempo por Zonal Destino
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-700 font-black uppercase tracking-wider border-b">
                          <tr>
                            <th className="p-3">Zonal</th>
                            <th className="p-3 text-center">Total Camiones</th>
                            <th className="p-3 text-center">A Tiempo</th>
                            <th className="p-3 text-center">Retrasados</th>
                            <th className="p-3 text-center">Margen Promedio</th>
                            <th className="p-3 text-right">% Cumplimiento</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {zonalStats.map((zon, idx) => (
                            <tr key={zon.name} className="hover:bg-slate-50/80 transition-all">
                              <td className="p-3 font-extrabold flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center">
                                  #{idx + 1}
                                </span>
                                <span className="uppercase">{zon.name}</span>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setKpiDetailModal({
                                    title: `Despachos — Zonal ${zon.name}`,
                                    subtitle: `${zon.total} camiones/cierres enviados a ${zon.name} en el período`,
                                    type: 'all',
                                    logs: filteredLogs.filter(l => getBaseZonalName(l.zonal_name) === zon.name)
                                  })}
                                  className="font-bold font-mono text-slate-800 hover:text-amber-600 hover:underline cursor-pointer"
                                  title="Ver todos los camiones/despachos enviados a este zonal"
                                >
                                  {zon.total}
                                </button>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setKpiDetailModal({
                                    title: `Salidas A Tiempo — Zonal ${zon.name}`,
                                    subtitle: `${zon.onTime} de ${zon.total} salidas a tiempo a ${zon.name}`,
                                    type: 'on_time',
                                    logs: filteredLogs.filter(l => getBaseZonalName(l.zonal_name) === zon.name && l.is_on_time)
                                  })}
                                  className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200 hover:scale-105 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center gap-1"
                                  title="Haz clic para ver el detalle de salidas a tiempo"
                                >
                                  🟢 {zon.onTime}
                                </button>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setKpiDetailModal({
                                    title: `Salidas Retrasadas — Zonal ${zon.name}`,
                                    subtitle: `${zon.late} de ${zon.total} salidas con retraso a ${zon.name}`,
                                    type: 'late',
                                    logs: filteredLogs.filter(l => getBaseZonalName(l.zonal_name) === zon.name && !l.is_on_time)
                                  })}
                                  className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200 hover:bg-rose-200 hover:scale-105 transition-all cursor-pointer shadow-2xs active:scale-95 inline-flex items-center gap-1"
                                  title="Haz clic para ver el detalle de salidas retrasadas"
                                >
                                  🔴 {zon.late}
                                </button>
                              </td>
                              <td className="p-3 text-center font-mono text-slate-600">
                                {zon.avgDiff} min
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200 hidden sm:block">
                                    <div
                                      className={`h-full rounded-full ${
                                        zon.rate >= 95 ? 'bg-emerald-500' : zon.rate >= 85 ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${zon.rate}%` }}
                                    />
                                  </div>
                                  <span className={`px-3 py-1 rounded-full text-xs font-black font-mono ${
                                    zon.rate >= 95 ? 'bg-emerald-500 text-white' : zon.rate >= 85 ? 'bg-amber-500 text-white' : 'bg-rose-600 text-white'
                                  }`}>
                                    {zon.rate}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* SUBTAB 4: DETALLE DE REGISTROS HISTÓRICOS */}
                {kpiActiveSubTab === 'detalle' && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                      Listado Completo de Salidas Registradas en Supabase ({filteredLogs.length})
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-700 font-black uppercase tracking-wider border-b">
                          <tr>
                            <th className="p-3">Fecha</th>
                            <th className="p-3">Zonal</th>
                            <th className="p-3 text-center">Meta Cierre</th>
                            <th className="p-3 text-center">Hora Cierre Real</th>
                            <th className="p-3 text-center">Estado</th>
                            <th className="p-3">Supervisor</th>
                            <th className="p-3">Responsable (Firmante)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                          {filteredLogs.slice(0, 100).map((log) => (
                            <tr key={log.id || `${log.dispatch_id}-${log.zonal_name}-${log.viaje_numero}`} className="hover:bg-slate-50/80 transition-all">
                              <td className="p-3 font-mono font-bold">{log.inspection_date}</td>
                              <td className="p-3 font-extrabold uppercase">
                                {log.zonal_name}
                              </td>
                              <td className="p-3 text-center font-mono">{log.target_time} hrs</td>
                              <td className="p-3 text-center font-mono font-black">{log.actual_time} hrs</td>
                              <td className="p-3 text-center">
                                {log.is_on_time ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    🟢 A TIEMPO (+{log.diff_minutes}m)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                    🔴 RETRASADO (-{log.diff_minutes}m)
                                  </span>
                                )}
                              </td>
                              <td className="p-3">{log.supervisor_name || '—'}</td>
                              <td className="p-3 font-semibold text-emerald-800">
                                {log.signed_by_name || log.signed_by || 'Pendiente Firma'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

            {/* MODAL DE DETALLE DE SALIDAS (A TIEMPO / RETRASADAS) */}
            {kpiDetailModal && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in select-none">
                <div className="bg-white rounded-2xl max-w-4xl w-full p-5 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
                  {/* Header */}
                  <div className="flex items-center justify-between border-b pb-3 shrink-0">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                        {kpiDetailModal.type === 'on_time' ? (
                          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                        ) : kpiDetailModal.type === 'late' ? (
                          <span className="w-3 h-3 rounded-full bg-rose-500 inline-block shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>
                        ) : (
                          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
                        )}
                        {kpiDetailModal.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        {kpiDetailModal.subtitle}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setKpiDetailModal(null); setKpiDetailSearch(''); }}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer font-bold text-lg"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Search Filter Bar */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Buscar por zonal, fecha, supervisor o responsable..."
                        value={kpiDetailSearch}
                        onChange={(e) => setKpiDetailSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                      />
                    </div>
                    {kpiDetailSearch && (
                      <button
                        type="button"
                        onClick={() => setKpiDetailSearch('')}
                        className="text-xs text-slate-500 font-bold px-2 py-1 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Limpiar
                      </button>
                    )}
                  </div>

                  {/* Table Content */}
                  <div className="overflow-y-auto flex-1 border border-slate-200 rounded-xl">
                    {(() => {
                      const q = kpiDetailSearch.toLowerCase().trim();
                      const filtered = kpiDetailModal.logs.filter(log => {
                        if (!q) return true;
                        return (
                          (log.inspection_date || '').toLowerCase().includes(q) ||
                          (log.zonal_name || '').toLowerCase().includes(q) ||
                          (log.supervisor_name || '').toLowerCase().includes(q) ||
                          (log.signed_by_name || log.signed_by || '').toLowerCase().includes(q) ||
                          (`viaje ${log.viaje_numero}`).includes(q)
                        );
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="p-8 text-center text-slate-400 italic text-xs">
                            No se encontraron registros que coincidan con la búsqueda.
                          </div>
                        );
                      }

                      return (
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 text-slate-700 font-black uppercase tracking-wider border-b sticky top-0 z-10 shadow-2xs">
                            <tr>
                              <th className="p-3">Fecha</th>
                              <th className="p-3">Zonal / Viaje</th>
                              <th className="p-3 text-center">Meta Cierre</th>
                              <th className="p-3 text-center">Hora Cierre Real</th>
                              <th className="p-3 text-center">Estado / Margen</th>
                              <th className="p-3">Supervisor</th>
                              <th className="p-3">Responsable (Firmante)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                            {filtered.map((log) => (
                              <tr key={log.id || `${log.dispatch_id}-${log.zonal_name}-${log.viaje_numero}`} className="hover:bg-slate-50/80 transition-all">
                                <td className="p-3 font-mono font-bold">{log.inspection_date}</td>
                                <td className="p-3 font-extrabold uppercase">
                                  {log.zonal_name}
                                </td>
                                <td className="p-3 text-center font-mono">{log.target_time} hrs</td>
                                <td className="p-3 text-center font-mono font-black">{log.actual_time} hrs</td>
                                <td className="p-3 text-center">
                                  {log.is_on_time ? (
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      🟢 A TIEMPO (+{log.diff_minutes}m)
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                      🔴 RETRASADO (-{log.diff_minutes}m)
                                    </span>
                                  )}
                                </td>
                                <td className="p-3">{log.supervisor_name || '—'}</td>
                                <td className="p-3 font-semibold text-emerald-800">
                                  {log.signed_by_name || log.signed_by || 'Pendiente Firma'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>

                  {/* Modal Footer */}
                  <div className="flex items-center justify-between pt-2 border-t text-xs text-slate-500 font-semibold shrink-0">
                    <span>Mostrando {kpiDetailModal.logs.length} registros en total</span>
                    <button
                      type="button"
                      onClick={() => { setKpiDetailModal(null); setKpiDetailSearch(''); }}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold transition-all cursor-pointer shadow-xs active:scale-95"
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
        })()}

        {activeTab === 'bitacora_atrasos' && (() => {
          // Filtrar logs con retraso (is_on_time === false)
          let lateDepartureLogs = zonalDepartureLogs.filter(l => !l.is_on_time);

          // Filtrar según el período seleccionado
          if (bitacoraPeriod === 'semana_actual') {
            const now = new Date();
            const dayOfWeek = now.getDay() || 7; // 1 = Lunes
            const monday = new Date(now);
            monday.setDate(now.getDate() - (dayOfWeek - 1));
            const mondayStr = getChileDateString(monday);
            lateDepartureLogs = lateDepartureLogs.filter(l => l.inspection_date >= mondayStr);
          } else if (bitacoraPeriod === 'semana_pasada') {
            const now = new Date();
            const dayOfWeek = now.getDay() || 7;
            const thisMonday = new Date(now);
            thisMonday.setDate(now.getDate() - (dayOfWeek - 1));
            const prevMonday = new Date(thisMonday);
            prevMonday.setDate(thisMonday.getDate() - 7);
            const prevSunday = new Date(thisMonday);
            prevSunday.setDate(thisMonday.getDate() - 1);
            
            const prevMondayStr = getChileDateString(prevMonday);
            const prevSundayStr = getChileDateString(prevSunday);
            lateDepartureLogs = lateDepartureLogs.filter(l => l.inspection_date >= prevMondayStr && l.inspection_date <= prevSundayStr);
          } else if (bitacoraPeriod === 'ultimas_4_semanas') {
            const minDate = new Date();
            minDate.setDate(minDate.getDate() - 28);
            const minDateStr = getChileDateString(minDate);
            lateDepartureLogs = lateDepartureLogs.filter(l => l.inspection_date >= minDateStr);
          } else if (bitacoraPeriod === 'personalizado') {
            lateDepartureLogs = lateDepartureLogs.filter(l => l.inspection_date >= bitacoraStartDate && l.inspection_date <= bitacoraEndDate);
          }

          const totalLateCount = lateDepartureLogs.length;

          // Mapear cada log retrasado con su justificación en delayLogs (si existe)
          const mappedDelays = lateDepartureLogs.map(log => {
            const baseZonal = getBaseZonalName(log.zonal_name);
            const viajeNum = log.viaje_numero || 1;
            const matchedEntry = delayLogs.find(d => 
              d.departure_log_id === log.id || 
              (d.zonal_name === baseZonal && d.viaje_numero === viajeNum && d.inspection_date === log.inspection_date)
            );

            return {
              log,
              entry: matchedEntry
            };
          });

          const justifiedCount = mappedDelays.filter(m => !!m.entry).length;
          const justifiedRate = totalLateCount > 0 ? Math.round((justifiedCount / totalLateCount) * 100) : 100;
          const avgDelayMinutes = totalLateCount > 0 ? Math.round(lateDepartureLogs.reduce((acc, l) => acc + (l.diff_minutes || 0), 0) / totalLateCount) : 0;

          // Desglose por categoría
          const categoryCounts: { [key: string]: number } = {
            'Operación': 0,
            'Transporte': 0,
            'Facturación': 0,
            'Planificación': 0,
            'Otro': 0
          };

          mappedDelays.forEach(m => {
            if (m.entry && m.entry.category) {
              categoryCounts[m.entry.category] = (categoryCounts[m.entry.category] || 0) + 1;
            }
          });

          // Categoría con mayor cantidad de atrasos
          let topCategory = 'Operación';
          let maxCatCount = -1;
          Object.entries(categoryCounts).forEach(([cat, count]) => {
            if (count > maxCatCount) {
              maxCatCount = count;
              topCategory = cat;
            }
          });

          // Aplicar filtros de búsqueda, categoría y estado a la lista mostrada en la tabla
          let filteredRows = mappedDelays.filter(({ log, entry }) => {
            if (bitacoraCategoryFilter !== 'todos') {
              if (!entry || entry.category !== bitacoraCategoryFilter) return false;
            }
            if (bitacoraStatusFilter === 'pendiente') {
              if (!!entry) return false;
            } else if (bitacoraStatusFilter === 'justificado') {
              if (!entry) return false;
            }

            if (bitacoraSearchQuery.trim()) {
              const q = bitacoraSearchQuery.toLowerCase().trim();
              const baseZonal = getBaseZonalName(log.zonal_name).toLowerCase();
              const sup = (log.supervisor_name || '').toLowerCase();
              const resp = (getSignerNameFromLog(log, palletUsers) || '').toLowerCase();
              const cat = (entry?.category || '').toLowerCase();
              const just = (entry?.justification || '').toLowerCase();
              return baseZonal.includes(q) || sup.includes(q) || resp.includes(q) || cat.includes(q) || just.includes(q) || log.inspection_date.includes(q);
            }
            return true;
          });

          return (
            <div className="space-y-6 animate-fade-in select-none">
              {/* HEADER PESTAÑA BITÁCORA */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3">
                <div>
                  <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                    Bitácora de Atrasos & Análisis de Causa Raíz
                  </h2>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Registro de justificaciones de retraso por categoría, fotos de respaldo e informe semanal
                  </p>
                </div>

                {/* FILTROS DE PERÍODO / RANGO DE FECHAS */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-2xs">
                    {[
                      { key: 'semana_actual', label: 'Esta Semana' },
                      { key: 'semana_pasada', label: 'Semana Pasada' },
                      { key: 'ultimas_4_semanas', label: 'Últimas 4 Semanas' },
                      { key: 'todo', label: 'Todo' },
                      { key: 'personalizado', label: 'Rango...' }
                    ].map(p => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setBitacoraPeriod(p.key as any)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          bitacoraPeriod === p.key ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {bitacoraPeriod === 'personalizado' && (
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1 text-xs font-bold shadow-2xs">
                      <input
                        type="date"
                        value={bitacoraStartDate}
                        onChange={(e) => setBitacoraStartDate(e.target.value)}
                        className="bg-transparent focus:outline-none cursor-pointer"
                      />
                      <span className="text-slate-400">a</span>
                      <input
                        type="date"
                        value={bitacoraEndDate}
                        onChange={(e) => setBitacoraEndDate(e.target.value)}
                        className="bg-transparent focus:outline-none cursor-pointer"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => { fetchZonalDepartureLogs(); fetchDelayLogbook(); }}
                    className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 cursor-pointer shadow-sm active:scale-95"
                    title="Actualizar datos de Bitácora"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* TARJETAS RESUMEN / INFORME SEMANAL */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-rose-50/80 border border-rose-200 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider">Total Atrasos Período</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-3xl font-black text-rose-800 font-mono">{totalLateCount}</span>
                    <span className="text-xs font-bold text-rose-600">despachos</span>
                  </div>
                </div>

                <div className="bg-emerald-50/80 border border-emerald-200 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">% Atrasos Justificados</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-3xl font-black text-emerald-800 font-mono">{justifiedRate}%</span>
                    <span className="text-xs font-bold text-emerald-600">{justifiedCount} de {totalLateCount}</span>
                  </div>
                </div>

                <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-2xl shadow-sm flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider">Categoría Mayoritaria</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-black text-amber-900 truncate">
                      {justifiedCount > 0 ? topCategory : 'Sin Datos'}
                    </span>
                    <span className="text-xs font-bold text-amber-700 font-mono">
                      {justifiedCount > 0 ? `${maxCatCount} casos` : ''}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-md text-white flex flex-col justify-between">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Promedio de Retraso</span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-3xl font-black text-amber-400 font-mono">-{avgDelayMinutes}m</span>
                    <span className="text-[10px] text-slate-400">por salida</span>
                  </div>
                </div>
              </div>

              {/* INFORME DE DISTRIBUCIÓN PORCENTUAL POR CATEGORÍA */}
              <div className="bg-white p-4.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                    📊 Informe de Distribución Porcentual por Categoría de Atraso
                  </h3>
                  <span className="text-[11px] font-bold text-slate-400">
                    Base: {justifiedCount} atrasos justificados de {totalLateCount} totales
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {[
                    { key: 'Operación', icon: '🏭', color: 'amber', bg: 'bg-amber-500', text: 'text-amber-700' },
                    { key: 'Transporte', icon: '🚛', color: 'blue', bg: 'bg-blue-500', text: 'text-blue-700' },
                    { key: 'Facturación', icon: '📄', color: 'purple', bg: 'bg-purple-500', text: 'text-purple-700' },
                    { key: 'Planificación', icon: '📅', color: 'emerald', bg: 'bg-emerald-500', text: 'text-emerald-700' },
                    { key: 'Otro', icon: '⚙️', color: 'slate', bg: 'bg-slate-500', text: 'text-slate-700' }
                  ].map(cat => {
                    const count = categoryCounts[cat.key] || 0;
                    const pct = justifiedCount > 0 ? Math.round((count / justifiedCount) * 100) : 0;

                    return (
                      <div key={cat.key} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex flex-col justify-between space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                            <span>{cat.icon}</span>
                            <span>{cat.key}</span>
                          </span>
                          <span className="text-xs font-mono font-black text-slate-700">{pct}%</span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <div className={`h-full ${cat.bg} transition-all duration-500`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 text-right block">
                          {count} {count === 1 ? 'atraso' : 'atrasos'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* FILTROS Y BÚSQUEDA TABLA */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex-wrap">
                <div className="relative flex-1 w-full sm:w-auto">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Buscar por zonal, supervisor, responsable o palabra clave..."
                    value={bitacoraSearchQuery}
                    onChange={(e) => setBitacoraSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-rose-500 focus:bg-white transition-all"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  <select
                    value={bitacoraCategoryFilter}
                    onChange={(e) => setBitacoraCategoryFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="todos">Todas las Categorías</option>
                    <option value="Operación">🏭 Operación</option>
                    <option value="Transporte">🚛 Transporte</option>
                    <option value="Facturación">📄 Facturación</option>
                    <option value="Planificación">📅 Planificación</option>
                    <option value="Otro">⚙️ Otro</option>
                  </select>

                  <select
                    value={bitacoraStatusFilter}
                    onChange={(e) => setBitacoraStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                  >
                    <option value="todos">Todos los Estados</option>
                    <option value="pendiente">🔴 Pendientes Justificación</option>
                    <option value="justificado">🟢 Justificados</option>
                  </select>
                </div>
              </div>

              {/* TABLA DE SALIDAS RETRASADAS Y GESTIÓN DE BITÁCORA */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {filteredRows.length === 0 ? (
                  <div className="text-center py-16 px-4 space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                    <h3 className="text-sm font-black text-slate-800">No hay atrasos registrados para los filtros seleccionados</h3>
                    <p className="text-xs text-slate-400 font-medium">¡Excelente desempeño operacional en este período!</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="py-3 px-2.5">Fecha</th>
                          <th className="py-3 px-2.5">Zonal / Viaje</th>
                          <th className="py-3 px-2.5 text-center">Meta vs Real</th>
                          <th className="py-3 px-2.5 text-center">Retraso</th>
                          <th className="py-3 px-2.5">Responsable & Sup.</th>
                          <th className="py-3 px-2.5 text-center">Categoría / Acción</th>
                          <th className="py-3 px-2.5">Justificación & Evidencia</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredRows.map(({ log, entry }) => {
                          const baseZonal = getBaseZonalName(log.zonal_name);
                          const viajeNum = log.viaje_numero || 1;
                          const signer = getSignerNameFromLog(log, palletUsers);

                          return (
                            <tr key={log.id || `${log.inspection_date}-${baseZonal}-${viajeNum}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-2.5 font-mono text-[11px] whitespace-nowrap">
                                {getFormatDate(log.inspection_date)}
                              </td>

                              <td className="py-3 px-2.5 font-black uppercase text-slate-800 whitespace-nowrap">
                                {log.zonal_name}
                              </td>

                              <td className="py-3 px-2.5 text-center font-mono whitespace-nowrap">
                                <span className="text-slate-400 font-normal">{log.target_time}</span>
                                <span className="text-slate-300 mx-1">➔</span>
                                <strong className="text-slate-800 font-bold">{log.actual_time}</strong>
                              </td>

                              <td className="py-3 px-2.5 text-center whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                  🔴 -{log.diff_minutes} min
                                </span>
                              </td>

                              <td className="py-3 px-2.5">
                                <div className="text-slate-900 font-extrabold text-xs">{signer || log.supervisor_name}</div>
                                <div className="text-[10px] text-slate-500 font-semibold truncate">
                                  Sup: {log.supervisor_name}
                                </div>
                              </td>

                              <td className="py-3 px-2.5 text-center whitespace-nowrap">
                                {entry ? (
                                  <button
                                    type="button"
                                    onClick={() => openDelayModal(log)}
                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border uppercase tracking-wider transition-all cursor-pointer hover:shadow-xs active:scale-95 inline-flex items-center gap-1 ${
                                      entry.category === 'Operación' ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200' :
                                      entry.category === 'Transporte' ? 'bg-blue-100 text-blue-900 border-blue-300 hover:bg-blue-200' :
                                      entry.category === 'Facturación' ? 'bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200' :
                                      entry.category === 'Planificación' ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200' :
                                      'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                                    }`}
                                    title="Hacer clic para editar la justificación"
                                  >
                                    <span>{entry.category}</span>
                                    <PenTool className="w-3 h-3 text-slate-500 ml-0.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openDelayModal(log)}
                                    className="px-3 py-1 rounded-xl text-[11px] font-black bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1.5 animate-pulse"
                                    title="Hacer clic para justificar este atraso"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span>⚠️ + Justificar</span>
                                  </button>
                                )}
                              </td>

                              <td className="py-3 px-2.5">
                                {entry ? (
                                  <div className="space-y-1">
                                    <p className="text-slate-700 text-xs font-medium break-words whitespace-pre-wrap bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                                      "{entry.justification}"
                                    </p>
                                    {entry.photos && entry.photos.length > 0 && (
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {entry.photos.map((pUrl, pIdx) => (
                                          <img
                                            key={pIdx}
                                            src={pUrl}
                                            alt={`Evidencia ${pIdx + 1}`}
                                            className="w-8 h-8 rounded object-cover border border-slate-200 cursor-pointer hover:scale-110 transition-transform shadow-2xs"
                                            onClick={() => openPhotoGallery(entry.photos || [], pIdx)}
                                          />
                                        ))}
                                        <span className="text-[10px] text-slate-400 font-bold">
                                          ({entry.photos.length} fotos)
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">
                                    Sin justificación ingresada
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* MODAL PARA REGISTRAR / EDITAR JUSTIFICACIÓN DE ATRASO */}
              {editingDelayModal && (
                <div 
                  onPaste={handlePasteDelayPhotos}
                  className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in select-none"
                >
                  <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200">
                    <div className="flex items-center justify-between border-b pb-3">
                      <div>
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          Justificación de Atraso
                        </h3>
                        <p className="text-xs text-slate-500 font-bold mt-0.5">
                          {getBaseZonalName(editingDelayModal.logItem.zonal_name)} {editingDelayModal.logItem.viaje_numero > 1 ? `(Viaje ${editingDelayModal.logItem.viaje_numero})` : ''} — Retraso: <span className="text-rose-600">-{editingDelayModal.logItem.diff_minutes} min</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingDelayModal(null)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer text-base font-bold"
                      >
                        ✕
                      </button>
                    </div>

                    {/* DATOS DEL RESUMEN DEL DESPACHO */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs space-y-1 font-semibold text-slate-700">
                      <div className="flex justify-between">
                        <span>Fecha / Meta Cierre:</span>
                        <strong className="font-mono">{getFormatDate(editingDelayModal.logItem.inspection_date)} ({editingDelayModal.logItem.target_time} hrs)</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Hora Cierre Real:</span>
                        <strong className="font-mono text-rose-700">{editingDelayModal.logItem.actual_time} hrs</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Supervisor / Responsable:</span>
                        <strong>{editingDelayModal.logItem.supervisor_name}</strong>
                      </div>
                    </div>

                    {/* SELECCIÓN DE CATEGORÍA DEL ATRASO */}
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-700 uppercase">
                        Categoría del Atraso <span className="text-rose-600">*</span>
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          { key: 'Operación', icon: '🏭', desc: 'Picking, andén, armado' },
                          { key: 'Transporte', icon: '🚛', desc: 'Camión, chofer, falla' },
                          { key: 'Facturación', icon: '📄', desc: 'Guías, sistema ERP' },
                          { key: 'Planificación', icon: '📅', desc: 'Ruta, stock, horario' },
                          { key: 'Otro', icon: '⚙️', desc: 'Otras razones' }
                        ].map(cat => (
                          <button
                            key={cat.key}
                            type="button"
                            onClick={() => setDelayCategory(cat.key as any)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                              delayCategory === cat.key
                                ? 'bg-rose-50 border-rose-500 text-rose-950 font-black ring-2 ring-rose-400/30'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                            }`}
                          >
                            <span className="text-xs font-bold flex items-center gap-1">
                              <span>{cat.icon}</span>
                              <span>{cat.key}</span>
                            </span>
                            <span className="text-[9px] text-slate-500 font-medium mt-1 block">
                              {cat.desc}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* DETALLE / JUSTIFICACIÓN DE CAUSA RAÍZ */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-700 uppercase">
                          Motivo / Justificación del Atraso <span className="text-rose-600">*</span>
                        </label>
                        <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          📋 Ctrl + V para pegar fotos
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        placeholder="Describe la causa raíz del retraso. Si tomaste una captura de pantalla o copiaste una foto, puedes pegarla directamente aquí con Ctrl + V..."
                        value={delayJustification}
                        onChange={(e) => setDelayJustification(e.target.value)}
                        onPaste={handlePasteDelayPhotos}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-medium focus:outline-none focus:border-rose-500 focus:bg-white transition-all"
                      />
                    </div>

                    {/* FOTOS DE EVIDENCIA (OPCIONAL) */}
                    <div className="space-y-2 border-t pt-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                          <Camera className="w-3.5 h-3.5 text-amber-600" />
                          Fotos de Evidencia ({delayPhotos.length}/6)
                        </label>
                        <div className="flex items-center gap-1.5">
                          <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 active:scale-95" title="Tomar foto directa con la cámara">
                            <Camera className="w-3.5 h-3.5 text-amber-600" />
                            <span>Tomar Foto</span>
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              multiple
                              onChange={handleDelayPhotoUpload}
                              className="hidden"
                            />
                          </label>
                          <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all flex items-center gap-1 active:scale-95" title="Elegir fotos guardadas desde la galería">
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Galería</span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={handleDelayPhotoUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {delayPhotos.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {delayPhotos.map((pUrl, pIdx) => (
                            <div key={pIdx} className="relative rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-100">
                              <img
                                src={pUrl}
                                alt={`Evidencia ${pIdx + 1}`}
                                className="w-full h-full object-cover cursor-pointer"
                                onClick={() => openPhotoGallery(delayPhotos, pIdx)}
                              />
                              <button
                                type="button"
                                onClick={() => removeDelayPhoto(pIdx)}
                                className="absolute top-1 right-1 bg-rose-600 text-white rounded-full p-0.5 opacity-90 hover:opacity-100 shadow-sm cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* BOTONES FOOTER */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                      <button
                        type="button"
                        onClick={() => setEditingDelayModal(null)}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDelayJustification}
                        disabled={delaySaveLoading}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md shadow-rose-600/30 flex items-center gap-1.5 active:scale-95"
                      >
                        {delaySaveLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <span>💾 Guardar Justificación</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* VISTA: REPORTE DE INSPECCIÓN & SEMÁFORO POR PATENTE */}
        {activeTab === 'inspeccion_reporte' && (
          <div className="space-y-6">
            {/* CABECERA Y RESUMEN KPI DE INSPECCIÓN */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="text-xl">🚥</span>
                    <span>REPORTE DE INSPECCIÓN & SEMÁFORO POR PATENTE</span>
                  </h2>
                  <p className="text-xs text-slate-500 font-semibold mt-0.5">
                    Monitoreo del estado físico/mecánico de camiones y acumulación de observaciones para transportistas externos.
                  </p>
                </div>

                {/* PERIODO DE FILTRADO */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionPeriod('hoy');
                      fetchHistory('hoy');
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      inspectionPeriod === 'hoy' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ⚡ Hoy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionPeriod('semana');
                      fetchHistory('semana');
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      inspectionPeriod === 'semana' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    🗓️ Esta Semana
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionPeriod('mes');
                      fetchHistory('mes');
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      inspectionPeriod === 'mes' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    📅 Este Mes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionPeriod('todo');
                      fetchHistory('todo');
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                      inspectionPeriod === 'todo' ? 'bg-white text-slate-900 shadow-2xs font-black' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    🗂️ Ver Todo
                  </button>
                </div>
              </div>

              {/* BUSCADOR */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Buscar por Patente de camión, N° de camión, supervisor o zonal..."
                  value={inspectionSearch}
                  onChange={(e) => setInspectionSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                />
              </div>

              {/* CÁLCULO DE MÉTRICAS GLOBALES */}
              {(() => {
                const filteredRecords = records.filter(rec => {
                  const recDateStr = String(rec.inspection_date || rec.created_at || '').slice(0, 10);
                  if (inspectionPeriod === 'hoy') {
                    return recDateStr === getChileDateString();
                  } else if (inspectionPeriod === 'semana') {
                    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                    return recDateStr >= sevenDaysAgo;
                  } else if (inspectionPeriod === 'mes') {
                    const now = new Date();
                    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
                    return recDateStr >= startOfMonth;
                  }
                  return true;
                }).filter(rec => {
                  if (!inspectionSearch.trim()) return true;
                  const q = inspectionSearch.toLowerCase().trim();
                  return (
                    (rec.truck_plate || '').toLowerCase().includes(q) ||
                    (rec.truck_number || '').toLowerCase().includes(q) ||
                    (rec.supervisor_name || '').toLowerCase().includes(q) ||
                    (rec.zonals_detail || []).some(z => z.zonal_name.toLowerCase().includes(q))
                  );
                });

                const plateGroups: { [key: string]: {
                  plate: string;
                  truckNumbers: Set<string>;
                  supervisors: Set<string>;
                  records: DispatchRecord[];
                  verdeCount: number;
                  amarilloCount: number;
                  rojoCount: number;
                  itemCounts: { [itemKey: string]: { verde: number; amarillo: number; rojo: number } };
                } } = {};

                let totalVerdes = 0;
                let totalAmarillos = 0;
                let totalRojos = 0;

                filteredRecords.forEach(rec => {
                  const plate = (rec.truck_plate && rec.truck_plate !== 'N/A') ? rec.truck_plate.trim().toUpperCase() : `CAMIÓN #${rec.truck_number || 'S/A'}`;
                  
                  if (!plateGroups[plate]) {
                    plateGroups[plate] = {
                      plate,
                      truckNumbers: new Set(),
                      supervisors: new Set(),
                      records: [],
                      verdeCount: 0,
                      amarilloCount: 0,
                      rojoCount: 0,
                      itemCounts: {
                        postura_anden: { verde: 0, amarillo: 0, rojo: 0 },
                        limpieza_estructura: { verde: 0, amarillo: 0, rojo: 0 },
                        luces_encendidas: { verde: 0, amarillo: 0, rojo: 0 },
                        separador_termico: { verde: 0, amarillo: 0, rojo: 0 },
                        lingas_camion: { verde: 0, amarillo: 0, rojo: 0 }
                      }
                    };
                  }

                  const group = plateGroups[plate];
                  if (rec.truck_number && rec.truck_number !== 'N/A') group.truckNumbers.add(rec.truck_number);
                  if (rec.supervisor_name) group.supervisors.add(rec.supervisor_name);
                  group.records.push(rec);

                  const chk = rec.checklist || {};
                  const items = ['postura_anden', 'limpieza_estructura', 'luces_encendidas', 'separador_termico', 'lingas_camion'];

                  items.forEach(key => {
                    const st = getChecklistStatus(chk[key]);
                    if (st === 'VERDE') {
                      group.verdeCount++;
                      totalVerdes++;
                      if (group.itemCounts[key]) group.itemCounts[key].verde++;
                    } else if (st === 'AMARILLO') {
                      group.amarilloCount++;
                      totalAmarillos++;
                      if (group.itemCounts[key]) group.itemCounts[key].amarillo++;
                    } else if (st === 'ROJO') {
                      group.rojoCount++;
                      totalRojos++;
                      if (group.itemCounts[key]) group.itemCounts[key].rojo++;
                    }
                  });
                });

                const sortedPlates = Object.values(plateGroups).sort((a, b) => {
                  const weightA = a.rojoCount * 3 + a.amarilloCount;
                  const weightB = b.rojoCount * 3 + b.amarilloCount;
                  return weightB - weightA;
                });

                return (
                  <div className="space-y-6">
                    {/* CARDS DE KPIS */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-center shadow-2xs">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Camiones Evaluados</span>
                        <span className="text-2xl font-black text-slate-800 font-mono">{sortedPlates.length}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block">patentes distintas</span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl text-center shadow-2xs">
                        <span className="text-[10px] font-bold text-emerald-800 uppercase block">🟢 Conformes (Verde)</span>
                        <span className="text-2xl font-black text-emerald-700 font-mono">{totalVerdes}</span>
                        <span className="text-[10px] text-emerald-600 font-semibold block">puntos aprobados</span>
                      </div>
                      <div className="bg-amber-50 border border-amber-300 p-3.5 rounded-xl text-center shadow-2xs">
                        <span className="text-[10px] font-bold text-amber-900 uppercase block">🟡 Problemas (Amarillo)</span>
                        <span className="text-2xl font-black text-amber-700 font-mono">{totalAmarillos}</span>
                        <span className="text-[10px] text-amber-800 font-semibold block">observaciones menores</span>
                      </div>
                      <div className="bg-rose-50 border border-rose-300 p-3.5 rounded-xl text-center shadow-2xs">
                        <span className="text-[10px] font-bold text-rose-900 uppercase block">🔴 Rechazados (Rojo)</span>
                        <span className="text-2xl font-black text-rose-700 font-mono">{totalRojos}</span>
                        <span className="text-[10px] text-rose-800 font-semibold block">fallas críticas</span>
                      </div>
                    </div>

                    {/* LISTADO DE PATENTES CON ACUMULACIÓN DE SEMÁFOROS */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b pb-2 flex-wrap gap-2">
                        <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                          🚛 Estado Consolidado por Patente ({sortedPlates.length})
                        </h3>

                        {totalRojos + totalAmarillos > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              const allFailRecords = filteredRecords.filter(r => {
                                const chk = r.checklist || {};
                                return ['postura_anden', 'limpieza_estructura', 'luces_encendidas', 'separador_termico', 'lingas_camion'].some(k => {
                                  const st = getChecklistStatus(chk[k]);
                                  return st === 'AMARILLO' || st === 'ROJO';
                                });
                              });
                              openFailureAlertModalForPlate({
                                plate: `CONSOLIDADO ${inspectionPeriod.toUpperCase()} (${sortedPlates.filter(p => p.rojoCount + p.amarilloCount > 0).length} CAMIONES)`,
                                truckNumbers: Array.from(new Set(allFailRecords.map(r => r.truck_number).filter(Boolean))),
                                records: allFailRecords
                              });
                            }}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[11px] font-black transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer border border-rose-500"
                            title="Enviar reporte por correo con todas las fallas detectadas en el período seleccionado"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            <span>Notificar Fallas del Período ({totalRojos + totalAmarillos})</span>
                          </button>
                        )}
                      </div>

                      {sortedPlates.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 border border-slate-200 rounded-xl">
                          <p className="text-xs font-bold text-slate-400">No se encontraron inspecciones para el periodo o búsqueda seleccionada.</p>
                        </div>
                      ) : (
                        sortedPlates.map((group) => {
                          const hasCriticalFailures = group.rojoCount > 0 || group.amarilloCount >= 2;
                          const isExpanded = !!expandedInspectionPlates[group.plate];
                          const itemLabels: { [key: string]: string } = {
                            postura_anden: '1. Horario Postura Andén',
                            limpieza_estructura: '2. Limpieza & Estructura',
                            luces_encendidas: '3. Luces Encendidas',
                            separador_termico: '4. Separador Térmico',
                            lingas_camion: '5. Lingas de Sujeción'
                          };

                          // 1. Ordenar cronológicamente descendente los despachos de este grupo/periodo
                          const sortedGroupRecords = [...group.records].sort((a, b) => {
                            const timeA = `${a.inspection_date || ''} ${a.close_time || a.inspection_time || '00:00'}`;
                            const timeB = `${b.inspection_date || ''} ${b.close_time || b.inspection_time || '00:00'}`;
                            return timeB.localeCompare(timeA);
                          });

                          // 2. Obtener historial completo de este camión en toda la base de datos (records)
                          const allTruckRecordsSorted = records.filter(r => {
                            const p = (r.truck_plate || '').trim().toUpperCase();
                            const n = (r.truck_number || '').trim().toUpperCase();
                            const normKey = (group.plate || '').trim().toUpperCase();
                            return (p && p !== 'N/A' && p === normKey) || (n && n !== 'N/A' && n === normKey) || (`CAMIÓN #${n}` === normKey);
                          }).sort((a, b) => {
                            const timeA = `${a.inspection_date || ''} ${a.close_time || a.inspection_time || '00:00'}`;
                            const timeB = `${b.inspection_date || ''} ${b.close_time || b.inspection_time || '00:00'}`;
                            return timeB.localeCompare(timeA);
                          });

                          // 3. Buscar el despacho más reciente donde se detectó daño de separador térmico
                          const latestThermalDamageRecord = allTruckRecordsSorted.find(r => {
                            const st = getChecklistStatus(r.checklist?.separador_termico);
                            return st === 'AMARILLO' || st === 'ROJO';
                          });

                          let displayedZonals: string[] = [];
                          let displayedDate: string | null = null;
                          let isDamageOriginZonal = false;
                          let detectedProblemDate: string | null = null;

                          if (latestThermalDamageRecord) {
                            detectedProblemDate = latestThermalDamageRecord.inspection_date;
                            const problemIdx = allTruckRecordsSorted.findIndex(r => r.id === latestThermalDamageRecord.id);
                            // La zonal anterior a la que se detectó el problema
                            if (problemIdx >= 0 && problemIdx < allTruckRecordsSorted.length - 1) {
                              const prevTrip = allTruckRecordsSorted[problemIdx + 1];
                              displayedZonals = prevTrip.zonals_detail?.map(z => z.zonal_name).filter(Boolean) || [];
                              displayedDate = prevTrip.inspection_date;
                              isDamageOriginZonal = true;
                            }
                          }

                          if (!isDamageOriginZonal) {
                            const lastRecord = allTruckRecordsSorted[0] || sortedGroupRecords[0];
                            displayedZonals = lastRecord?.zonals_detail?.map(z => z.zonal_name).filter(Boolean) || [];
                            displayedDate = lastRecord?.inspection_date;
                          }

                          const thermalDamages = sortedGroupRecords.filter(r => {
                            const st = getChecklistStatus(r.checklist?.separador_termico);
                            return st === 'AMARILLO' || st === 'ROJO';
                          });

                          return (
                            <div
                              key={group.plate}
                              className={`bg-white border rounded-2xl p-3.5 shadow-sm space-y-3 transition-all ${
                                group.rojoCount > 0
                                  ? 'border-rose-400 bg-rose-50/10 ring-1 ring-rose-200'
                                  : group.amarilloCount > 0
                                  ? 'border-amber-300 bg-amber-50/10'
                                  : 'border-slate-200'
                              }`}
                            >
                              {/* CABECERA PATENTE RESUMIDA (HACER CLIC PARA DESPLEGAR DETALLE) */}
                              <div
                                onClick={() => {
                                  const willExpand = !expandedInspectionPlates[group.plate];
                                  setExpandedInspectionPlates(prev => ({
                                    ...prev,
                                    [group.plate]: willExpand
                                  }));
                                  if (willExpand) {
                                    group.records.forEach(r => {
                                      fetchFullDispatchDetail(r.id);
                                    });
                                  }
                                }}
                                className="flex items-center justify-between flex-wrap gap-2 cursor-pointer select-none py-1 hover:opacity-90 transition-opacity"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-base font-black font-mono bg-slate-900 text-white px-3 py-1 rounded-xl tracking-wider shadow-2xs">
                                    {group.plate}
                                  </span>
                                  {Array.from(group.truckNumbers).map(tn => (
                                    <span key={tn} className="text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg font-mono">
                                      Camión #{tn}
                                    </span>
                                  ))}

                                  {/* ZONAL ORIGEN DEL DAÑO O ÚLTIMA ZONAL */}
                                  {isDamageOriginZonal ? (
                                    <span className="text-xs font-bold text-amber-950 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs" title={`Problema detectado al ingresar a andén el ${detectedProblemDate}. La rotura ocurrió en el viaje previo a ${displayedZonals.join(', ')} (${displayedDate})`}>
                                      <span className="text-amber-800 font-extrabold">📍 Zonal Origen Daño:</span>
                                      <span className="font-mono font-black text-amber-950">{displayedZonals.length > 0 ? displayedZonals.join(', ') : 'S/A'}</span>
                                      {displayedDate && <span className="text-[10px] text-amber-800 font-normal">({displayedDate})</span>}
                                    </span>
                                  ) : (
                                    <span className="text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-2xs" title="Última zonal visitada por este camión">
                                      <span className="text-slate-600 font-bold">📍 Última Zonal:</span>
                                      <span className="font-mono font-black text-slate-900">{displayedZonals.length > 0 ? displayedZonals.join(', ') : 'S/A'}</span>
                                      {displayedDate && <span className="text-[10px] text-slate-500 font-normal">({displayedDate})</span>}
                                    </span>
                                  )}

                                  {thermalDamages.length > 0 && (
                                    <span className="text-[10px] font-black uppercase text-amber-950 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-lg flex items-center gap-1" title="Esta unidad presenta daños o colchonetas rotas reportadas">
                                      <span>🛡️ Sep. Térmico Dañado ({thermalDamages.length})</span>
                                    </span>
                                  )}

                                  {hasCriticalFailures && (
                                    <span className="text-[10px] font-black uppercase text-rose-800 bg-rose-100 border border-rose-300 px-2.5 py-0.5 rounded-full animate-pulse flex items-center gap-1">
                                      <span>🚨 ALERTA TRANSPORTISTA</span>
                                    </span>
                                  )}
                                  <span className="text-[11px] text-slate-500 font-semibold hidden md:inline">
                                    ({group.records.length} despacho{group.records.length > 1 ? 's' : ''})
                                  </span>
                                </div>

                                {/* RESUMEN DE CONTEOS DE SEMÁFORO DE LA PATENTE, BOTÓN AVISO CORREO Y BOTÓN DESPLEGAR */}
                                <div className="flex items-center gap-2 font-mono flex-wrap">
                                  <span className="text-xs font-black text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                    🟢 {group.verdeCount}
                                  </span>
                                  <span className="text-xs font-black text-amber-900 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                    🟡 {group.amarilloCount}
                                  </span>
                                  <span className="text-xs font-black text-rose-900 bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                    🔴 {group.rojoCount}
                                  </span>

                                  {/* Botón Enviar Aviso por Correo */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openFailureAlertModalForPlate(group);
                                    }}
                                    className={`px-2.5 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer border transition-all ${
                                      group.rojoCount > 0
                                        ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-500 animate-pulse'
                                        : group.amarilloCount > 0
                                        ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-500'
                                        : 'bg-slate-700 hover:bg-slate-800 text-white border-slate-600'
                                    }`}
                                    title="Enviar aviso/correo al supervisor encargado de camiones, rampas y zonales"
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                    <span>Aviso Correo</span>
                                  </button>

                                  <span className="ml-1 text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs flex items-center gap-1 font-sans font-bold">
                                    {isExpanded ? (
                                      <>
                                        <span className="text-[10px] hidden sm:inline">Ocultar</span>
                                        <ChevronUp className="w-4 h-4 text-slate-600" />
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-[10px] hidden sm:inline">Ver Fotos & Calificaciones</span>
                                        <ChevronDown className="w-4 h-4 text-slate-600" />
                                      </>
                                    )}
                                  </span>
                                </div>
                              </div>

                              {/* DETALLE COMPLETO (SOLO VISIBLE AL HACER CLIC) */}
                              {isExpanded && (
                                <div className="space-y-3 pt-3 border-t border-slate-200/80 animate-fade-in">
                                  <div className="text-[11px] text-slate-500 font-semibold flex items-center gap-3 flex-wrap">
                                    <span>Despachos evaluados: <strong className="text-slate-800 font-mono">{group.records.length}</strong></span>
                                    <span>Supervisores evaluadores: <strong className="text-slate-700">{Array.from(group.supervisors).join(', ')}</strong></span>
                                  </div>

                                  {/* DESGLOSE DETALLADO DE LOS 5 PUNTOS DE INSPECCIÓN DE ESTA PATENTE */}
                                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
                                    {Object.keys(group.itemCounts).map(itemKey => {
                                      const counts = group.itemCounts[itemKey];
                                      return (
                                        <div
                                          key={itemKey}
                                          className={`p-2 rounded-xl border text-[10.5px] space-y-1 ${
                                            counts.rojo > 0
                                              ? 'bg-rose-50 border-rose-300 text-rose-950 font-bold'
                                              : counts.amarillo > 0
                                              ? 'bg-amber-50 border-amber-300 text-amber-950 font-bold'
                                              : 'bg-slate-50 border-slate-200 text-slate-700'
                                          }`}
                                        >
                                          <div className="font-extrabold truncate" title={itemLabels[itemKey]}>
                                            {itemLabels[itemKey]}
                                          </div>
                                          <div className="flex items-center justify-between font-mono font-black text-[10px]">
                                            <span className={counts.verde > 0 ? 'text-emerald-700' : 'text-slate-400'}>🟢 {counts.verde}</span>
                                            <span className={counts.amarillo > 0 ? 'text-amber-700 font-bold' : 'text-slate-400'}>🟡 {counts.amarillo}</span>
                                            <span className={counts.rojo > 0 ? 'text-rose-700 font-extrabold' : 'text-slate-400'}>🔴 {counts.rojo}</span>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* COMENTARIOS Y EVIDENCIAS DE FOTOS DE COLCHONETAS / LINGAS POR SUPERVISOR */}
                                  <div className="space-y-2 pt-2 border-t border-slate-100">
                                    {sortedGroupRecords.map(r => {
                                      const chk = r.checklist || {};
                                      const colchonetasComment = chk.colchonetas_comment;
                                      const lingasComment = chk.lingas_comment;
                                      const colchonetasPhotos: string[] = chk.colchonetas_photos || [];
                                      const lingasPhotos: string[] = chk.lingas_photos || [];
                                      const generalPhotos: string[] = chk.photos || [];

                                      const sepStatus = getChecklistStatus(chk.separador_termico);
                                      const lingasStatus = getChecklistStatus(chk.lingas_camion);
                                      const hasAnyFault = ['postura_anden', 'limpieza_estructura', 'luces_encendidas', 'separador_termico', 'lingas_camion'].some(k => {
                                        const st = getChecklistStatus(chk[k]);
                                        return st === 'AMARILLO' || st === 'ROJO';
                                      });

                                      const prevZonalInfo = getPreviousZonalForRecord(r, records);
                                      const thisZonals = r.zonals_detail?.map(z => z.zonal_name).filter(Boolean) || [];

                                      // RECOLECTAR TODAS LAS FOTOS (VERDES, AMARILLAS Y ROJAS)
                                      const inspectionPhotos: {
                                        url: string;
                                        category: string;
                                        status: 'VERDE' | 'AMARILLO' | 'ROJO' | 'GRIS';
                                        comment?: string;
                                      }[] = [];

                                      colchonetasPhotos.forEach((url) => {
                                        inspectionPhotos.push({
                                          url,
                                          category: 'Separador Térmico',
                                          status: sepStatus,
                                          comment: colchonetasComment
                                        });
                                      });

                                      lingasPhotos.forEach((url) => {
                                        inspectionPhotos.push({
                                          url,
                                          category: 'Lingas de Sujeción',
                                          status: lingasStatus,
                                          comment: lingasComment
                                        });
                                      });

                                      generalPhotos.forEach((url) => {
                                        inspectionPhotos.push({
                                          url,
                                          category: 'Inspección General',
                                          status: hasAnyFault ? 'AMARILLO' : 'VERDE'
                                        });
                                      });

                                      // Fotos de Zonales de este despacho
                                      (r.zonals_detail || []).forEach(z => {
                                        (z.photos || []).forEach(url => {
                                          inspectionPhotos.push({
                                            url,
                                            category: `Zonal ${z.zonal_name || 'Despacho'}`,
                                            status: 'VERDE',
                                            comment: z.sello ? `Sello: ${z.sello}` : undefined
                                          });
                                        });
                                      });

                                      const allPhotoUrls = inspectionPhotos.map(p => p.url);

                                      return (
                                        <div key={r.id} className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-2 shadow-2xs">
                                          <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 flex-wrap gap-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span>Fecha: <strong className="font-mono text-slate-700">{r.inspection_date}</strong> ({r.close_time || r.inspection_time || 'Sin hora'})</span>
                                              {thisZonals.length > 0 && (
                                                <span className="text-slate-800 bg-white border border-slate-200 px-2 py-0.5 rounded-lg font-mono">
                                                  📍 Zonal Despacho: <strong>{thisZonals.join(', ')}</strong>
                                                </span>
                                              )}
                                            </div>
                                            <span>Supervisor Evaluador: <strong className="text-slate-800">{r.supervisor_name}</strong></span>
                                          </div>

                                          {/* Calificación rápida de los 5 puntos en este despacho */}
                                          <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono py-1 border-y border-slate-200/50">
                                            {[
                                              { k: 'postura_anden', l: 'Andén' },
                                              { k: 'limpieza_estructura', l: 'Limpieza/Estructura' },
                                              { k: 'luces_encendidas', l: 'Luces' },
                                              { k: 'separador_termico', l: 'Sep. Térmico' },
                                              { k: 'lingas_camion', l: 'Lingas' }
                                            ].map(chkItem => {
                                              const st = getChecklistStatus(chk[chkItem.k]);
                                              return (
                                                <span
                                                  key={chkItem.k}
                                                  className={`px-1.5 py-0.5 rounded font-bold border ${
                                                    st === 'VERDE' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                                    st === 'AMARILLO' ? 'bg-amber-100 text-amber-900 border-amber-300 font-extrabold' :
                                                    st === 'ROJO' ? 'bg-rose-100 text-rose-800 border-rose-300 font-black animate-pulse' :
                                                    'bg-slate-100 text-slate-500 border-slate-200'
                                                  }`}
                                                >
                                                  {st === 'VERDE' ? '🟢' : st === 'AMARILLO' ? '🟡' : st === 'ROJO' ? '🔴' : '⚪'} {chkItem.l}
                                                </span>
                                              );
                                            })}
                                          </div>

                                          {/* BLOQUE DE TRAZABILIDAD CRUCIAL: SEPARADOR TÉRMICO / COLCHONETAS DAÑADAS */}
                                          {(sepStatus === 'AMARILLO' || sepStatus === 'ROJO') && (
                                            <div className="bg-amber-50/80 border border-amber-300 p-2.5 rounded-xl text-xs space-y-1.5">
                                              <div className="flex items-center justify-between font-black text-amber-950 flex-wrap gap-1">
                                                <span className="flex items-center gap-1.5 text-xs">
                                                  <span>🛡️</span>
                                                  <span>Trazabilidad de Daño en Separador Térmico / Colchonetas:</span>
                                                </span>
                                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-black ${
                                                  sepStatus === 'ROJO' ? 'bg-rose-600 text-white' : 'bg-amber-400 text-amber-950'
                                                }`}>
                                                  {sepStatus === 'ROJO' ? '🔴 CRÍTICO / ROTO' : '🟡 OBSERVADO'}
                                                </span>
                                              </div>

                                              <div className="bg-white p-2 rounded-lg border border-amber-200 text-[11px] space-y-1">
                                                <p className="text-slate-800">
                                                  📍 <strong>Zonal previa donde se manipuló/descargó el separador:</strong>{' '}
                                                  {prevZonalInfo.previousZonals.length > 0 ? (
                                                    <span className="font-black font-mono text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                                                      {prevZonalInfo.previousZonals.join(', ')} ({prevZonalInfo.previousDate})
                                                    </span>
                                                  ) : (
                                                    <span className="italic text-slate-500">
                                                      Primer despacho registrado en el sistema — Zonal actual: {thisZonals.join(', ') || 'S/A'}
                                                    </span>
                                                  )}
                                                </p>
                                                {colchonetasComment && (
                                                  <p className="text-slate-900 font-medium">
                                                    <strong>Detalle del daño reportado:</strong> {colchonetasComment}
                                                  </p>
                                                )}
                                                <p className="text-[10px] text-slate-500 italic">
                                                  * CIAL efectúa la carga en planta y la descarga en la zonal de destino (personal CIAL responsable de la manipulación de colchonetas).
                                                </p>
                                              </div>
                                            </div>
                                          )}

                                          {/* COMENTARIOS ADICIONALES */}
                                          {colchonetasComment && (sepStatus === 'VERDE' || sepStatus === 'GRIS') && (
                                            <p className="text-[11px] text-emerald-900 bg-emerald-50 p-2 rounded-xl border border-emerald-200 font-medium">
                                              <strong>Obs. Separador Térmico:</strong> {colchonetasComment}
                                            </p>
                                          )}

                                          {lingasComment && (
                                            <p className={`text-[11px] p-2 rounded-xl border font-medium ${
                                              lingasStatus === 'ROJO' ? 'text-rose-900 bg-rose-50 border-rose-200' :
                                              lingasStatus === 'AMARILLO' ? 'text-amber-900 bg-amber-50 border-amber-200' :
                                              'text-slate-800 bg-white border-slate-200'
                                            }`}>
                                              <strong>Obs. Lingas de Sujeción:</strong> {lingasComment}
                                            </p>
                                          )}

                                          {r.observations && (
                                            <p className="text-[11px] text-slate-700 bg-white p-2 rounded-xl border border-slate-200 font-medium">
                                              <strong>Observaciones Generales:</strong> {r.observations}
                                            </p>
                                          )}

                                          {/* GALERÍA DE FOTOS Y CALIFICACIONES (VERDES, AMARILLAS Y ROJAS) */}
                                          {inspectionPhotos.length > 0 ? (
                                            <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                                              <div className="flex items-center justify-between flex-wrap gap-1">
                                                <span className="text-[10.5px] font-black uppercase text-slate-700 flex items-center gap-1.5">
                                                  📷 Fotos Registradas ({inspectionPhotos.length} foto{inspectionPhotos.length > 1 ? 's' : ''}):
                                                </span>
                                                <span className="text-[9.5px] text-slate-400 font-semibold">
                                                  Haz clic en una foto para ampliarla
                                                </span>
                                              </div>

                                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
                                                {inspectionPhotos.map((item, pIdx) => {
                                                  const borderClass =
                                                    item.status === 'ROJO' ? 'border-2 border-rose-500 shadow-sm shadow-rose-200 ring-1 ring-rose-300' :
                                                    item.status === 'AMARILLO' ? 'border-2 border-amber-400 shadow-sm shadow-amber-200 ring-1 ring-amber-300' :
                                                    item.status === 'VERDE' ? 'border-2 border-emerald-400 shadow-sm shadow-emerald-100' :
                                                    'border-2 border-slate-300';

                                                  const badgeClass =
                                                    item.status === 'ROJO' ? 'bg-rose-600 text-white' :
                                                    item.status === 'AMARILLO' ? 'bg-amber-400 text-amber-950 font-black' :
                                                    item.status === 'VERDE' ? 'bg-emerald-600 text-white' :
                                                    'bg-slate-700 text-white';

                                                  const icon =
                                                    item.status === 'ROJO' ? '🔴' :
                                                    item.status === 'AMARILLO' ? '🟡' :
                                                    item.status === 'VERDE' ? '🟢' : '⚪';

                                                  return (
                                                    <div
                                                      key={pIdx}
                                                      className={`relative rounded-xl overflow-hidden bg-white cursor-pointer hover:scale-[1.03] transition-all group ${borderClass}`}
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        openPhotoGallery(allPhotoUrls, pIdx);
                                                      }}
                                                      title={`Ver foto de ${item.category} (${item.status})`}
                                                    >
                                                      <div className="aspect-square w-full relative bg-slate-100">
                                                        <img
                                                          src={item.url}
                                                          alt={`${item.category} ${pIdx + 1}`}
                                                          className="w-full h-full object-cover"
                                                          loading="lazy"
                                                        />
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                                                            🔍 Ver
                                                          </span>
                                                        </div>
                                                      </div>
                                                      <div className={`px-1.5 py-1 text-[9px] font-bold flex items-center justify-between gap-1 select-none truncate ${badgeClass}`}>
                                                        <span className="truncate">{item.category}</span>
                                                        <span className="shrink-0">{icon}</span>
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          ) : hasAnyFault ? (
                                            <div className="text-[10px] text-amber-700 italic bg-amber-50/50 p-2 rounded-xl border border-amber-200">
                                              ⚠️ Despacho presenta observaciones (🟡 / 🔴) pero no se adjuntaron fotos de respaldo.
                                            </div>
                                          ) : (
                                            <div className="text-[10px] text-emerald-700 font-semibold bg-emerald-50/50 p-2 rounded-xl border border-emerald-200 flex items-center justify-between">
                                              <span>✅ Inspección 100% Conforme. Sin fotos adjuntas.</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {activeTab === 'zonales' && (() => {
          setActiveTab('historial');
          setHistorySubTab('saldos');
          fetchReturns();
          return null;
        })()}

      </main>

      {/* ASISTENTE MODAL: CALCULADORA DE BANDEJAS */}
      {showBandejasHelper !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-black text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4.5 h-4.5" />
                Asistente de Bandejas - {selectedZonals[showBandejasHelper]?.zonal_name}
              </h3>
              <button
                type="button"
                onClick={() => setShowBandejasHelper(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-500 font-semibold">
              Ingresa la cantidad de pallets según la cantidad de bandejas por pallet (45, 40, 35, 30, 25, 20) y agrega las bandejas sueltas o restantes.
            </p>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {/* Pallets 45 (Excepcional 9 niveles) */}
              <div className="flex items-center justify-between bg-amber-50/50 p-2.5 rounded-xl border border-amber-200/80">
                <span className="text-xs font-black text-amber-900">Pallets de 45 bandejas (1x45 — 9 niv. Excepcional)</span>
                <div className="flex items-center gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => setHelper45(Math.max(0, helper45 - 1))}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shadow-sm cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-sm w-6 text-center text-amber-950">{helper45}</span>
                  <button
                    type="button"
                    onClick={() => setHelper45(helper45 + 1)}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shadow-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Pallets 40 */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Pallets de 40 bandejas (1x40)</span>
                <div className="flex items-center gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => setHelper40(Math.max(0, helper40 - 1))}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shadow-sm cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-sm w-6 text-center">{helper40}</span>
                  <button
                    type="button"
                    onClick={() => setHelper40(helper40 + 1)}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shadow-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Pallets 35 */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Pallets de 35 bandejas (1x35)</span>
                <div className="flex items-center gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => setHelper35(Math.max(0, helper35 - 1))}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-sm w-6 text-center">{helper35}</span>
                  <button
                    type="button"
                    onClick={() => setHelper35(helper35 + 1)}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Pallets 30 */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Pallets de 30 bandejas (1x30)</span>
                <div className="flex items-center gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => setHelper30(Math.max(0, helper30 - 1))}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-sm w-6 text-center">{helper30}</span>
                  <button
                    type="button"
                    onClick={() => setHelper30(helper30 + 1)}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Pallets 25 */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Pallets de 25 bandejas (1x25)</span>
                <div className="flex items-center gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => setHelper25(Math.max(0, helper25 - 1))}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-sm w-6 text-center">{helper25}</span>
                  <button
                    type="button"
                    onClick={() => setHelper25(helper25 + 1)}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Pallets 20 */}
              <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700">Pallets de 20 bandejas (1x20)</span>
                <div className="flex items-center gap-2 select-none">
                  <button
                    type="button"
                    onClick={() => setHelper20(Math.max(0, helper20 - 1))}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                  >
                    -
                  </button>
                  <span className="font-mono font-black text-sm w-6 text-center">{helper20}</span>
                  <button
                    type="button"
                    onClick={() => setHelper20(helper20 + 1)}
                    className="bg-white border hover:bg-slate-100 text-slate-700 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Bandejas Restantes / Sueltas */}
              <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-amber-900 uppercase">Restante / Bandejas Sueltas:</span>
                  <input
                    type="number"
                    min={0}
                    value={helperRestante || ''}
                    onChange={(e) => setHelperRestante(Math.max(0, parseInt(e.target.value) || 0))}
                    placeholder="0"
                    className="w-20 bg-white border border-amber-300 rounded-lg px-2 py-1 text-sm font-mono font-black text-right focus:outline-none focus:border-amber-500 shadow-sm"
                  />
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-0.5 select-none">
                  <button
                    type="button"
                    onClick={() => setHelperRestante(prev => prev + 1)}
                    className="bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 px-2 py-0.5 rounded text-xs font-bold cursor-pointer"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelperRestante(prev => prev + 5)}
                    className="bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 px-2 py-0.5 rounded text-xs font-bold cursor-pointer"
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelperRestante(0)}
                    className="bg-white border border-amber-200 text-amber-900 hover:bg-amber-100 px-2 py-0.5 rounded text-xs font-bold cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* FÓRMULA DINÁMICA EN TIEMPO REAL */}
            {(() => {
              const parts = [];
              if (helper45 > 0) parts.push(`45x${helper45}`);
              if (helper40 > 0) parts.push(`40x${helper40}`);
              if (helper35 > 0) parts.push(`35x${helper35}`);
              if (helper30 > 0) parts.push(`30x${helper30}`);
              if (helper25 > 0) parts.push(`25x${helper25}`);
              if (helper20 > 0) parts.push(`20x${helper20}`);
              if (helperRestante > 0) parts.push(`restante ${helperRestante}`);
              const formulaText = parts.length > 0 ? parts.join(' + ') : 'Sin bandejas';
              const totalB = (helper45 * 45) + (helper40 * 40) + (helper35 * 35) + (helper30 * 30) + (helper25 * 25) + (helper20 * 20) + helperRestante;

              return (
                <div className="bg-brand-light p-3.5 rounded-xl border border-brand-border space-y-1">
                  <div className="flex justify-between items-center text-brand-primary">
                    <span className="text-xs font-black uppercase">Fórmula:</span>
                    <span className="text-xs font-mono font-bold text-slate-600 bg-white/80 px-2 py-0.5 rounded border">
                      {formulaText}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-brand-primary pt-1 border-t border-brand-border/40">
                    <span className="text-xs font-black uppercase">Suma Total Calculada:</span>
                    <span className="text-xl font-mono font-black">{totalB} bandejas</span>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBandejasHelper(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={applyBandejasHelper}
                className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white py-3 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
              >
                APLICAR CÁLCULO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASISTENTE MODAL: REGISTRAR RETORNO DE PALLETS TÁCTIL */}
      {showReturnModal !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <form onSubmit={handleReturnSubmit} className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-black text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
                <RotateCcw className="w-4.5 h-4.5" />
                Retorno de Pallets - {showReturnModal}
              </h3>
              <button
                type="button"
                onClick={() => setShowReturnModal(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-500 font-semibold">
              Indica cuántos pallets de Madera y Plástico ingresan de vuelta al CD y el nombre del supervisor receptor.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Supervisor Receptor (Autenticado)</label>
                <input 
                  type="text" 
                  value={returnSupervisor} 
                  disabled
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-500 cursor-not-allowed select-none"
                />
              </div>

              {/* Contadores */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Madera */}
                <div className="bg-amber-50/20 border border-amber-100 p-3 rounded-xl text-center space-y-2">
                  <span className="text-[10px] font-black text-amber-800 block uppercase">Madera Retornados</span>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReturnWood(Math.max(0, returnWood - 1))}
                      className="bg-white border text-slate-600 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-mono font-black text-lg w-8 text-center">{returnWood}</span>
                    <button
                      type="button"
                      onClick={() => setReturnWood(returnWood + 1)}
                      className="bg-white border text-slate-600 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReturnWood(returnWood + 5)}
                      className="bg-white border hover:bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 cursor-pointer"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnWood(0)}
                      className="bg-white border hover:bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Plastico */}
                <div className="bg-emerald-50/20 border border-emerald-100 p-3 rounded-xl text-center space-y-2">
                  <span className="text-[10px] font-black text-emerald-800 block uppercase">Plástico Retornados</span>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReturnPlastic(Math.max(0, returnPlastic - 1))}
                      className="bg-white border text-slate-600 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm cursor-pointer"
                    >
                      -
                    </button>
                    <span className="font-mono font-black text-lg w-8 text-center">{returnPlastic}</span>
                    <button
                      type="button"
                      onClick={() => setReturnPlastic(returnPlastic + 1)}
                      className="bg-white border text-slate-600 w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-sm cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex justify-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setReturnPlastic(returnPlastic + 5)}
                      className="bg-white border hover:bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 cursor-pointer"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnPlastic(0)}
                      className="bg-white border hover:bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold text-slate-500 cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

              </div>

            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReturnModal(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white py-3 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>CONFIRMAR INGRESO</>}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ASISTENTE MODAL: MI PERFIL / CAMBIO DE CONTRASEÑA */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-black text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-4.5 h-4.5" />
                Mi Perfil de Supervisor
              </h3>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Información del usuario */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400 font-bold uppercase">Nombre:</span>
                <span className="text-slate-800 font-black">{supervisorName}</span>
              </div>
              <div className="flex justify-between items-center text-xs pt-1">
                <span className="text-slate-400 font-bold uppercase">Cuenta Correo:</span>
                <span className="text-slate-600 font-mono font-bold">{user?.email}</span>
              </div>
            </div>

            {/* Formulario de Cambio de Clave */}
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                setPasswordError(null);
                setPasswordSuccess(null);
                if (newPassword.length < 8) {
                  setPasswordError("La contraseña debe tener al menos 8 caracteres.");
                  return;
                }
                if (newPassword !== confirmNewPassword) {
                  setPasswordError("Las contraseñas no coinciden.");
                  return;
                }
                setPasswordLoading(true);
                try {
                  const { error } = await supabase.auth.updateUser({ password: newPassword });
                  if (error) throw error;
                  setPasswordSuccess("¡Contraseña actualizada con éxito!");
                  setNewPassword('');
                  setConfirmNewPassword('');
                } catch (err: any) {
                  setPasswordError(err.message || "Error al actualizar la contraseña.");
                } finally {
                  setPasswordLoading(false);
                }
              }}
              className="space-y-3.5 border-t pt-4"
            >
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">Cambiar Contraseña Internamente</h4>
              
              {passwordSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  {passwordSuccess}
                </div>
              )}

              {passwordError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  {passwordError}
                </div>
              )}

              <div className="space-y-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Nueva Contraseña</label>
                  <input
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={passwordLoading}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-brand-primary focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Confirmar Nueva Contraseña</label>
                  <input
                    type="password"
                    placeholder="Repite la nueva contraseña"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    disabled={passwordLoading}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:outline-none focus:border-brand-primary focus:bg-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-xl text-xs font-black transition-all cursor-pointer"
                >
                  CERRAR
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="flex-1 bg-brand-emerald hover:bg-emerald-600 text-white py-3 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  {passwordLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>ACTUALIZAR CLAVE</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE EDICIÓN COMPLETA DE DESPACHO (SOLO ADMIN/SUPERIOR) */}
      {editingDispatchRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-3xl w-full shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 select-none">
              <div className="flex items-center gap-2">
                <div className="bg-amber-100 p-2 rounded-xl text-amber-800 font-bold">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
                    Editar Despacho #{editingDispatchRecord.truck_number !== 'N/A' ? editingDispatchRecord.truck_number : editingDispatchRecord.id.slice(0, 6)}
                  </h3>
                  <p className="text-xs text-amber-700 font-bold">
                    {isAdmin ? 'Modo Administrador — Edición Directa' : isShiftLeader ? 'Jefe de Turno — Edición de Despacho' : 'Edición de Mi Despacho'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDispatchRecord(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveEditDispatch} className="space-y-5">
              
              {/* DATOS BÁSICOS */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider border-b pb-1">
                  1. Fecha, Hora y Supervisor
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Fecha de Inspección</label>
                    <input 
                      type="date" 
                      value={editingDate}
                      onChange={(e) => setEditingDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Hora de Inspección</label>
                    <input 
                      type="text" 
                      value={editingTime}
                      onChange={(e) => setEditingTime(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                      placeholder="HH:MM:SS"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Hora Cierre Camión</label>
                    <input 
                      type="time" 
                      value={editingCloseTime}
                      onChange={(e) => setEditingCloseTime(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Supervisor</label>
                    <input 
                      type="text" 
                      value={editingSupervisorName}
                      onChange={(e) => setEditingSupervisorName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">N° Camión</label>
                    <input 
                      type="text" 
                      value={editingTruckNumber}
                      onChange={(e) => setEditingTruckNumber(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Patente</label>
                    <input 
                      type="text" 
                      value={editingTruckPlate}
                      onChange={(e) => setEditingTruckPlate(e.target.value.toUpperCase())}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">N° de Andén</label>
                    <input 
                      type="text" 
                      value={editingTruckAnden}
                      onChange={(e) => setEditingTruckAnden(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                      placeholder="Ej. Andén 4"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Kilos Totales (kg)</label>
                    <input 
                      type="text" 
                      value={editingTruckKilos}
                      onChange={(e) => setEditingTruckKilos(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                      placeholder="Ej. 21.116"
                    />
                  </div>
                </div>
              </div>

              {/* TEMPERATURAS Y POSICIONES */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider border-b pb-1">
                  2. Posiciones & Termos (°C)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Posiciones Ocupadas</label>
                    <input 
                      type="number" 
                      value={editingPositions}
                      onChange={(e) => setEditingPositions(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                      min={0}
                      max={40}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Temp. 1er Termo</label>
                    <input 
                      type="number" 
                      value={editingTemp1er}
                      onChange={(e) => handleSetEditingTemp1er(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Temp. 2do Termo</label>
                    <input 
                      type="number" 
                      value={editingTemp2do}
                      onChange={(e) => handleSetEditingTemp2do(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Temp. 3er Termo</label>
                    <input 
                      type="number" 
                      value={editingTemp3er}
                      onChange={(e) => handleSetEditingTemp3er(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* DETALLE DE ZONALES */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-4">
                <div className="flex justify-between items-center border-b pb-1">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    3. Detalle de Zonales Cargados ({editingZonalsDetail.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddEditingZonal}
                    className="bg-brand-primary hover:bg-brand-secondary text-white text-[10px] font-black px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    + Agregar Zonal
                  </button>
                </div>

                <div className="space-y-4">
                  {editingZonalsDetail.map((zonal, zIndex) => {
                    const woodTotal = (zonal.congelados.wood_bases || 0) + (zonal.congelados.wood_extra || 0) +
                                     (zonal.estandar.wood_bases || 0) + (zonal.estandar.wood_extra || 0) +
                                     (zonal.bandejas.wood_bases || 0) + (zonal.bandejas.wood_extra || 0);
                    const plasticTotal = (zonal.congelados.plastic_bases || 0) + (zonal.congelados.plastic_extra || 0) +
                                        (zonal.estandar.plastic_bases || 0) + (zonal.estandar.plastic_extra || 0) +
                                        (zonal.bandejas.plastic_bases || 0) + (zonal.bandejas.plastic_extra || 0);

                    return (
                      <div key={zIndex} className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3 shadow-sm">
                        <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg">
                          <div className="flex items-center gap-2 flex-1 flex-wrap">
                            <span className="font-black text-xs text-brand-primary">#{zIndex + 1}</span>
                            <select
                              value={zonal.zonal_name}
                              onChange={(e) => handleUpdateEditingZonal(zIndex, 'zonal_name', e.target.value)}
                              className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                            >
                              {ZONALES_LIST.map(zn => (
                                <option key={zn} value={zn}>{zn}</option>
                              ))}
                            </select>

                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-500">Viaje:</span>
                              <input 
                                type="number" 
                                min={1}
                                max={10}
                                value={zonal.viaje_numero || 1}
                                onChange={(e) => handleUpdateEditingZonal(zIndex, 'viaje_numero', Number(e.target.value))}
                                className="w-12 bg-white border border-slate-300 rounded px-1 py-0.5 text-xs font-bold text-center"
                              />
                            </div>

                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-500">Lugar:</span>
                              <select
                                value={zonal.lugar_camion}
                                onChange={(e) => handleUpdateEditingZonal(zIndex, 'lugar_camion', e.target.value)}
                                className="bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold"
                              >
                                <option value="1° (FONDO)">1° (FONDO)</option>
                                <option value="2°">2°</option>
                                <option value="3°">3°</option>
                                <option value="4° (PUERTA)">4° (PUERTA)</option>
                              </select>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveEditingZonal(zIndex)}
                            className="text-rose-600 hover:text-rose-800 p-1 rounded font-bold cursor-pointer"
                            title="Quitar este zonal"
                          >
                            &times;
                          </button>
                        </div>

                        {/* Cantidades del zonal */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          {/* BANDEJAS Y CANTIDAD DE BANDEJAS */}
                          <div className="bg-slate-50 p-2 rounded-lg border space-y-1">
                            <span className="font-bold text-[10px] text-slate-600 uppercase block border-b pb-0.5">Bandejas</span>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-500">Cant. Bandejas:</span>
                              <input 
                                type="number" 
                                value={zonal.bandejas.bandejas_count || 0}
                                onChange={(e) => handleUpdateEditingZonalCategory(zIndex, 'bandejas', 'bandejas_count', Number(e.target.value))}
                                className="w-16 bg-white border rounded px-1.5 py-0.5 text-xs font-mono font-bold text-right"
                              />
                            </div>
                          </div>

                          {/* PALLETS MADERA TOTALES */}
                          <div className="bg-amber-50/50 p-2 rounded-lg border border-amber-100 space-y-1">
                            <span className="font-bold text-[10px] text-amber-800 uppercase block border-b border-amber-200 pb-0.5">Madera (Total: {woodTotal})</span>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-500">Congelados Base:</span>
                              <input 
                                type="number" 
                                value={zonal.congelados.wood_bases || 0}
                                onChange={(e) => handleUpdateEditingZonalCategory(zIndex, 'congelados', 'wood_bases', Number(e.target.value))}
                                className="w-12 bg-white border rounded px-1 py-0.5 text-xs font-mono font-bold text-right"
                              />
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-500">Estándar Base:</span>
                              <input 
                                type="number" 
                                value={zonal.estandar.wood_bases || 0}
                                onChange={(e) => handleUpdateEditingZonalCategory(zIndex, 'estandar', 'wood_bases', Number(e.target.value))}
                                className="w-12 bg-white border rounded px-1 py-0.5 text-xs font-mono font-bold text-right"
                              />
                            </div>
                          </div>

                          {/* PALLETS PLÁSTICO TOTALES */}
                          <div className="bg-emerald-50/50 p-2 rounded-lg border border-emerald-100 space-y-1">
                            <span className="font-bold text-[10px] text-emerald-800 uppercase block border-b border-emerald-200 pb-0.5">Plástico (Total: {plasticTotal})</span>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-500">Congelados Base:</span>
                              <input 
                                type="number" 
                                value={zonal.congelados.plastic_bases || 0}
                                onChange={(e) => handleUpdateEditingZonalCategory(zIndex, 'congelados', 'plastic_bases', Number(e.target.value))}
                                className="w-12 bg-white border rounded px-1 py-0.5 text-xs font-mono font-bold text-right"
                              />
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] text-slate-500">Estándar Base:</span>
                              <input 
                                type="number" 
                                value={zonal.estandar.plastic_bases || 0}
                                onChange={(e) => handleUpdateEditingZonalCategory(zIndex, 'estandar', 'plastic_bases', Number(e.target.value))}
                                className="w-12 bg-white border rounded px-1 py-0.5 text-xs font-mono font-bold text-right"
                              />
                            </div>
                          </div>
                        </div>

                        {/* SELLO */}
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">N° Sello:</span>
                          <input 
                            type="text" 
                            value={zonal.sello || ''}
                            onChange={(e) => handleUpdateEditingZonal(zIndex, 'sello', e.target.value)}
                            className="bg-slate-50 border border-slate-300 rounded px-2 py-1 text-xs font-bold font-mono"
                            placeholder="Ej. 017315"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* OBSERVACIONES */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Observaciones</label>
                <textarea 
                  rows={2}
                  value={editingObservations}
                  onChange={(e) => setEditingObservations(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold"
                />
              </div>

              {/* BOTONES ACCIÓN */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setEditingDispatchRecord(null)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  disabled={editingSaveLoading}
                  className="bg-brand-emerald hover:bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-xs font-black transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {editingSaveLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      GUARDAR CORRECCIÓN
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* MODAL DE GALERÍA DE FOTOS EN TAMAÑO COMPLETO CON NAVEGACIÓN */}
      {galleryPhotos.length > 0 && (
        <div 
          className="fixed inset-0 z-[999999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in select-none"
          onClick={closePhotoGallery}
        >
          <div className="relative max-w-5xl w-full max-h-[92vh] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            
            {/* CONTENEDOR DE LA IMAGEN CON FLECHAS */}
            <div className="relative flex items-center justify-center w-full max-h-[82vh]">
              <img 
                src={galleryPhotos[activePhotoIndex]} 
                alt={`Foto ${activePhotoIndex + 1}`} 
                className="max-w-full max-h-[82vh] object-contain rounded-2xl shadow-2xl border border-white/20 transition-all duration-200"
              />

              {/* BOTÓN ANTERIOR (FLECHA IZQUIERDA) */}
              {galleryPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={handlePrevPhoto}
                  className="absolute left-2 sm:-left-6 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full shadow-2xl cursor-pointer border border-white/30 backdrop-blur-sm transition-all active:scale-95 z-10"
                  title="Foto anterior (Flecha Izquierda ⬅️)"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}

              {/* BOTÓN SIGUIENTE (FLECHA DERECHA) */}
              {galleryPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={handleNextPhoto}
                  className="absolute right-2 sm:-right-6 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full shadow-2xl cursor-pointer border border-white/30 backdrop-blur-sm transition-all active:scale-95 z-10"
                  title="Siguiente foto (Flecha Derecha ➡️)"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}
            </div>

            {/* BARRA INFERIOR CON CONTADOR Y CONSEJO */}
            <div className="mt-3 flex items-center gap-3 bg-black/60 border border-white/20 px-4 py-1.5 rounded-full text-white text-xs font-bold shadow-lg backdrop-blur-sm">
              <span>📷 Foto {activePhotoIndex + 1} de {galleryPhotos.length}</span>
              {galleryPhotos.length > 1 && (
                <span className="text-[10px] text-slate-300 font-normal border-l border-white/20 pl-3 hidden sm:inline">
                  Usa las flechas ⬅️ ➡️ del teclado para navegar
                </span>
              )}
            </div>

            {/* BOTÓN CERRAR */}
            <button
              type="button"
              onClick={closePhotoGallery}
              className="absolute -top-4 -right-2 sm:-right-4 bg-rose-600 hover:bg-rose-700 text-white p-2.5 rounded-full shadow-2xl cursor-pointer transition-all active:scale-95 border-2 border-white z-20"
              title="Cerrar (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODAL: CANVAS DE FIRMA DE PERFIL                     */}
      {/* ══════════════════════════════════════════════════════ */}
      {showSignaturePad && (
        <div className="fixed inset-0 z-[99990] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-violet-500" />
                  Mi Firma Digital
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Dibuja tu firma con el dedo o mouse</p>
              </div>
              <button type="button" onClick={() => setShowSignaturePad(false)} className="p-2 hover:bg-slate-100 rounded-xl cursor-pointer"><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            {/* Indicador de Cargo */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500 uppercase text-[10px]">Cargo registrado:</span>
              <span className="font-black text-violet-700">{userTitle || (isAdmin ? 'Administrador' : isShiftLeader ? 'Jefe de Turno' : 'Supervisor')}</span>
            </div>

            {/* Canvas */}
            <div className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 overflow-hidden" style={{ touchAction: 'none' }}>
              <canvas
                ref={signatureCanvasRef}
                width={400}
                height={160}
                className="w-full cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>

            {userSignature && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1.5">Firma actual guardada:</p>
                <img src={userSignature} alt="Firma actual" className="h-10 object-contain" />
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearCanvas}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-black cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Limpiar
              </button>
              <button
                type="button"
                onClick={saveSignatureToProfile}
                disabled={savingSignature}
                className="flex-2 flex-grow bg-violet-500 hover:bg-violet-600 text-white py-2.5 rounded-xl text-xs font-black cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {savingSignature ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {savingSignature ? 'Guardando...' : 'GUARDAR FIRMA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODAL: VISTA PREVIA + FIRMA DE DESPACHO              */}
      {/* ══════════════════════════════════════════════════════ */}
      {signPreviewRecord && (
        <div className="fixed inset-0 z-[99991] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-3xl shrink-0 z-10">
              <div>
                <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-violet-500" />
                  Vista Previa del Despacho
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Revisa el documento antes de firmar</p>
              </div>
              <button type="button" onClick={() => setSignPreviewRecord(null)} className="p-2 hover:bg-slate-100 rounded-xl cursor-pointer"><X className="w-5 h-5 text-slate-500" /></button>
            </div>

            {/* Contenido del documento */}
            <div className="p-6 space-y-4 flex-1">
              {/* Encabezado del despacho */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div><span className="font-black text-slate-400 uppercase text-[10px]">Fecha</span><p className="font-bold text-slate-800">{signPreviewRecord.inspection_date}</p></div>
                  <div><span className="font-black text-slate-400 uppercase text-[10px]">Hora Inicio</span><p className="font-bold text-slate-800">{signPreviewRecord.inspection_time}</p></div>
                  <div><span className="font-black text-slate-400 uppercase text-[10px]">Camión</span><p className="font-bold text-slate-800">{signPreviewRecord.truck_number} · {signPreviewRecord.truck_plate}</p></div>
                  <div><span className="font-black text-slate-400 uppercase text-[10px]">Supervisor</span><p className="font-bold text-slate-800">{signPreviewRecord.supervisor_name}</p></div>
                  {signPreviewRecord.truck_kilos && <div><span className="font-black text-slate-400 uppercase text-[10px]">Kilos</span><p className="font-bold text-slate-800">{signPreviewRecord.truck_kilos} kg</p></div>}
                  {signPreviewRecord.close_time && <div><span className="font-black text-slate-400 uppercase text-[10px]">Hora Cierre</span><p className="font-bold text-slate-800">{signPreviewRecord.close_time}</p></div>}
                </div>
              </div>

              {/* Zonales */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Zonales despachados</p>
                  {(() => {
                    const gWood = signPreviewRecord.zonals_detail.reduce((sum, z) => 
                      sum + (z.congelados?.wood_bases || 0) + (z.congelados?.wood_extra || 0) +
                      (z.estandar?.wood_bases || 0) + (z.estandar?.wood_extra || 0) +
                      (z.bandejas?.wood_bases || 0) + (z.bandejas?.wood_extra || 0), 0);
                    const gPlastic = signPreviewRecord.zonals_detail.reduce((sum, z) => 
                      sum + (z.congelados?.plastic_bases || 0) + (z.congelados?.plastic_extra || 0) +
                      (z.estandar?.plastic_bases || 0) + (z.estandar?.plastic_extra || 0) +
                      (z.bandejas?.plastic_bases || 0) + (z.bandejas?.plastic_extra || 0), 0);
                    const gBandejas = signPreviewRecord.zonals_detail.reduce((sum, z) => 
                      sum + (z.bandejas?.bandejas_count || 0), 0);
                    return (
                      <span className="text-[11px] font-mono font-black text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-lg">
                        Totales: 🪵 Madera: {gWood} | ♻️ Plástico: {gPlastic} | 📦 Bandejas: {gBandejas}
                      </span>
                    );
                  })()}
                </div>
                {signPreviewRecord.zonals_detail.map((z, i) => {
                  const woodTotal = (z.congelados?.wood_bases || 0) + (z.congelados?.wood_extra || 0) + 
                                    (z.estandar?.wood_bases || 0) + (z.estandar?.wood_extra || 0) +
                                    (z.bandejas?.wood_bases || 0) + (z.bandejas?.wood_extra || 0);
                  const plasticTotal = (z.congelados?.plastic_bases || 0) + (z.congelados?.plastic_extra || 0) + 
                                       (z.estandar?.plastic_bases || 0) + (z.estandar?.plastic_extra || 0) +
                                       (z.bandejas?.plastic_bases || 0) + (z.bandejas?.plastic_extra || 0);
                  const bandejaTotal = (z.bandejas?.bandejas_count || 0);
                  return (
                    <div key={i} className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-2 text-xs">
                      <span className="font-black text-slate-800">{z.zonal_name}</span>
                      <div className="flex gap-3 text-slate-500 font-mono font-bold">
                        {woodTotal > 0 && <span>🪵 {woodTotal} Madera</span>}
                        {plasticTotal > 0 && <span>♻️ {plasticTotal} Plástico</span>}
                        {bandejaTotal > 0 && <span>📦 {bandejaTotal} Bandejas</span>}
                        {z.sello && <span className="font-sans text-slate-700">🔒 Sello: {z.sello}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Separador */}
              <div className="border-t-2 border-dashed border-slate-200 pt-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">Firma de aprobación</p>

                {!userSignature ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                    <PenTool className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm font-black text-amber-800">No tienes firma configurada</p>
                    <p className="text-xs text-amber-600 mt-1">Ve al botón <strong>"Mi Firma"</strong> en el encabezado para dibujarla.</p>
                    <button
                      type="button"
                      onClick={() => { setSignPreviewRecord(null); setShowSignaturePad(true); }}
                      className="mt-3 px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-black cursor-pointer hover:bg-amber-600"
                    >
                      Configurar firma ahora
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-5">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                      <div>
                        <img src={userSignature} alt="Mi firma" className="h-16 object-contain mb-2" />
                        <p className="text-sm font-black text-slate-800">{userDisplayName || supervisorName}</p>
                        <p className="text-xs text-slate-500"><strong className="text-violet-700 font-extrabold">{userTitle || (isAdmin ? 'Administrador' : isShiftLeader ? 'Jefe de Turno' : 'Supervisor')}</strong> · {new Date().toLocaleDateString('es-CL')} {new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSignDispatch}
                        disabled={signingInProgress}
                        className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl text-sm font-black cursor-pointer active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg"
                      >
                        {signingInProgress ? <RefreshCw className="w-4 h-4 animate-spin" /> : <PenTool className="w-4 h-4" />}
                        {signingInProgress ? 'Firmando...' : 'FIRMAR DOCUMENTO'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODAL ADVERTENCIA AL FIRMAR: CAMPOS INCOMPLETOS EN HISTORIAL  */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {signWarningAlert && (
        <div className="fixed inset-0 z-[99998] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-7 space-y-5 border-2 border-orange-400">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-300 text-orange-600 flex items-center justify-center shrink-0 shadow-sm">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  ⚠️ Advertencia: Datos Incompletos
                </h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Este despacho tiene campos sin rellenar. Verifica antes de firmar:
                </p>
              </div>
            </div>

            <div className="bg-orange-50/70 border border-orange-200/80 rounded-2xl p-4 space-y-2">
              <span className="text-[11px] font-black uppercase text-orange-800 tracking-wider block">
                Campos faltantes o vacíos:
              </span>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {signWarningAlert.fields.map((field, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-orange-200 rounded-xl px-3 py-2 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0"></span>
                    <span>{field}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs font-semibold text-slate-600 text-center">
              Puedes volver al historial para editar el despacho, o firmar de todas formas si los datos son correctos.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSignWarningAlert(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 border border-slate-300"
              >
                ✏️ VOLVER Y REVISAR
              </button>
              <button
                type="button"
                onClick={() => {
                  const rec = signWarningAlert.rec;
                  setSignWarningAlert(null);
                  setSignPreviewRecord(rec);
                }}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 shadow-md"
              >
                ✍️ FIRMAR DE TODAS FORMAS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* MODAL POKA-YOKE: ADVERTENCIA DATOS INCOMPLETOS       */}
      {/* ══════════════════════════════════════════════════════ */}
      {missingFieldsAlert && (
        <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 sm:p-7 space-y-5 border-2 border-amber-400">
            
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 text-amber-600 flex items-center justify-center shrink-0 shadow-sm">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 tracking-tight">
                  ⚠️ Poka-Yoke: Datos Incompletos del Camión
                </h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Se detectaron los siguientes datos faltantes antes de registrar el despacho:
                </p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 space-y-2">
              <span className="text-[11px] font-black uppercase text-amber-800 tracking-wider block">
                Campos no ingresados:
              </span>
              <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {missingFieldsAlert.map((field, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-white border border-amber-200 rounded-xl px-3 py-2 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                    <span>{field}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs font-semibold text-slate-600 text-center">
              ¿Deseas volver atrás para completar los datos o prefieres continuar y confirmar el despacho de todas formas?
            </p>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMissingFieldsAlert(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 border border-slate-300"
              >
                ✏️ VOLVER Y COMPLETAR
              </button>

              <button
                type="button"
                onClick={() => handleSubmit(undefined, true)}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 shadow-md"
              >
                ⚠️ CONTINUAR Y CONFIRMAR
              </button>
            </div>

          </div>
        </div>
      )}

      {/* OVERLAY MODAL: MODO MONITOR TV (PANTALLA COMPLETA EN TONOS CLAROS PARA CONTROL ROOM) */}
      {isTvMonitorMode && (() => {
        const compareTimes = (actualTimeStr: string, targetTimeStr: string) => {
          if (!actualTimeStr || !targetTimeStr) return { isOnTime: true, diffMinutes: 0 };
          const [aH, aM] = actualTimeStr.slice(0, 5).split(':').map(Number);
          const [tH, tM] = targetTimeStr.slice(0, 5).split(':').map(Number);
          const actualMin = aH * 60 + aM;
          const targetMin = tH * 60 + tM;
          const diff = targetMin - actualMin;
          return {
            isOnTime: actualMin <= targetMin,
            diffMinutes: Math.abs(diff)
          };
        };

        const formatCountdown = (targetTimeStr: string, targetDateStr: string, now: Date) => {
          if (!targetTimeStr) return { status: 'IN_PROGRESS', text: '--:--:--', isOverdue: false };
          const [h, m] = targetTimeStr.split(':').map(Number);
          const targetDate = new Date(targetDateStr + 'T00:00:00');
          targetDate.setHours(h, m, 0, 0);

          const diffMs = targetDate.getTime() - now.getTime();
          const diffSec = Math.floor(Math.abs(diffMs) / 1000);

          const hours = Math.floor(diffSec / 3600);
          const minutes = Math.floor((diffSec % 3600) / 60);
          const seconds = diffSec % 60;

          const formatted = [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            seconds.toString().padStart(2, '0')
          ].join(':');

          if (diffMs < 0) {
            return { status: 'OVERDUE', text: `+${formatted}`, isOverdue: true };
          } else {
            return { status: 'IN_PROGRESS', text: formatted, isOverdue: false };
          }
        };

        const dayDispatches = records.filter(r => r.inspection_date === departuresDate);
        
        const activeZonalEntries = new Map<string, { 
          zonalName: string; 
          viajeNumero: number; 
          matchedDispatch: DispatchRecord | null; 
          matchedZonalDetail: any;
          isOpenDraft?: boolean;
          draftTruckNumber?: string;
          draftTruckPlate?: string;
          draftSupervisor?: string;
        }>();

        // 1. Zonas de despachos cerrados en Supabase
        dayDispatches.forEach(rec => {
          (rec.zonals_detail || []).forEach(z => {
            const baseName = getBaseZonalName(z.zonal_name);
            const viajeNum = z.viaje_numero || 1;
            const key = `${baseName}-${viajeNum}`;
            if (!activeZonalEntries.has(key)) {
              activeZonalEntries.set(key, {
                zonalName: baseName,
                viajeNumero: viajeNum,
                matchedDispatch: rec,
                matchedZonalDetail: z
              });
            }
          });
        });

        // 2. Zonas agregadas en camiones en carga activos (Borradores Abiertos) para el día de hoy
        if (departuresDate === getChileDateString()) {
          truckDrafts.forEach(draft => {
            (draft.selectedZonals || []).forEach(sz => {
              const baseName = getBaseZonalName(sz.zonal_name);
              const viajeNum = sz.viaje_numero || 1;
              const key = `${baseName}-${viajeNum}`;
              
              if (!activeZonalEntries.has(key)) {
                activeZonalEntries.set(key, {
                  zonalName: baseName,
                  viajeNumero: viajeNum,
                  matchedDispatch: null,
                  matchedZonalDetail: sz,
                  isOpenDraft: true,
                  draftTruckNumber: draft.truckNumber,
                  draftTruckPlate: draft.truckPlate,
                  draftSupervisor: draft.supervisorName || supervisorName
                });
              }
            });
          });
        }

        const departureCards = Array.from(activeZonalEntries.values()).map(({ zonalName, viajeNumero, matchedDispatch, matchedZonalDetail, isOpenDraft, draftTruckNumber, draftTruckPlate, draftSupervisor }) => {
          const targetConfig = getZonalTargetConfig(zonalName, viajeNumero);

          const targetTime = targetConfig.target_time;
          const isClosed = !!matchedDispatch;
          const actualTime = matchedDispatch 
            ? ((matchedDispatch.close_time && matchedDispatch.close_time.trim()) 
                ? matchedDispatch.close_time.trim().slice(0, 5) 
                : (matchedDispatch.inspection_time || matchedDispatch.created_at.slice(11, 16))) 
            : null;

          let status: 'ON_TIME' | 'LATE' | 'IN_PROGRESS' | 'OVERDUE' = 'IN_PROGRESS';
          let diffMinutes = 0;
          let countdownText = '';

          if (isClosed && actualTime) {
            const comp = compareTimes(actualTime, targetTime);
            status = comp.isOnTime ? 'ON_TIME' : 'LATE';
            diffMinutes = comp.diffMinutes;
          } else {
            const cd = formatCountdown(targetTime, departuresDate, nowTime);
            status = cd.status as any;
            countdownText = cd.text;
          }

          return {
            id: `${zonalName}-${viajeNumero}`,
            zonalName,
            viajeNumero,
            targetTime,
            isClosed,
            actualTime,
            status,
            diffMinutes,
            countdownText,
            dispatch: matchedDispatch,
            zonalDetail: matchedZonalDetail,
            isOpenDraft: !!isOpenDraft,
            draftTruckNumber,
            draftTruckPlate,
            draftSupervisor
          };
        });

        // Ordenar tarjetas: Zonales en proceso / abiertas primero (al inicio de la lista superior), luego zonales cerradas
        const sortedTvCards = [...departureCards].sort((a, b) => {
          const aActive = !a.isClosed || a.isOpenDraft;
          const bActive = !b.isClosed || b.isOpenDraft;

          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;

          if (aActive && bActive) {
            if (a.status === 'OVERDUE' && b.status !== 'OVERDUE') return -1;
            if (a.status !== 'OVERDUE' && b.status === 'OVERDUE') return 1;
            return a.targetTime.localeCompare(b.targetTime);
          }

          return a.targetTime.localeCompare(b.targetTime);
        });

        const totalScheduled = departureCards.length;
        const onTimeCount = departureCards.filter(c => c.status === 'ON_TIME').length;
        const lateCount = departureCards.filter(c => c.status === 'LATE').length;
        const inProgressCount = departureCards.filter(c => c.status === 'IN_PROGRESS').length;
        const overdueCount = departureCards.filter(c => c.status === 'OVERDUE').length;

        const closedTotal = onTimeCount + lateCount;
        const complianceRate = closedTotal > 0 ? Math.round((onTimeCount / closedTotal) * 100) : (totalScheduled > 0 ? 100 : 0);

        return (
          <div className="fixed inset-0 z-[999999] bg-slate-100 text-slate-800 p-3 sm:p-4 overflow-y-auto flex flex-col justify-between animate-fade-in select-none">
            {/* CABECERA MONITOR TV COMPACTA */}
            <div className="flex items-center justify-between border border-slate-200 px-4 py-2 mb-2.5 bg-white rounded-xl shadow-2xs">
              <div className="flex items-center gap-3">
                <img src={cialLogo} alt="CIAL Logo" className="h-8 object-contain" />
                <div>
                  <h1 className="text-base sm:text-lg font-black text-brand-primary uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-500" />
                    MONITOR CONTROL ROOM — SALIDAS A TIEMPO
                  </h1>
                  <span className="text-[10px] text-slate-500 font-mono font-bold">
                    Fecha: {departuresDate} | Actualización en Vivo
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <div className="text-right font-mono">
                  <span className="text-[9px] text-slate-400 font-bold uppercase block leading-none">Hora Actual</span>
                  <span className="text-2xl font-black text-emerald-600 tracking-wider">
                    {nowTime.toLocaleTimeString('es-CL')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsTvMonitorMode(false)}
                  className="bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-black cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5 transition-all"
                >
                  <X className="w-4 h-4" /> Salir del Modo TV
                </button>
              </div>
            </div>

            {/* METRICAS KPI CLARAS Y COMPACTAS */}
            <div className="grid grid-cols-4 gap-2.5 mb-2.5">
              <div className="bg-emerald-50 border border-emerald-300 px-3 py-2 rounded-xl text-center shadow-2xs flex items-center justify-between">
                <span className="text-[11px] font-black text-emerald-800 uppercase tracking-wider">A Tiempo</span>
                <span className="text-2xl sm:text-3xl font-mono font-black text-emerald-600">{onTimeCount}</span>
              </div>

              <div className="bg-rose-50 border border-rose-300 px-3 py-2 rounded-xl text-center shadow-2xs flex items-center justify-between">
                <span className="text-[11px] font-black text-rose-800 uppercase tracking-wider">Retrasados / Expirados</span>
                <span className="text-2xl sm:text-3xl font-mono font-black text-rose-600">{lateCount + overdueCount}</span>
              </div>

              <div className="bg-amber-50 border border-amber-300 px-3 py-2 rounded-xl text-center shadow-2xs flex items-center justify-between">
                <span className="text-[11px] font-black text-amber-800 uppercase tracking-wider">En Proceso</span>
                <span className="text-2xl sm:text-3xl font-mono font-black text-amber-600">{inProgressCount}</span>
              </div>

              <div className="bg-slate-900 border border-amber-400 px-3 py-2 rounded-xl text-center shadow-2xs text-white flex items-center justify-between">
                <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">% Cumplimiento Metas</span>
                <span className="text-2xl sm:text-3xl font-mono font-black text-amber-400">{complianceRate}%</span>
              </div>
            </div>

            {/* LISTADO DE TARJETAS ZONALES COMPACTAS (MAXIMIZANDO EJE X Y COMPACTANDO EJE Y) */}
            <div className="space-y-1.5 flex-1 overflow-y-auto pr-1">
              {sortedTvCards.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-2">
                  <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                  <h3 className="text-base font-black text-slate-700">No hay salidas ni camiones registrados para el día {departuresDate}</h3>
                </div>
              ) : (
                sortedTvCards.map((card) => (
                  <div
                    key={card.id}
                    className={`bg-white border rounded-xl px-3 py-2 shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-2.5 ${
                      card.status === 'ON_TIME'
                        ? 'border-emerald-300 bg-emerald-50/15'
                        : card.status === 'LATE'
                        ? 'border-rose-300 bg-rose-50/15'
                        : card.status === 'OVERDUE'
                        ? 'border-rose-500 animate-pulse bg-rose-50/40'
                        : 'border-amber-300 bg-amber-50/20'
                    }`}
                  >
                    {/* COL 1: ZONAL Y META CIERRE (COMPACTO) */}
                    <div className="flex items-center gap-2.5 min-w-[210px]">
                      <div className={`w-2.5 h-7 rounded-full shrink-0 ${
                        card.status === 'ON_TIME' ? 'bg-emerald-500' : card.status === 'LATE' ? 'bg-rose-500' : card.status === 'OVERDUE' ? 'bg-rose-600 animate-pulse' : 'bg-amber-400'
                      }`} />
                      <div className="flex items-baseline gap-2">
                        <h2 className="text-base font-black uppercase tracking-tight text-slate-900">
                          {card.zonalName} {card.viajeNumero > 1 ? card.viajeNumero : ''}
                        </h2>
                        <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">
                          Meta: <strong className="text-slate-800 font-mono">{card.targetTime} hrs</strong>
                        </span>
                      </div>
                    </div>

                    {/* COL 2: BADGE DE ESTADO (COMPACTO) */}
                    <div className="min-w-[130px] flex items-center">
                      {card.status === 'ON_TIME' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-2xs">
                          🟢 A TIEMPO
                        </span>
                      )}
                      {card.status === 'LATE' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 shadow-2xs">
                          🔴 RETRASADO
                        </span>
                      )}
                      {card.status === 'OVERDUE' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-600 text-white animate-bounce flex items-center gap-1 shadow-xs">
                          🚨 FUERA DE TIEMPO
                        </span>
                      )}
                      {card.status === 'IN_PROGRESS' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                          🟡 EN CARGA
                        </span>
                      )}
                    </div>

                    {/* COL 3: CUENTA REGRESIVA O HORA REAL DE CIERRE (COMPACTO) */}
                    <div className="min-w-[210px] text-left md:text-center font-mono">
                      {card.isClosed ? (
                        <div className="flex items-center justify-start md:justify-center gap-2">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Cierre:</span>
                          <span className="text-xl font-black text-slate-900">{card.actualTime?.slice(0, 5)} <span className="text-xs font-normal text-slate-400">hrs</span></span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            card.status === 'ON_TIME' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {card.status === 'ON_TIME' ? `+${card.diffMinutes}m` : `-${card.diffMinutes}m`}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-start md:justify-center gap-2">
                          <span className="text-[10px] text-slate-500 font-extrabold uppercase">
                            {card.status === 'OVERDUE' ? 'Atrasado:' : 'Faltan:'}
                          </span>
                          <span className={`text-2xl font-black tracking-wider ${
                            card.status === 'OVERDUE' ? 'text-rose-600 animate-pulse' : 'text-amber-600'
                          }`}>
                            {card.countdownText}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* COL 4: DETALLE HORIZONTAL DEL CAMIÓN (APROVECHA EJE X CONTINUO) */}
                    <div className="flex-1 flex items-center justify-start md:justify-end gap-2.5 text-xs font-mono border-t md:border-t-0 md:border-l border-slate-200 pt-1 md:pt-0 md:pl-3">
                      {card.isOpenDraft ? (
                        <>
                          <span className="font-extrabold text-slate-900">🚚 Camión #{card.draftTruckNumber || 'En Carga'}</span>
                          <span className="bg-amber-100 px-2 py-0.5 rounded border border-amber-300 font-mono text-amber-900 font-black text-[10px]">
                            {card.draftTruckPlate || 'S/P'}
                          </span>
                          <span className="text-slate-600 font-bold text-[11px] truncate max-w-[160px]">
                            Sup: {card.draftSupervisor || 'Asignado'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-200 text-amber-950 uppercase border border-amber-300 shrink-0">
                            🟡 EN CARGA
                          </span>
                        </>
                      ) : card.dispatch ? (
                        <>
                          <span className="font-extrabold text-slate-900">🚚 Camión #{card.dispatch.truck_number || 'S/N'}</span>
                          <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-300 font-mono text-slate-800 font-black text-[10px]">
                            {card.dispatch.truck_plate || 'S/P'}
                          </span>
                          <span className="text-slate-600 font-bold text-[11px] truncate max-w-[160px]">
                            Sup: {card.dispatch.supervisor_name}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-100 text-emerald-800 uppercase border border-emerald-300 shrink-0">
                            🟢 DESPACHADO
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400 font-bold italic">
                          Esperando postura de camión...
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })()}

      {/* MODAL CONFIGURADOR DE METAS DE CIERRE */}
      {showConfigTargetsModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 animate-fade-in select-none">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b pb-3 shrink-0">
              <h3 className="text-sm font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                ⚙️ Configuración de Metas de Cierre por Zonal
              </h3>
              <button
                type="button"
                onClick={() => setShowConfigTargetsModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-500 font-semibold shrink-0">
              Ajusta el horario de meta para cada zonal y viaje (ej. Temuco 1 a las 17:30 y Temuco 2 a las 19:30).
            </p>

            {/* LISTA EDITABLE DE METAS */}
            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {zonalTargetTimes.map((item) => (
                <div key={item.id || `${item.zonal_name}-${item.viaje_numero}`} className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-black text-xs text-slate-800 uppercase">
                      {item.zonal_name} {item.viaje_numero > 1 ? item.viaje_numero : ''}
                    </span>
                    <span className="text-[10px] text-slate-400 font-bold block">
                      Viaje N° {item.viaje_numero}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      defaultValue={item.target_time}
                      onBlur={(e) => {
                        if (e.target.value && e.target.value !== item.target_time) {
                          handleSaveZonalTargetTime(item.zonal_name, item.viaje_numero, e.target.value);
                        }
                      }}
                      className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono font-black text-slate-800 focus:outline-none focus:border-amber-500 cursor-pointer shadow-2xs"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* FORMULARIO AGREGAR VIAJE 2 O NUEVA META */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 shrink-0">
              <span className="text-[10px] font-black text-amber-800 uppercase block">➕ Agregar / Configurar Viaje Zonal</span>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Nombre Zonal (ej. Temuco)"
                  value={newTargetZonalName}
                  onChange={(e) => setNewTargetZonalName(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:border-amber-400"
                />
                <select
                  value={newTargetViaje}
                  onChange={(e) => setNewTargetViaje(parseInt(e.target.value))}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold focus:outline-none focus:border-amber-400 cursor-pointer"
                >
                  <option value={1}>Viaje N° 1</option>
                  <option value={2}>Viaje N° 2</option>
                  <option value={3}>Viaje N° 3</option>
                </select>
                <input
                  type="time"
                  value={newTargetTimeStr}
                  onChange={(e) => setNewTargetTimeStr(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-amber-400 cursor-pointer"
                />
              </div>
              <button
                type="button"
                disabled={savingTargetTime || !newTargetZonalName || !newTargetTimeStr}
                onClick={() => handleSaveZonalTargetTime(newTargetZonalName, newTargetViaje, newTargetTimeStr)}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white py-1.5 rounded-lg text-xs font-black cursor-pointer shadow-sm disabled:opacity-50"
              >
                {savingTargetTime ? 'Guardando...' : 'GUARDAR NUEVA META DE CIERRE'}
              </button>
            </div>

            <div className="pt-2 border-t shrink-0">
              <button
                type="button"
                onClick={() => setShowConfigTargetsModal(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                CERRAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL VISTA PREVIA E IMPRESIÓN DE PDF */}
      {pdfPreviewModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-2 sm:p-4 z-50 animate-fade-in select-none">
          <div className="bg-slate-900 rounded-2xl max-w-4xl w-full flex flex-col h-[90vh] shadow-2xl border border-slate-700 overflow-hidden">
            
            {/* CABECERA MODAL */}
            <div className="bg-slate-800 px-4 py-3 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <span>Vista Previa de Despacho</span>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                      {pdfPreviewModal.rec.truck_plate !== 'N/A' ? pdfPreviewModal.rec.truck_plate : `Camión #${pdfPreviewModal.rec.truck_number}`}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {getFormatDate(pdfPreviewModal.rec.inspection_date)} — Zonales: {pdfPreviewModal.rec.zonals_detail.map(z => z.zonal_name).join(' - ')}
                  </p>
                </div>
              </div>

              {/* ACCIONES DEL HEADER */}
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (pdfPreviewModal.htmlTemplate) {
                      const printIframe = document.createElement('iframe');
                      printIframe.style.position = 'fixed';
                      printIframe.style.right = '0';
                      printIframe.style.bottom = '0';
                      printIframe.style.width = '0';
                      printIframe.style.height = '0';
                      printIframe.style.border = '0';
                      document.body.appendChild(printIframe);
                      
                      const doc = printIframe.contentWindow?.document;
                      if (doc) {
                        doc.open();
                        doc.write(`
                          <!DOCTYPE html>
                          <html>
                            <head>
                              <title>Despacho Camión ${pdfPreviewModal.rec.truck_plate || pdfPreviewModal.rec.truck_number}</title>
                              <style>
                                @page {
                                  size: letter portrait;
                                  margin: 5mm;
                                }
                                body {
                                  margin: 0;
                                  padding: 0;
                                  background: #fff;
                                  -webkit-print-color-adjust: exact;
                                  print-color-adjust: exact;
                                }
                              </style>
                            </head>
                            <body>
                              ${pdfPreviewModal.htmlTemplate}
                            </body>
                          </html>
                        `);
                        doc.close();
                        
                        setTimeout(() => {
                          printIframe.contentWindow?.focus();
                          printIframe.contentWindow?.print();
                          setTimeout(() => {
                            if (document.body.contains(printIframe)) {
                              document.body.removeChild(printIframe);
                            }
                          }, 2000);
                        }, 200);
                      }
                    } else {
                      window.open(pdfPreviewModal.blobUrl, '_blank');
                    }
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 border border-emerald-500"
                  title="Imprimir comprobante al instante sin esperas"
                >
                  <span>🖨️ Imprimir Ahora</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const filename = `Despacho_Camion_${pdfPreviewModal.rec.truck_plate || 'SinPatente'}_${pdfPreviewModal.rec.inspection_date}.pdf`;
                    pdfPreviewModal.pdfObj.save(filename);
                  }}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-slate-600 active:scale-95"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Descargar Archivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPdfPreviewModal(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-bold rounded-xl transition-all cursor-pointer active:scale-95 border border-slate-700"
                >
                  ✕ Cerrar
                </button>
              </div>
            </div>

            {/* CUERPO DEL MODAL (VISOR INTERACTIVO IFRAME) */}
            <div className="flex-1 bg-slate-950 p-2 overflow-hidden flex items-center justify-center">
              <iframe
                src={pdfPreviewModal.blobUrl}
                title="Vista previa del PDF de Despacho"
                className="w-full h-full rounded-xl border border-slate-800 bg-white"
              />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODAL: AVISO Y ENVÍO DE CORREO DE FALLAS EN CAMIÓN / RAMPA     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {failureAlertModal && (
        <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border-2 border-rose-400 flex flex-col max-h-[92vh] animate-fade-in">
            
            {/* CABECERA MODAL */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between gap-3 shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500 text-rose-400 flex items-center justify-center shrink-0 shadow-sm">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                    <span>Aviso de Fallas a Supervisor de Rampas</span>
                    <span className="font-mono bg-rose-600 text-white px-2.5 py-0.5 rounded-lg text-xs font-black">
                      {failureAlertModal.plate}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 font-semibold mt-0.5">
                    Envío formal de anomalías y evidencias fotográficas detectadas durante la inspección.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFailureAlertModal(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* CUERPO DEL MODAL (SCROLLABLE) */}
            <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              
              {/* TOAST DE COPIADO EXITOSO */}
              {alertCopiedToast && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl font-bold flex items-center gap-2 animate-fade-in shadow-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>¡Reporte formateado copiado al portapapeles con éxito! Listo para pegar en WhatsApp o correo.</span>
                </div>
              )}

              {/* CAMPOS DE DESTINATARIO Y COPIA */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">
                  Configuración de Destinatarios
                </span>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-brand-primary" />
                    <span>Para (Supervisor Encargado de Camiones / Rampas):</span>
                  </label>
                  <input
                    type="email"
                    placeholder="ej. supervisor.rampas@cial.cl"
                    value={alertRecipientEmail}
                    onChange={(e) => {
                      setAlertRecipientEmail(e.target.value);
                      localStorage.setItem('nexus_rampas_alert_to', e.target.value);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary shadow-2xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>En Copia (CC - Jefaturas, Transportes, etc. separados por coma):</span>
                  </label>
                  <input
                    type="text"
                    placeholder="ej. jefe.turno@cial.cl, transportes@cial.cl"
                    value={alertCcEmail}
                    onChange={(e) => {
                      setAlertCcEmail(e.target.value);
                      localStorage.setItem('nexus_rampas_alert_cc', e.target.value);
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary shadow-2xs"
                  />
                </div>
              </div>

              {/* BANNER DE TRAZABILIDAD ZONAL */}
              {failureAlertModal.lastZonals && failureAlertModal.lastZonals.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 p-3 rounded-2xl text-[11px] space-y-1">
                  <div className="flex items-center justify-between font-black text-amber-950">
                    <span className="flex items-center gap-1.5">
                      <span>📍</span>
                      <span>Última(s) Zonal(es) visitada(s) por este camión:</span>
                    </span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300">
                      {failureAlertModal.lastZonals.join(', ')} {failureAlertModal.lastDispatchDate ? `(${failureAlertModal.lastDispatchDate})` : ''}
                    </span>
                  </div>
                  <p className="text-amber-800 text-[10px]">
                    * Nota Operativa: CIAL carga en planta y descarga en sucursales zonales. Las roturas o daños en separadores térmicos / colchonetas ocurren en la zonal previa donde se descargó la unidad.
                  </p>
                </div>
              )}

              {/* LISTADO DE FALLAS DETECTADAS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">
                    Fallas & Observaciones Registradas ({failureAlertModal.failures.length})
                  </span>
                  {failureAlertModal.truckNumbers.length > 0 && (
                    <span className="text-[10px] font-mono font-bold text-slate-500">
                      N° Camión: {failureAlertModal.truckNumbers.join(', ')}
                    </span>
                  )}
                </div>

                {failureAlertModal.failures.length === 0 ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                    <p className="text-xs font-bold text-emerald-800">
                      🟢 No se registran fallas críticas ni observaciones en amarillo para esta patente.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {failureAlertModal.failures.map((f, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-2xl border space-y-1.5 ${
                          f.status === 'ROJO'
                            ? 'bg-rose-50/80 border-rose-300 text-rose-950'
                            : 'bg-amber-50/80 border-amber-300 text-amber-950'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-extrabold text-xs flex items-center gap-1.5">
                            <span>{f.status === 'ROJO' ? '🔴' : '🟡'}</span>
                            <span>{f.itemLabel}</span>
                          </span>
                          <span className="text-[10px] font-mono font-bold opacity-80">
                            {f.date} · {f.supervisor}
                          </span>
                        </div>

                        {/* TRAZABILIDAD SEPARADOR TÉRMICO */}
                        {f.itemKey === 'separador_termico' && (
                          <div className="bg-white/90 p-2 rounded-xl border border-current/20 text-[11px] space-y-0.5">
                            <span className="font-bold text-amber-950 block">
                              📍 Zonal de descarga previa: {f.previousZonals && f.previousZonals.length > 0 ? (
                                <strong className="font-mono text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300">
                                  {f.previousZonals.join(', ')} ({f.previousDate || 'Viaje anterior'})
                                </strong>
                              ) : (
                                <span className="italic text-slate-500 font-normal">Zonal actual: {f.currentZonals?.join(', ') || 'S/A'}</span>
                              )}
                            </span>
                          </div>
                        )}

                        {f.comment && (
                          <p className="text-[11px] font-medium bg-white/70 p-2 rounded-xl border border-current/20">
                            <strong>Detalle / Causa:</strong> {f.comment}
                          </p>
                        )}

                        {/* MINIATURAS DE FOTOS DE EVIDENCIA ASOCIADAS */}
                        {f.photos && f.photos.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-wider block opacity-90">
                                📷 Fotos de Evidencia ({f.photos.length}):
                              </span>
                              <span className="text-[9px] text-slate-500 font-bold">
                                Clic en "Copiar" para pegar en el correo con Ctrl+V
                              </span>
                            </div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              {f.photos.map((pUrl, pIdx) => (
                                <div key={pIdx} className="relative group bg-white rounded-xl border border-slate-300 p-1 shadow-2xs">
                                  <img
                                    src={pUrl}
                                    alt={`Evidencia ${pIdx + 1}`}
                                    className="w-16 h-16 rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                    onClick={() => openPhotoGallery(f.photos, pIdx)}
                                    title="Clic para ampliar foto"
                                  />
                                  <div className="flex items-center justify-between gap-1 mt-1">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyImageToClipboard(pUrl)}
                                      className="text-[8.5px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded transition-all cursor-pointer flex items-center gap-0.5"
                                      title="Copiar imagen al portapapeles para pegar con Ctrl+V en Outlook"
                                    >
                                      <Copy className="w-2.5 h-2.5" />
                                      <span>Copiar</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const a = document.createElement('a');
                                        a.href = pUrl;
                                        a.download = `Evidencia_${failureAlertModal.plate}_${pIdx + 1}.jpg`;
                                        a.click();
                                      }}
                                      className="text-[8.5px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                                      title="Descargar esta foto"
                                    >
                                      ⬇️
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* VISTA PREVIA DEL CORREO FORMATEADO */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl border border-slate-800 space-y-2 select-text shadow-inner">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1.5">
                    <span>✉️ Formato Oficial del Correo:</span>
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    Listo para enviar o copiar
                  </span>
                </div>
                <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-200 select-all overflow-x-auto max-h-48">
                  {buildFailureReportPlainText(failureAlertModal)}
                </pre>
              </div>

              {/* GUÍA DE ADJUNTO DE FOTOS EN OUTLOOK */}
              <div className="bg-sky-50 border border-sky-200 p-3 rounded-2xl text-[11px] space-y-1 text-sky-950">
                <strong className="block font-black text-sky-900">💡 ¿Cómo adjuntar las fotos al correo?</strong>
                <p className="text-sky-800 text-[10.5px]">
                  Por restricciones de seguridad de los navegadores y de Outlook/Gmail, ningún sitio web puede adjuntar archivos locales automáticamente.
                  <br />
                  • <strong>Opción 1:</strong> Presiona <strong>"Copiar"</strong> en cualquier foto arriba y pégala con <strong>Ctrl + V</strong> directamente dentro del cuerpo de tu correo.
                  <br />
                  • <strong>Opción 2:</strong> Presiona <strong>"Descargar Todas las Fotos"</strong> abajo y arrastra los archivos descargados a tu mensaje.
                </p>
              </div>

              {/* VISTA PREVIA DEL ASUNTO */}
              <div className="bg-slate-100 p-3 rounded-xl border border-slate-200 text-slate-700 text-[11px]">
                <strong className="text-slate-900 block font-black mb-0.5">Asunto del Correo:</strong>
                <span className="font-mono">🚨 ALERTA INSPECCIÓN: Fallas detectadas en Camión {failureAlertModal.plate}</span>
              </div>

            </div>

            {/* BOTONES DE ACCIÓN FOOTER */}
            <div className="bg-slate-50 p-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                <button
                  type="button"
                  onClick={handleCopyFailureReport}
                  className="px-3.5 py-2.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                  title="Copiar texto formateado para pegar en WhatsApp o Teams"
                >
                  <Copy className="w-4 h-4 text-slate-500" />
                  <span>Copiar Reporte</span>
                </button>

                {failureAlertModal.failures.some(f => f.photos && f.photos.length > 0) && (
                  <button
                    type="button"
                    onClick={handleDownloadAllFailurePhotos}
                    className="px-3.5 py-2.5 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                    title="Descarga todas las fotos de evidencia al computador para adjuntarlas a Outlook"
                  >
                    <FileDown className="w-4 h-4 text-amber-700" />
                    <span>📥 Descargar Todas las Fotos ({failureAlertModal.failures.reduce((s, f) => s + (f.photos?.length || 0), 0)})</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setFailureAlertModal(null)}
                  className="px-4 py-2.5 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition-all cursor-pointer active:scale-95"
                >
                  Cerrar
                </button>

                <button
                  type="button"
                  onClick={handleSendFailureEmail}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-md border border-rose-500"
                  title="Abrir en Outlook o cliente de correo predeterminado"
                >
                  <Send className="w-4 h-4" />
                  <span>Abrir en Correo (Outlook / Webmail)</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      <footer className="bg-slate-100 border-t border-slate-200 text-slate-400 py-4 text-center text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-auto">
        CIAL Alimentos — Control Outbound v1.1.0 (2026)
      </footer>

    </div>
  );
}
