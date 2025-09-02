/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/index.html",
    "./src/**/*.{js,jsx,ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        indigoP: "#4F46E5",
        greenP: "#16A34A",
        tealP: "#14B8A6",
        amberP: "#F59E0B",
        slate400: "#94A3B8",
        slate500: "#64748B",
        slate600: "#475569",
        line: "#E5E7EB",
        card: "#ffffff",
        ring: "#c7d2fe",
        dangerBg: "#FEF2F2",
        dangerBorder: "#FCA5A5",
        dangerText: "#7F1D1D",
      },
      boxShadow: {
        soft: "0 8px 24px rgba(2, 6, 23, 0.06)",
      },
      borderRadius: {
        xxl: "20px",
      },
    },
  },
  plugins: [],
};
