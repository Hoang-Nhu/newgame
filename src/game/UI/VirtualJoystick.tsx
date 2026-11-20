import React, { useRef, useState } from 'react';

interface VirtualJoystickProps {
  onChange: (dx: number, dz: number, active: boolean) => void;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onChange }) => {
  const padRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });

  const updateFromClient = (clientX: number, clientY: number) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const maxR = rect.width * 0.36;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR && dist > 0.001) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setKnobPos({ x: dx, y: dy });
    onChange(dx / Math.max(1, maxR), dy / Math.max(1, maxR), true);
  };

  const reset = () => {
    pointerIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });
    onChange(0, 0, false);
  };

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-1.5 select-none touch-none">
      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          pointerIdRef.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromClient(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointerIdRef.current !== e.pointerId) return;
          updateFromClient(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (pointerIdRef.current !== e.pointerId) return;
          reset();
        }}
        onPointerCancel={reset}
        className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#0a1120]/88 border-2 border-sky-400/35 shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing"
      >
        <div className="w-12 h-12 rounded-full border border-dashed border-white/20 pointer-events-none" />
        <div
          className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-400 to-indigo-600 border-2 border-white/75 shadow-lg pointer-events-none"
          style={{ transform: `translate(${knobPos.x}px, ${knobPos.y}px)` }}
        />
      </div>
      <span className="text-[10px] text-slate-300/85 font-semibold hidden sm:inline">
        WASD / Joystick · Giữ Chuột Phải xoay 3D
      </span>
    </div>
  );
};
