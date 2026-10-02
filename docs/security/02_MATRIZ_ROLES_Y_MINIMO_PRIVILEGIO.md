# 🛡️ MATRIZ DE ROLES Y PRINCIPIO DE MÍNIMO PRIVILEGIO (RBAC)
**Sistema:** Control Outbound CIAL (Nexus Pallets)  
**Versión:** 1.2.0  
**Fecha:** Octubre 2026  
**Estándares de Referencia:** CIS Control 16 (Application Software Security), ISO/IEC 27001 (Control A.9: Control de Acceso)

---

## 1. Definición y Jerarquía de Roles

El acceso a la aplicación **Control Outbound** está gobernado por un modelo de Control de Acceso Basado en Roles (**RBAC**) implementado en la tabla `pallet_users` de PostgreSQL y verificado tanto en la interfaz de usuario como en las políticas de seguridad de la base de datos (RLS):

```
       ┌───────────────────────────────┐
       │     🔴 admin (Control Total)   │
       └───────────────┬───────────────┘
                       │
       ┌───────────────▼───────────────┐
       │   🟡 jefe_turno (Validación)  │
       └───────────────┬───────────────┘
                       │
       ┌───────────────▼───────────────┐
       │   🟢 supervisor (Operación)   │
       └───────────────┬───────────────┘
                       │
       ┌───────────────▼───────────────┐
       │ 🔵 administrativo (Consulta)  │
       └───────────────────────────────┘
```

1. **🔴 Administrador (`admin`):**
   * Destinado a la administración del sistema y soporte TI (Ariel Mella / Informática).
   * Puede gestionar usuarios (altas, bajas, asignación de roles, reinicio de contraseñas).
   * Autorización exclusiva para modificar o eliminar registros históricos y despachos firmados.
   * Gestión de almacenamiento y purga de imágenes de evidencia antiguas (>30 días).
2. **🟡 Jefe de Turno (`jefe_turno`):**
   * Responsable de la supervisión global del andén y la operación en su turno de trabajo.
   * Autoriza y firma digitalmente los despachos de camiones completados.
   * Puede editar despachos del día en curso ante ajustes de última hora.
   * Acceso completo a indicadores de cumplimiento (KPI Salidas a Tiempo) y Bitácora de Atrasos.
3. **🟢 Supervisor de Despacho (`supervisor`):**
   * Personal de terreno en andén que inspecciona el camión y registra la carga de pallets.
   * Puede crear nuevos despachos de camión y borradores en curso.
   * Puede editar sus propios despachos creados durante la jornada de hoy (horario oficial de Chile).
   * Traspasar la edición de un camión a otro supervisor mediante la función *Cambio de Turno*.
   * Registrar retornos de pallets vacíos provenientes de zonales al CD.
4. **🔵 Administrativo (`administrativo`):**
   * Personal de facturación, control de inventario o soporte administrativo.
   * **Modo Estricto Solo Lectura:** Puede consultar el historial, buscar por patente o fecha, ver detalles de zonales y exportar minutas o reportes.
   * **Restricción:** No tiene botones de creación de despacho, no puede editar registros, no tiene permiso de firma manuscrita y no puede registrar retornos de pallets.

---

## 2. Matriz CRUD de Permisos por Entidad

| Módulo / Entidad | Rol: `administrativo` | Rol: `supervisor` | Rol: `jefe_turno` | Rol: `admin` |
|---|:---:|:---:|:---:|:---:|
| **Crear Despacho de Camión** | ❌ Denegado | ✅ Permitido | ✅ Permitido | ✅ Permitido |
| **Editar Despacho Propio (Hoy)** | ❌ Denegado | ✅ Permitido | ✅ Permitido | ✅ Permitido |
| **Editar Despacho Ajeno (Hoy)** | ❌ Denegado | ⚠️ Solo vía Cambio de Turno | ✅ Permitido | ✅ Permitido |
| **Editar Despacho Histórico (Días anteriores)** | ❌ Denegado | ❌ Denegado | ❌ Denegado | ✅ Autorizado |
| **Firmar Digitalmente Despacho** | ❌ Sin permiso | ⚠️ Solo si `can_sign=true` | ✅ Permitido | ✅ Permitido |
| **Eliminar Despacho sin Firma** | ❌ Denegado | ✅ Solo Creador (Hoy) | ✅ Permitido | ✅ Permitido |
| **Eliminar Despacho Firmado** | ❌ Denegado | ❌ Denegado | ❌ Denegado | ✅ Autorizado |
| **Registrar Retorno de Pallets al CD** | ❌ Denegado | ✅ Permitido | ✅ Permitido | ✅ Permitido |
| **Visualizar Historial y Saldos Zonales** | ✅ Permitido | ✅ Permitido | ✅ Permitido | ✅ Permitido |
| **Registrar Justificación en Bitácora Atrasos**| ❌ Denegado | ✅ Permitido | ✅ Permitido | ✅ Permitido |
| **Administración de Usuarios (Crear/Aprobar/Editar)** | ❌ Denegado | ❌ Denegado | ❌ Denegado | ✅ Exclusivo |
| **Forzar Cambio de Contraseñas de Usuarios** | ❌ Denegado | ❌ Denegado | ❌ Denegado | ✅ Exclusivo |
| **Depuración de Fotos Antiguas (>30 días)** | ❌ Denegado | ❌ Denegado | ❌ Denegado | ✅ Exclusivo |

---

## 3. Mecanismos de Aplicación de Mínimo Privilegio

### A. Segregación a Nivel de Base de Datos (PostgreSQL / Supabase)
1. **Restricción de Integridad de Roles:**
   ```sql
   CONSTRAINT pallet_users_role_check CHECK (
       role = ANY (ARRAY['admin'::text, 'jefe_turno'::text, 'supervisor'::text, 'usuario'::text, 'facturador'::text, 'administrativo'::text])
   )
   ```
2. **Rol por Defecto:**
   Toda nueva cuenta auto-registrada con correo `@cial.cl` recibe por defecto el rol más restrictivo: `'administrativo'`, con `can_sign = false` y `is_active = true` (o pendiente de aprobación por el Administrador).
3. **Anulación Automática de Firmas ante Modificaciones:**
   Si un despacho ya firmado es editado posteriormente por un supervisor autorizado, el sistema anula inmediatamente la firma digital previa y obliga a una re-validación por el Jefe de Turno, garantizando la inmutabilidad de los despachos despachados.

### B. Segregación en Interfaz de Usuario (UI)
* En la barra de navegación superior, los usuarios con rol `administrativo` no ven la pestaña *"Despacho Camión"*, evitando exposición de formularios interactivos.
* Si un usuario de solo lectura intenta ingresar forzando la ruta o el estado, se despliega una tarjeta de bloqueo estilizada informando:
  > *"Rol Administrativo (Solo Lectura) — Tu cuenta está configurada en modo consulta. Para registrar o editar despachos de camiones, solicita permisos de Supervisor a tu jefatura."*
