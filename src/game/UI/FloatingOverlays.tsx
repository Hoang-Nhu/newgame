import React from 'react';
import { ProjectedDamageItem, ProjectedHeroOverlay } from '../types';

interface FloatingOverlaysProps {
  heroes: ProjectedHeroOverlay[];
  damages: ProjectedDamageItem[];
}

export const FloatingOverlays: React.FC<FloatingOverlaysProps> = ({ heroes, damages }) => {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
      {/* Overhead Hero Nameplates & Health Bars */}
      {heroes.map((h) => {
        if (!h.visible || !h.showBarAndName) return null;
        const pct = Math.max(0, Math.min(100, (h.hp / h.maxHp) * 100));

        return (
          <div
            key={h.id}
            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center gap-0.5"
            style={{
              left: `${h.screenX}px`,
              top: `${h.screenY}px`,
              opacity: h.isInvisible || h.inBush ? 0.65 : 1,
            }}
          >
            {/* Status indicators */}
            <div className="flex items-center gap-1 text-[10px] font-bold tracking-wide">
              {h.comboStep > 0 && !h.isClone && (
                <span className="text-amber-300 bg-black/80 px-1 rounded font-mono-num">
                  C{h.comboStep}/3
                </span>
              )}
              {h.isTitan && <span className="text-amber-300 bg-black/75 px-1 rounded">KHỔNG LỒ</span>}
              {h.hasShield && <span className="text-sky-300 bg-black/75 px-1 rounded">KHIÊN</span>}
              {h.isStunned && <span className="text-yellow-300 bg-black/80 px-1 rounded">CHOÁNG</span>}
              {h.isKnockedUp && <span className="text-rose-300 bg-black/80 px-1 rounded">HẤT TUNG</span>}
              {h.isRooted && <span className="text-purple-300 bg-black/75 px-1 rounded">BẤT ĐỘNG</span>}
              {h.isSlowed && <span className="text-cyan-300 bg-black/75 px-1 rounded">CHẬM</span>}
              {h.isInvisible && <span className="text-fuchsia-300 bg-black/75 px-1 rounded">TÀNG HÌNH</span>}
            </div>

            {/* Hero Name */}
            <div
              className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-[#0b0e14]/88 border ${
                h.isPlayer ? 'border-amber-400/80' : 'border-white/10'
              }`}
            >
              <span
                className="w-2 h-2 rounded-xs shrink-0"
                style={{ backgroundColor: h.cssColor }}
              />
              <span className="text-[11px] font-semibold text-slate-100 whitespace-nowrap leading-none">
                {h.isPlayer ? `${h.displayName} (Bạn)` : h.displayName}
              </span>
              {!h.isClone && (
                <span className="text-[10px] font-mono-num text-slate-300 leading-none">
                  {Math.round(h.hp)}
                </span>
              )}
            </div>

            {/* HP Bar + Ready Dots */}
            <div className="w-24 h-2 bg-[#0b0e14]/90 border border-white/20 rounded-xs overflow-hidden p-[1px]">
              <div
                className="h-full transition-[width] duration-75"
                style={{
                  width: `${pct}%`,
                  backgroundColor: h.isClone ? '#c084fc' : h.cssColor,
                }}
              />
            </div>

            {!h.isClone && (
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  title="Skill 1"
                  className={`w-2 h-1 rounded-xs ${h.skill1Ready ? 'bg-sky-400' : 'bg-slate-700'}`}
                />
                <span
                  title="Skill 2"
                  className={`w-2 h-1 rounded-xs ${h.skill2Ready ? 'bg-emerald-400' : 'bg-slate-700'}`}
                />
                <span
                  title="Ultimate"
                  className={`w-3 h-1 rounded-xs ${h.ultReady ? 'bg-amber-400' : 'bg-slate-700'}`}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Floating Damage & Heal Numbers */}
      {damages.map((d) => {
        let colorClass = 'text-rose-400 text-base font-bold';
        if (d.kind === 'crit') colorClass = 'text-amber-300 text-xl font-extrabold';
        else if (d.kind === 'heal') colorClass = 'text-emerald-400 text-base font-bold';
        else if (d.kind === 'shield') colorClass = 'text-sky-300 text-sm font-bold';
        else if (d.kind === 'status') colorClass = 'text-fuchsia-300 text-xs font-bold tracking-wider';

        return (
          <div
            key={d.id}
            className={`absolute font-mono-num whitespace-nowrap animate-float-damage drop-shadow-[0_2px_3px_rgba(0,0,0,0.95)] ${colorClass}`}
            style={{
              left: `${d.screenX}px`,
              top: `${d.screenY}px`,
            }}
          >
            {d.text}
          </div>
        );
      })}
    </div>
  );
};
