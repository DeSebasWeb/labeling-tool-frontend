import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Preparado para JWT: cuando se agregue auth, interceptar aqui
// client.interceptors.request.use((config) => {
//   const token = localStorage.getItem('access_token')
//   if (token) config.headers.Authorization = `Bearer ${token}`
//   return config
// })

export default client
