import { MAX_CONTENT_BYTES } from '../shared/schemas.js';

export type FileInputErrorCode =
  | 'MULTIPLE_FILES'
  | 'INVALID_FILE_TYPE'
  | 'CONTENT_TOO_LARGE'
  | 'INVALID_ENCODING';

const FILE_INPUT_ERROR_MESSAGES: Record<FileInputErrorCode, string> = {
  MULTIPLE_FILES: 'Un seul fichier à la fois : auditez vos fichiers un par un.',
  INVALID_FILE_TYPE: 'Seuls les fichiers .md sont acceptés.',
  CONTENT_TOO_LARGE: 'Le document dépasse la taille maximale de 200 Ko.',
  INVALID_ENCODING: 'Le fichier doit être un texte encodé en UTF-8.',
};

export class FileInputError extends Error {
  constructor(readonly code: FileInputErrorCode) {
    super(FILE_INPUT_ERROR_MESSAGES[code]);
    this.name = 'FileInputError';
  }
}

export async function readMarkdownFile(
  files: FileList | File[],
): Promise<{ content: string; fileName: string }> {
  const selectedFiles = Array.from(files);
  if (selectedFiles.length !== 1) {
    throw new FileInputError('MULTIPLE_FILES');
  }

  const file = selectedFiles[0]!;
  if (!/\.md$/i.test(file.name)) {
    throw new FileInputError('INVALID_FILE_TYPE');
  }
  if (file.size > MAX_CONTENT_BYTES) {
    throw new FileInputError('CONTENT_TOO_LARGE');
  }

  let content: string;
  try {
    content = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: false,
    }).decode(await file.arrayBuffer());
  } catch {
    throw new FileInputError('INVALID_ENCODING');
  }

  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/u.test(content)) {
    throw new FileInputError('INVALID_ENCODING');
  }

  return { content, fileName: file.name };
}
