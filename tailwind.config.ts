import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			fontFamily: {
				sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Clean design system extension
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))'
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))'
				},
				chart: {
					'1': 'hsl(var(--chart-1))',    // Your Brand (Primary)
					'2': 'hsl(var(--chart-2))',    // Blue
					'3': 'hsl(var(--chart-3))',    // Green
					'4': 'hsl(var(--chart-4))',    // Orange
					'5': 'hsl(var(--chart-5))',    // Purple
					'6': 'hsl(var(--chart-6))',    // Red
					'7': 'hsl(var(--chart-7))',    // Teal
					'8': 'hsl(var(--chart-8))',    // Violet
					'9': 'hsl(var(--chart-9))',    // Amber
					'10': 'hsl(var(--chart-10))',  // Pink
					'11': 'hsl(var(--chart-11))',  // Cyan
					'12': 'hsl(var(--chart-12))',  // Lime
					'13': 'hsl(var(--chart-13))',  // Rose
					'14': 'hsl(var(--chart-14))',  // Indigo
					'15': 'hsl(var(--chart-15))',  // Yellow
					'16': 'hsl(var(--chart-16))',  // Emerald
					'17': 'hsl(var(--chart-17))',  // Fuchsia
					'18': 'hsl(var(--chart-18))',  // Sky
					'19': 'hsl(var(--chart-19))',  // Orange Red
					'20': 'hsl(var(--chart-20))',  // Blue Violet
					'21': 'hsl(var(--chart-21))',  // Muted Teal
					'22': 'hsl(var(--chart-22))',  // Burnt Orange
					'23': 'hsl(var(--chart-23))',  // Medium Purple
					'24': 'hsl(var(--chart-24))',  // Olive Green
					'25': 'hsl(var(--chart-25))'   // Coral Pink
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				fadeIn: {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				slideIn: {
					'0%': { transform: 'translateY(10px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' }
				},
				scaleIn: {
					'0%': { transform: 'scale(0.95)', opacity: '0' },
					'100%': { transform: 'scale(1)', opacity: '1' }
				},
				shimmer: {
					'0%': { 'background-position': '-200% 0' },
					'100%': { 'background-position': '200% 0' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				// Clean design system animations
				'fade-in': 'fadeIn 0.2s ease-out',
				'slide-in': 'slideIn 0.3s ease-out',
				'scale-in': 'scaleIn 0.2s ease-out',
				'shimmer': 'shimmer 2s infinite'
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
