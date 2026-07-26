import axios from "axios"

const api = axios.create({
  baseURL: "/auth",
  withCredentials: true,
})

export default api
