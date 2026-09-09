/** Tailwind config เดิมจาก Code/tailwind.config.js — คง theme เดิมทุกค่า
 *  เปลี่ยนเฉพาะ content paths ให้ชี้โครงสร้างใหม่ */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,js,html}'],
  theme: {
    extend: {
      fontFamily: {
        prompt: ['Prompt', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
    },
  },
  plugins: [],
};
