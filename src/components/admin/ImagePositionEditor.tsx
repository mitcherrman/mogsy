import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { RotateCcw } from "lucide-react";

interface Props {
  imageUrl: string;
  itemName: string;
  initialFocalX: number;
  initialFocalY: number;
  initialZoom: number;
  onSave: (focalX: number, focalY: number, zoom: number) => void;
  onCancel: () => void;
}

export default function ImagePositionEditor({
  imageUrl, itemName, initialFocalX, initialFocalY, initialZoom, onSave, onCancel,
}: Props) {
  const [focalX, setFocalX] = useState(initialFocalX);
  const [focalY, setFocalY] = useState(initialFocalY);
  const [zoom, setZoom] = useState(initialZoom);
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
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">Position & Zoom</h4>
        <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1 text-xs h-7">
          <RotateCcw className="h-3 w-3" /> Reset
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">Click or drag on the preview to set the focal point. The card will crop around that point.</p>

      {/* Live preview in card aspect ratio */}
      <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden max-w-[240px] mx-auto">
        <div
          ref={containerRef}
          className="w-full aspect-[5/4] overflow-hidden relative cursor-crosshair select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: "none" }}
        >
          <img
            src={imageUrl}
            alt={itemName}
            className="w-full h-full object-cover pointer-events-none"
            draggable={false}
            style={{
              objectPosition: `${focalX}% ${focalY}%`,
              transform: `scale(${zoom})`,
              transformOrigin: `${focalX}% ${focalY}%`,
            }}
          />
          {/* Focal point indicator */}
          <div
            className="absolute w-5 h-5 rounded-full border-2 border-primary bg-primary/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-lg"
            style={{ left: `${focalX}%`, top: `${focalY}%` }}
          >
            <div className="absolute inset-[3px] rounded-full bg-primary" />
          </div>
          {/* Crosshair lines */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute bg-primary/20" style={{ left: `${focalX}%`, top: 0, bottom: 0, width: 1 }} />
            <div className="absolute bg-primary/20" style={{ top: `${focalY}%`, left: 0, right: 0, height: 1 }} />
          </div>
        </div>
        <div className="px-2 py-1.5 text-center">
          <h3 className="text-sm font-extrabold text-foreground truncate">{itemName}</h3>
        </div>
      </div>

      {/* Zoom slider */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Zoom</label>
          <span className="text-xs font-mono text-foreground">{zoom.toFixed(1)}×</span>
        </div>
        <Slider
          min={1}
          max={3}
          step={0.1}
          value={[zoom]}
          onValueChange={([v]) => setZoom(v)}
        />
      </div>

      {/* Position readout */}
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>X: <span className="font-mono text-foreground">{focalX}%</span></span>
        <span>Y: <span className="font-mono text-foreground">{focalY}%</span></span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={() => onSave(focalX, focalY, zoom)}>Save Position</Button>
      </div>
    </div>
  );
}
