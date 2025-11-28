/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      // Extend default colors if needed, but Tailwind's default zinc is perfect
      colors: {
        // You can add custom brand colors here if needed
      }
    },
  },
  plugins: [],
}
