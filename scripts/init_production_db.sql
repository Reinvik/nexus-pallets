-- ==============================================================================
-- NEXUS PALLETS - SCRIPT DDL DE INICIALIZACIÓN DE PRODUCCIÓN
-- Cumplimiento CIS Control 16.8 (Separación Limpia de Staging y Producción)
-- Base de Datos Destino: Supabase Prod (qtzpzgwyjptbnipvyjdu)
-- ==============================================================================

-- 1. TABLA: pallet_users (Usuarios y Roles de Control)
CREATE TABLE IF NOT EXISTS public.pallet_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'administrativo'::TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT DEFAULT ''::TEXT,
    signature_b64 TEXT DEFAULT NULL,
    can_sign BOOLEAN DEFAULT true,
    must_change_password BOOLEAN DEFAULT true,
    password_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT pallet_users_role_check CHECK (
        role = ANY (ARRAY['admin'::text, 'jefe_turno'::text, 'supervisor'::text, 'usuario'::text, 'facturador'::text, 'administrativo'::text])
    )
);

CREATE INDEX IF NOT EXISTS idx_pallet_users_email ON public.pallet_users (email);

-- 2. TABLA: pallet_dispatches (Registro Principal de Despachos de Camiones)
CREATE TABLE IF NOT EXISTS public.pallet_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    truck_number TEXT,
    truck_plate TEXT,
    supervisor_name TEXT NOT NULL,
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    inspection_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT (CURRENT_TIME AT TIME ZONE 'America/Santiago'::text),
    positions_occupied INTEGER,
    checklist JSONB NOT NULL DEFAULT '{}'::JSONB,
    zonals_detail JSONB NOT NULL DEFAULT '[]'::JSONB,
    observations TEXT,
    temp_1er INTEGER DEFAULT 0,
    temp_2do INTEGER DEFAULT -18,
    temp_3er INTEGER DEFAULT 0,
    close_time TEXT,
    truck_kilos TEXT,
    anden_number TEXT,
    signed_by TEXT,
    signed_at TIMESTAMP WITH TIME ZONE,
    signature_b64 TEXT,
    signed_by_title TEXT,
    checklist_summary JSONB,
    zonals_summary JSONB,
    created_by TEXT,
    shared_with TEXT,
    shared_with_name TEXT,
    shift_handover_at TIMESTAMP WITH TIME ZONE,
    photo_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pallet_dispatches_date ON public.pallet_dispatches (inspection_date);
CREATE INDEX IF NOT EXISTS idx_pallet_dispatches_truck ON public.pallet_dispatches (truck_number);
CREATE INDEX IF NOT EXISTS idx_pallet_dispatches_created_by ON public.pallet_dispatches (created_by);

-- 3. TABLA: pallet_returns (Bitácora de Retornos de Pallets desde Zonales)
CREATE TABLE IF NOT EXISTS public.pallet_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zonal_name TEXT NOT NULL,
    wood_returned INTEGER NOT NULL DEFAULT 0,
    plastic_returned INTEGER NOT NULL DEFAULT 0,
    supervisor_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pallet_returns_zonal ON public.pallet_returns (zonal_name);
CREATE INDEX IF NOT EXISTS idx_pallet_returns_created_at ON public.pallet_returns (created_at);

-- 4. HABILITACIÓN DE RLS Y POLÍTICAS DE ACCESO
ALTER TABLE public.pallet_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pallet_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pallet_returns ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso para clave pública / anónima autorizada
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pallet_users' AND policyname = 'pallet_users_all') THEN
        CREATE POLICY pallet_users_all ON public.pallet_users FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pallet_dispatches' AND policyname = 'pallet_dispatches_all') THEN
        CREATE POLICY pallet_dispatches_all ON public.pallet_dispatches FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pallet_returns' AND policyname = 'pallet_returns_all') THEN
        CREATE POLICY pallet_returns_all ON public.pallet_returns FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;
