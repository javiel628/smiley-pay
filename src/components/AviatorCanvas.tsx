import { useEffect, useRef } from 'react';
import type { RoundPhase } from '../types';

interface AviatorCanvasProps {
  phase: RoundPhase;
  multiplier: number;
  crashPoint: number | null;
  roundCode: string;
  phaseStartedAt: number;
  bettingEndsAt: number;
  serverTimeOffsetMs: number;
  cashoutBanner: { multiplier: number; payout: number } | null;
}

const GROWTH_RATE = 0.068;

function drawAviatorPlane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  propPhase: number,
  scale = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.scale(scale, scale);

  // Subtle glow behind aircraft
  ctx.shadowColor = 'rgba(244, 63, 94, 0.65)';
  ctx.shadowBlur = 18;

  // Tail wing
  ctx.fillStyle = '#be123c';
  ctx.beginPath();
  ctx.moveTo(-28, -2);
  ctx.lineTo(-36, -15);
  ctx.lineTo(-22, -14);
  ctx.lineTo(-14, -2);
  ctx.closePath();
  ctx.fill();

  // Main fuselage
  ctx.fillStyle = '#e11d48';
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.quadraticCurveTo(-18, -11, 16, -8);
  ctx.quadraticCurveTo(30, -4, 34, 2);
  ctx.quadraticCurveTo(26, 9, -24, 6);
  ctx.closePath();
  ctx.fill();

  // Gold/White cockpit highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.ellipse(8, -4, 9, 4, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // Racing stripe
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-22, 1);
  ctx.lineTo(22, 1);
  ctx.lineTo(18, 4);
  ctx.lineTo(-22, 3.5);
  ctx.closePath();
  ctx.fill();

  // Lower wing
  ctx.fillStyle = '#9f1239';
  ctx.beginPath();
  ctx.moveTo(-6, 3);
  ctx.lineTo(10, 3);
  ctx.lineTo(0, 14);
  ctx.lineTo(-14, 11);
  ctx.closePath();
  ctx.fill();

  // Nose hub
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(34, 2, 3, 0, Math.PI * 2);
  ctx.fill();

  // Spinning propeller
  const propLen = 11 * Math.abs(Math.sin(propPhase)) + 3;
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.9)';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(35, 2 - propLen);
  ctx.lineTo(35, 2 + propLen);
  ctx.stroke();

  ctx.restore();
}

export function AviatorCanvas({
  phase,
  multiplier,
  crashPoint,
  roundCode,
  phaseStartedAt,
  bettingEndsAt,
  serverTimeOffsetMs,
  cashoutBanner,
}: AviatorCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    phase,
    multiplier,
    crashPoint,
    phaseStartedAt,
    bettingEndsAt,
    serverTimeOffsetMs,
    flyAwayStart: 0,
  });

  useEffect(() => {
    const prevPhase = stateRef.current.phase;
    stateRef.current = {
      phase,
      multiplier,
      crashPoint,
      phaseStartedAt,
      bettingEndsAt,
      serverTimeOffsetMs,
      flyAwayStart: phase === 'CRASHED' && prevPhase !== 'CRASHED' ? performance.now() : stateRef.current.flyAwayStart,
    };
  }, [phase, multiplier, crashPoint, phaseStartedAt, bettingEndsAt, serverTimeOffsetMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    const render = (nowPerf: number) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(300, Math.floor(rect.width * dpr));
      const targetH = Math.max(240, Math.floor(rect.height * dpr));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const w = rect.width;
      const h = rect.height;
      ctx.save();
      ctx.scale(dpr, dpr);

      // Background dark radial sky
      const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.55, 20, w * 0.5, h * 0.55, w * 0.75);
      bgGrad.addColorStop(0, '#181c28');
      bgGrad.addColorStop(0.55, '#0e1118');
      bgGrad.addColorStop(1, '#090b10');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Subtle Aviator rotating sunburst rays
      const s = stateRef.current;
      const rayRotation = (nowPerf * 0.00012) % (Math.PI * 2);
      ctx.save();
      ctx.translate(w * 0.12, h * 0.88);
      ctx.rotate(rayRotation);
      const rayCount = 18;
      for (let i = 0; i < rayCount; i++) {
        if (i % 2 === 0) {
          const a0 = (i / rayCount) * Math.PI * 2;
          const a1 = ((i + 0.55) / rayCount) * Math.PI * 2;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.018)';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, Math.max(w, h) * 1.4, a0, a1);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();

      const padLeft = 44;
      const padBottom = 34;
      const padTop = 28;
      const padRight = 36;
      const plotW = w - padLeft - padRight;
      const plotH = h - padTop - padBottom;

      // Subtle axis guide lines
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, padTop);
      ctx.lineTo(padLeft, h - padBottom);
      ctx.lineTo(w - padRight, h - padBottom);
      ctx.stroke();

      // Axis dots along bottom and left
      ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
      for (let i = 1; i <= 6; i++) {
        const gx = padLeft + (plotW * i) / 6;
        ctx.beginPath();
        ctx.arc(gx, h - padBottom + 10, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let j = 1; j <= 4; j++) {
        const gy = h - padBottom - (plotH * j) / 4;
        ctx.beginPath();
        ctx.arc(padLeft - 12, gy, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      const estimatedServerNow = Date.now() + s.serverTimeOffsetMs;

      if (s.phase === 'BETTING') {
        // Draw parked plane at origin
        drawAviatorPlane(ctx, padLeft + 24, h - padBottom - 16, -0.06, nowPerf * 0.03, 0.95);

        // Centered waiting & countdown bar
        const totalWait = Math.max(1, s.bettingEndsAt - s.phaseStartedAt);
        const remaining = Math.max(0, s.bettingEndsAt - estimatedServerNow);
        const progress = Math.min(1, Math.max(0, remaining / totalWait));

        ctx.textAlign = 'center';
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 18px "Outfit", sans-serif';
        ctx.fillText('WAITING FOR NEXT ROUND', w / 2, h / 2 - 14);

        const barW = Math.min(260, w * 0.56);
        const barH = 7;
        const barX = (w - barW) / 2;
        const barY = h / 2 + 8;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW, barH, 999);
        ctx.fill();

        ctx.fillStyle = '#e11d48';
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * progress, barH, 999);
        ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillText(`Takeoff in ${(remaining / 1000).toFixed(1)}s`, w / 2, barY + 26);
      } else if (s.phase === 'FLYING') {
        const elapsedSec = Math.max(0, (estimatedServerNow - s.phaseStartedAt) / 1000);
        const liveMult = Math.max(s.multiplier, Math.floor(Math.exp(GROWTH_RATE * elapsedSec) * 100) / 100);

        // Smooth progression curve capped cleanly within viewport with subtle bobbing
        const progressT = Math.min(1, elapsedSec / 9.5);
        const easeX = 1 - Math.pow(1 - progressT, 1.35);
        const bobY = progressT > 0.75 ? Math.sin(nowPerf * 0.004) * 9 : 0;
        const bobX = progressT > 0.75 ? Math.cos(nowPerf * 0.003) * 6 : 0;

        const endX = padLeft + easeX * (plotW * 0.86) + bobX;
        const endY = h - padBottom - Math.pow(progressT, 1.45) * (plotH * 0.78) + bobY;

        // Draw curved trajectory & translucent area gradient
        const cpX = padLeft + (endX - padLeft) * 0.56;
        const cpY = h - padBottom - (h - padBottom - endY) * 0.16;

        const areaGrad = ctx.createLinearGradient(0, endY, 0, h - padBottom);
        areaGrad.addColorStop(0, 'rgba(225, 29, 72, 0.34)');
        areaGrad.addColorStop(1, 'rgba(225, 29, 72, 0.02)');

        ctx.beginPath();
        ctx.moveTo(padLeft, h - padBottom);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.lineTo(endX, h - padBottom);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();

        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(padLeft, h - padBottom);
        ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        ctx.stroke();

        // Compute tangent angle for natural plane pitch
        const tangentAngle = Math.atan2(endY - cpY, endX - cpX);
        drawAviatorPlane(ctx, endX, endY, tangentAngle * 0.65, nowPerf * 0.055, 1.02);

        // Giant centered live multiplier
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 56px "Outfit", sans-serif';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 14;
        ctx.fillText(`${liveMult.toFixed(2)}x`, w / 2, h / 2 + 8);
        ctx.shadowBlur = 0;
      } else if (s.phase === 'CRASHED') {
        const sinceCrash = Math.max(0, (nowPerf - s.flyAwayStart) / 1000);
        const flyOffset = Math.min(1.5, sinceCrash * 2.2);
        const planeX = padLeft + plotW * 0.72 + flyOffset * plotW * 0.6;
        const planeY = padTop + plotH * 0.25 - flyOffset * plotH * 0.65;

        if (planeX < w + 60 && planeY > -60) {
          drawAviatorPlane(ctx, planeX, planeY, -0.42, nowPerf * 0.07, 1.0);
        }

        ctx.textAlign = 'center';
        ctx.fillStyle = '#f8fafc';
        ctx.font = '700 18px "Outfit", sans-serif';
        ctx.fillText('FLEW AWAY!', w / 2, h / 2 - 34);

        const finalMult = s.crashPoint ?? s.multiplier;
        ctx.fillStyle = '#f43f5e';
        ctx.font = '800 58px "Outfit", sans-serif';
        ctx.fillText(`${finalMult.toFixed(2)}x`, w / 2, h / 2 + 22);
      }

      ctx.restore();
      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#090b10] shadow-lg">
      {/* Stage Top Overlay Metadata */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3">
        <div className="font-mono text-xs text-slate-400">
          {roundCode || 'BK-1000'}
        </div>
      </div>

      {cashoutBanner && (
        <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-400/50 bg-emerald-950/90 px-4 py-2 text-xs shadow-xl backdrop-blur-sm">
            <span className="font-semibold text-emerald-200">You cashed out!</span>
            <span className="font-mono font-bold text-white tabular-nums">
              {cashoutBanner.multiplier.toFixed(2)}x
            </span>
            <span className="font-mono font-extrabold text-emerald-400 tabular-nums">
              +KES {cashoutBanner.payout.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="block h-[250px] w-full sm:h-[320px] lg:h-[340px]"
      />
    </div>
  );
}
