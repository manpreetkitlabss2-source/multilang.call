/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#102a43",
        sky: "#ebf8ff",
        accent: "#0f766e",
        warm: "#f59e0b"
      },
      boxShadow: {
        panel: "0 24px 80px rgba(16, 42, 67, 0.12)"
      }
    }
  },
  plugins: []
};
