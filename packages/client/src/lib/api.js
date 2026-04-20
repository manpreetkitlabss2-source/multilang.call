export const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
export const createAuthHeaders = (token) => {
    if (!token) {
        return {};
    }
    return {
        Authorization: `Bearer ${token}`
    };
};
