import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { RotateCcw } from "lucide-react";

interface Props {
  imageUrl: string;
  itemName: string;
  initialFocalX: number;
  initialFocalY: number;
  initialZoom: number;
  initialPadTop: number;
  initialPadLeft: number;
  onSave: (focalX: number, focalY: number, zoom: number, padTop: number, padLeft: number) => void;
  onCancel: () => void;
}

export default function ImagePositionEditor({
  imageUrl, itemName, initialFocalX, initialFocalY, initialZoom, initialPadTop, initialPadLeft, onSave, onCancel,
}: Props) {
  const [focalX, setFocalX] = useState(initialFocalX);
  const [focalY, setFocalY] = useState(initialFocalY);
  const [zoom, setZoom] = useState(initialZoom);
  const [padTop, setPadTop] = useState(initialPadTop);
  const [padLeft, setPadLeft] = useState(initialPadLeft);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFocal(e);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    updateFocal(e);
  }, []);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const updateFocal = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)));
    setFocalX(x);
    setFocalY(y);
  };

  const handleReset = () => {
    setFocalX(50);
    setFocalY(50);
    setZoom(1);
    setPadTop(0);
    setPadLeft(0);
  };

  const clampInt = (v: string, min: number, max: number) => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return min;
    return Math.max(min, Math.min(max, n));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">Image Adjustment</h4>
        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1 text-xs h-7">
          <RotateCcw className="h-3 w-3" /> Reset All
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">Click/drag to set focal point. Use sliders or type values for precise control.</p>

      {/* Live preview */}
      <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden max-w-[320px] mx-auto"> className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden max-w-[320px] mx-auto">">
        <div
          ref={containerRef}
          className="w-full aspect-[5/4] overflow-hidden relative cursor-crosshair select-none bg-muted/30"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: "none" }}
        >
          <img
            src={imageUrl}
            alt={itemName}
            className="absolute object-contain pointer-events-none"
            draggable={false}
            style={{
              top: `${padTop}%`,
              left: `${padLeft}%`,
              width: `${100 - padLeft}%`,
              height: `${100 - padTop}%`,
              objectPosition: `${focalX}% ${focalY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${focalX}% ${focalY}%`,
            }}
          />
          {/* Focal point indicator */}
          <div
            className="absolute w-5 h-5 rounded-full border-2 border-primary bg-primary/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-lg"
            style={{ left: `${padLeft + (100 - padLeft) * focalX / 100}%`, top: `${padTop + (100 - padTop) * focalY / 100}%` }}
          >
            <div className="absolute inset-[3px] rounded-full bg-primary" />
          </div>
          {/* Border guides */}
          {padTop > 0 && (
            <div className="absolute left-0 right-0 top-0 border-b border-dashed border-primary/40 pointer-events-none" style={{ height: `${padTop}%` }}>
              <span className="absolute bottom-0.5 left-1 text-[8px] text-primary/60 font-mono">{padTop}%</span>
            </div>
          )}
          {padLeft > 0 && (
            <div className="absolute top-0 bottom-0 left-0 border-r border-dashed border-primary/40 pointer-events-none" style={{ width: `${padLeft}%` }}>
              <span className="absolute right-0.5 top-1 text-[8px] text-primary/60 font-mono writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>{padLeft}%</span>
            </div>
          )}
        </div>
        <div className="px-2 py-1.5 text-center">
          <h3 className="text-sm font-extrabold text-foreground truncate">{itemName}</h3>
        </div>
      </div>

      {/* Controls grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Focal X */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Focal X</label>
            <Input
              type="number" min={0} max={100}
              value={focalX}
              onChange={e => setFocalX(clampInt(e.target.value, 0, 100))}
              className="w-14 h-6 text-[10px] text-right px-1 font-mono"
            />
          </div>
          <Slider min={0} max={100} step={1} value={[focalX]} onValueChange={([v]) => setFocalX(v)} />
        </div>

        {/* Focal Y */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Focal Y</label>
            <Input
              type="number" min={0} max={100}
              value={focalY}
              onChange={e => setFocalY(clampInt(e.target.value, 0, 100))}
              className="w-14 h-6 text-[10px] text-right px-1 font-mono"
            />
          </div>
          <Slider min={0} max={100} step={1} value={[focalY]} onValueChange={([v]) => setFocalY(v)} />
        </div>

        {/* Zoom */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Zoom</label>
            <Input
              type="number" min={0.3} max={3} step={0.05}
              value={zoom.toFixed(2)}
              onChange={e => {
                const n = parseFloat(e.target.value);
                if (!isNaN(n)) setZoom(Math.max(0.3, Math.min(3, n)));
              }}
              className="w-14 h-6 text-[10px] text-right px-1 font-mono"
            />
          </div>
          <Slider min={0.3} max={3} step={0.05} value={[zoom]} onValueChange={([v]) => setZoom(v)} />
        </div>

        {/* Pad Top (border top) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Border Top</label>
            <Input
              type="number" min={0} max={50}
              value={padTop}
              onChange={e => setPadTop(clampInt(e.target.value, 0, 50))}
              className="w-14 h-6 text-[10px] text-right px-1 font-mono"
            />
          </div>
          <Slider min={0} max={50} step={1} value={[padTop]} onValueChange={([v]) => setPadTop(v)} />
        </div>

        {/* Pad Left (border left) */}
        <div className="col-span-2 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Border Left</label>
            <Input
              type="number" min={0} max={50}
              value={padLeft}
              onChange={e => setPadLeft(clampInt(e.target.value, 0, 50))}
              className="w-14 h-6 text-[10px] text-right px-1 font-mono"
            />
          </div>
          <Slider min={0} max={50} step={1} value={[padLeft]} onValueChange={([v]) => setPadLeft(v)} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={() => onSave(focalX, focalY, zoom, padTop, padLeft)}>Save</Button>
      </div>
    </div>
  );
}
