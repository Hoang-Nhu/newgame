import React from 'react';
import { Eye, EyeOff, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { CHARACTER_CONFIGS } from '../Character/CharacterConfig';
import { CameraMode, CharacterHUDInfo } from '../types';

interface TopHUDProps {
  heroes: CharacterHUDInfo[];
  playerHero: CharacterHUDInfo | null;
  nearestEnemy: CharacterHUDInfo | null;
  followedHeroId: string | null;
  elapsedTime: number;
  aliveCount: number;
  cameraMode: CameraMode;
  paused: boolean;
  muted: boolean;
  revealFog: boolean;
  killFeed: Array<{
    id: number;
    killer: string;
    victim: string;
    skillName: string;
    time: number;
    killerColor: string;
  }>;
  onOpenHeroModal: () => void;
  onToggleCamera: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onToggleRevealFog: () => void;
  onRestart: () => void;
  onFollowHero: (id: string) => void;
}

const StatusBadges: React.FC<{ hero: CharacterHUDInfo }> = ({ hero }) => (
  <div className="flex items-center gap-1 flex-wrap">
    {hero.inBush && (
      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-200 text-[9px] font-bold">
        🌿 Ẩn bụi
      </span>
    )}
    {hero.hasShield && (
      <span className="px-1.5 py-0.5 rounded bg-sky-500/25 text-sky-200 text-[9px] font-bold">
        🛡️ Khiên -50%
      </span>
    )}
    {hero.isTitan && (
      <span className="px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-200 text-[9px] font-bold">
        👑 Khổng Lồ
      </span>
    )}
    {hero.isSpedUp && (
      <span className="px-1.5 py-0.5 rounded bg-cyan-500/25 text-cyan-200 text-[9px] font-bold">
        ⚡ +50% Tốc
      </span>
    )}
    {hero.isStunned && (
      <span className="px-1.5 py-0.5 rounded bg-yellow-500/30 text-yellow-200 text-[9px] font-bold">
        💫 Choáng
      </span>
    )}
    {hero.isKnockedUp && (
      <span className="px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 text-[9px] font-bold">
        🌀 Hất Tung
      </span>
    )}
    {hero.isRooted && (
      <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200 text-[9px] font-bold">
        🔒 Bất Động
      </span>
    )}
    {hero.isSlowed && (
      <span className="px-1.5 py-0.5 rounded bg-blue-500/30 text-blue-200 text-[9px] font-bold">
        ❄️ Chậm
      </span>
    )}
    {hero.isInvisible && (
      <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/30 text-fuchsia-200 text-[9px] font-bold">
        👻 Vô Hình
      </span>
    )}
  </div>
);

export const TopHUD: React.FC<TopHUDProps> = ({
  heroes,
  playerHero,
  nearestEnemy,
  followedHeroId,
  elapsedTime,
  aliveCount,
  cameraMode,
  paused,
  muted,
  revealFog,
  killFeed,
  onOpenHeroModal,
  onToggleCamera,
  onTogglePause,
  onToggleMute,
  onToggleRevealFog,
  onRestart,
  onFollowHero,
}) => {
  const mins = Math.floor(elapsedTime / 60);
  const secs = Math.floor(elapsedTime % 60);
  const clockStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const pCfg = playerHero ? CHARACTER_CONFIGS[playerHero.charClass] : null;
  const pHpPct = playerHero ? Math.max(0, Math.min(100, (playerHero.hp / playerHero.maxHp) * 100)) : 0;
  const comboTimerPct = playerHero
    ? Math.max(0, Math.min(100, (playerHero.comboResetTimer / 2.0) * 100))
    : 0;

  const eCfg = nearestEnemy ? CHARACTER_CONFIGS[nearestEnemy.charClass] : null;
  const eHpPct = nearestEnemy
    ? Math.max(0, Math.min(100, (nearestEnemy.hp / nearestEnemy.maxHp) * 100))
    : 0;

  return (
    <header className="pointer-events-none fixed top-0 inset-x-0 z-30 p-2 sm:p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        {/* Top-Left: Player Hero Status Card */}
        <div className="pointer-events-auto rounded-2xl bg-[#0a1120]/90 border border-slate-700/75 px-3 py-2 sm:px-3.5 sm:py-2.5 w-[39%] sm:w-64 shadow-xl">
          {playerHero && pCfg ? (
            <>
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[11px] sm:text-xs font-extrabold text-emerald-300 truncate">
                  {pCfg.icon} {pCfg.displayName} (Bạn)
                </span>
                <span className="text-[10px] sm:text-xs font-mono-num font-bold text-slate-200">
                  {playerHero.alive ? `${playerHero.hp}/${playerHero.maxHp}` : 'Bị Loại'}
                </span>
              </div>

              <div className="w-full h-2 sm:h-2.5 rounded-full bg-slate-800/95 overflow-hidden border border-white/10">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-[width] duration-100"
                  style={{ width: `${pHpPct}%` }}
                />
              </div>

              {/* Combo 1-2-3 live bar + Status tags */}
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold text-slate-400">Combo</span>
                  {[1, 2, 3].map((step) => {
                    const active = playerHero.comboStep >= step;
                    return (
                      <span
                        key={step}
                        className={`w-4 h-4 rounded flex items-center justify-center font-mono-num text-[9px] font-black border ${
                          active
                            ? step === 3
                              ? 'bg-amber-400 text-slate-950 border-amber-200'
                              : 'bg-sky-400 text-slate-950 border-sky-200'
                            : 'bg-slate-900 text-slate-500 border-slate-700'
                        }`}
                      >
                        {step}
                      </span>
                    );
                  })}
                  {playerHero.comboResetTimer > 0 && (
                    <div className="w-8 h-1 bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${comboTimerPct}%` }}
                      />
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-mono-num text-amber-300 font-bold">
                  {playerHero.kills} KO
                </span>
              </div>

              <div className="mt-1">
                <StatusBadges hero={playerHero} />
              </div>
            </>
          ) : null}
        </div>

        {/* Top-Center: Matchup Button & Utility Controls */}
        <div className="pointer-events-auto flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenHeroModal}
            className="rounded-full bg-[#0a1120]/92 hover:bg-slate-800/95 px-3 py-1.5 sm:px-4 sm:py-2 text-[11px] sm:text-xs font-extrabold text-amber-300 border border-amber-400/40 shadow-lg flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>⚔️</span>
            <span>Sinh Tồn ({aliveCount}/6 sống)</span>
            <span className="text-slate-400 font-mono-num">· {clockStr}</span>
          </button>

          <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
            <button
              type="button"
              onClick={onToggleCamera}
              className="rounded-full bg-[#0a1120]/90 hover:bg-slate-800 px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-sky-200 border border-slate-700/75 cursor-pointer"
              title="Chuyển 2D / 3D (Phím TAB)"
            >
              🎥 {cameraMode === '3D' ? '3D (TAB)' : '2D (TAB)'}
            </button>
            <button
              type="button"
              onClick={onToggleRevealFog}
              className={`rounded-full px-2.5 py-1 text-[10px] sm:text-[11px] font-bold border cursor-pointer flex items-center gap-1 ${
                revealFog
                  ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-300'
                  : 'bg-[#0a1120]/90 border-slate-700/75 text-slate-300 hover:bg-slate-800'
              }`}
              title="Bật/tắt tầm nhìn sương mù bụi cỏ"
            >
              {revealFog ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{revealFog ? 'Soi Map' : 'Ẩn Bụi'}</span>
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="rounded-full bg-[#0a1120]/90 hover:bg-slate-800 px-2 py-1 text-[10px] sm:text-[11px] font-bold text-slate-200 border border-slate-700/75 cursor-pointer"
              title="Âm thanh"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            </button>
            <button
              type="button"
              onClick={onTogglePause}
              className="rounded-full bg-[#0a1120]/90 hover:bg-slate-800 px-2 py-1 text-[10px] sm:text-[11px] font-bold text-slate-200 border border-slate-700/75 cursor-pointer"
              title="Tạm dừng (P)"
            >
              {paused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="rounded-full bg-[#0a1120]/90 hover:bg-slate-800 px-2.5 py-1 text-[10px] sm:text-[11px] font-bold text-slate-200 border border-slate-700/75 cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Đấu lại</span>
            </button>
          </div>
        </div>

        {/* Top-Right: Nearest Visible Enemy Card + 6-Hero Survival Strip */}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5 w-[39%] sm:w-64">
          <div className="rounded-2xl bg-[#0a1120]/90 border border-slate-700/75 px-3 py-2 sm:px-3.5 sm:py-2.5 w-full shadow-xl">
            {nearestEnemy && eCfg ? (
              <>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[10px] sm:text-xs font-mono-num font-bold text-slate-200">
                    {nearestEnemy.hp}/{nearestEnemy.maxHp}
                  </span>
                  <span className="text-[11px] sm:text-xs font-extrabold text-rose-300 truncate">
                    {eCfg.icon} {eCfg.displayName} AI
                  </span>
                </div>
                <div className="w-full h-2 sm:h-2.5 rounded-full bg-slate-800/95 overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-gradient-to-l from-rose-500 to-orange-400 transition-[width] duration-100 ml-auto"
                    style={{ width: `${eHpPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-end">
                  <StatusBadges hero={nearestEnemy} />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-slate-400 py-1">
                <span>🔍 Tầm nhìn</span>
                <span className="font-semibold text-slate-300">Chưa thấy địch</span>
              </div>
            )}
          </div>

          {/* Compact 6-hero alive roster chips */}
          <div className="hidden sm:flex items-center justify-end gap-1 flex-wrap">
            {heroes.map((h) => {
              const cfg = CHARACTER_CONFIGS[h.charClass];
              const isFollowed = followedHeroId === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onFollowHero(h.id)}
                  title={`Camera: ${h.displayName}`}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 cursor-pointer transition-colors ${
                    isFollowed
                      ? 'bg-slate-800 border-amber-400 text-white'
                      : 'bg-[#0a1120]/88 border-slate-700/70 text-slate-300 hover:border-slate-500'
                  } ${!h.alive ? 'opacity-35 line-through' : ''}`}
                >
                  <span>{cfg.icon}</span>
                  <span className="font-mono-num">{h.alive ? h.hp : 'KO'}</span>
                </button>
              );
            })}
          </div>

          {/* Kill feed */}
          {killFeed.length > 0 && (
            <div className="flex flex-col gap-1 items-end">
              {killFeed.slice(0, 2).map((k) => (
                <div
                  key={k.id}
                  className="px-2 py-0.5 rounded bg-[#0a1120]/88 border border-slate-700/60 text-[10px] text-slate-300 whitespace-nowrap"
                >
                  <span className="font-bold" style={{ color: k.killerColor }}>
                    {k.killer}
                  </span>{' '}
                  <span className="text-slate-500">hạ</span>{' '}
                  <span className="font-bold text-rose-300">{k.victim}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
