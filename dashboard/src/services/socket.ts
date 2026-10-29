import { io } from 'socket.io-client'

const apiUrl = import.meta.env.VITE_GYMGO_API_URL

if (!apiUrl) {
  throw new Error('VITE_GYMGO_API_URL no está configurada.')
}

const socketUrl = apiUrl.replace(/\/api\/?$/, '')

export const socket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: {
    token: localStorage.getItem('token') || '',
  },
})

export function connectSocket() {
  const token = localStorage.getItem('token')
  socket.auth = token ? { token } : {}
  if (!token) return socket
  if (!socket.connected) socket.connect()
  return socket
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect()
}