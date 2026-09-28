import type { AuditDocumentType } from '../../shared/audit-criteria.js';
import {
  AiAuditOutputSchema,
  AiTypedAuditOutputSchema,
} from '../../shared/schemas.js';
import type { AiCriterionEvaluation, AiTypedAuditOutput } from '../../shared/schemas.js';

export class AiOutputInvalidError extends Error {
  constructor() {
    super('La réponse de l’IA ne respecte pas le format attendu.');
    this.name = 'AiOutputInvalidError';
  }
}

function firstJsonObject(text: string): string | undefined {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (start < 0) {
      if (character === '{') {
        start = index;
        depth = 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}

export function parseAiOutput(
  text: string,
  documentType: AuditDocumentType = 'spec',
): AiTypedAuditOutput {
  try {
    const json = firstJsonObject(text);
    if (!json) {
      throw new Error('No JSON object found.');
    }
    const parsed: unknown = JSON.parse(json);
    if (documentType === 'spec') {
      const result = AiAuditOutputSchema.safeParse(parsed);
      if (!result.success) {
        throw new Error('JSON schema validation failed.');
      }
      return {
        evaluations: result.data.pillars.map(
          ({ pillarId, ...evaluation }): AiCriterionEvaluation => ({
            criterionId: pillarId,
            ...evaluation,
          }),
        ),
      };
    }

    const result = AiTypedAuditOutputSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error('JSON schema validation failed.');
    }
    return result.data;
  } catch {
    throw new AiOutputInvalidError();
  }
}
