import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        steel: {
          DEFAULT: "#0f5f6d",
          deep: "#083943",
          ink: "#06161a",
          plate: "#0b2c33",
          rim: "#1a7a88",
          glow: "#3ec6d4",
        },
        amber: {
          flare: "#e38b2a",
          label: "#f0a13a",
        },
        paper: {
          cream: "#efe6d4",
        },
      },
      fontFamily: {
        display: ["Rajdhani", "Impact", "Arial Narrow", "sans-serif"],
        sans: ["IBM Plex Sans", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        plate: "0 18px 40px rgba(0, 0, 0, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
