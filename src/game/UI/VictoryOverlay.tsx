import React from 'react';
import { RotateCcw, Skull, Swords, Trophy } from 'lucide-react';
import { CHARACTER_CONFIGS } from '../Character/CharacterConfig';
import { CharacterHUDInfo } from '../types';

interface VictoryOverlayProps {
  winner: CharacterHUDInfo | null;
  heroes: CharacterHUDInfo[];
  elapsedTime: number;
  onRestart: () => void;
  onOpenHeroModal: () => void;
}

export const VictoryOverlay: React.FC<VictoryOverlayProps> = ({
  winner,
  heroes,
  elapsedTime,
  onRestart,
  onOpenHeroModal,
}) => {
  if (!winner) return null;

  const playerWon = winner.isPlayer;
  const sorted = [...heroes].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.damageDealt - a.damageDealt;
  });

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#0a1120] border border-amber-500/45 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${
              playerWon
                ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                : 'bg-rose-500/15 border-rose-400/50 text-rose-300'
            }`}
          >
            {playerWon ? <Trophy className="w-6 h-6" /> : <Skull className="w-6 h-6" />}
          </div>
          <div>
            <p className="text-xs text-slate-400">
              Người sống sót cuối · {elapsedTime.toFixed(1)}s
            </p>
            <h2 className="font-display text-2xl font-black text-white">
              {playerWon ? 'Chiến Thắng!' : `${winner.displayName} Thắng!`}
            </h2>
          </div>
        </div>

        <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-2xl overflow-hidden mb-5">
          {sorted.map((h) => {
            const cfg = CHARACTER_CONFIGS[h.charClass];
            return (
              <div
                key={h.id}
                className="flex items-center justify-between px-3.5 py-2 text-xs bg-[#101829]/80"
              >
                <div className="flex items-center gap-2">
                  <span>{cfg.icon}</span>
                  <span className="font-bold text-slate-100">
                    {h.displayName} {h.isPlayer ? '(Bạn)' : ''}
                  </span>
                  {h.alive && (
                    <span className="text-[10px] text-emerald-400 font-bold">Sống sót</span>
                  )}
                </div>
                <div className="flex items-center gap-4 font-mono-num text-slate-300">
                  <span>{h.kills} Hạ</span>
                  <span>{h.damageDealt} ST</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onRestart}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 hover:brightness-110 text-slate-950 font-black text-sm transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Đấu Lại</span>
          </button>
          <button
            type="button"
            onClick={onOpenHeroModal}
            className="flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm border border-slate-600 cursor-pointer"
          >
            <Swords className="w-4 h-4" />
            <span>Đổi Tướng</span>
          </button>
        </div>
      </div>
    </div>
  );
};
