/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        // GMX-inspired palette
        slate: {
          100: "#696D96",
          400: "#9FA3BC",
          500: "#C4C6D5",
          600: "#D4D4E2",
          700: "#DADAE7",
          800: "#EDEDF2",
          900: "#FCFCFC",
          950: "#090A14",
        },
        blue: {
          400: "#2D42FC",
          500: "#3d51ff",
        },
        green: {
          500: "#109375",
          700: "#0FDE8D",
        },
        red: {
          500: "#EA2A46",
        },
      },
    },
  },
  plugins: [],
};
