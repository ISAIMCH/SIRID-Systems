import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CircleCheck, Dumbbell, Hammer } from 'lucide-react'
import { getEquipment, getMaintenanceReports } from '../services/api'
import type { MaintenanceReport } from '../services/api'
import type { Equipment } from '../types'
import { socket } from '../services/socket'
import { useStaffRoles } from '../utils/access'
import PageHeader from '../components/ui/PageHeader'
import KpiCard from '../components/ui/KpiCard'
import Segmented from '../components/ui/Segmented'
import EquipmentList from '../components/equipment/EquipmentList'
import MaintenanceReports from '../components/equipment/MaintenanceReports'

type EquipmentResponse = Equipment[] | { data?: unknown; equipment?: unknown }
type View = 'equipos' | 'reportes'

async function fetchEquipment() {
  const response = await getEquipment<EquipmentResponse>()
  const equipmentCandidate = Array.isArray(response) ? response : response?.data || response?.equipment || []
  return Array.isArray(equipmentCandidate) ? equipmentCandidate as Equipment[] : []
}

const errorText = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback)

// Machines and the failures clients report on them, in one place: reports change how many units are available.
function EquipmentPage() {
  const canAttend = useStaffRoles().has('Admin')
  const [searchParams, setSearchParams] = useSearchParams()
  const view: View = searchParams.get('vista') === 'reportes' ? 'reportes' : 'equipos'

  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [isEquipmentLoading, setIsEquipmentLoading] = useState(true)
  const [equipmentError, setEquipmentError] = useState<string | null>(null)
  const [reports, setReports] = useState<MaintenanceReport[]>([])
  const [areReportsLoading, setAreReportsLoading] = useState(true)
  const [reportsError, setReportsError] = useState<string | null>(null)

  const loadEquipment = useCallback(async () => {
    try {
      setEquipment(await fetchEquipment())
      setEquipmentError(null)
    } catch (requestError) {
      setEquipmentError(errorText(requestError, 'No se pudo cargar el equipo.'))
    } finally {
      setIsEquipmentLoading(false)
    }
  }, [])

  const loadReports = useCallback(async () => {
    try {
      setReports((await getMaintenanceReports()).reports)
      setReportsError(null)
    } catch (requestError) {
      setReportsError(errorText(requestError, 'No se pudieron cargar los reportes.'))
    } finally {
      setAreReportsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => { void loadEquipment(); void loadReports() }, 0)
    return () => clearTimeout(timer)
  }, [loadEquipment, loadReports])

  // New reports from the app, and changes made elsewhere, arrive live; they can also move units in or out of service.
  useEffect(() => {
    const refresh = () => { void loadReports(); void loadEquipment() }
    socket.on('maintenance-updated', refresh)
    return () => { socket.off('maintenance-updated', refresh) }
  }, [loadEquipment, loadReports])

  function setView(next: View) {
    setSearchParams(next === 'reportes' ? { vista: 'reportes' } : {}, { replace: true })
  }

  function handleReportUpdated(report: MaintenanceReport) {
    setReports((current) => current.map((item) => item._id === report._id ? report : item))
    void loadEquipment()
  }

  const totalUnits = equipment.reduce((sum, item) => sum + (item.totalQuantity ?? 0), 0)
  const unitsInMaintenance = equipment.reduce((sum, item) => sum + Math.min(item.maintenanceQuantity ?? 0, item.totalQuantity ?? 0), 0)
  const outOfService = equipment.filter((item) => item.status === 'out_of_service').length
  const pendingReports = reports.filter((report) => report.status === 'pending').length
  const openReports = reports.filter((report) => report.status !== 'resolved').length

  return (
    <section className="min-h-screen bg-canvas px-4 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Operación"
        title="Equipo y mantenimiento"
        description="Las máquinas del gimnasio, sus unidades disponibles y las fallas que reportan los clientes."
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <KpiCard label="Equipos" value={equipment.length} icon={Dumbbell} isLoading={isEquipmentLoading} hint={`${totalUnits} unidad${totalUnits === 1 ? '' : 'es'} en total`} />
        <KpiCard label="Unidades disponibles" value={totalUnits - unitsInMaintenance} icon={CircleCheck} tone="brand" isLoading={isEquipmentLoading} hint={unitsInMaintenance > 0 ? `${unitsInMaintenance} en mantenimiento` : 'Todo en servicio'} />
        <KpiCard label="Fuera de servicio" value={outOfService} icon={Hammer} tone={outOfService > 0 ? 'warning' : 'default'} isLoading={isEquipmentLoading} hint={outOfService > 0 ? 'Sin unidades disponibles' : 'Ningún equipo detenido'} />
        <KpiCard label="Reportes abiertos" value={openReports} icon={AlertTriangle} tone={pendingReports > 0 ? 'warning' : 'default'} isLoading={areReportsLoading} hint={pendingReports > 0 ? `${pendingReports} sin atender` : 'Todos atendidos'} />
      </div>

      <div className="mt-6">
        <Segmented
          label="Vista"
          value={view}
          options={[['equipos', 'Equipos'], ['reportes', openReports > 0 ? `Reportes (${openReports})` : 'Reportes']] as const}
          onChange={setView}
        />
      </div>

      <div className="mt-4">
        {view === 'equipos' ? (
          <EquipmentList equipment={equipment} isLoading={isEquipmentLoading} error={equipmentError} onChanged={loadEquipment} />
        ) : (
          <MaintenanceReports
            reports={reports}
            isLoading={areReportsLoading}
            error={reportsError}
            canAttend={canAttend}
            onRefresh={() => { setAreReportsLoading(true); void loadReports() }}
            onReportUpdated={handleReportUpdated}
          />
        )}
      </div>
    </section>
  )
}

export default EquipmentPage
