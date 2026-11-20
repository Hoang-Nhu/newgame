import React, { useEffect, useRef } from 'react';
import { CHARACTER_CONFIGS } from '../Character/CharacterConfig';
import { CharacterHUDInfo, SkillSlot } from '../types';

interface MobaSkillClusterProps {
  playerHero: CharacterHUDInfo | null;
  onStartPreview: (slot: SkillSlot) => void;
  onUpdatePreview: (dragDx: number, dragDy: number) => void;
  onCommitPreview: () => void;
  onCancelPreview: () => void;
}

export const MobaSkillCluster: React.FC<MobaSkillClusterProps> = ({
  playerHero,
  onStartPreview,
  onUpdatePreview,
  onCommitPreview,
  onCancelPreview,
}) => {
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
  }>({ active: false, pointerId: null, startX: 0, startY: 0 });

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!dragStateRef.current.active || e.pointerId !== dragStateRef.current.pointerId) return;
      onUpdatePreview(
        e.clientX - dragStateRef.current.startX,
        e.clientY - dragStateRef.current.startY
      );
    };

    const handleUp = (e: PointerEvent) => {
      if (!dragStateRef.current.active || e.pointerId !== dragStateRef.current.pointerId) return;
      dragStateRef.current.active = false;
      dragStateRef.current.pointerId = null;
      onCommitPreview();
    };

    const handleCancel = () => {
      if (!dragStateRef.current.active) return;
      dragStateRef.current.active = false;
      dragStateRef.current.pointerId = null;
      onCancelPreview();
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [onUpdatePreview, onCommitPreview, onCancelPreview]);

  if (!playerHero) return null;

  if (!playerHero.alive) {
    return (
      <div className="pointer-events-auto rounded-2xl bg-[#0a1120]/90 border border-rose-500/40 px-4 py-2.5 text-xs font-bold text-rose-300 shadow-xl">
        Bạn đã bị loại · Đang theo dõi đấu trường
      </div>
    );
  }

  const cfg = CHARACTER_CONFIGS[playerHero.charClass];

  const beginHold = (slot: SkillSlot) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
    onStartPreview(slot);
  };

  const renderSkillButton = (
    slot: 'skill1' | 'skill2' | 'ultimate',
    keyHint: string,
    gradientClass: string,
    sizeClass: string
  ) => {
    const def = cfg.skills[slot];
    const cd = playerHero.cooldowns[slot];
    const maxCd = playerHero.maxCooldowns[slot];
    const cdPct = maxCd > 0 ? Math.min(100, (cd / maxCd) * 100) : 0;

    return (
      <button
        key={slot}
        type="button"
        onPointerDown={beginHold(slot)}
        title={`${def.name}: ${def.description} (Giữ & kéo để ngắm hướng 3D)`}
        className={`relative rounded-full bg-gradient-to-br ${gradientClass} ${sizeClass} font-black text-[9px] sm:text-[10px] border-2 shadow-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden px-1 select-none touch-none active:scale-92 transition-transform`}
      >
        <div
          className="absolute inset-x-0 bottom-0 bg-slate-950/75 pointer-events-none"
          style={{ height: `${cdPct}%` }}
        />
        <span className="relative z-10 leading-tight text-center drop-shadow-sm">
          {def.name}
        </span>
        <span className="relative z-10 text-[8px] font-mono-num opacity-95 mt-0.5">
          {cd > 0.05 ? `${cd.toFixed(1)}s` : keyHint}
        </span>
      </button>
    );
  };

  const basicCd = playerHero.cooldowns.basic;
  const basicMax = playerHero.maxCooldowns.basic;
  const basicPct = basicMax > 0 ? Math.min(100, (basicCd / basicMax) * 100) : 0;
  const nextHitLabel =
    playerHero.comboStep === 2
      ? 'ĐÒN 3!'
      : playerHero.comboStep === 1
      ? 'ĐÒN 2'
      : 'ĐÁNH THƯỜNG';

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-2 select-none touch-none">
      {/* Combo hint pill above cluster */}
      <div className="px-2.5 py-0.5 rounded-full bg-[#0a1120]/88 border border-slate-700/75 text-[10px] font-bold text-amber-300">
        {cfg.comboHit3Label} · Giữ nút để ngắm 3D
      </div>

      <div className="flex items-end gap-2.5">
        {/* 3 Skills arranged cleanly next to Main Attack */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {renderSkillButton(
              'skill1',
              'Q / 1',
              'from-amber-400 to-orange-600 text-slate-950 border-amber-100/80',
              'w-14 h-14 sm:w-16 sm:h-16'
            )}
            {renderSkillButton(
              'skill2',
              'E / 2',
              'from-fuchsia-500 to-purple-700 text-white border-fuchsia-200/80',
              'w-14 h-14 sm:w-16 sm:h-16'
            )}
            {renderSkillButton(
              'ultimate',
              'R / 3',
              'from-yellow-300 via-amber-500 to-red-600 text-slate-950 border-yellow-100',
              'w-15 h-15 sm:w-17 sm:h-17'
            )}
          </div>
        </div>

        {/* Big Circular Basic Attack / 3-Hit Combo Button */}
        <button
          type="button"
          onPointerDown={beginHold('basic')}
          title={`${cfg.skills.basic.name}: ${cfg.skills.basic.description}`}
          className={`relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br ${
            playerHero.comboStep === 2
              ? 'from-yellow-300 via-amber-500 to-rose-600 border-yellow-100'
              : 'from-amber-400 via-orange-500 to-rose-600 border-amber-200/85'
          } text-slate-950 font-black border-4 shadow-2xl flex flex-col items-center justify-center cursor-pointer overflow-hidden select-none touch-none active:scale-92 transition-transform`}
        >
          <div
            className="absolute inset-x-0 bottom-0 bg-slate-950/65 pointer-events-none"
            style={{ height: `${basicPct}%` }}
          />
          <span className="relative z-10 text-xl sm:text-2xl leading-none">{cfg.icon}</span>
          <span className="relative z-10 text-[9px] sm:text-[10px] tracking-tight mt-1 font-black text-center leading-tight px-1">
            {nextHitLabel}
          </span>
          <span className="relative z-10 text-[8px] font-mono-num opacity-85">
            {basicCd > 0.05 ? `${basicCd.toFixed(1)}s` : 'LMB / J'}
          </span>
        </button>
      </div>
    </div>
  );
};
