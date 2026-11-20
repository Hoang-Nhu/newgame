import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/GameEngine';
import {
  CharacterClass,
  MatchSnapshot,
  MinimapSnapshot,
  ProjectedDamageItem,
  ProjectedHeroOverlay,
} from './game/types';
import { FloatingOverlays } from './game/UI/FloatingOverlays';
import { Minimap } from './game/UI/Minimap';
import { TopHUD } from './game/UI/TopHUD';
import { VirtualJoystick } from './game/UI/VirtualJoystick';
import { MobaSkillCluster } from './game/UI/MobaSkillCluster';
import { HeroSelectModal } from './game/UI/HeroSelectModal';
import { VictoryOverlay } from './game/UI/VictoryOverlay';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [match, setMatch] = useState<MatchSnapshot | null>(null);
  const [heroOverlays, setHeroOverlays] = useState<ProjectedHeroOverlay[]>([]);
  const [damageOverlays, setDamageOverlays] = useState<ProjectedDamageItem[]>([]);
  const [minimap, setMinimap] = useState<MinimapSnapshot | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const [heroModalOpen, setHeroModalOpen] = useState(false);
  const [pendingClass, setPendingClass] = useState<CharacterClass>('SwordMaster');

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = new GameEngine(container, {
      onMatchSnapshot: (snapshot) => {
        setMatch(snapshot);
      },
      onOverlayFrame: (heroes, damages, minimapData) => {
        setHeroOverlays(heroes);
        setDamageOverlays(damages);
        setMinimap(minimapData);
      },
      onWebGLContextLost: () => {
        setContextLost(true);
      },
    });

    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleOpenHeroModal = () => {
    if (match) {
      setPendingClass(match.playerClass);
    }
    setHeroModalOpen(true);
  };

  const handleConfirmHeroStart = () => {
    setHeroModalOpen(false);
    engineRef.current?.setPlayerClass(pendingClass);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#070d19] select-none">
      {/* Dedicated isolated WebGL mount container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
      />

      {contextLost && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#070d19]/95 p-6">
          <div className="max-w-sm rounded-2xl border border-slate-700 bg-[#0a1120] p-5 text-center">
            <h2 className="font-display text-lg font-bold text-white mb-2">
              Mất Kết Nối Đồ Họa 3D
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Trình duyệt vừa tạm ngắt ngữ cảnh WebGL. Nhấn tải lại để tiếp tục trận đấu.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              Tải lại đấu trường
            </button>
          </div>
        </div>
      )}

      {/* Projected Overhead HP Bars, Hero Names & Floating Damage Numbers */}
      <FloatingOverlays heroes={heroOverlays} damages={damageOverlays} />

      {/* Top HUD: Player Card + Survival Matchup Pill & Tools + Nearest Enemy Card */}
      {match && (
        <TopHUD
          heroes={match.heroes}
          playerHero={match.playerHero}
          nearestEnemy={match.nearestEnemy}
          followedHeroId={match.followedHeroId}
          elapsedTime={match.elapsedTime}
          aliveCount={match.aliveCount}
          cameraMode={match.cameraMode}
          paused={match.paused}
          muted={match.muted}
          revealFog={match.revealFogForSpectator}
          killFeed={match.killFeed}
          onOpenHeroModal={handleOpenHeroModal}
          onToggleCamera={() => engineRef.current?.toggleCameraMode()}
          onTogglePause={() => engineRef.current?.togglePause()}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onToggleRevealFog={() => engineRef.current?.toggleRevealFog()}
          onRestart={() => engineRef.current?.spawnMatch()}
          onFollowHero={(id) => engineRef.current?.followHero(id)}
        />
      )}

      {/* Bottom Controls: Left Virtual Joystick + Minimap | Right MOBA Skill Cluster */}
      <footer className="pointer-events-none fixed bottom-0 inset-x-0 z-30 p-3 sm:p-4 flex items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <VirtualJoystick
            onChange={(dx, dz, active) => engineRef.current?.setJoystickInput(dx, dz, active)}
          />
          <Minimap
            snapshot={minimap}
            onPanTo={(x, z) => engineRef.current?.panTo(x, z)}
          />
        </div>

        {match && (
          <MobaSkillCluster
            playerHero={match.playerHero}
            onStartPreview={(slot) => engineRef.current?.startSkillPreview(slot)}
            onUpdatePreview={(dx, dy) => engineRef.current?.updateSkillPreview(dx, dy)}
            onCommitPreview={() => engineRef.current?.commitSkillPreview()}
            onCancelPreview={() => engineRef.current?.cancelSkillPreview()}
          />
        )}
      </footer>

      {/* Hero Select & Guide Modal */}
      <HeroSelectModal
        open={heroModalOpen}
        selectedClass={pendingClass}
        onSelectClass={setPendingClass}
        onStartMatch={handleConfirmHeroStart}
        onClose={() => setHeroModalOpen(false)}
      />

      {/* Last Survivor Victory / Defeat Overlay */}
      {match && (
        <VictoryOverlay
          winner={match.winner}
          heroes={match.heroes}
          elapsedTime={match.elapsedTime}
          onRestart={() => engineRef.current?.spawnMatch()}
          onOpenHeroModal={handleOpenHeroModal}
        />
      )}
    </div>
  );
}
