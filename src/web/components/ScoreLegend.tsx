import { SCORE_BANDS } from '../../shared/scoring.js';

export function ScoreLegend() {
  return (
    <details className="score-legend">
      <summary>Barème de notation</summary>
      <table>
        <caption>Interprétation des notes sur 100</caption>
        <thead>
          <tr>
            <th scope="col">Note</th>
            <th scope="col">Niveau</th>
          </tr>
        </thead>
        <tbody>
          {SCORE_BANDS.map((band) => (
            <tr key={band.label}>
              <td>
                {band.min}–{band.max}
              </td>
              <td>{band.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
