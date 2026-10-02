# 📦 INVENTARIO DE COMPONENTES DE TERCEROS (SBOM)
**Sistema:** Control Outbound CIAL (Nexus Pallets)  
**Versión:** 1.2.0  
**Fecha de Generación:** Octubre 2026  
**Formato Estándar:** CycloneDX v1.5 / SPDX compatible (Archivo JSON: `docs/security/sbom.cyclonedx.json`)  
**Cumplimiento:** CIS Control 16 (Inventario de Componentes y Gestión de Vulnerabilidades)

---

## 1. Resumen Ejecutivo de Dependencias

* **Total de Componentes Directos:** 18
* **Dependencias de Producción:** 10
* **Dependencias de Desarrollo y Pruebas:** 8
* **Estado de Vulnerabilidades (`npm audit`):** **0 vulnerabilidades detectadas (Clean)**.
* **Licenciamiento:** 100% licencias permisivas de código abierto (MIT, ISC, Apache-2.0). Cero licencias restrictivas Copyleft (GPL) que comprometan la propiedad intelectual de CIAL Alimentos.

---

## 2. Inventario de Dependencias de Producción (Runtime)

| Componente | Versión Exacta | Licencia | Propósito en la Solución | Justificación de Seguridad |
|---|---|---|---|---|
| **`react`** | 19.2.7 | MIT | Motor de interfaz de usuario reactiva. | Versión oficial LTS con mantenimiento activo por Meta y comunidad global. |
| **`react-dom`** | 19.2.7 | MIT | Renderizado en DOM con prevención nativa de XSS. | Previene inyección de scripts escapando valores dinámicos. |
| **`@supabase/supabase-js`** | 2.110.7 | MIT | Cliente oficial de base de datos, autenticación y storage. | Manejo seguro de JWT, consultas parametrizadas contra PostgREST y TLS 1.3. |
| **`tailwindcss`** | 4.3.3 | MIT | Framework de diseño corporativo y estilos CSS. | Compilación CSS pura sin dependencias en tiempo de ejecución. |
| **`@tailwindcss/postcss`** | 4.3.3 | MIT | Integración de procesamiento de estilos Tailwind. | Herramienta de compilación estática. |
| **`postcss`** | 8.5.19 | MIT | Procesador de hojas de estilo CSS. | Mantenimiento activo y seguro. |
| **`lucide-react`** | 1.24.0 | ISC | Iconografía corporativa (SVG puros). | No ejecuta scripts; únicamente renderiza iconos SVG puros. |
| **`jspdf`** | 4.2.1 | MIT | Generador cliente de reportes y minutas de despacho en PDF. | Procesamiento 100% en el navegador sin intermediarios de red. |
| **`html2canvas`** | 1.4.1 | MIT | Renderizado de firmas y evidencias visuales a imagen. | No envía datos al exterior; ejecución estricta en el sandbox del navegador. |
| **`pg`** | 8.22.0 | MIT | Driver PostgreSQL para scripts de migración y soporte backend. | Cliente estándar de la industria para conexiones SQL parametrizadas. |

---

## 3. Inventario de Dependencias de Desarrollo y Pruebas

| Componente | Versión Exacta | Licencia | Propósito |
|---|---|---|---|
| **`typescript`** | ~6.0.2 | Apache-2.0 | Tipado estático estricto para prevenir errores de tipo en tiempo de compilación. |
| **`vite`** | 8.1.1 | MIT | Empaquetador y servidor de desarrollo ultra-rápido. |
| **`vitest`** | 5.0.3 | MIT | Suite de pruebas unitarias automatizadas para CIS Control 16.12. |
| **`@vitejs/plugin-react`** | 6.0.3 | MIT | Plugin oficial de integración React-Vite. |
| **`oxlint`** | 1.71.0 | MIT | Linter estático de código de alto rendimiento. |
| **`@types/node`** | 24.13.2 | MIT | Tipos TypeScript para entorno de ejecución Node.js. |
| **`@types/react`** | 19.2.17 | MIT | Definiciones de tipos oficiales para React 19. |
| **`@types/react-dom`** | 19.2.3 | MIT | Definiciones de tipos oficiales para React DOM. |

---

## 4. Comando de Auditoría y Regeneración Continua

Para regenerar el archivo formal JSON del SBOM ante cualquier cambio de librerías, ejecute:

```bash
npm run sbom
```

Para verificar vulnerabilidades conocidas en la base de datos de seguridad de npm:

```bash
npm audit
```
