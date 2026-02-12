/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#f8fafc",
        mint: "#d1fae5",
        sun: "#fde68a"
      }
    }
  },
  plugins: []
};
