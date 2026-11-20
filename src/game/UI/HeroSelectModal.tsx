import React from 'react';
import { CHARACTER_CONFIGS, CHARACTER_ORDER } from '../Character/CharacterConfig';
import { CharacterClass } from '../types';

interface HeroSelectModalProps {
  open: boolean;
  selectedClass: CharacterClass;
  onSelectClass: (cls: CharacterClass) => void;
  onStartMatch: () => void;
  onClose: () => void;
}

export const HeroSelectModal: React.FC<HeroSelectModalProps> = ({
  open,
  selectedClass,
  onSelectClass,
  onStartMatch,
  onClose,
}) => {
  if (!open) return null;

  const activeCfg = CHARACTER_CONFIGS[selectedClass];

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/80">
      <div className="rounded-3xl bg-[#0a1120] border border-slate-700/85 max-w-2xl w-full p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-black text-white">
              Chọn Tướng &amp; Đấu Trường Sinh Tồn
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              6 Chiến binh sinh tồn · Mỗi đòn đánh thường có Combo 3 nhịp riêng · Người sống cuối thắng!
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* 6 Hero Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
          {CHARACTER_ORDER.map((cls) => {
            const cfg = CHARACTER_CONFIGS[cls];
            const isSelected = cls === selectedClass;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => onSelectClass(cls)}
                className={`p-3 rounded-2xl border text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-amber-400/15 border-amber-400 text-white shadow-lg'
                    : 'bg-slate-900/75 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">{cfg.icon}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: cfg.cssColor }}
                  />
                </div>
                <div className="text-xs font-extrabold mt-1 text-white">{cfg.displayName}</div>
                <div className="text-[10px] text-slate-400 truncate">{cfg.title}</div>
                <div className="text-[10px] text-amber-300 font-semibold mt-1 truncate">
                  {cfg.comboHit3Label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Hero Kit Details */}
        <div className="rounded-2xl bg-slate-900/85 border border-slate-700/75 p-3.5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold text-white">
              {activeCfg.icon} Bộ Kỹ Năng: {activeCfg.displayName} ({activeCfg.maxHp} HP)
            </span>
            <span className="text-[11px] font-bold text-amber-300">
              {activeCfg.comboHit3Label}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-slate-950/70 p-2 border border-slate-800">
              <div className="font-bold text-slate-200">
                Đánh Thường [LMB / J] · 1s
              </div>
              <div className="text-slate-400 mt-0.5">{activeCfg.skills.basic.description}</div>
            </div>
            <div className="rounded-xl bg-slate-950/70 p-2 border border-slate-800">
              <div className="font-bold text-amber-300">
                Skill 1 [Q / 1]: {activeCfg.skills.skill1.name} · 5s
              </div>
              <div className="text-slate-400 mt-0.5">{activeCfg.skills.skill1.description}</div>
            </div>
            <div className="rounded-xl bg-slate-950/70 p-2 border border-slate-800">
              <div className="font-bold text-fuchsia-300">
                Skill 2 [E / 2]: {activeCfg.skills.skill2.name} · 5s
              </div>
              <div className="text-slate-400 mt-0.5">{activeCfg.skills.skill2.description}</div>
            </div>
            <div className="rounded-xl bg-slate-950/70 p-2 border border-slate-800">
              <div className="font-bold text-rose-300">
                Chiêu Cuối [R / 3]: {activeCfg.skills.ultimate.name} · 15s
              </div>
              <div className="text-slate-400 mt-0.5">{activeCfg.skills.ultimate.description}</div>
            </div>
          </div>
        </div>

        {/* Quick Controls Guide */}
        <div className="rounded-2xl bg-slate-900/70 border border-slate-700/70 p-3 text-[11px] text-slate-300 space-y-1">
          <div>
            • <strong className="text-amber-300">Giữ chiêu để ngắm 3D:</strong> Nhấn giữ nút chiêu ở góc dưới phải và kéo để xoay mũi tên / vòng vùng ngắm trước khi thả tay.
          </div>
          <div>
            • <strong className="text-emerald-300">Bụi Cỏ &amp; Vật Cản:</strong> Nấp bụi cỏ để ẩn tên &amp; hình khỏi địch; cây và tường đá chắn tầm nhìn AI.
          </div>
          <div>
            • <strong className="text-sky-300">Camera:</strong> Giữ chuột phải kéo để xoay góc 3D, cuộn chuột để zoom, nhấn <strong className="text-white">TAB</strong> để đổi giữa 3D và 2D.
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={onStartMatch}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-sm shadow-lg hover:brightness-110 cursor-pointer"
          >
            Vào Trận Với {activeCfg.displayName}
          </button>
        </div>
      </div>
    </div>
  );
};
