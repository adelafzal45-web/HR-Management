/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#F1B344",
          dark: "#E08A3E",
          light: "#FDE9C8",
        },
      },
      fontFamily: {
        sans: ["Mont", "Poppins", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
