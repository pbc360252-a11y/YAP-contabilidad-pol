import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { PortalLayout } from './components/layout/PortalLayout'
import {
  Login,
  Dashboard,
  Personas,
  Prestamos,
  Historial,
  Mora,
  Informes,
  Empresas,
  TiposPrestamo,
  TasasInteres,
  Usuarios,
  Perfil,
  SolicitudPublica,
  PortalLogin,
  PortalDashboard,
  PortalPrestamos,
  PortalPagos,
  PortalPerfil,
  Auditoria
} from './pages'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/solicitar" element={<SolicitudPublica />} />

        {/* Rutas Privadas con Layout */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/inicio" replace />} />
          <Route path="inicio" element={<Dashboard />} />
          <Route path="personas" element={<Personas />} />
          <Route path="prestamos" element={<Prestamos />} />
          <Route path="historial" element={<Historial />} />
          <Route path="mora" element={<Mora />} />
          <Route path="informes" element={<Informes />} />
          <Route path="perfil" element={<Perfil />} />

          <Route path="configuracion">
            <Route path="empresas" element={<Empresas />} />
            <Route path="tipos" element={<TiposPrestamo />} />
            <Route path="tasas" element={<TasasInteres />} />
            <Route path="usuarios" element={<Usuarios />} />
            <Route path="auditoria" element={<Auditoria />} />
          </Route>
        </Route>

        {/* RUTAS DEL PORTAL DEL CLIENTE */}
        <Route path="/portal/login" element={<PortalLogin />} />
        <Route path="/portal" element={<PortalLayout />}>
          <Route index element={<Navigate to="/portal/inicio" replace />} />
          <Route path="inicio" element={<PortalDashboard />} />
          <Route path="prestamos" element={<PortalPrestamos />} />
          <Route path="pagos" element={<PortalPagos />} />
          <Route path="perfil" element={<PortalPerfil />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
