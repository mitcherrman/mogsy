import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ThemeOverlayProps {
  themeId: string;
}

/* ────────────────────────────────────
   Shared helpers
   ──────────────────────────────────── */
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

/* ────────────────────────────────────
   MIDNIGHT – stars + moon + shooting star
   ──────────────────────────────────── */
function MidnightOverlay() {
  const stars = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    x: rand(0, 100),
    y: rand(0, 100),
    size: rand(1, 3),
    delay: rand(0, 5),
    duration: rand(2, 5),
  }));

  return (
    <>
      <style>{`
        @keyframes twinkle { 0%,100%{opacity:.2} 50%{opacity:1} }
        @keyframes shootingStar {
          0%{transform:translate(0,0) scale(1);opacity:1}
          100%{transform:translate(200px,120px) scale(0);opacity:0}
        }
        @keyframes moonGlow {
          0%,100%{box-shadow:0 0 40px hsl(45 60% 80%/.3), 0 0 80px hsl(250 50% 60%/.15)}
          50%{box-shadow:0 0 60px hsl(45 60% 80%/.5), 0 0 100px hsl(250 50% 60%/.25)}
        }
      `}</style>

      {/* Moon */}
      <div
        className="absolute top-6 right-8 w-12 h-12 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle at 40% 40%, hsl(45,80%,92%), hsl(45,60%,75%))",
          animation: "moonGlow 4s ease-in-out infinite",
        }}
      />

      {/* Stars */}
      {stars.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            background: "hsl(220,80%,90%)",
            animation: `twinkle ${s.duration}s ${s.delay}s ease-in-out infinite`,
          }}
        />
      ))}

      {/* Shooting star */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1.5, delay: 2, repeat: Infinity, repeatDelay: 8 }}
        className="absolute top-[15%] left-[10%] pointer-events-none"
      >
        <div
          className="w-1 h-1 rounded-full"
          style={{
            background: "white",
            boxShadow: "0 0 6px 2px hsl(200,80%,80%)",
            animation: "shootingStar 1.5s linear infinite",
          }}
        />
      </motion.div>

      {/* Nebula glow */}
      <div
        className="absolute top-[20%] left-[50%] w-72 h-72 rounded-full pointer-events-none opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(280,60%,50%), transparent 70%)" }}
      />
    </>
  );
}

/* ────────────────────────────────────
   FOREST – vines, leaves, tree silhouettes
   ──────────────────────────────────── */
function ForestOverlay() {
  const [showLeaves, setShowLeaves] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowLeaves(false), 3000);
    return () => clearTimeout(t);
  }, []);

  const leaves = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: rand(5, 95),
    size: rand(14, 26),
    rotation: rand(-60, 60),
    delay: rand(0, 0.8),
  }));

  const floatingLeaves = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    x: rand(0, 100),
    size: rand(10, 18),
    duration: rand(8, 15),
    delay: rand(0, 10),
  }));

  return (
    <>
      <style>{`
        @keyframes leafFloat {
          0%{transform:translateY(-20px) rotate(0deg);opacity:0}
          10%{opacity:.6}
          90%{opacity:.6}
          100%{transform:translateY(calc(100vh + 40px)) rotate(360deg);opacity:0}
        }
        @keyframes vineGrow {
          0%{clip-path:inset(0 0 100% 0)}
          100%{clip-path:inset(0 0 0% 0)}
        }
      `}</style>

      {/* Left vine */}
      <svg className="absolute top-0 left-0 h-full w-16 pointer-events-none opacity-40" viewBox="0 0 60 800" preserveAspectRatio="none" style={{ animation: "vineGrow 2s ease-out forwards" }}>
        <path d="M10,0 Q30,80 15,160 Q0,240 20,320 Q35,400 10,480 Q-5,560 15,640 Q30,720 10,800" fill="none" stroke="hsl(140,40%,30%)" strokeWidth="3" />
        <path d="M10,100 Q25,110 35,95" fill="none" stroke="hsl(140,50%,35%)" strokeWidth="2" />
        <path d="M15,250 Q30,240 40,260" fill="none" stroke="hsl(140,50%,35%)" strokeWidth="2" />
        <path d="M10,420 Q25,410 38,430" fill="none" stroke="hsl(140,50%,35%)" strokeWidth="2" />
        <path d="M15,600 Q28,590 36,610" fill="none" stroke="hsl(140,50%,35%)" strokeWidth="2" />
        {/* Small leaves on vine */}
        <ellipse cx="35" cy="92" rx="8" ry="5" fill="hsl(140,45%,30%)" transform="rotate(-20 35 92)" />
        <ellipse cx="40" cy="258" rx="8" ry="5" fill="hsl(150,40%,28%)" transform="rotate(15 40 258)" />
        <ellipse cx="38" cy="428" rx="7" ry="5" fill="hsl(130,45%,32%)" transform="rotate(-10 38 428)" />
        <ellipse cx="36" cy="608" rx="8" ry="5" fill="hsl(145,40%,30%)" transform="rotate(20 36 608)" />
      </svg>

      {/* Right vine */}
      <svg className="absolute top-0 right-0 h-full w-16 pointer-events-none opacity-40" viewBox="0 0 60 800" preserveAspectRatio="none" style={{ animation: "vineGrow 2.2s 0.3s ease-out both" }}>
        <path d="M50,0 Q30,100 45,200 Q60,300 40,400 Q25,500 50,600 Q65,700 45,800" fill="none" stroke="hsl(140,40%,30%)" strokeWidth="3" />
        <ellipse cx="28" cy="195" rx="8" ry="5" fill="hsl(140,45%,30%)" transform="rotate(25 28 195)" />
        <ellipse cx="25" cy="395" rx="7" ry="5" fill="hsl(150,40%,28%)" transform="rotate(-15 25 395)" />
        <ellipse cx="30" cy="595" rx="8" ry="5" fill="hsl(130,45%,32%)" transform="rotate(10 30 595)" />
      </svg>

      {/* Bottom tree silhouette */}
      <div className="absolute bottom-0 left-0 right-0 h-24 pointer-events-none opacity-15">
        <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,100 L0,60 Q10,30 20,50 Q30,20 40,45 Q50,10 60,40 Q70,25 80,50 Q90,15 100,45 Q110,30 120,55 Q130,20 140,50 Q150,35 160,55 Q170,15 180,45 Q190,30 200,50 Q210,10 220,40 Q230,25 240,55 Q250,15 260,45 Q270,30 280,50 Q290,20 300,45 Q310,35 320,55 Q330,10 340,40 Q350,25 360,55 Q370,20 380,50 Q390,35 400,45 L400,100 Z" fill="hsl(140,35%,15%)" />
        </svg>
      </div>

      {/* Leaf-brush entry animation */}
      <AnimatePresence>
        {showLeaves && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-50 pointer-events-none"
          >
            {leaves.map((leaf) => (
              <motion.div
                key={leaf.id}
                initial={{ y: "40vh", x: `${leaf.x}vw`, rotate: leaf.rotation, opacity: 0.9 }}
                animate={{ y: "-20vh", x: `${leaf.x + rand(-15, 15)}vw`, rotate: leaf.rotation + 180, opacity: 0 }}
                transition={{ duration: 1.8, delay: leaf.delay, ease: "easeOut" }}
                className="absolute"
                style={{ width: leaf.size, height: leaf.size }}
              >
                <svg viewBox="0 0 24 24" fill="hsl(130,50%,35%)" className="w-full h-full drop-shadow-md">
                  <path d="M12,2 Q18,8 17,14 Q16,18 12,22 Q8,18 7,14 Q6,8 12,2Z" />
                  <line x1="12" y1="6" x2="12" y2="20" stroke="hsl(130,30%,25%)" strokeWidth="0.5" />
                </svg>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient floating leaves */}
      {floatingLeaves.map((leaf) => (
        <div
          key={`float-${leaf.id}`}
          className="absolute pointer-events-none"
          style={{
            left: `${leaf.x}%`,
            top: "-20px",
            width: leaf.size,
            height: leaf.size,
            animation: `leafFloat ${leaf.duration}s ${leaf.delay}s linear infinite`,
          }}
        >
          <svg viewBox="0 0 24 24" fill="hsl(130,40%,35%)" className="w-full h-full opacity-40">
            <path d="M12,2 Q18,8 17,14 Q16,18 12,22 Q8,18 7,14 Q6,8 12,2Z" />
          </svg>
        </div>
      ))}
    </>
  );
}

/* ────────────────────────────────────
   SUNSET – sun, rays, clouds
   ──────────────────────────────────── */
function SunsetOverlay() {
  return (
    <>
      <style>{`
        @keyframes sunPulse {
          0%,100%{box-shadow:0 0 60px hsl(30 90% 55%/.5), 0 0 120px hsl(20 80% 50%/.2)}
          50%{box-shadow:0 0 80px hsl(30 90% 55%/.7), 0 0 160px hsl(20 80% 50%/.3)}
        }
        @keyframes sunRaysSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes cloudDrift { 0%{transform:translateX(-100%)} 100%{transform:translateX(calc(100vw + 100%))} }
      `}</style>

      {/* Sun */}
      <div
        className="absolute top-4 right-12 w-16 h-16 rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle at 45% 45%, hsl(45,100%,80%), hsl(25,90%,55%), hsl(350,70%,45%))",
          animation: "sunPulse 3s ease-in-out infinite",
        }}
      />

      {/* Sun rays */}
      <div
        className="absolute top-[-20px] right-[-16px] w-48 h-48 pointer-events-none opacity-20"
        style={{ animation: "sunRaysSpin 30s linear infinite" }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 origin-bottom"
            style={{
              width: 2,
              height: 80,
              background: `linear-gradient(to top, hsl(30,90%,55%), transparent)`,
              transform: `translate(-50%, -100%) rotate(${i * 30}deg)`,
            }}
          />
        ))}
      </div>

      {/* Clouds */}
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            top: `${15 + i * 12}%`,
            animation: `cloudDrift ${18 + i * 6}s ${i * 5}s linear infinite`,
            opacity: 0.12 - i * 0.02,
          }}
        >
          <svg width="120" height="40" viewBox="0 0 120 40">
            <ellipse cx="60" cy="25" rx="50" ry="15" fill="hsl(20,40%,70%)" />
            <ellipse cx="40" cy="18" rx="30" ry="14" fill="hsl(20,40%,75%)" />
            <ellipse cx="80" cy="20" rx="28" ry="12" fill="hsl(20,40%,72%)" />
          </svg>
        </div>
      ))}

      {/* Warm gradient at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none opacity-20"
        style={{ background: "linear-gradient(to top, hsl(15,80%,30%), transparent)" }}
      />
    </>
  );
}

/* ────────────────────────────────────
   AURORA – northern lights waves + snow
   ──────────────────────────────────── */
function AuroraOverlay() {
  const snowflakes = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: rand(0, 100),
    size: rand(2, 4),
    duration: rand(6, 14),
    delay: rand(0, 10),
  }));

  return (
    <>
      <style>{`
        @keyframes auroraWave1 {
          0%{transform:translateX(-30%) scaleY(1);opacity:.25}
          50%{transform:translateX(30%) scaleY(1.3);opacity:.4}
          100%{transform:translateX(-30%) scaleY(1);opacity:.25}
        }
        @keyframes auroraWave2 {
          0%{transform:translateX(20%) scaleY(1.2);opacity:.2}
          50%{transform:translateX(-20%) scaleY(0.8);opacity:.35}
          100%{transform:translateX(20%) scaleY(1.2);opacity:.2}
        }
        @keyframes snowFall {
          0%{transform:translateY(-10px) translateX(0);opacity:0}
          10%{opacity:.7}
          90%{opacity:.7}
          100%{transform:translateY(calc(100vh + 20px)) translateX(20px);opacity:0}
        }
      `}</style>

      {/* Aurora band 1 */}
      <div
        className="absolute top-[5%] left-0 right-0 h-48 pointer-events-none blur-2xl"
        style={{
          background: "linear-gradient(90deg, transparent 10%, hsl(170,60%,45%) 30%, hsl(200,60%,50%) 50%, hsl(280,50%,50%) 70%, transparent 90%)",
          animation: "auroraWave1 8s ease-in-out infinite",
        }}
      />

      {/* Aurora band 2 */}
      <div
        className="absolute top-[12%] left-0 right-0 h-32 pointer-events-none blur-3xl"
        style={{
          background: "linear-gradient(90deg, transparent 15%, hsl(160,50%,40%) 35%, hsl(220,60%,55%) 55%, hsl(300,40%,45%) 75%, transparent 90%)",
          animation: "auroraWave2 10s 1s ease-in-out infinite",
        }}
      />

      {/* Snowflakes */}
      {snowflakes.map((s) => (
        <div
          key={s.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${s.x}%`,
            top: "-10px",
            width: s.size,
            height: s.size,
            background: "hsl(200,30%,90%)",
            animation: `snowFall ${s.duration}s ${s.delay}s linear infinite`,
          }}
        />
      ))}

      {/* Mountain silhouettes at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none opacity-20">
        <svg viewBox="0 0 400 80" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,80 L0,60 L40,30 L70,50 L120,15 L160,45 L200,10 L250,40 L290,20 L330,50 L370,25 L400,45 L400,80 Z" fill="hsl(210,25%,12%)" />
        </svg>
      </div>
    </>
  );
}

/* ────────────────────────────────────
   ROYAL – gold filigree, crown, ornaments
   ──────────────────────────────────── */
function RoyalOverlay() {
  return (
    <>
      <style>{`
        @keyframes goldShimmer {
          0%{background-position:200% 0}
          100%{background-position:-200% 0}
        }
        @keyframes crownFloat {
          0%,100%{transform:translateY(0) rotate(-2deg)}
          50%{transform:translateY(-6px) rotate(2deg)}
        }
      `}</style>

      {/* Corner filigree top-left */}
      <svg className="absolute top-0 left-0 w-28 h-28 pointer-events-none opacity-30" viewBox="0 0 100 100">
        <path d="M0,0 Q50,10 40,50 Q30,80 0,100" fill="none" stroke="hsl(45,80%,55%)" strokeWidth="1.5" />
        <path d="M0,0 Q30,30 20,60" fill="none" stroke="hsl(45,80%,55%)" strokeWidth="1" />
        <circle cx="40" cy="50" r="3" fill="hsl(45,90%,60%)" />
        <circle cx="20" cy="60" r="2" fill="hsl(45,90%,60%)" />
        {/* Scroll decoration */}
        <path d="M5,5 Q15,5 15,15 Q15,5 25,5" fill="none" stroke="hsl(45,70%,50%)" strokeWidth="1" />
      </svg>

      {/* Corner filigree top-right */}
      <svg className="absolute top-0 right-0 w-28 h-28 pointer-events-none opacity-30" viewBox="0 0 100 100" style={{ transform: "scaleX(-1)" }}>
        <path d="M0,0 Q50,10 40,50 Q30,80 0,100" fill="none" stroke="hsl(45,80%,55%)" strokeWidth="1.5" />
        <path d="M0,0 Q30,30 20,60" fill="none" stroke="hsl(45,80%,55%)" strokeWidth="1" />
        <circle cx="40" cy="50" r="3" fill="hsl(45,90%,60%)" />
        <circle cx="20" cy="60" r="2" fill="hsl(45,90%,60%)" />
      </svg>

      {/* Bottom filigree border */}
      <div className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none overflow-hidden opacity-25">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent 20px, hsl(45,80%,55%) 20px, hsl(45,80%,55%) 21px, transparent 21px, transparent 40px), 
              repeating-linear-gradient(90deg, transparent, transparent 10px, hsl(45,80%,55%) 10px, hsl(45,80%,55%) 10.5px, transparent 10.5px, transparent 20px)`,
            backgroundPosition: "0 0, 10px 4px",
            backgroundSize: "40px 8px, 20px 4px",
          }}
        />
      </div>

      {/* Floating crown icon */}
      <div
        className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-none opacity-15"
        style={{ animation: "crownFloat 4s ease-in-out infinite" }}
      >
        <svg width="60" height="40" viewBox="0 0 60 40" fill="hsl(45,90%,55%)">
          <path d="M5,30 L10,10 L20,22 L30,5 L40,22 L50,10 L55,30 Z" />
          <rect x="5" y="30" width="50" height="5" rx="1" />
        </svg>
      </div>

      {/* Gold shimmer line */}
      <div
        className="absolute top-[50%] left-0 right-0 h-[1px] pointer-events-none"
        style={{
          background: "linear-gradient(90deg, transparent, hsl(45,80%,55%), transparent, hsl(45,80%,55%), transparent)",
          backgroundSize: "200% 100%",
          animation: "goldShimmer 4s linear infinite",
          opacity: 0.2,
        }}
      />
    </>
  );
}

/* ────────────────────────────────────
   LOL – Hextech runes, magic particles
   ──────────────────────────────────── */
function LolOverlay() {
  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    x: rand(5, 95),
    y: rand(10, 90),
    size: rand(2, 5),
    delay: rand(0, 6),
    duration: rand(3, 6),
  }));

  return (
    <>
      <style>{`
        @keyframes hexPulse {
          0%,100%{stroke-opacity:.2;filter:drop-shadow(0 0 3px hsl(45,100%,50%))}
          50%{stroke-opacity:.5;filter:drop-shadow(0 0 8px hsl(45,100%,50%))}
        }
        @keyframes magicFloat {
          0%{transform:translateY(0) scale(1);opacity:0}
          20%{opacity:.8}
          80%{opacity:.8}
          100%{transform:translateY(-40px) scale(0);opacity:0}
        }
        @keyframes runeGlow {
          0%,100%{opacity:.1} 50%{opacity:.3}
        }
      `}</style>

      {/* Hextech border top */}
      <svg className="absolute top-0 left-0 right-0 h-16 pointer-events-none" viewBox="0 0 400 60" preserveAspectRatio="none">
        <path d="M0,0 L15,0 L25,12 L375,12 L385,0 L400,0" fill="none" stroke="hsl(45,90%,50%)" strokeWidth="1" style={{ animation: "hexPulse 3s ease-in-out infinite" }} />
        <path d="M0,2 L15,2 L25,14 L375,14 L385,2 L400,2" fill="none" stroke="hsl(200,60%,40%)" strokeWidth="0.5" opacity="0.3" />
      </svg>

      {/* Hextech border bottom */}
      <svg className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none" viewBox="0 0 400 60" preserveAspectRatio="none" style={{ transform: "scaleY(-1)" }}>
        <path d="M0,0 L15,0 L25,12 L375,12 L385,0 L400,0" fill="none" stroke="hsl(45,90%,50%)" strokeWidth="1" style={{ animation: "hexPulse 3s 1s ease-in-out infinite" }} />
      </svg>

      {/* Rune circles */}
      <svg className="absolute top-[20%] left-4 w-20 h-20 pointer-events-none" viewBox="0 0 80 80" style={{ animation: "runeGlow 4s ease-in-out infinite" }}>
        <circle cx="40" cy="40" r="35" fill="none" stroke="hsl(45,80%,50%)" strokeWidth="0.8" strokeDasharray="4 6" />
        <circle cx="40" cy="40" r="25" fill="none" stroke="hsl(200,60%,45%)" strokeWidth="0.5" strokeDasharray="2 4" />
        <path d="M40,15 L40,65 M15,40 L65,40" stroke="hsl(45,80%,50%)" strokeWidth="0.5" opacity="0.5" />
      </svg>

      <svg className="absolute bottom-[25%] right-4 w-16 h-16 pointer-events-none" viewBox="0 0 80 80" style={{ animation: "runeGlow 4s 2s ease-in-out infinite" }}>
        <circle cx="40" cy="40" r="30" fill="none" stroke="hsl(45,80%,50%)" strokeWidth="0.8" strokeDasharray="3 5" />
        <polygon points="40,15 60,55 20,55" fill="none" stroke="hsl(200,60%,45%)" strokeWidth="0.5" />
      </svg>

      {/* Magic particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: `hsl(45,100%,${60 + rand(0, 20)}%)`,
            boxShadow: `0 0 ${p.size * 2}px hsl(45,100%,50%)`,
            animation: `magicFloat ${p.duration}s ${p.delay}s ease-in-out infinite`,
          }}
        />
      ))}

      {/* Sword divider */}
      <div className="absolute left-1/2 top-[45%] -translate-x-1/2 pointer-events-none opacity-10">
        <svg width="200" height="2" viewBox="0 0 200 2">
          <line x1="0" y1="1" x2="80" y2="1" stroke="hsl(45,80%,50%)" strokeWidth="1" />
          <polygon points="95,0 100,1 95,2" fill="hsl(45,80%,50%)" />
          <polygon points="105,0 100,1 105,2" fill="hsl(45,80%,50%)" />
          <line x1="120" y1="1" x2="200" y2="1" stroke="hsl(45,80%,50%)" strokeWidth="1" />
        </svg>
      </div>
    </>
  );
}

/* ────────────────────────────────────
   CYBERPUNK – neon grid, glitch, rain
   ──────────────────────────────────── */
function CyberpunkOverlay() {
  const raindrops = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: rand(0, 100),
    height: rand(15, 40),
    duration: rand(0.4, 1.2),
    delay: rand(0, 2),
    opacity: rand(0.15, 0.4),
  }));

  const glitchLines = Array.from({ length: 4 }, (_, i) => ({
    id: i,
    y: rand(10, 90),
    delay: rand(0, 8),
  }));

  return (
    <>
      <style>{`
        @keyframes digitalRain {
          0%{transform:translateY(-100%);opacity:0}
          10%{opacity:1}
          90%{opacity:1}
          100%{transform:translateY(calc(100vh + 100%));opacity:0}
        }
        @keyframes neonFlicker {
          0%,19%,21%,23%,25%,54%,56%,100%{opacity:var(--flicker-opacity, .3)}
          20%,24%,55%{opacity:0}
        }
        @keyframes glitchSlide {
          0%,100%{transform:translateX(0);opacity:0}
          49%{opacity:0}
          50%{transform:translateX(-3px);opacity:.6}
          51%{transform:translateX(5px);opacity:.4}
          52%{transform:translateX(0);opacity:0}
        }
        @keyframes scanline {
          0%{transform:translateY(-100%)}
          100%{transform:translateY(100vh)}
        }
      `}</style>

      {/* Neon grid floor at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none overflow-hidden" style={{ perspective: "400px" }}>
        <div
          className="w-full h-full origin-bottom"
          style={{
            transform: "rotateX(60deg)",
            backgroundImage: `
              linear-gradient(90deg, hsl(180,100%,50%,0.08) 1px, transparent 1px),
              linear-gradient(0deg, hsl(320,100%,50%,0.08) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Neon border accents */}
      <div className="absolute top-0 left-0 right-0 h-[2px] pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, hsl(180,100%,50%), hsl(320,100%,50%), transparent)", opacity: 0.5, animation: "neonFlicker 4s linear infinite", "--flicker-opacity": "0.5" } as any} />
      <div className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none" style={{ background: "linear-gradient(90deg, transparent, hsl(320,100%,50%), hsl(180,100%,50%), transparent)", opacity: 0.4, animation: "neonFlicker 5s 1s linear infinite", "--flicker-opacity": "0.4" } as any} />

      {/* Digital rain */}
      {raindrops.map((r) => (
        <div
          key={r.id}
          className="absolute pointer-events-none"
          style={{
            left: `${r.x}%`,
            top: 0,
            width: 1,
            height: r.height,
            background: `linear-gradient(to bottom, transparent, hsl(180,100%,50%))`,
            opacity: r.opacity,
            animation: `digitalRain ${r.duration}s ${r.delay}s linear infinite`,
          }}
        />
      ))}

      {/* Glitch lines */}
      {glitchLines.map((g) => (
        <div
          key={g.id}
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${g.y}%`,
            height: 2,
            background: "hsl(320,100%,55%)",
            animation: `glitchSlide 6s ${g.delay}s ease-in-out infinite`,
          }}
        />
      ))}

      {/* Scanline */}
      <div
        className="absolute left-0 right-0 h-[1px] pointer-events-none opacity-10"
        style={{
          background: "hsl(180,100%,70%)",
          animation: "scanline 3s linear infinite",
        }}
      />

      {/* Corner cyberpunk brackets */}
      <svg className="absolute top-3 left-3 w-10 h-10 pointer-events-none opacity-40" viewBox="0 0 40 40">
        <path d="M0,12 L0,0 L12,0" fill="none" stroke="hsl(180,100%,50%)" strokeWidth="2" />
      </svg>
      <svg className="absolute top-3 right-3 w-10 h-10 pointer-events-none opacity-40" viewBox="0 0 40 40">
        <path d="M40,12 L40,0 L28,0" fill="none" stroke="hsl(320,100%,50%)" strokeWidth="2" />
      </svg>
      <svg className="absolute bottom-3 left-3 w-10 h-10 pointer-events-none opacity-40" viewBox="0 0 40 40">
        <path d="M0,28 L0,40 L12,40" fill="none" stroke="hsl(320,100%,50%)" strokeWidth="2" />
      </svg>
      <svg className="absolute bottom-3 right-3 w-10 h-10 pointer-events-none opacity-40" viewBox="0 0 40 40">
        <path d="M40,28 L40,40 L28,40" fill="none" stroke="hsl(180,100%,50%)" strokeWidth="2" />
      </svg>
    </>
  );
}

/* ────────────────────────────────────
   MOGGED – Gigachad fade-in with sound
   ──────────────────────────────────── */
function MoggedOverlay() {
  const [show, setShow] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Small delay then fade in + play sound
    const t = setTimeout(() => {
      setShow(true);
      try {
        const audio = new Audio("/sounds/mogged.mp3");
        audio.volume = 0.6;
        audio.play().catch(() => {});
        audioRef.current = audio;
      } catch {}
    }, 300);

    return () => {
      clearTimeout(t);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <>
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at center, transparent 30%, hsl(0,0%,0%) 100%)",
          opacity: 0.7,
        }}
      />

      {/* Gigachad image */}
      <div
        className="absolute bottom-0 right-0 pointer-events-none transition-all duration-[2000ms] ease-out"
        style={{
          opacity: show ? 0.35 : 0,
          transform: show ? "translateY(0) scale(1)" : "translateY(40px) scale(0.95)",
          width: "min(60%, 400px)",
          height: "auto",
        }}
      >
        <img
          src="/images/gigachad-nobg.png"
          alt=""
          className="w-full h-auto grayscale"
          style={{ maskImage: "linear-gradient(to top, black 40%, transparent 100%)" }}
        />
      </div>

      {/* "MOGGED" text watermark */}
      <div
        className="absolute top-[15%] left-1/2 -translate-x-1/2 pointer-events-none transition-opacity duration-[2500ms]"
        style={{ opacity: show ? 0.06 : 0 }}
      >
        <span
          className="text-[8rem] sm:text-[12rem] font-black tracking-[0.3em] select-none"
          style={{ color: "hsl(0,0%,100%)", fontFamily: "Impact, sans-serif" }}
        >
          MOGGED
        </span>
      </div>
    </>
  );
}

/* ────────────────────────────────────
   Main overlay switch
   ──────────────────────────────────── */
export default function ThemeOverlay({ themeId }: ThemeOverlayProps) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {themeId === "midnight" && <MidnightOverlay />}
      {themeId === "forest" && <ForestOverlay />}
      {themeId === "sunset" && <SunsetOverlay />}
      {themeId === "aurora" && <AuroraOverlay />}
      {themeId === "royal" && <RoyalOverlay />}
      {themeId === "lol" && <LolOverlay />}
      {themeId === "cyberpunk" && <CyberpunkOverlay />}
      {themeId === "mogged" && <MoggedOverlay />}
    </div>
  );
}
