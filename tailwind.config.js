/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sky: {
          300: '#67d8f2',
          400: '#28b8df',
          500: '#0788bd',
          600: '#056f9d',
        },
        cyan: {
          300: '#82e8ed',
          400: '#35c9d3',
          500: '#1298aa',
          600: '#0d7787',
        },
        emerald: {
          300: '#7de2d5',
          400: '#36c9bd',
          500: '#159b9c',
          600: '#117c80',
        },
        blue: {
          300: '#8acbff',
          400: '#42aef2',
          500: '#1686c4',
          600: '#0c669c',
        },
        amber: {
          300: '#ffc078',
          400: '#ff9a3d',
          500: '#ed7420',
          600: '#c65716',
        },
        violet: {
          300: '#82e8ed',
          400: '#35c9d3',
          500: '#1298aa',
          600: '#0d7787',
        },
      },
    },
  },
  plugins: [],
};
