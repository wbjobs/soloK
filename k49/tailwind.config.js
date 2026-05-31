/** @type {import('tailwindcss').Config} */

export default {
    darkMode: "class",
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        container: {
            center: true,
        },
        extend: {
            colors: {
                cyber: {
                    bg: '#0a0e17',
                    cyan: '#00ffc8',
                    purple: '#a855f7',
                    dark: '#111827',
                },
            },
            fontFamily: {
                display: ['JetBrains Mono', 'monospace'],
                mono: ['JetBrains Mono', 'monospace'],
            },
        },
    },
    plugins: [],
};
