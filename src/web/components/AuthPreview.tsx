import { CircleCheck, Loader, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

type Tone = 'run' | 'warn' | 'ok';

interface Phase {
  file: number;
  from: number;
  to: number;
  tone: Tone;
  badge: string;
  caption: string;
  ms: number;
}

const FILES = ['spec.md', 'plan.md', 'tasks.md'];
// [score initial (sous le seuil), score final (conforme)]
const SCORES: Array<[number, number]> = [
  [80, 87],
  [74, 91],
  [83, 96],
];

const TIMELINE: Phase[] = [
  ...FILES.flatMap((_, file): Phase[] => {
    const [low, high] = SCORES[file]!;
    return [
      { file, from: 0, to: low, tone: 'run', badge: 'Analyse', caption: 'Analyse de la clarté et de la testabilité…', ms: 2000 },
      { file, from: low, to: low, tone: 'warn', badge: 'À retravailler', caption: 'Sous le seuil : critères ambigus détectés', ms: 1300 },
      { file, from: low, to: low, tone: 'run', badge: 'Retravail', caption: 'Reformulation des sections faibles…', ms: 1500 },
      { file, from: low, to: high, tone: 'ok', badge: 'Conforme', caption: 'Couverture validée & cas limites blindés', ms: 1900 },
    ];
  }),
  { file: FILES.length, from: 96, to: 96, tone: 'ok', badge: 'Pipeline validé', caption: 'spec, plan et tâches alignés de bout en bout', ms: 2600 },
];

const STATIC_PHASE = TIMELINE[TIMELINE.length - 1]!;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  );
}

export function AuthPreview() {
  const [reduced] = useState(prefersReducedMotion);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);

  useEffect(() => {
    if (reduced) {
      return;
    }
    const phase = TIMELINE[index]!;
    const tweenMs = phase.from === phase.to ? 0 : phase.ms * 0.8;
    const start = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = tweenMs === 0 ? 1 : Math.min(1, (time - start) / tweenMs);
      const eased = 1 - (1 - progress) ** 3;
      setScore(Math.round(phase.from + (phase.to - phase.from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    const timeout = window.setTimeout(
      () => setIndex((index + 1) % TIMELINE.length),
      phase.ms,
    );
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [index, reduced]);

  const phase = reduced ? STATIC_PHASE : TIMELINE[index]!;
  const shownScore = reduced ? STATIC_PHASE.to : score;
  const Icon =
    phase.tone === 'ok' ? CircleCheck : phase.tone === 'warn' ? TriangleAlert : Loader;

  return (
    <div className="auth-preview" aria-hidden="true">
      <div className="auth-preview-bar">
        <span className="auth-preview-dots">
          <i />
          <i />
          <i />
        </span>
        <code>sdd-audit-pipeline.v2</code>
        <span className="auth-preview-tag">
          <ShieldCheck size={12} />
          Garanti zéro rétention
        </span>
      </div>
      <div className="auth-preview-steps">
        {FILES.map((name, file) => {
          const state =
            file < phase.file || (file === phase.file && phase.tone === 'ok' && phase.badge === 'Conforme')
              ? 'is-done'
              : file === phase.file
                ? 'is-active'
                : '';
          return (
            <div className={state} key={name}>
              <small>Étape {file + 1}</small>
              <code>{name}</code>
            </div>
          );
        })}
      </div>
      <div className={`auth-preview-score is-${phase.tone}`}>
        <div>
          <p>
            <strong>{shownScore}</strong>
            <span>/100</span>
            <em>{phase.badge}</em>
          </p>
          <small>{phase.caption}</small>
        </div>
        <Icon size={40} strokeWidth={1.5} />
      </div>
    </div>
  );
}
