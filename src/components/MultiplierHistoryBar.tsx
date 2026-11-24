import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { RoundHistoryItem } from '../types';

interface MultiplierHistoryBarProps {
  history: RoundHistoryItem[];
}

function getOddsStyle(crashPoint: number): string {
  if (crashPoint >= 10) {
    return 'text-rose-400 border-rose-500/35 bg-rose-950/40';
  }
  if (crashPoint >= 2) {
    return 'text-violet-300 border-violet-500/35 bg-violet-950/40';
  }
  return 'text-sky-300 border-sky-500/30 bg-sky-950/35';
}

export function MultiplierHistoryBar({ history }: MultiplierHistoryBarProps) {
  const [expanded, setExpanded] = useState(false);

  const avgCrash =
    history.length > 0
      ? history.reduce((sum, r) => sum + r.crashPoint, 0) / history.length
      : 0;
  const peakCrash =
    history.length > 0 ? Math.max(...history.map((r) => r.crashPoint)) : 0;
  const highOddsCount = history.filter((r) => r.crashPoint >= 10).length;

  return (
    <div className="relative rounded-xl border border-white/10 bg-[#12161f] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-1.5 overflow-x-auto arena-scroll py-0.5">
          {history.slice(0, 18).map((round) => (
            <span
              key={round.id}
              title={`Round ${round.roundCode}`}
              className={`font-mono text-xs font-semibold tabular-nums rounded-md border px-2.5 py-1 whitespace-nowrap shrink-0 ${getOddsStyle(
                round.crashPoint,
              )}`}
            >
              {round.crashPoint.toFixed(2)}x
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-1 rounded-md border border-white/10 bg-[#181d28] px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>History</span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2.5 border-t border-white/10 pt-2.5">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>Last {history.length} rounds</span>
            {history.length > 0 && (
              <div className="flex items-center gap-3 font-mono text-[11px] tabular-nums">
                <span>
                  Avg: <strong className="text-slate-200">{avgCrash.toFixed(2)}x</strong>
                </span>
                <span>
                  Peak: <strong className="text-rose-400">{peakCrash.toFixed(2)}x</strong>
                </span>
                <span>
                  10x+: <strong className="text-violet-300">{highOddsCount}</strong>
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((round) => (
              <span
                key={round.id}
                className={`font-mono text-xs font-semibold tabular-nums rounded-md border px-2.5 py-1 whitespace-nowrap ${getOddsStyle(
                  round.crashPoint,
                )}`}
              >
                {round.crashPoint.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
