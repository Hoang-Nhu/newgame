import React, { useEffect, useRef } from 'react';
import { MinimapSnapshot } from '../types';

interface MinimapProps {
  snapshot: MinimapSnapshot | null;
  onPanTo: (x: number, z: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({ snapshot, onPanTo }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const size = 164;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const half = snapshot.arenaHalfSize;
    const scale = size / (half * 2);
    const toPx = (wx: number, wz: number) => ({
      px: (wx + half) * scale,
      py: (wz + half) * scale,
    });

    // Background
    ctx.fillStyle = '#0e131b';
    ctx.fillRect(0, 0, size, size);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = (size / 4) * i;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    // Bushes
    snapshot.bushes.forEach((b) => {
      const { px, py } = toPx(b.x, b.z);
      ctx.fillStyle = b.rustling ? 'rgba(74, 222, 128, 0.52)' : 'rgba(34, 108, 66, 0.45)';
      ctx.beginPath();
      ctx.arc(px, py, b.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      if (b.rustling) {
        ctx.strokeStyle = '#86efac';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    });

    // Active Lava Fissures
    snapshot.lavaZones.forEach((l) => {
      const p1 = toPx(l.x, l.z);
      const p2 = toPx(l.x + l.dirX * l.length, l.z + l.dirZ * l.length);
      ctx.strokeStyle = '#ff5722';
      ctx.lineWidth = Math.max(2, l.width * scale);
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();
    });

    // Obstacles
    snapshot.obstacles.forEach((o) => {
      const { px, py } = toPx(o.x, o.z);
      if (o.type === 'wall' && o.halfW !== undefined && o.halfD !== undefined) {
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(
          px - o.halfW * scale,
          py - o.halfD * scale,
          o.halfW * 2 * scale,
          o.halfD * 2 * scale
        );
      } else if (o.type === 'tree') {
        ctx.fillStyle = '#14532d';
        ctx.beginPath();
        ctx.arc(px, py, o.radius * scale, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#64748b';
        ctx.beginPath();
        ctx.arc(px, py, o.radius * scale, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Heroes
    snapshot.heroes.forEach((h) => {
      if (!h.alive) return;
      const { px, py } = toPx(h.x, h.z);
      if (h.hidden) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
        return;
      }

      ctx.fillStyle = h.cssColor;
      ctx.beginPath();
      ctx.arc(px, py, h.isClone ? 2.6 : 4.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = h.isFollowed ? '#ffffff' : '#0b0e14';
      ctx.lineWidth = h.isFollowed ? 1.8 : 1;
      ctx.stroke();
    });

    // Camera viewport box
    const camPos = toPx(snapshot.cameraCenter.x, snapshot.cameraCenter.z);
    const boxSize = Math.min(size, snapshot.cameraViewSpan * scale);
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(camPos.px - boxSize / 2, camPos.py - boxSize / 2, boxSize, boxSize);
  }, [snapshot]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!snapshot || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const half = snapshot.arenaHalfSize;
    onPanTo((nx - 0.5) * half * 2, (ny - 0.5) * half * 2);
  };

  return (
    <div className="pointer-events-auto hidden sm:flex flex-col gap-1 bg-[#0a1120]/90 border border-slate-700/75 rounded-xl p-1.5 shadow-xl">
      <div className="flex items-center justify-between px-1 text-[10px] font-bold text-slate-300">
        <span>Bản Đồ</span>
        <span className="font-mono-num text-[9px] text-slate-400">56m</span>
      </div>
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        onClick={handleClick}
        className="w-[126px] h-[126px] rounded-lg border border-slate-800 cursor-crosshair block"
        title="Click để di chuyển camera tới vị trí"
      />
    </div>
  );
};
