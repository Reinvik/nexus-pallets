# 🔒 CHECKLIST DE CODIFICACIÓN SEGURA Y MAPEO OWASP TOP 10
**Sistema:** Control Outbound CIAL (Nexus Pallets)  
**Versión:** 1.2.0  
**Fecha:** Octubre 2026  
**Estándares:** OWASP Top 10 Web Application Security Risks, NIST SSDF v1.1

---

## 1. Mapeo Exhaustivo contra OWASP Top 10

| Categoría OWASP | Riesgo Potencial | Mitigación Implementada en Nexus Outbound | Estado |
|---|---|---|:---:|
| **A01: Broken Access Control (Control de Acceso Roto)** | Usuarios no autorizados modificando registros ajenos, saltándose roles o alterando históricos de días anteriores. | • Políticas de **Row Level Security (RLS)** activas en PostgreSQL.<br/>• Matriz **RBAC** dinámica que restringe la creación/edición a supervisores y jefes de turno.<br/>• Rol `administrativo` estrictamente en solo lectura.<br/>• Edición histórica (días anteriores) bloqueada en backend y frontend exclusivamente para rol `admin`. | ✅ **CUMPLIDO** |
| **A02: Cryptographic Failures (Fallas Criptográficas)** | Exposición de credenciales, contraseñas débiles o transmisión de datos en texto plano. | • Cifrado en tránsito forzado bajo **TLS 1.3 / HTTPS** (AES-256).<br/>• Almacenamiento de contraseñas con **bcrypt / Argon2** (Supabase Auth). Cero almacenamiento en texto claro.<br/>• Ningún secreto, token o clave privada se encuentra versionada en el código fuente (se utilizan variables de entorno `.env`). | ✅ **CUMPLIDO** |
| **A03: Injection (Inyección SQL / XSS)** | Inyección de código malicioso en campos de búsqueda, números de camión o patentes. | • **SQL Injection:** Eliminado por diseño. Se utiliza el cliente oficial de Supabase (PostgREST) que ejecuta consultas 100% parametrizadas.<br/>• **Cross-Site Scripting (XSS):** React 19 escapa por defecto todos los valores en el DOM. Adicionalmente, se incluye `DOMPurify` para cualquier contenido HTML sanitizado. | ✅ **CUMPLIDO** |
| **A04: Insecure Design (Diseño Inseguro)** | Fallas de lógica de negocio, ausencia de validaciones de temperatura o sobrecarga de pallets. | • Módulo centralizado de reglas de negocio (`src/utils/calculations.ts`).<br/>• Validación automática de rangos de temperatura frigorífica CIAL (-18°C congelados).<br/>• Validación de capacidades máximas de pallets y posiciones por andén.<br/>• Suite de pruebas unitarias automatizadas (`npm test`) validando cálculos críticos. | ✅ **CUMPLIDO** |
| **A05: Security Misconfiguration (Configuración Errónea de Seguridad)** | Despliegue con llaves de prueba en producción, cabeceras inseguras o servicios de depuración expuestos. | • Separación formal de entornos: Staging (`.env.staging`) vs Producción (`.env.production`) bajo CIS Control 16.8.<br/>• Desactivación de consolas y paneles de depuración en compilaciones de producción.<br/>• Cabeceras de seguridad HTTP gestionadas por Vercel Edge. | ✅ **CUMPLIDO** |
| **A06: Vulnerable and Outdated Components (Componentes Vulnerables y Obsoletos)** | Dependencias npm desactualizadas con vulnerabilidades conocidas (CVEs). | • Dependencias fijadas con `package-lock.json`.<br/>• Auditoría automática mediante `npm audit`: **0 vulnerabilidades detectadas**.<br/>• Inventario formal de componentes (SBOM) generado bajo estándar SPDX/CycloneDX. | ✅ **CUMPLIDO** |
| **A07: Identification and Authentication Failures (Fallas de Identificación y Autenticación)** | Ataques de fuerza bruta, sesiones desatendidas o contraseñas perpetuas. | • Restricción de registro exclusivamente a cuentas corporativas con dominio `@cial.cl`.<br/>• **Cierre automático de sesión por inactividad a los 15 minutos** con advertencia visual (CIS Control 16).<br/>• Mecanismo de expiración y forzado de cambio de clave alfanumérica por política de seguridad CIAL. | ✅ **CUMPLIDO** |
| **A08: Software and Data Integrity Failures (Fallas de Integridad de Software y Datos)** | Inyección de dependencias maliciosas en el pipeline de build o alteración de despachos firmados. | • Inmutabilidad de despachos: si un despacho firmado se modifica, la firma digital anterior se anula automáticamente exigiendo nueva validación.<br/>• Verificación de hashes criptográficos de dependencias en npm y build inmutable en Vercel. | ✅ **CUMPLIDO** |
| **A09: Security Logging and Monitoring Failures (Fallas de Registro y Monitoreo)** | Imposibilidad de determinar quién modificó un despacho o cuándo se retiró un camión. | • Registro de autoría en cada despacho (`created_by`, `supervisor_name`, `created_at`, `completed_at`).<br/>• Registro de traspaso de turno (`shared_with`, `shared_with_name`, `shift_handover_at`).<br/>• Registro de firma digital con timestamp y cargo (`signed_by`, `signed_at`, `signed_by_title`).<br/>• Bitácora histórica inmutable de retornos de pallets y justificación de atrasos. | ✅ **CUMPLIDO** |
| **A10: Server-Side Request Forgery (SSRF)** | Peticiones maliciosas enviadas por el servidor hacia recursos internos. | • **No aplicable / Mitigado:** La aplicación es una Single Page Application (SPA) que se ejecuta en el navegador del cliente; no dispone de servidores backend intermedios que realicen peticiones ciegas hacia redes internas corporativas. | ✅ **CUMPLIDO** |

---

## 2. Checklist de Buenas Prácticas de Codificación Segura

- [x] **Validación de Entradas:** Todas las entradas de usuario se validan antes de impactar el estado o la base de datos (longitud de patente, números enteros para pallets, rangos de temperatura).
- [x] **Manejo Seguro de Errores:** Errores capturados con bloques `try/catch`. La aplicación nunca expone cadenas de conexión, contraseñas ni detalles de bajo nivel en mensajes de usuario.
- [x] **Eliminación de llamadas nativas de bloqueo:** Sustitución de `window.alert()` y `window.confirm()` por modales corporativos Tailwind que no interrumpen el hilo de ejecución del navegador.
- [x] **Sanitización de Datos de Salida:** Uso de bibliotecas de renderizado seguro para exportación en PDF (`jsPDF`, `html2canvas`) asegurando que ningún código ejecutable se inyecte en documentos generados.
