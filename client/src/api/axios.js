import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.PROD ? '/api' : `${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api`,
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('session_token');

    // Prevent caching
    config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    config.headers['Pragma'] = 'no-cache';
    config.headers['Expires'] = '0';

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('session_token');
            localStorage.removeItem('user_data');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

export default api;
