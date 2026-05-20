import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function SecretRoom() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "hsl(230,40%,8%)" }}
    >
      {/* Back button */}
      <Button
        variant="ghost"
        size="icon" aria-label="Go back"
        onClick={() => navigate(-1)}
        className="absolute top-4 left-4 z-20 text-[hsl(180,60%,60%)] hover:text-[hsl(180,80%,70%)]"
      >
        <ArrowLeft className="w-6 h-6" />
      </Button>

      {/* Room SVG — pencil-drawn style */}
      <svg
        viewBox="0 0 600 400"
        className="w-full max-w-xl px-4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Floor */}
        <path
          d="M40,320 L560,320"
          stroke="hsl(230,20%,35%)"
          strokeWidth="4"
          strokeDasharray="2,0"
          style={{ filter: "url(#pencil)" }}
        />
        {/* Back wall */}
        <path
          d="M80,100 L80,320 M520,100 L520,320 M80,100 L520,100"
          stroke="hsl(230,20%,30%)"
          strokeWidth="3.5"
        />
        {/* Wall texture lines */}
        <path d="M150,100 L150,320" stroke="hsl(230,15%,25%)" strokeWidth="1" opacity="0.3" />
        <path d="M300,100 L300,320" stroke="hsl(230,15%,25%)" strokeWidth="1" opacity="0.3" />
        <path d="M450,100 L450,320" stroke="hsl(230,15%,25%)" strokeWidth="1" opacity="0.3" />

        {/* Ceiling light */}
        <line x1="300" y1="100" x2="300" y2="140" stroke="hsl(45,60%,50%)" strokeWidth="2" />
        <ellipse cx="300" cy="145" rx="12" ry="6" stroke="hsl(45,60%,50%)" strokeWidth="2.5" />
        <ellipse cx="300" cy="145" rx="20" ry="10" stroke="hsl(45,50%,40%)" strokeWidth="1" opacity="0.3" />

        {/* Light cone */}
        <path
          d="M280,150 L220,320 M320,150 L380,320"
          stroke="hsl(45,60%,50%)"
          strokeWidth="0.5"
          opacity="0.15"
        />

        {/* COUCH — thick pencil-drawn */}
        {/* Couch base */}
        <path
          d="M180,260 Q180,240 200,238 L400,238 Q420,240 420,260 L420,290 Q420,300 410,300 L190,300 Q180,300 180,290 Z"
          stroke="hsl(0,60%,45%)"
          strokeWidth="4"
          fill="hsl(0,50%,30%)"
          opacity="0.8"
        />
        {/* Couch back */}
        <path
          d="M185,240 Q185,200 205,195 L395,195 Q415,200 415,240"
          stroke="hsl(0,60%,45%)"
          strokeWidth="4"
          fill="hsl(0,45%,25%)"
          opacity="0.8"
        />
        {/* Couch cushion lines */}
        <line x1="260" y1="240" x2="260" y2="295" stroke="hsl(0,50%,40%)" strokeWidth="2.5" />
        <line x1="340" y1="240" x2="340" y2="295" stroke="hsl(0,50%,40%)" strokeWidth="2.5" />
        {/* Couch armrests */}
        <path
          d="M170,230 Q165,235 165,260 L165,290 Q165,305 180,305 L185,305 L185,238 Q178,238 170,230Z"
          stroke="hsl(0,55%,42%)"
          strokeWidth="3"
          fill="hsl(0,45%,28%)"
          opacity="0.8"
        />
        <path
          d="M430,230 Q435,235 435,260 L435,290 Q435,305 420,305 L415,305 L415,238 Q422,238 430,230Z"
          stroke="hsl(0,55%,42%)"
          strokeWidth="3"
          fill="hsl(0,45%,28%)"
          opacity="0.8"
        />
        {/* Couch legs */}
        <line x1="190" y1="300" x2="188" y2="318" stroke="hsl(0,30%,25%)" strokeWidth="3" />
        <line x1="410" y1="300" x2="412" y2="318" stroke="hsl(0,30%,25%)" strokeWidth="3" />

        {/* Side table */}
        <rect x="460" y="265" width="40" height="55" rx="3" stroke="hsl(30,30%,35%)" strokeWidth="3" fill="hsl(30,20%,18%)" opacity="0.7" />
        <ellipse cx="480" cy="260" rx="8" ry="12" stroke="hsl(180,50%,45%)" strokeWidth="2" fill="hsl(180,40%,20%)" opacity="0.6" />

        {/* Picture frame on wall */}
        <rect x="260" y="130" width="80" height="55" rx="2" stroke="hsl(45,40%,45%)" strokeWidth="2.5" fill="hsl(230,25%,15%)" />
        <text x="300" y="162" textAnchor="middle" fill="hsl(180,50%,50%)" fontSize="10" fontFamily="monospace" opacity="0.7">SUS</text>

        {/* Rug */}
        <ellipse cx="300" cy="315" rx="100" ry="8" stroke="hsl(280,30%,35%)" strokeWidth="2" fill="hsl(280,25%,18%)" opacity="0.5" />

        {/* Pencil texture filter */}
        <defs>
          <filter id="pencil">
            <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.5" />
          </filter>
        </defs>
      </svg>

      {/* Text */}
      <p
        className="mt-8 text-lg font-mono tracking-wide animate-fade-in"
        style={{ color: "hsl(180,60%,60%)" }}
      >
        You found the secret room...
      </p>
      <p
        className="mt-2 text-sm font-mono opacity-50"
        style={{ color: "hsl(230,20%,60%)" }}
      >
        shhh... don't tell anyone
      </p>

      {/* Twerking Among Us GIF */}
      <div className="mt-8">
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          className="w-32 h-32 md:w-40 md:h-40 object-contain drop-shadow-lg"
        >
          <source src="/images/twerking-amongus.webm" type="video/webm" />
          <source src="/images/twerking-amongus.mp4" type="video/mp4" />
          <img src="/images/twerking-amongus.gif" alt="secret crewmate" className="w-32 h-32 md:w-40 md:h-40 object-contain drop-shadow-lg" draggable={false} />
        </video>
      </div>
    </div>
  );
}
