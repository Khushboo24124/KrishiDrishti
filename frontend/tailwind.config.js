/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        leaf: {
          50: "#f1f9ee",
          100: "#dcf0d4",
          200: "#b9e1ab",
          300: "#8ecd7c",
          400: "#66b652",
          500: "#469b34",
          600: "#357c27",
          700: "#2c6221",
          800: "#274e1f",
          900: "#22421d",
        },
        soil: {
          50: "#faf6f1",
          100: "#f0e6d8",
          200: "#e0cbae",
          300: "#cba97c",
          400: "#b98a55",
          500: "#a3703f",
          600: "#875934",
          700: "#6c452c",
          800: "#5a3a28",
          900: "#4d3224",
        },
      },
    },
  },
  plugins: [],
};
