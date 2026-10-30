// The gym the dashboard works in, sent to the API as X-Gym-Id. Owners can pick ALL_GYMS to see every gym.
export const ALL_GYMS = 'all'

const STORAGE_KEY = 'activeGymId'

export function getActiveGymId() {
  return localStorage.getItem(STORAGE_KEY)
}

export function storeActiveGymId(gymId: string | null) {
  if (gymId) localStorage.setItem(STORAGE_KEY, gymId)
  else localStorage.removeItem(STORAGE_KEY)
}
