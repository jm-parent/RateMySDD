import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractNames = [
  'audit-output.schema.json',
  'typed-audit-output.schema.json',
];

for (const contractName of contractNames) {
  const contractPath = resolve(
    projectRoot,
    'specs',
    '001-markdown-spec-audit',
    'contracts',
    contractName,
  );
  const runtimeContractPath = resolve(
    projectRoot,
    'dist',
    'specs',
    '001-markdown-spec-audit',
    'contracts',
    contractName,
  );

  await mkdir(dirname(runtimeContractPath), { recursive: true });
  await copyFile(contractPath, runtimeContractPath);
}
