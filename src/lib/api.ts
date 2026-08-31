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
    const status = error?.response?.status;
    const data   = error?.response?.data;

    // FIX SEC-3: Auto-logout only for definitive authentication rejections:
    //   401 = token invalid/expired
    //   403 with suspended/expired flag = restaurant blocked by platform
    // Do NOT auto-logout for 403 that is a business-logic rejection
    // (e.g. "order already in status X") — those are handled per-page.
    const isAuthFailure =
      status === 401 ||
      (status === 403 && (data?.suspended || data?.expired));

    if (isAuthFailure) {
      localStorage.removeItem('flowup_staff_token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default API;

export const RESTAURANT_ID =
  (import.meta.env.VITE_RESTAURANT_ID as string) || '';
