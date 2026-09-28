import { useRef, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import type { AuditDocumentType } from '../../shared/audit-criteria.js';
import { MAX_CONTENT_BYTES } from '../../shared/schemas.js';
import { FileInputError, readMarkdownFile } from '../file-input.js';

interface DocumentInputProps {
  value: string;
  documentType?: AuditDocumentType;
  onChange: (value: string) => void;
  onContentReplaced: (value: string) => void;
  fileName: string | null;
  onFileLoaded: (file: { content: string; fileName: string }) => void;
  disabled?: boolean;
}

export function DocumentInput({
  value,
  documentType = 'spec',
  onChange,
  onContentReplaced,
  fileName,
  onFileLoaded,
  disabled = false,
}: DocumentInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string>();
  const [isDragging, setIsDragging] = useState(false);
  const bytes = new TextEncoder().encode(value).length;
  const kilobytes = (bytes / 1_024).toFixed(1);
  const characterCount = Array.from(value).length;
  const wordCount = value.trim() ? value.trim().split(/\s+/u).length : 0;
  const documentLabel = {
    spec: 'Spécification',
    plan: 'Plan',
    tasks: 'Tasks',
  }[documentType];
  const documentName = {
    spec: 'spécification',
    plan: 'plan',
    tasks: 'tasks',
  }[documentType];
  const example = `# Spécification Fonctionnelle & Technique

## 1. Contexte du projet
Décrivez ici l'objectif de la fonctionnalité...

## 2. Exigences fonctionnelles
- [ ] L'utilisateur doit pouvoir se connecter
- [ ] Validation des champs de formulaire

## 3. Contraintes techniques
Architecture, stack, et performances ciblées...`;

  async function loadFiles(files: FileList | File[]) {
    if (disabled) {
      return;
    }
    try {
      const loadedFile = await readMarkdownFile(files);
      setFileError(undefined);
      onFileLoaded(loadedFile);
    } catch (cause) {
      setFileError(
        cause instanceof FileInputError
          ? cause.message
          : 'Impossible de lire ce fichier. Veuillez réessayer.',
      );
    }
  }

  function handleFileSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = '';
    if (files.length > 0) {
      void loadFiles(files);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void loadFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="document-input">
      <div
        className={`file-drop-zone${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) {
            setIsDragging(true);
          }
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <CloudUpload aria-hidden="true" focusable="false" size={20} />
        <p className="file-drop-hint">
          Déposez un fichier <code>.md</code> ici ou{' '}
          <button
            type="button"
            className="file-picker-link"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            parcourez vos dossiers
          </button>
        </p>
        <p className="file-drop-meta">Encodage UTF-8 · Limite max 200 Ko</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown"
          aria-label="Choisir un fichier .md"
          className="visually-hidden"
          onChange={handleFileSelection}
          disabled={disabled}
        />
      </div>
      {fileError && (
        <p className="file-input-error" role="alert">
          {fileError}
        </p>
      )}
      <div className="document-input-heading">
        <label htmlFor="markdown-content">{documentLabel} Markdown à auditer</label>
        <div className="document-input-actions">
          {documentType === 'spec' && (
            <>
              <button
                type="button"
                className="text-action"
                onClick={() => onContentReplaced(example)}
                disabled={disabled}
              >
                Charger un exemple
              </button>
              <span aria-hidden="true" />
            </>
          )}
          <button
            type="button"
            className="text-action"
            onClick={() => onContentReplaced('')}
            disabled={disabled || (value.length === 0 && fileName === null)}
          >
            Effacer
          </button>
        </div>
      </div>
      <div className="document-editor">
        <textarea
          id="markdown-content"
          rows={20}
          placeholder={`Collez ou rédigez votre ${documentName} Markdown…`}
          value={value}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
          spellCheck={false}
        />
        <p
          className={
            bytes > MAX_CONTENT_BYTES
              ? 'size-indicator size-exceeded'
              : 'size-indicator'
          }
          aria-live="polite"
        >
          <span>{characterCount} caractère{characterCount === 1 ? '' : 's'} &nbsp;•&nbsp; {wordCount} mot{wordCount === 1 ? '' : 's'}</span>
          {kilobytes} Ko / 200 Ko
        </p>
      </div>
    </div>
  );
}
