import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AdminLayout from './layouts/AdminLayout'
import Gyms from './pages/Gyms'
import Equipment from './pages/Equipment'
import Inventory from './pages/Inventory'
import Login from './pages/Login'
import Overview from './pages/Overview'
import Promotions from './pages/Promotions'
import Payments from './pages/Payments'
import Subscriptions from './pages/Subscriptions'
import Users from './pages/Users'
import AuthProvider from './store/AuthContext'
import { useAuth } from './store/useAuth'

function ProtectedRoute() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename="/dashboard">
        <Routes>
          <Route path="login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route index element={<Overview />} />
              <Route path="gyms" element={<Gyms />} />
              <Route path="equipment" element={<Equipment />} />
              <Route path="inventory" element={<Inventory />} />
              <Route path="promotions" element={<Promotions />} />
              <Route path="users" element={<Users />} />
              <Route path="payments" element={<Payments />} />
              <Route path="subscriptions" element={<Subscriptions />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
