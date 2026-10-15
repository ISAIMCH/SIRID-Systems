import { io } from 'socket.io-client'

const apiUrl = import.meta.env.VITE_GYMGO_API_URL

if (!apiUrl) {
  throw new Error('VITE_GYMGO_API_URL no está configurada.')
}

const socketUrl = apiUrl.replace(/\/api\/?$/, '')

export const socket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
})

export function connectSocket() {
  const token = localStorage.getItem('token')
  socket.auth = token ? { token } : {}
  if (!socket.connected) socket.connect()
  return socket
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect()
}