import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
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
			sky: {
				'400': 'hsl(210, 80%, 70%)',
				'500': 'hsl(210, 80%, 60%)',
				'600': 'hsl(210, 80%, 50%)'
			},
			violet: {
				'400': 'hsl(270, 60%, 75%)',
				'500': 'hsl(270, 60%, 65%)',
				'600': 'hsl(270, 60%, 55%)'
			},
			rose: {
				'400': 'hsl(330, 70%, 80%)',
				'500': 'hsl(330, 70%, 70%)',
				'600': 'hsl(330, 70%, 60%)'
			},
  			tier: {
  				bronze: 'hsl(30, 60%, 45%)',
  				silver: 'hsl(220, 10%, 65%)',
  				gold: 'hsl(45, 90%, 55%)',
  				platinum: 'hsl(190, 80%, 60%)',
  				diamond: 'hsl(190, 80%, 60%)'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
			/**
			 * Stat Check lane plaque: a brass cover plate that starts fully
			 * across the plaque viewport, holds while the interior swaps, then
			 * retracts upward. Clipped by the viewport's overflow-hidden, so
			 * the plaque frame itself never moves.
			 */
			'plaque-blink': {
				'0%': { transform: 'translateY(0)' },
				'42%': { transform: 'translateY(0)' },
				'100%': { transform: 'translateY(-101%)' }
			},
			/**
			 * Stat Check decisive transfer: a packet of energy leaving the
			 * winning number and travelling to the lane plaque. The distance
			 * comes from --packet-dx/--packet-dy, measured at runtime from the
			 * value element and the plaque.
			 */
			'energy-transfer': {
				'0%': { transform: 'translate(-50%, -50%) scale(0.4)', opacity: '0' },
				'12%': { transform: 'translate(-50%, -50%) scale(1.15)', opacity: '1' },
				'85%': { opacity: '1' },
				'100%': {
					transform:
						'translate(calc(-50% + var(--packet-dx, 0px)), calc(-50% + var(--packet-dy, 0px))) scale(0.55)',
					opacity: '0.9'
				}
			},
			/**
			 * Stat Check impact frame: two short directional jolts of the
			 * arena frame. Deliberately not elastic and not a loop — it ends
			 * on the identity transform, so no geometry is left displaced.
			 */
			'arena-jolt': {
				'0%': { transform: 'translate3d(0,0,0)' },
				'18%': { transform: 'translate3d(-5px, 3px, 0)' },
				'38%': { transform: 'translate3d(4px, -2px, 0)' },
				'62%': { transform: 'translate3d(-2px, 1px, 0)' },
				'100%': { transform: 'translate3d(0,0,0)' }
			},
			/** Stat Check damage total: one contained pop as a component lands. */
			'damage-tick': {
				'0%': { transform: 'scale(0.82)', opacity: '0.4' },
				'55%': { transform: 'scale(1.12)', opacity: '1' },
				'100%': { transform: 'scale(1)', opacity: '1' }
			},
			/** The completed total striking home at the impact frame. */
			'damage-strike': {
				'0%': { transform: 'scale(1)' },
				'30%': { transform: 'scale(1.3)' },
				'100%': { transform: 'scale(1.12)' }
			},
			/**
			 * Contained pulse leaving the centre toward the damaged side of the
			 * arena (--damage-dy is negative for the opponent, positive for the
			 * player), so the travel reads as "this bar is about to drain".
			 */
			'damage-pulse': {
				'0%': { transform: 'translate(-50%, -50%) scale(0.5)', opacity: '0' },
				'25%': { transform: 'translate(-50%, -50%) scale(1)', opacity: '0.85' },
				'100%': {
					transform: 'translate(-50%, calc(-50% + var(--damage-dy, 0px))) scale(1.5)',
					opacity: '0'
				}
			},
			/**
			 * Floating SWEEP notification: a brief rise into place, a hold, and a
			 * clean exit — celebratory without an elastic bounce or a slot-machine
			 * effect. The whole life of the effect is one animation, so it ends on
			 * its own and never needs a timer of its own.
			 */
			'sweep-notice': {
				'0%': { transform: 'translateY(10px) scale(0.94)', opacity: '0' },
				'16%': { transform: 'translateY(0) scale(1)', opacity: '1' },
				'78%': { transform: 'translateY(0) scale(1)', opacity: '1' },
				'100%': { transform: 'translateY(-8px) scale(0.98)', opacity: '0' }
			},
			/** Single glint travelling across the brass plate, once. */
			'sweep-glint': {
				'0%': { transform: 'translateX(0)', opacity: '0' },
				'22%': { opacity: '1' },
				'70%': { transform: 'translateX(420%)', opacity: '0' },
				'100%': { transform: 'translateX(420%)', opacity: '0' }
			},
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
			'pulse-glow': {
				'0%, 100%': {
					boxShadow: '0 0 15px hsl(210 80% 60% / 0.2)'
				},
				'50%': {
					boxShadow: '0 0 30px hsl(210 80% 60% / 0.4)'
				}
			},
  			'slide-up': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(20px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'versus-pulse': {
  				'0%, 100%': {
  					transform: 'scale(1)',
  					opacity: '1'
  				},
  				'50%': {
  					transform: 'scale(1.1)',
  					opacity: '0.8'
  				}
  			}
  		},
  		animation: {
			/** Duration is overridden inline so it follows the animation-speed control. */
			'plaque-blink': 'plaque-blink 300ms cubic-bezier(0.4,0,0.2,1) forwards',
			/** Duration is overridden inline so it follows the animation-speed control. */
			'energy-transfer': 'energy-transfer 1000ms cubic-bezier(0.45,0,0.55,1) forwards',
			/** Speed-scaled via --sc-arena-jolt, set on the arena frame. */
			'arena-jolt': 'arena-jolt var(--sc-arena-jolt, 380ms) cubic-bezier(0.36,0.07,0.19,0.97) both',
			/** Speed-scaled via --sc-damage-tick, set on the damage overlay. */
			'damage-tick': 'damage-tick var(--sc-damage-tick, 280ms) cubic-bezier(0.22,1,0.36,1) both',
			'damage-strike': 'damage-strike var(--sc-arena-jolt, 380ms) cubic-bezier(0.22,1,0.36,1) both',
			'damage-pulse': 'damage-pulse var(--sc-damage-pulse, 700ms) cubic-bezier(0.22,1,0.36,1) both',
			/** Speed-scaled via --sc-sweep-notice, set on the damage overlay. */
			'sweep-notice': 'sweep-notice var(--sc-sweep-notice, 900ms) cubic-bezier(0.22,1,0.36,1) both',
			'sweep-glint': 'sweep-glint var(--sc-sweep-notice, 900ms) cubic-bezier(0.4,0,0.2,1) both',
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
  			'slide-up': 'slide-up 0.5s ease-out',
  			'versus-pulse': 'versus-pulse 1.5s ease-in-out infinite'
  		},
  		fontFamily: {
  			sans: [
  				'Inter',
  				'ui-sans-serif',
  				'system-ui',
  				'-apple-system',
  				'BlinkMacSystemFont',
  				'Segoe UI',
  				'Roboto',
  				'Helvetica Neue',
  				'Arial',
  				'Noto Sans',
  				'sans-serif'
  			],
  			serif: [
  				'Lora',
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			],
  			mono: [
  				'Space Mono',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			]
  		},
  		boxShadow: {
  			'2xs': 'var(--shadow-2xs)',
  			xs: 'var(--shadow-xs)',
  			sm: 'var(--shadow-sm)',
  			md: 'var(--shadow-md)',
  			lg: 'var(--shadow-lg)',
  			xl: 'var(--shadow-xl)',
  			'2xl': 'var(--shadow-2xl)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
