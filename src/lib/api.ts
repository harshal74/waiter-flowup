import axios from 'axios';

// Dev: baseURL = '/api' → Vite proxy forwards to http://localhost:5000/api
// Prod: set VITE_API_URL on Netlify (e.g., https://your-backend.onrender.com/api)
const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('flowup_staff_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

API.interceptors.response.use(
  (res) => res,
  (error) => {
    // Just reject — let each page/component handle errors themselves.
    // DO NOT auto-clear localStorage or redirect here.
    // A single failed API call (e.g. optional dashboard data) must not kill the session.
    return Promise.reject(error);
  }
);

export default API;

export const RESTAURANT_ID =
  (import.meta.env.VITE_RESTAURANT_ID as string) || '';
