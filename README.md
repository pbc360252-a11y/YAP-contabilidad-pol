# YAP — Sistema de Créditos por Libranza

Sistema de gestión de préstamos descontados por nómina, construido para el equipo de **Contabilidad POL**. Permite administrar empresas, empleados-deudores, préstamos, cuotas y pagos con un portal separado para que los clientes consulten su saldo.

---

## Arquitectura

```
YAP/
├── backend/          Express + Prisma + PostgreSQL
│   ├── src/
│   │   ├── routes/       Endpoints REST por módulo
│   │   ├── services/     Lógica de negocio (financiero, mora, cron, audit)
│   │   ├── middleware/   auth.js, validate.js, clienteAuth.js
│   │   └── lib/          prisma.js (cliente singleton)
│   └── prisma/
│       └── schema.prisma
└── frontend/         React + Vite + Zustand
    └── src/
        ├── pages/        Vistas principales
        ├── components/   Componentes reutilizables
        ├── store/        useStore.js (Zustand)
        └── utils/        api.js, financiero.js, formatCOP.js
```

---

## Requisitos

| Herramienta | Versión mínima |
|-------------|---------------|
| Node.js     | 18.x o superior |
| PostgreSQL   | 14.x o superior |
| npm         | 9.x o superior |

---

## Variables de entorno

### Backend (`backend/.env`)

```env
# Base de datos
DATABASE_URL="postgresql://usuario:password@host:5432/yap_db"

# Autenticación JWT
JWT_SECRET="clave-secreta-de-al-menos-32-caracteres"
JWT_REFRESH_SECRET="otra-clave-secreta-diferente"

# Cifrado de datos sensibles
ENCRYPTION_KEY="clave-hex-de-64-caracteres"   # genera con: npm run keygen

# Correo transaccional (Resend)
RESEND_API_KEY="re_xxxxxxxx"
EMAIL_FROM="notificaciones@tudominio.com"

# Almacenamiento de archivos (Supabase Storage)
SUPABASE_URL="https://xxxxxxxx.supabase.co"
SUPABASE_ANON_KEY="eyJxxx..."
SUPABASE_SERVICE_KEY="eyJxxx..."

# URL del frontend (para CORS en producción)
FRONTEND_URL="https://tu-frontend.onrender.com"

# Entorno
NODE_ENV="development"   # o "production"
PORT=3001
```

### Frontend (`frontend/.env.development`)

```env
VITE_API_BASE_URL=http://localhost:3001/api
```

### Frontend (`frontend/.env.production`)

```env
VITE_API_BASE_URL=https://tu-backend.onrender.com/api
# VITE_ALLOW_OFFLINE_DEMO debe quedar ausente o en "false" en producción
```

---

## Setup local

```bash
# 1. Clonar el repositorio
git clone https://github.com/pbc360252-a11y/YAP-contabilidad-pol.git
cd YAP-contabilidad-pol

# 2. Backend
cd backend
cp .env.example .env          # Editar con tus credenciales
npm install
npx prisma generate
npx prisma migrate dev --name init   # Crea las tablas
node scripts/crear-admin.js          # Crea el superadmin inicial
npm run dev                          # Inicia en http://localhost:3001

# 3. Frontend (en otra terminal)
cd ../frontend
npm install
npm run dev                          # Inicia en http://localhost:5173
```

---

## Comandos útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor en modo desarrollo (nodemon) |
| `npm run start` | Inicia el servidor en producción |
| `npm run test` | Ejecuta la suite de pruebas (Vitest) |
| `npm run test:coverage` | Tests con reporte de cobertura |
| `npm run keygen` | Genera una ENCRYPTION_KEY aleatoria |
| `npx prisma studio` | Abre el explorador visual de la BD |
| `npx prisma migrate dev` | Aplica cambios del schema en desarrollo |
| `npx prisma migrate deploy` | Aplica migraciones en producción |

---

## Roles del sistema

| Rol | Descripción |
|-----|-------------|
| `superadmin` | Acceso total, puede gestionar usuarios y configuración global |
| `administrador` | Gestión de empresas, personas, préstamos y pagos |
| `analista` | Puede crear y consultar préstamos; sin acceso a configuración |
| `cobrador` | Registro de pagos y consulta de mora |
| `operador` | Solo lectura, consulta de estados |

---

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Autenticación con JWT |
| POST | `/api/auth/refresh` | Renovar access token |
| GET | `/api/stats/dashboard` | KPIs del dashboard |
| GET | `/api/prestamos` | Listar préstamos (paginado) |
| POST | `/api/prestamos` | Crear préstamo con amortización |
| POST | `/api/pagos` | Registrar pago de cuota |
| GET | `/api/personas` | Listar deudores |
| GET | `/api/cliente/dashboard` | Portal del cliente (auth separada) |
| GET | `/api/health` | Healthcheck del servidor |

---

## Despliegue en Render

El archivo `render.yaml` configura dos servicios:

- **`yap-backend`** — Node.js Web Service (buildCommand: `npm install && npx prisma generate && npx prisma migrate deploy`)
- **`yap-frontend`** — Static Site (Vite build → `dist/`)

Las variables de entorno marcadas con `sync: false` deben configurarse manualmente en el dashboard de Render.

---

## Arquitectura financiera

- **Motor de cálculo**: `decimal.js` para evitar errores de punto flotante IEEE 754.
- **Amortización francesa**: cuota fija con fórmula `P × (r(1+r)^n) / ((1+r)^n - 1)`.
- **Snapshot de tasas**: las tasas se guardan en `PrestamTasa` al momento de crear el préstamo; cambios futuros de tasa no afectan préstamos existentes.
- **Mora**: calculada proporcionalmente por días de atraso sobre el saldo vencido.
- **Validación de usura**: `validarTasaUsura()` verifica límites legales colombianos (Superfinanciera).

---

## Licencia

Uso interno — Contabilidad POL. Todos los derechos reservados.
