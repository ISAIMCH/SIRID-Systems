import { io } from 'socket.io-client'

const apiUrl = import.meta.env.VITE_GYMGO_API_URL

if (!apiUrl) {
  throw new Error('VITE_GYMGO_API_URL no está configurada.')
}

const socketUrl = apiUrl.replace(/\/api\/?$/, '')

export const socket = io(socketUrl, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  // Read on every (re)connect so the socket always uses the current session token.
  auth: (callback) => {
    const token = localStorage.getItem('token')
    callback(token ? { token } : {})
  },
})

// The server closes a socket when its session is re-checked and fails (SEC-05), or when this browser's password
// changed and its token was replaced. One reconnection picks up the current token; if the session really ended,
// the server refuses it and the client does not retry.
socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect' && localStorage.getItem('token')) socket.connect()
})

export function connectSocket() {
  if (!localStorage.getItem('token')) return socket
  if (!socket.connected) socket.connect()
  return socket
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect()
}