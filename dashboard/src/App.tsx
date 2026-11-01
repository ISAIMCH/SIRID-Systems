import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AdminLayout from './layouts/AdminLayout'
import Equipment from './pages/Equipment'
import Exercises from './pages/Exercises'
import Inventory from './pages/Inventory'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Overview from './pages/Overview'
import Promotions from './pages/Promotions'
import Payments from './pages/Payments'
import Routines from './pages/Routines'
import Sales from './pages/Sales'
import Subscriptions from './pages/Subscriptions'
import Users from './pages/Users'
import AuthProvider from './store/AuthContext'
import { useAuth } from './store/useAuth'
import { canAccessPage, useStaffRoles } from './utils/access'

// The QR reader and generator only download when these pages open.
const Access = lazy(() => import('./pages/Access'))
const Gyms = lazy(() => import('./pages/Gyms'))
const Documents = lazy(() => import('./pages/Documents'))
const Platform = lazy(() => import('./pages/Platform'))
const Maintenance = lazy(() => import('./pages/Maintenance'))

function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

// Typing the URL of a page the active gym's roles can't use sends the user to Inicio instead of hitting a 403.
function RoleRoute() {
  const { session, isPlatformMode } = useAuth()
  const roles = useStaffRoles()
  const location = useLocation()

  // Sessions saved before gyms existed load as null until /auth/me answers; wait instead of redirecting.
  if (!session) return null
  if (isPlatformMode) return <Navigate to="/platform" replace />

  if (!canAccessPage(roles, location.pathname)) {
    return <Navigate to="/" replace />
  }

  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  )
}

// Inicio is the gym overview; SIRID staff without a gym land on their panel instead.
function HomeRoute() {
  const { isPlatformMode } = useAuth()

  if (isPlatformMode) return <Navigate to="/platform" replace />
  return <Overview />
}

// SIRID's panel is for platform staff only, whatever their roles in the active gym.
function PlatformRoute() {
  const { session } = useAuth()

  if (!session) return null
  if (!session.user.isPlatformAdmin) return <Navigate to="/" replace />

  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/dashboard">
        <Routes>
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<Signup />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route index element={<HomeRoute />} />
              <Route element={<PlatformRoute />}>
                <Route path="platform" element={<Platform />} />
              </Route>
              <Route element={<RoleRoute />}>
                <Route path="gyms" element={<Gyms />} />
                <Route path="access" element={<Access />} />
                <Route path="documents" element={<Documents />} />
                <Route path="equipment" element={<Equipment />} />
                <Route path="maintenance" element={<Maintenance />} />
                <Route path="exercises" element={<Exercises />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="promotions" element={<Promotions />} />
                <Route path="users" element={<Users />} />
                <Route path="payments" element={<Payments />} />
                <Route path="routines" element={<Routines />} />
                <Route path="sales" element={<Sales />} />
                <Route path="subscriptions" element={<Subscriptions />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
