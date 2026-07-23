import { useState, useEffect } from 'react';
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
  RotateCcw,
  Package,
  LogOut,
  Edit2,
  FileDown,
  Camera,
  X,
  Save
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
  "Coyhaique"
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
  checklist: {
    postura_anden: boolean;
    limpieza_estructura: boolean;
    luces_encendidas: boolean;
    separador_termico: boolean;
    lingas_camion: boolean;
    photos?: string[];
  };
  zonals_detail: ZonalDetail[];
  observations: string;
  created_at: string;
  temp_1er: number;
  temp_2do: number;
  temp_3er: number;
  close_time?: string | null;
}

interface PalletReturnRecord {
  id: string;
  zonal_name: string;
  wood_returned: number;
  plastic_returned: number;
  supervisor_name: string;
  created_at: string;
}

const formatSupervisorName = (email: string | undefined): string => {
  if (!email) return 'Supervisor';
  const username = email.split('@')[0];
  return username
    .split('.')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const ADMIN_EMAILS = [
  'ariel.mella@cial.cl',
  'euro.velasquez@cial.cl',
  'admin@cial.cl'
];

const checkIsAdmin = (user: any): boolean => {
  if (!user) return false;
  const email = (user.email || '').toLowerCase();
  const role = (user.user_metadata?.role || user.app_metadata?.role || '').toLowerCase();
  if (['admin', 'superadmin', 'jefe', 'supervisor_jefe'].includes(role)) return true;
  return ADMIN_EMAILS.includes(email);
};

export default function App({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<'nuevo' | 'historial' | 'zonales'>('nuevo');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Datos Históricos de Despachos y Devoluciones
  const [records, setRecords] = useState<DispatchRecord[]>([]);
  const [returnsList, setReturnsList] = useState<PalletReturnRecord[]>([]);
  const [expandedRecords, setExpandedRecords] = useState<{ [key: string]: boolean }>({});
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [historySubTab, setHistorySubTab] = useState<'camiones' | 'zonales'>('camiones');
  const [historyZonalFilter, setHistoryZonalFilter] = useState<string>('ALL');

  // Datos del Formulario actual de Despacho
  const [supervisorName, setSupervisorName] = useState(() => formatSupervisorName(user?.email));
  const [truckNumber, setTruckNumber] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [positionsOccupied, setPositionsOccupied] = useState<number>(26);
  const [observations, setObservations] = useState('');
  const [temp1er, setTemp1er] = useState<number>(0);
  const [temp2do, setTemp2do] = useState<number>(-18);
  const [temp3er, setTemp3er] = useState<number>(0);
  const [closeTime, setCloseTime] = useState<string>('');

  const isAdmin = checkIsAdmin(user);

  // Estados para edición diferida de hora de cierre de camión en historial
  const [editingCloseTimes, setEditingCloseTimes] = useState<{ [key: string]: string }>({});
  const [savingCloseTimeId, setSavingCloseTimeId] = useState<string | null>(null);

  // Estado para el modal de edición completa de despacho (solo admin)
  const [editingDispatchRecord, setEditingDispatchRecord] = useState<DispatchRecord | null>(null);
  const [editingDate, setEditingDate] = useState('');
  const [editingTime, setEditingTime] = useState('');
  const [editingCloseTime, setEditingCloseTime] = useState('');
  const [editingTruckNumber, setEditingTruckNumber] = useState('');
  const [editingTruckPlate, setEditingTruckPlate] = useState('');
  const [editingSupervisorName, setEditingSupervisorName] = useState('');
  const [editingPositions, setEditingPositions] = useState(26);
  const [editingTemp1er, setEditingTemp1er] = useState(0);
  const [editingTemp2do, setEditingTemp2do] = useState(-18);
  const [editingTemp3er, setEditingTemp3er] = useState(0);
  const [editingZonalsDetail, setEditingZonalsDetail] = useState<ZonalDetail[]>([]);
  const [editingObservations, setEditingObservations] = useState('');
  const [editingSaveLoading, setEditingSaveLoading] = useState(false);

  // Checklist de 5 items
  const [checklist, setChecklist] = useState({
    postura_anden: true,
    limpieza_estructura: true,
    luces_encendidas: true,
    separador_termico: true,
    lingas_camion: true
  });

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

  // State para modal/asistente de sumatoria de bandejas (40, 35, 30, 25, 20 + restante)
  const [showBandejasHelper, setShowBandejasHelper] = useState<number | null>(null); // Index del zonal actual en el asistente
  const [helper40, setHelper40] = useState(0);
  const [helper35, setHelper35] = useState(0);
  const [helper30, setHelper30] = useState(0);
  const [helper25, setHelper25] = useState(0);
  const [helper20, setHelper20] = useState(0);
  const [helperRestante, setHelperRestante] = useState(0);

  // Acordeón para colapsar zonales en edición
  const [expandedZonalIndex, setExpandedZonalIndex] = useState<number | null>(0);



  // Fotos adjuntas en observaciones (max 4 fotos)
  const [photos, setPhotos] = useState<string[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

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

  // Restaurar borrador de localStorage si existe
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem('NEXUS_CONTROL_DESPACHO_DRAFT_V1');
      if (savedDraft) {
        const d = JSON.parse(savedDraft);
        if (d.truckNumber !== undefined) setTruckNumber(d.truckNumber);
        if (d.truckPlate !== undefined) setTruckPlate(d.truckPlate);
        if (d.positionsOccupied !== undefined) setPositionsOccupied(d.positionsOccupied);
        if (d.observations !== undefined) setObservations(d.observations);
        if (d.temp1er !== undefined) setTemp1er(d.temp1er);
        if (d.temp2do !== undefined) setTemp2do(d.temp2do);
        if (d.temp3er !== undefined) setTemp3er(d.temp3er);
        if (d.closeTime !== undefined) setCloseTime(d.closeTime);
        if (d.checklist !== undefined) setChecklist(d.checklist);
        if (d.selectedZonals && Array.isArray(d.selectedZonals)) setSelectedZonals(d.selectedZonals);
        if (d.photos && Array.isArray(d.photos)) setPhotos(d.photos);
        if (d.selectedZonals?.length > 0 || d.truckNumber || d.observations || d.photos?.length > 0) {
          setHasRestoredDraft(true);
        }
      }
    } catch (e) {
      console.error('Error restaurando borrador:', e);
    }
  }, []);

  // Auto-guardado de borrador en localStorage
  useEffect(() => {
    const hasContent = selectedZonals.length > 0 || !!truckNumber || !!truckPlate || !!observations || photos.length > 0;
    if (hasContent) {
      try {
        const draftData = {
          truckNumber,
          truckPlate,
          positionsOccupied,
          observations,
          temp1er,
          temp2do,
          temp3er,
          closeTime,
          checklist,
          selectedZonals,
          photos
        };
        localStorage.setItem('NEXUS_CONTROL_DESPACHO_DRAFT_V1', JSON.stringify(draftData));
        setHasRestoredDraft(true);
      } catch (e) {
        console.error('Error guardando borrador:', e);
      }
    }
  }, [truckNumber, truckPlate, positionsOccupied, observations, temp1er, temp2do, temp3er, closeTime, checklist, selectedZonals, photos]);

  const clearDraft = (silent = false) => {
    if (!silent) {
      if (!window.confirm('¿Deseas descartar los datos del borrador actual y reiniciar el formulario?')) return;
    }
    localStorage.removeItem('NEXUS_CONTROL_DESPACHO_DRAFT_V1');
    setTruckNumber('');
    setTruckPlate('');
    setPositionsOccupied(26);
    setObservations('');
    setTemp1er(0);
    setTemp2do(-18);
    setTemp3er(0);
    setCloseTime('');
    setChecklist({
      postura_anden: true,
      limpieza_estructura: true,
      luces_encendidas: true,
      separador_termico: true,
      lingas_camion: true
    });
    setSelectedZonals([]);
    setPhotos([]);
    setHasRestoredDraft(false);
  };

  // Cargar historial y retornos
  useEffect(() => {
    fetchHistory();
    fetchReturns();
  }, []);

  useEffect(() => {
    if (user?.email) {
      setSupervisorName(formatSupervisorName(user.email));
      setReturnSupervisor(formatSupervisorName(user.email));
    }
  }, [user]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pallet_dispatches')
        .select('*')
        .order('created_at', { ascending: false });

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

  // Mapa para expandir/ocultar pallets de madera en estándar y bandejas
  const [showWoodMap, setShowWoodMap] = useState<{ [key: string]: boolean }>({});
  const toggleWoodShow = (zonalIndex: number, catName: string) => {
    const key = `${zonalIndex}_${catName}`;
    setShowWoodMap(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddZonalPhoto = async (zonalIndex: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const updated = [...selectedZonals];
    const currentPhotos = [...(updated[zonalIndex].photos || [])];
    const remaining = 4 - currentPhotos.length;
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

  // Asistente de Bandejas (40, 35, 30, 25, 20 + restante)
  const openBandejasHelper = (index: number) => {
    setShowBandejasHelper(index);
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
    if (helper40 > 0) parts.push(`40x${helper40}`);
    if (helper35 > 0) parts.push(`35x${helper35}`);
    if (helper30 > 0) parts.push(`30x${helper30}`);
    if (helper25 > 0) parts.push(`25x${helper25}`);
    if (helper20 > 0) parts.push(`20x${helper20}`);
    if (helperRestante > 0) parts.push(`${helperRestante}`);
    const formulaText = parts.length > 0 ? parts.join(' + ') : '0';
    const totalBandejas = (helper40 * 40) + (helper35 * 35) + (helper30 * 30) + (helper25 * 25) + (helper20 * 20) + Math.max(0, Number(helperRestante || 0));
    const totalPallets = helper40 + helper35 + helper30 + helper25 + helper20;
    
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

  // Cálculo de balances agregados por Zonal
  const getZonalBalances = () => {
    const balances: { [key: string]: { wood_sent: number; plastic_sent: number; wood_ret: number; plastic_ret: number } } = {};

    ZONALES_LIST.forEach(z => {
      balances[z] = { wood_sent: 0, plastic_sent: 0, wood_ret: 0, plastic_ret: 0 };
    });

    records.forEach(rec => {
      rec.zonals_detail.forEach(zd => {
        const name = zd.zonal_name;
        if (balances[name]) {
          const wood = 
            zd.congelados.wood_bases + zd.congelados.wood_extra +
            zd.estandar.wood_bases + zd.estandar.wood_extra +
            zd.bandejas.wood_bases + zd.bandejas.wood_extra;

          const plastic = 
            zd.congelados.plastic_bases + zd.congelados.plastic_extra +
            zd.estandar.plastic_bases + zd.estandar.plastic_extra +
            zd.bandejas.plastic_bases + zd.bandejas.plastic_extra;

          balances[name].wood_sent += wood;
          balances[name].plastic_sent += plastic;
        }
      });
    });

    returnsList.forEach(ret => {
      const name = ret.zonal_name;
      if (balances[name]) {
        balances[name].wood_ret += ret.wood_returned;
        balances[name].plastic_ret += ret.plastic_returned;
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
        return {
          wood: acc.wood + t.wood,
          plastic: acc.plastic + t.plastic,
          bandejas: acc.bandejas + t.bandejas
        };
      },
      { wood: 0, plastic: 0, bandejas: 0 }
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

  // Generar y Descargar PDF de Despacho usando html2canvas + jsPDF directo
  const handleDownloadPDF = async (rec: DispatchRecord) => {
    if (generatingPdfId) return;
    setGeneratingPdfId(rec.id);

    let container: HTMLDivElement | null = null;
    try {
      // Convertir el logo a Base64 para incrustación directa sin llamadas de red
      const logoBase64 = await getLogoBase64(cialLogo);

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
            <tr style="text-align: center; font-size: 11px; height: 35px;">
              <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-family: monospace;">${i + 1}</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: left; font-weight: bold; text-transform: uppercase; font-family: sans-serif;">
                ${z.zonal_name} ${z.viaje_numero && z.viaje_numero > 1 ? z.viaje_numero : ''} 
                <span style="font-size: 8px; color: #555; font-weight: normal; margin-left: 4px;">(${z.lugar_camion})</span>
              </td>
              <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-family: monospace; font-size: 11px;">${bandejas > 0 ? bandejas : '—'}</td>
              <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-family: monospace; font-size: 11px;">${wood > 0 ? wood : 'X'}</td>
              <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-family: monospace; font-size: 11px;">${plastic > 0 ? plastic : 'X'}</td>
              <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-family: monospace; font-size: 11px;">${z.sello || ''}</td>
            </tr>
          `);
        } else {
          rows.push(`
            <tr style="text-align: center; font-size: 11px; height: 35px;">
              <td style="border: 1px solid #000; padding: 6px; font-weight: bold; font-family: monospace; color: #ccc;">${i + 1}</td>
              <td style="border: 1px solid #000; padding: 6px; text-align: left; color: #ccc;">—</td>
              <td style="border: 1px solid #000; padding: 6px; color: #ccc;">—</td>
              <td style="border: 1px solid #000; padding: 6px; color: #ccc;">—</td>
              <td style="border: 1px solid #000; padding: 6px; color: #ccc;">—</td>
              <td style="border: 1px solid #000; padding: 6px; color: #ccc;">—</td>
            </tr>
          `);
        }
      }

      // Totales agregados
      const totalW = rec.zonals_detail.reduce((sum, z) => sum + z.congelados.wood_bases + z.congelados.wood_extra + z.estandar.wood_bases + z.estandar.wood_extra + z.bandejas.wood_bases + z.bandejas.wood_extra, 0);
      const totalP = rec.zonals_detail.reduce((sum, z) => sum + z.congelados.plastic_bases + z.congelados.plastic_extra + z.estandar.plastic_bases + z.estandar.plastic_extra + z.bandejas.plastic_bases + z.bandejas.plastic_extra, 0);
      const totalB = rec.zonals_detail.reduce((sum, z) => sum + (z.bandejas.bandejas_count || 0), 0);

      const pdfHtml = `
        <div style="font-family: Arial, sans-serif; font-size: 9.5px; width: 750px; padding: 25px; box-sizing: border-box; background-color: #ffffff; color: #000000; margin: 0 auto; line-height: 1.25;">
          
          <!-- Header -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 10px;">
            <tr>
              <td style="width: 25%; border: 1px solid #000; text-align: center; padding: 6px; vertical-align: middle;">
                <img src="${logoBase64}" style="height: 48px; width: auto; object-fit: contain;" />
              </td>
              <td style="width: 50%; border: 1px solid #000; text-align: center; padding: 6px; vertical-align: middle;">
                <div style="font-size: 13px; font-weight: 900; letter-spacing: 0.5px; font-family: sans-serif;">CHECK LIST CAMIONES SUR Y NORTE</div>
                <div style="font-size: 8.5px; margin-top: 2px; font-weight: bold; color: #444; font-family: sans-serif;">En oficina del Jefe de turno (Carpeta)</div>
              </td>
              <td style="width: 25%; border: 1px solid #000; text-align: center; padding: 6px; vertical-align: middle; background-color: #fafafa;">
                <div style="font-size: 7.5px; font-weight: 800; color: #666; text-transform: uppercase; letter-spacing: 0.5px; font-family: sans-serif;">NUMERO CAMIÓN / ANDÉN</div>
                <div style="font-size: 17px; font-weight: 900; margin-top: 2px; font-family: monospace;">${rec.truck_number !== 'N/A' ? rec.truck_number : 'S/A'}</div>
              </td>
            </tr>
          </table>

          <!-- Datos generales -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 10px; font-size: 9px;">
            <tr style="height: 24px;">
              <td style="width: 33.3%; border: 1px solid #000; padding: 5px;"><strong>HORA ENTREGA HOJA:</strong> </td>
              <td style="width: 33.3%; border: 1px solid #000; padding: 5px;"><strong>HORA INICIO PROCESO:</strong> <span style="font-family: monospace; font-weight: bold;">${rec.inspection_time}</span></td>
              <td style="width: 33.3%; border: 1px solid #000; padding: 5px;"><strong>HORA ENTREGA DOCUMENTOS:</strong> </td>
            </tr>
            <tr style="height: 24px;">
              <td colspan="2" style="border: 1px solid #000; padding: 5px;"><strong>ZONALES:</strong> <span style="font-weight: bold; text-transform: uppercase;">${rec.zonals_detail.map(z => {
                const viajeNum = z.viaje_numero || 1;
                return viajeNum > 1 ? `${z.zonal_name} ${viajeNum}` : z.zonal_name;
              }).join(' - ')}</span></td>
              <td style="border: 1px solid #000; padding: 5px;"><strong>PATENTE:</strong> <span style="font-family: monospace; font-weight: bold;">${rec.truck_plate !== 'N/A' ? rec.truck_plate : 'S/A'}</span></td>
            </tr>
            <tr style="height: 24px;">
              <td style="border: 1px solid #000; padding: 5px;"><strong>Hora Inspección:</strong> <span style="font-family: monospace; font-weight: bold;">${rec.inspection_time}</span></td>
              <td colspan="2" style="border: 1px solid #000; padding: 5px;"><strong>FECHA:</strong> <span style="font-family: monospace; font-weight: bold;">${getFormatDate(rec.inspection_date)}</span></td>
            </tr>
          </table>

          <!-- Checklist de rampa -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 10px; font-size: 9px;">
            <thead>
              <tr style="background-color: #f3f4f6; font-weight: 900; text-align: center; height: 24px;">
                <th style="border: 1px solid #000; padding: 5px; text-align: left; width: 70%; font-size: 8.5px; letter-spacing: 0.5px;">ITEMS DE INSPECCIÓN</th>
                <th style="border: 1px solid #000; padding: 5px; width: 15%; font-size: 8px;">CUMPLE</th>
                <th style="border: 1px solid #000; padding: 5px; width: 15%; font-size: 8px;">NO CUMPLE</th>
              </tr>
            </thead>
            <tbody>
              <tr style="height: 24px;">
                <td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold; vertical-align: middle;">1. Horario de postura en el Andén</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.postura_anden ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.postura_anden ? 'X' : ''}</td>
              </tr>
              <tr style="height: 24px;">
                <td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold; vertical-align: middle;">2. Estado de camión a Cargar (Limpieza, Daño estructural)</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.limpieza_estructura ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.limpieza_estructura ? 'X' : ''}</td>
              </tr>
              <tr style="height: 24px;">
                <td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold; vertical-align: middle;">3. Estado de Luces (ENCENDIDAS)</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.luces_encendidas ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.luces_encendidas ? 'X' : ''}</td>
              </tr>
              <tr style="height: 24px;">
                <td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold; vertical-align: middle;">4. Verificación Separador Térmico</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.separador_termico ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.separador_termico ? 'X' : ''}</td>
              </tr>
              <tr style="height: 24px;">
                <td style="border: 1px solid #000; padding: 4px 6px; font-weight: bold; vertical-align: middle;">5. Verificación Lingas por camión</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${rec.checklist.lingas_camion ? 'X' : ''}</td>
                <td style="border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0; font-weight: 900; font-size: 11px; font-family: Arial, sans-serif; line-height: 1;">${!rec.checklist.lingas_camion ? 'X' : ''}</td>
              </tr>
            </tbody>
          </table>

          <!-- Posiciones ocupadas -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 10px; font-size: 9px;">
            <tr style="height: 24px;">
              <td style="width: 50%; border: 1px solid #000; padding: 5px;"><strong>Posiciones ocupadas dentro del camión:</strong> <span style="font-family: monospace; font-weight: bold; font-size: 10.5px;">${rec.positions_occupied}</span></td>
              <td style="width: 50%; border: 1px solid #000; padding: 5px;"><strong>Alto de Bandejas:</strong> </td>
            </tr>
            <tr style="height: 24px;">
              <td colspan="2" style="border: 1px solid #000; padding: 5px;"><strong>Motivos del alto:</strong> </td>
            </tr>
          </table>

          <!-- Tabla principal de carga -->
          <div style="font-size: 10px; font-weight: 900; text-align: center; margin-top: 15px; margin-bottom: 5px; letter-spacing: 0.5px; text-transform: uppercase; font-family: sans-serif;">CARGA ADICIONAL ZONAL</div>
          <div style="display: flex; width: 100%; margin-bottom: 12px; gap: 0; box-sizing: border-box; align-items: stretch;">
            
            <!-- Tabla de Zonales (6 celdas por fila, ancho 86%) -->
            <table style="width: 86%; border-collapse: collapse; border: 2px solid #000; border-right: none; font-size: 9px; box-sizing: border-box; table-layout: fixed;">
              <thead>
                <tr style="background-color: #f3f4f6; font-weight: 900; text-align: center; font-size: 8px; height: 24px;">
                  <th style="border: 1px solid #000; padding: 4px; width: 6%;">N°</th>
                  <th style="border: 1px solid #000; padding: 4px; width: 34%; text-align: left;">ZONAL</th>
                  <th style="border: 1px solid #000; padding: 4px; width: 15%;">BANDEJAS</th>
                  <th style="border: 1px solid #000; padding: 4px; width: 15%;">PALLET MADERA</th>
                  <th style="border: 1px solid #000; padding: 4px; width: 15%;">PALLET PLÁSTICO</th>
                  <th style="border: 1px solid #000; padding: 4px; width: 15%;">N° DE SELLO</th>
                </tr>
              </thead>
              <tbody>
                ${rows.join('')}
              </tbody>
            </table>

            <!-- Cuadro de Temperaturas de Termos (ancho 14%, acoplado) -->
            <div style="width: 14%; border: 2px solid #000; display: flex; flex-direction: column; box-sizing: border-box; background-color: #fff;">
              <div style="background-color: #f3f4f6; border-bottom: 1px solid #000; padding: 4px; text-align: center; font-weight: 900; font-size: 7.5px; height: 24px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; line-height: 1.1;">
                TEMPERATURA TERMO / °C
              </div>
              
              <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; height: 140px; box-sizing: border-box;">
                
                <!-- 1ER -->
                <div style="display: flex; height: 33.3%; align-items: center; border-bottom: 1px solid #000; box-sizing: border-box;">
                  <div style="width: 45%; font-weight: bold; font-size: 7.5px; text-align: center; background-color: #f9f9f9; height: 100%; display: flex; align-items: center; justify-content: center; border-right: 1px solid #000;">1ER</div>
                  <div style="width: 55%; font-weight: bold; font-family: monospace; font-size: 10px; text-align: center;">${rec.temp_1er}°C</div>
                </div>
                
                <!-- 2DO -->
                <div style="display: flex; height: 33.3%; align-items: center; border-bottom: 1px solid #000; box-sizing: border-box;">
                  <div style="width: 45%; font-weight: bold; font-size: 7.5px; text-align: center; background-color: #f9f9f9; height: 100%; display: flex; align-items: center; justify-content: center; border-right: 1px solid #000;">2DO</div>
                  <div style="width: 55%; font-weight: bold; font-family: monospace; font-size: 10px; text-align: center;">${rec.temp_2do}°C</div>
                </div>
                
                <!-- 3ER -->
                <div style="display: flex; height: 33.3%; align-items: center; box-sizing: border-box;">
                  <div style="width: 45%; font-weight: bold; font-size: 7.5px; text-align: center; background-color: #f9f9f9; height: 100%; display: flex; align-items: center; justify-content: center; border-right: 1px solid #000;">3ER</div>
                  <div style="width: 55%; font-weight: bold; font-family: monospace; font-size: 10px; text-align: center;">${rec.temp_3er}°C</div>
                </div>

              </div>
            </div>

          </div>

          <!-- Observaciones y firmas -->
          <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; font-size: 9px;">
            <tr>
              <td colspan="2" style="border: 1px solid #000; padding: 6px; height: 35px; vertical-align: top; font-size: 8.5px;">
                <strong>OBSERVACIONES:</strong> <span style="font-weight: 600;">${rec.observations || ''}</span>
              </td>
            </tr>
            ${(() => {
              const zonalPhotos = rec.zonals_detail.flatMap(z => z.photos || []);
              const legacyPhotos = (rec.checklist as any)?.photos || [];
              const allPhotos = [...zonalPhotos, ...legacyPhotos];
              if (allPhotos.length === 0) return '';

              return `
                <tr>
                  <td colspan="2" style="border: 1px solid #000; padding: 6px; background-color: #fafafa;">
                    <strong style="font-size: 8px; text-transform: uppercase;">RESPALDOS FOTOGRÁFICOS (${allPhotos.length}):</strong>
                    <div style="display: flex; gap: 8px; margin-top: 5px; flex-wrap: wrap;">
                      ${allPhotos.map((pUrl: string) => `<img src="${pUrl}" style="height: 85px; width: auto; max-width: 45%; object-fit: cover; border: 1px solid #000; border-radius: 4px;" />`).join('')}
                    </div>
                  </td>
                </tr>
              `;
            })()}
            <tr>
              <td style="width: 55%; border: 1px solid #000; padding: 5px; vertical-align: top; height: 24px;">
                <strong>SUPERVISOR:</strong> <span style="font-weight: bold; text-transform: uppercase;">${rec.supervisor_name}</span>
              </td>
              <td rowspan="3" style="width: 45%; border: 1px solid #000; padding: 6px; text-align: center; vertical-align: middle; height: 80px; background-color: #fafafa;">
                <div style="font-size: 7.5px; color: #555; font-weight: bold; text-transform: uppercase; margin-bottom: 30px; letter-spacing: 0.5px;">Timbre y Firma</div>
                <div style="border-top: 1.5px dashed #000; width: 85%; margin: 0 auto;"></div>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 5px; height: 24px;">
                <strong>HORA CIERRE CAMIÓN:</strong> <span style="font-family: monospace; font-weight: bold; font-size: 10.5px;">${rec.close_time ? `${rec.close_time} hrs` : 'Pendiente'}</span>
              </td>
            </tr>
            <tr>
              <td style="border: 1px solid #000; padding: 5px; height: 24px;">
                <strong>HORA ENTREGA:</strong> <span style="font-family: monospace; font-weight: bold;">${rec.close_time || ''}</span>
              </td>
            </tr>
            <tr style="height: 24px;">
              <td colspan="2" style="border: 1px solid #000; padding: 5px; background-color: #fcfcfc;">
                <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 8.5px; text-transform: uppercase;">
                  <span>KILOS TOTALES DEL CAMIÓN: ___________________________</span>
                  <span style="font-family: monospace; padding-right: 10px;">TOTALES DESPACHO: M:${totalW} | P:${totalP} | B:${totalB}</span>
                </div>
              </td>
            </tr>
          </table>
          
          <div style="font-size: 7.5px; font-weight: bold; color: #666; text-align: center; margin-top: 15px; letter-spacing: 1px; text-transform: uppercase;">CONTROL UNIDADES LOGÍSTICAS — CIAL ALIMENTOS</div>
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

      // Capturar usando html2canvas puro
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 800
      });

      // Convertir el canvas resultante a Data URL (JPEG calidad 0.98)
      const imgData = canvas.toDataURL('image/jpeg', 0.98);

      // Crear documento jsPDF de página 'letter' en milímetros
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'letter'
      });

      // Dimensiones de hoja Letter: 215.9 x 279.4 mm
      const pageWidth = 215.9;
      const margin = 8;
      const printWidth = pageWidth - (margin * 2);
      const printHeight = (canvas.height * printWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', margin, margin, printWidth, printHeight);
      pdf.save(`Despacho_Camion_${rec.truck_plate || 'SinPatente'}_${rec.inspection_date}.pdf`);

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

    // Abrir modal de edición de despacho para Admin
  const openEditDispatchModal = (rec: DispatchRecord) => {
    setEditingDispatchRecord(rec);
    setEditingDate(rec.inspection_date || '');
    setEditingTime(rec.inspection_time || '');
    setEditingCloseTime(rec.close_time || '');
    setEditingTruckNumber(rec.truck_number !== 'N/A' ? rec.truck_number : '');
    setEditingTruckPlate(rec.truck_plate !== 'N/A' ? rec.truck_plate : '');
    setEditingSupervisorName(rec.supervisor_name || '');
    setEditingPositions(rec.positions_occupied || 26);
    setEditingTemp1er(rec.temp_1er ?? 0);
    setEditingTemp2do(rec.temp_2do ?? -18);
    setEditingTemp3er(rec.temp_3er ?? 0);
    setEditingZonalsDetail(JSON.parse(JSON.stringify(rec.zonals_detail || [])));
    setEditingObservations(rec.observations || '');
  };

  // Guardar edición completa de despacho
  const handleSaveEditDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDispatchRecord) return;
    setEditingSaveLoading(true);

    try {
      const { error } = await supabase
        .from('pallet_dispatches')
        .update({
          inspection_date: editingDate,
          inspection_time: editingTime,
          close_time: editingCloseTime || null,
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

  // Eliminar despacho (Solo Admin)
  const handleDeleteDispatch = async (rec: DispatchRecord) => {
    const confirmMsg = `¿Estás seguro de eliminar permanentemente el despacho de ${rec.supervisor_name} (Andén: ${rec.truck_number}, Patente: ${rec.truck_plate})?\n\nEsta acción recalculará inmediatamente los saldos de pallets.`;
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('pallet_dispatches')
        .delete()
        .eq('id', rec.id);

      if (error) throw error;

      setSuccessMsg('Despacho eliminado correctamente.');
      fetchHistory();
      fetchReturns();
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supervisorName) {
      alert("Por favor ingresa el nombre del Supervisor.");
      return;
    }
    if (selectedZonals.length === 0) {
      alert("Por favor agrega al menos un Zonal.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    
    // Formato manual de 24 horas robusto (HH:MM:SS) para evitar errores de timezone con localestring
    const pad = (num: number) => num.toString().padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    try {
      // Mapear zonales para concatenar el número de viaje/carga si es mayor que 1
      const formattedZonals = selectedZonals.map(sz => {
        const viajeNum = sz.viaje_numero || 1;
        return {
          ...sz,
          zonal_name: viajeNum > 1 ? `${sz.zonal_name} ${viajeNum}` : sz.zonal_name
        };
      });

      const { error } = await supabase
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
            photos: photos.length > 0 ? photos : undefined
          },
          zonals_detail: formattedZonals,
          observations: observations,
          completed_at: now.toISOString(),
          temp_1er: temp1er,
          temp_2do: temp2do,
          temp_3er: temp3er,
          close_time: closeTime || null
        }]);

      if (error) throw error;

      setSuccessMsg("¡Despacho registrado correctamente!");
      
      // Resetear borrador y formulario
      clearDraft(true);
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
              <h1 className="text-lg font-black tracking-wider leading-none">CONTROL DESPACHO</h1>
              <span className="text-[10px] text-emerald-300 font-bold tracking-widest uppercase">
                Control de Despacho Táctil
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
            onClick={() => { setActiveTab('zonales'); fetchReturns(); }}
            className={`flex-1 py-3 text-center text-sm font-bold border-b-2 transition-all cursor-pointer ${activeTab === 'zonales' ? 'border-brand-primary text-brand-primary bg-emerald-50/20' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            <span className="flex items-center justify-center gap-2">
              <Package className="w-4.5 h-4.5" />
              Saldos Zonales
            </span>
          </button>
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

        {activeTab === 'nuevo' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* INDICADOR DE AUTO-GUARDADO DE BORRADOR */}
            {hasRestoredDraft && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 px-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-950 flex-wrap">
                  <Save className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>💾 Borrador guardado automáticamente</span>
                  <span className="text-[10px] bg-emerald-200/60 text-emerald-900 px-2 py-0.5 rounded-md font-mono font-bold">
                    Protegido ante recargas o salida accidental
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => clearDraft(false)}
                  className="text-xs text-rose-600 hover:text-rose-800 font-extrabold hover:underline cursor-pointer flex items-center gap-1 shrink-0 ml-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Limpiar borrador
                </button>
              </div>
            )}
            
            {/* CARD 1: DATOS DEL SUPERVISOR Y CAMIÓN */}
            <section className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200/80 space-y-4">
              <h2 className="text-sm font-black text-brand-primary uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 pb-2.5">
                <User className="w-4.5 h-4.5" />
                1. Datos del Camión & Supervisor
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Supervisor (Autenticado)</label>
                  <input 
                    type="text" 
                    value={supervisorName} 
                    disabled
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 cursor-not-allowed select-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Patente (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Ej. DRCX-73" 
                    value={truckPlate} 
                    onChange={(e) => setTruckPlate(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Andén de Carga (Opcional)</label>
                  <input 
                    type="text" 
                    placeholder="Ej. Andén 4" 
                    value={truckNumber} 
                    onChange={(e) => setTruckNumber(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Hora Cierre (Opcional)</label>
                  <div className="flex gap-1.5 select-none">
                    <input 
                      type="time" 
                      value={closeTime} 
                      onChange={(e) => setCloseTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-mono font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const pad = (n: number) => n.toString().padStart(2, '0');
                        setCloseTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
                      }}
                      className="bg-brand-primary hover:bg-brand-secondary text-white px-2.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center"
                      title="Poner Hora Actual"
                    >
                      Ahora
                    </button>
                  </div>
                </div>
              </div>

              {/* TEMPERATURAS TERMO - A NIVEL DE CAMIÓN */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-slate-100 pt-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Temp. 1er Termo (ºC)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={temp1er}
                    onChange={(e) => setTemp1er(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono font-bold focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                  <div className="flex gap-2 mt-2 select-none">
                    <button
                      type="button"
                      onClick={() => setTemp1er(0)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border transition-all active:scale-95 cursor-pointer ${
                        temp1er === 0 
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-55'
                      }`}
                    >
                      Refri (0°C)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemp1er(-18)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border transition-all active:scale-95 cursor-pointer ${
                        temp1er === -18 
                          ? 'bg-sky-600 border-sky-600 text-white shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-55'
                      }`}
                    >
                      Congel (-18°C)
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Temp. 2do Termo (ºC)</label>
                  <input
                    type="number"
                    placeholder="-18"
                    value={temp2do}
                    onChange={(e) => setTemp2do(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono font-bold focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                  <div className="flex gap-2 mt-2 select-none">
                    <button
                      type="button"
                      onClick={() => setTemp2do(0)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border transition-all active:scale-95 cursor-pointer ${
                        temp2do === 0 
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-55'
                      }`}
                    >
                      Refri (0°C)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemp2do(-18)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border transition-all active:scale-95 cursor-pointer ${
                        temp2do === -18 
                          ? 'bg-sky-600 border-sky-600 text-white shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-55'
                      }`}
                    >
                      Congel (-18°C)
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Temp. 3er Termo (ºC)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={temp3er}
                    onChange={(e) => setTemp3er(parseInt(e.target.value) || 0)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-mono font-bold focus:outline-none focus:border-brand-primary focus:bg-white transition-all"
                  />
                  <div className="flex gap-2 mt-2 select-none">
                    <button
                      type="button"
                      onClick={() => setTemp3er(0)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border transition-all active:scale-95 cursor-pointer ${
                        temp3er === 0 
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-55'
                      }`}
                    >
                      Refri (0°C)
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemp3er(-18)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-black border transition-all active:scale-95 cursor-pointer ${
                        temp3er === -18 
                          ? 'bg-sky-600 border-sky-600 text-white shadow-sm' 
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-55'
                      }`}
                    >
                      Congel (-18°C)
                    </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                {/* Check list */}
                <div className="space-y-2">
                  <span className="block text-xs font-bold text-slate-500 uppercase">Check List de Inspección</span>
                  <div className="space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                    {[
                      { key: 'postura_anden', label: '1. Horario de postura en el Andén' },
                      { key: 'limpieza_estructura', label: '2. Estado camión (Limpieza, Sin daños)' },
                      { key: 'luces_encendidas', label: '3. Estado de Luces (ENCENDIDAS)' },
                      { key: 'separador_termico', label: '4. Verificación Separador Térmico' },
                      { key: 'lingas_camion', label: '5. Verificación Lingas por camión' }
                    ].map((item) => (
                      <label key={item.key} className="flex items-center justify-between text-xs font-bold text-slate-700 py-1 cursor-pointer select-none">
                        <span>{item.label}</span>
                        <input 
                          type="checkbox"
                          checked={(checklist as any)[item.key]}
                          onChange={(e) => setChecklist({ ...checklist, [item.key]: e.target.checked })}
                          className="w-5 h-5 rounded text-brand-primary focus:ring-brand-primary border-slate-300"
                        />
                      </label>
                    ))}
                  </div>
                </div>

                {/* Posiciones */}
                <div className="flex flex-col justify-between">
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase">Posiciones Ocupadas dentro del Camión</label>
                    <div className="flex items-center gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <button 
                        type="button"
                        onClick={() => setPositionsOccupied(Math.max(1, positionsOccupied - 1))}
                        className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg active:scale-95 transition-all shadow-sm cursor-pointer"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="flex-1 text-center">
                        <span className="text-3xl font-black text-brand-primary font-mono">{positionsOccupied}</span>
                        <span className="text-[10px] text-slate-400 block font-bold mt-0.5">POSICIONES</span>
                      </div>
                      <button 
                        type="button"
                        onClick={() => setPositionsOccupied(Math.min(30, positionsOccupied + 1))}
                        className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg active:scale-95 transition-all shadow-sm cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50 flex items-center gap-2 mt-2">
                    <Award className="w-4.5 h-4.5 text-brand-primary shrink-0" />
                    <span className="text-[11px] font-semibold text-slate-600">
                      Configuración táctil mobile-first para andenes de CIAL.
                    </span>
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
                                const catLabel = catName === 'congelados' ? 'CONGELADOS' : catName === 'estandar' ? 'ESTÁNDAR' : 'BANDEJAS';
                                const hasWoodValue = (catData.wood_bases || 0) > 0 || (catData.wood_extra || 0) > 0;
                                const isWoodVisible = catName === 'congelados' || hasWoodValue || !!showWoodMap[`${zonalIndex}_${catName}`];

                                return (
                                  <div 
                                    key={catName} 
                                    className="p-3.5 border border-slate-200/80 rounded-xl space-y-3.5 bg-slate-50/20"
                                  >
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                      <span className="text-xs font-black text-brand-primary tracking-wide">
                                        {catLabel}
                                      </span>
                                      {catName !== 'congelados' && !hasWoodValue && isWoodVisible && (
                                        <button
                                          type="button"
                                          onClick={() => toggleWoodShow(zonalIndex, catName)}
                                          className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                                        >
                                          Ocultar Madera X
                                        </button>
                                      )}
                                    </div>

                                    {/* CONTADORES DE PALLETS (TÁCTILES COMPACTOS EN EJE Y) */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                      
                                      {/* COLUMNA: PALLETS MADERA (CON OPCIÓN DE OCULTAR) */}
                                      {!isWoodVisible ? (
                                        <div className="bg-slate-100/60 border border-dashed border-slate-300 p-2.5 rounded-xl flex items-center justify-between text-xs">
                                          <span className="text-[10px] font-bold text-slate-400 uppercase">Pallet Madera (No usado)</span>
                                          <button
                                            type="button"
                                            onClick={() => toggleWoodShow(zonalIndex, catName)}
                                            className="text-[10px] font-extrabold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded-lg transition-all cursor-pointer flex items-center gap-1"
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
                                            <span className="text-[11px] font-black text-amber-950 font-mono bg-amber-100/50 px-1.5 py-0.5 rounded">
                                              {catData.wood_bases}+{catData.wood_extra} ({catData.wood_bases + catData.wood_extra})
                                            </span>
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

                                      {/* COLUMNA: PALLETS PLÁSTICOS */}
                                      <div className={`bg-emerald-50/20 border border-emerald-100 p-2.5 rounded-xl space-y-2 ${!isWoodVisible ? 'sm:col-span-2' : ''}`}>
                                        <div className="flex justify-between items-center select-none">
                                          <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                                            Pallet Plástico
                                          </span>
                                          <span className="text-[11px] font-black text-emerald-950 font-mono bg-emerald-100/50 px-1.5 py-0.5 rounded">
                                            {catData.plastic_bases}+{catData.plastic_extra} ({catData.plastic_bases + catData.plastic_extra})
                                          </span>
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
                                    </div>

                                    {/* Si es categoría BANDEJAS, agregar el contador de bandejas físicas */}
                                    {catName === 'bandejas' && (
                                      <div className="bg-slate-100/50 p-3 rounded-lg border border-slate-200/50 space-y-2">
                                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-slate-500 uppercase">Cantidad de Bandejas:</span>
                                            <span className="text-lg font-black text-brand-primary font-mono bg-white px-3 py-1 rounded border">
                                              {catData.bandejas_count || 0}
                                            </span>
                                          </div>

                                          <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateCategory(zonalIndex, 'bandejas', 'bandejas_count', (catData.bandejas_count || 0) + 1)}
                                              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold cursor-pointer"
                                            >
                                              +1
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateCategory(zonalIndex, 'bandejas', 'bandejas_count', (catData.bandejas_count || 0) + 10)}
                                              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold cursor-pointer"
                                            >
                                              +10
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateCategory(zonalIndex, 'bandejas', 'bandejas_count', (catData.bandejas_count || 0) + 40)}
                                              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold cursor-pointer"
                                            >
                                              +40
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateCategory(zonalIndex, 'bandejas', 'bandejas_count', Math.max(0, (catData.bandejas_count || 0) - 10))}
                                              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold cursor-pointer"
                                            >
                                              -10
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleUpdateCategory(zonalIndex, 'bandejas', 'bandejas_count', Math.max(0, (catData.bandejas_count || 0) - 1))}
                                              className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2 py-1 rounded text-xs font-bold cursor-pointer"
                                            >
                                              -1
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => openBandejasHelper(zonalIndex)}
                                              className="bg-brand-primary hover:bg-brand-secondary text-white px-2.5 py-1 rounded text-xs font-bold cursor-pointer transition-all shadow-sm"
                                            >
                                              Asistente
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
                                    Fotos de Respaldo Zonal ({(zonal.photos || []).length}/4)
                                  </label>
                                  {(!zonal.photos || zonal.photos.length < 4) && (
                                    <label className="bg-white hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-200 shadow-sm active:scale-95">
                                      <Camera className="w-4 h-4 text-brand-primary" />
                                      Adjuntar / Tomar Foto
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        capture="environment"
                                        className="hidden"
                                        onChange={(e) => handleAddZonalPhoto(zonalIndex, e.target.files)}
                                      />
                                    </label>
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
                                        onClick={() => setPreviewPhoto(imgSrc)}
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
              <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2 border-b border-white/10 pb-2.5">
                <ShieldCheck className="w-5 h-5" />
                Resumen de Carga del Camión
              </h2>

              <div className="grid grid-cols-3 gap-4 text-center py-2">
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Pallets Madera</span>
                  <span className="text-2xl font-mono font-black text-amber-400 mt-1 block">{totals.wood}</span>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Pallets Plástico</span>
                  <span className="text-2xl font-mono font-black text-emerald-400 mt-1 block">{totals.plastic}</span>
                </div>
                <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Bandejas Totales</span>
                  <span className="text-2xl font-mono font-black text-white mt-1 block">{totals.bandejas}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                <div className="flex-1 text-xs text-slate-400 font-semibold">
                  Al presionar <span className="text-emerald-400 font-bold">"Confirmar Despacho"</span>, se registrarán las firmas, las temperaturas de los termos y la sumatoria oficial en Supabase.
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto bg-brand-emerald hover:bg-emerald-600 text-white px-8 py-4 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      CONFIRMAR DESPACHO
                    </>
                  )}
                </button>
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

              <div className="flex items-center gap-2">
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
                </div>

                <button 
                  onClick={fetchHistory}
                  className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-all active:scale-95 text-slate-600 cursor-pointer shadow-sm"
                  title="Actualizar Historial"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* VISTA 1: POR CAMIONES (Tarjeta tradicional) */}
            {historySubTab === 'camiones' && (
              records.length === 0 ? (
                <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-400">Aún no se han registrado despachos en este día.</p>
                </div>
              ) : (
                <div className="space-y-4">
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
                                Andén: {rec.truck_number !== 'N/A' ? rec.truck_number : 'S/A'} 
                                {rec.truck_plate !== 'N/A' && ` | Patente: ${rec.truck_plate}`}
                              </span>
                            </div>

                            {/* Badges de Termos y Hora de Cierre */}
                            <div className="flex items-center gap-2 flex-wrap pt-0.5">
                              <div className="text-[10px] text-slate-600 font-bold font-mono bg-slate-50 border border-slate-200/70 px-2 py-0.5 rounded-md">
                                Termos: 1er: {rec.temp_1er}°C | 2do: {rec.temp_2do}°C | 3er: {rec.temp_3er}°C
                              </div>

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
                                    <button
                                      type="button"
                                      onClick={() => setEditingCloseTimes(prev => ({ ...prev, [rec.id]: rec.close_time || '' }))}
                                      className="text-slate-400 hover:text-brand-primary p-0.5 cursor-pointer"
                                      title="Editar Hora de Cierre"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
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
                              {z.zonal_name} {z.viaje_numero && z.viaje_numero > 1 ? `#${z.viaje_numero}` : ''}
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

                          {/* Botones de Acción */}
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              disabled={generatingPdfId === rec.id}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDownloadPDF(rec);
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border border-emerald-600 bg-brand-emerald text-white flex items-center gap-1 hover:bg-emerald-600 disabled:opacity-60"
                            >
                              {generatingPdfId === rec.id ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <FileDown className="w-3.5 h-3.5" />
                              )}
                              PDF
                            </button>

                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditDispatchModal(rec)}
                                  className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border border-amber-500 bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1"
                                  title="Editar Despacho (Solo Admin)"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  EDITAR
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDispatch(rec)}
                                  className="px-3 py-1.5 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm border border-rose-600 bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-1"
                                  title="Eliminar Despacho (Solo Admin)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  ELIMINAR
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => setExpandedRecords(prev => ({ ...prev, [rec.id]: !prev[rec.id] }))}
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
                                                  onClick={() => setPreviewPhoto(pUrl)}
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
                                            onClick={() => setPreviewPhoto(pUrl)}
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
                </div>
              )
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

                  return {
                    id: `${rec.id}-${z.zonal_name}-${z.viaje_numero || 1}`,
                    dispatchId: rec.id,
                    date: rec.inspection_date,
                    time: rec.inspection_time,
                    truckNumber: rec.truck_number,
                    truckPlate: rec.truck_plate,
                    supervisor: rec.supervisor_name,
                    zonalName: z.zonal_name,
                    viajeNumero: z.viaje_numero || 1,
                    lugarCamion: z.lugar_camion,
                    wood,
                    plastic,
                    bandejas,
                    sello: z.sello || '-'
                  };
                });
              });

              // Aplicar filtro si existe
              const filteredRows = historyZonalFilter === 'ALL' 
                ? allZonalRows 
                : allZonalRows.filter(r => r.zonalName === historyZonalFilter);

              // Totales agregados para el reporte filtrado
              const reportTotals = filteredRows.reduce(
                (acc, r) => ({
                  wood: acc.wood + r.wood,
                  plastic: acc.plastic + r.plastic,
                  bandejas: acc.bandejas + r.bandejas
                }),
                { wood: 0, plastic: 0, bandejas: 0 }
              );

              // Lista de zonales únicos para el selector
              const uniqueZonals = Array.from(new Set(allZonalRows.map(r => r.zonalName))).sort();

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
                        {uniqueZonals.map(z => (
                          <option key={z} value={z}>{z}</option>
                        ))}
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
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                            {filteredRows.map((row) => (
                              <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="p-3.5 font-mono text-[11px] whitespace-nowrap">
                                  <div>{getFormatDate(row.date)}</div>
                                  <div className="text-[10px] text-slate-400 font-normal">{row.time} hrs</div>
                                </td>

                                <td className="p-3.5">
                                  <div className="font-bold text-slate-800 uppercase text-xs">
                                    {row.zonalName} {row.viajeNumero > 1 ? `(${row.viajeNumero})` : ''}
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
                                  <div className="font-bold text-slate-700">Andén {row.truckNumber}</div>
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
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'zonales' && (
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

            {/* LISTA DE SALDOS POR ZONAL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ZONALES_LIST.map((zonalName) => {
                const bal = balances[zonalName] || { wood_sent: 0, plastic_sent: 0, wood_ret: 0, plastic_ret: 0 };
                const woodSaldo = bal.wood_sent - bal.wood_ret;
                const plasticSaldo = bal.plastic_sent - bal.plastic_ret;

                // Solo renderizar zonales que tengan algún movimiento (enviado o retornado)
                // o mostrar todos. Mostremos todos pero destacando los que tienen saldos activos
                const hasBalance = woodSaldo > 0 || plasticSaldo > 0;

                return (
                  <div 
                    key={zonalName} 
                    className={`bg-white border rounded-2xl p-4 shadow-sm flex flex-col justify-between gap-3 transition-all ${hasBalance ? 'border-brand-primary bg-emerald-50/5' : 'border-slate-200 opacity-75 hover:opacity-100'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-black text-sm text-slate-800">{zonalName}</h3>
                        <span className="text-[10px] text-slate-400 font-bold block mt-0.5 uppercase">Región / Zonal</span>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${hasBalance ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                        {hasBalance ? 'Saldo Activo' : 'Sin Pallets'}
                      </span>
                    </div>

                    {/* Fila de saldos */}
                    <div className="grid grid-cols-2 gap-2 text-center py-1">
                      {/* Madera */}
                      <div className="bg-amber-50/30 p-2.5 rounded-xl border border-amber-100/50">
                        <span className="text-[9px] text-amber-800 font-bold block uppercase">Madera Neto</span>
                        <span className="text-lg font-mono font-black text-amber-900 mt-0.5 block">
                          {woodSaldo} <span className="text-[10px] text-amber-600 font-normal">({bal.wood_sent} - {bal.wood_ret})</span>
                        </span>
                      </div>
                      
                      {/* Plastico */}
                      <div className="bg-emerald-50/30 p-2.5 rounded-xl border border-emerald-100/50">
                        <span className="text-[9px] text-emerald-800 font-bold block uppercase">Plástico Neto</span>
                        <span className="text-lg font-mono font-black text-emerald-900 mt-0.5 block">
                          {plasticSaldo} <span className="text-[10px] text-emerald-600 font-normal">({bal.plastic_sent} - {bal.plastic_ret})</span>
                        </span>
                      </div>
                    </div>

                    {/* Botón táctil para retornar */}
                    <button
                      type="button"
                      onClick={() => {
                        setShowReturnModal(zonalName);
                        setReturnSupervisor(formatSupervisorName(user?.email));
                        setReturnWood(0);
                        setReturnPlastic(0);
                      }}
                      className="w-full bg-brand-primary hover:bg-brand-secondary text-white py-2 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      REGISTRAR RETORNO CD
                    </button>

                  </div>
                );
              })}
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
              Ingresa la cantidad de pallets según la cantidad de bandejas por pallet (40, 35, 30, 25, 20) y agrega las bandejas sueltas o restantes.
            </p>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
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
              if (helper40 > 0) parts.push(`40x${helper40}`);
              if (helper35 > 0) parts.push(`35x${helper35}`);
              if (helper30 > 0) parts.push(`30x${helper30}`);
              if (helper25 > 0) parts.push(`25x${helper25}`);
              if (helper20 > 0) parts.push(`20x${helper20}`);
              if (helperRestante > 0) parts.push(`restante ${helperRestante}`);
              const formulaText = parts.length > 0 ? parts.join(' + ') : 'Sin bandejas';
              const totalB = (helper40 * 40) + (helper35 * 35) + (helper30 * 30) + (helper25 * 25) + (helper20 * 20) + helperRestante;

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
                  <p className="text-xs text-amber-700 font-bold">Modo Administrador — Edición Directa</p>
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

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
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
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Andén de Carga</label>
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
                      max={30}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Temp. 1er Termo</label>
                    <input 
                      type="number" 
                      value={editingTemp1er}
                      onChange={(e) => setEditingTemp1er(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Temp. 2do Termo</label>
                    <input 
                      type="number" 
                      value={editingTemp2do}
                      onChange={(e) => setEditingTemp2do(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Temp. 3er Termo</label>
                    <input 
                      type="number" 
                      value={editingTemp3er}
                      onChange={(e) => setEditingTemp3er(Number(e.target.value))}
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

      {/* MODAL DE VISTA PREVIA DE FOTO EN TAMAÑO COMPLETO */}
      {previewPhoto && (
        <div 
          className="fixed inset-0 z-[999999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in cursor-pointer select-none"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img 
              src={previewPhoto} 
              alt="Respaldo ampliado" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20"
            />
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-3 -right-3 bg-rose-600 hover:bg-rose-700 text-white p-2.5 rounded-full shadow-2xl cursor-pointer transition-all active:scale-95 border-2 border-white"
              title="Cerrar vista previa"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="bg-slate-100 border-t border-slate-200 text-slate-400 py-4 text-center text-[10px] font-semibold uppercase tracking-wider shrink-0 mt-auto">
        CIAL Alimentos — Control Despacho v1.1.0 (2026)
      </footer>

    </div>
  );
}
