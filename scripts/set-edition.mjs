import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const targetFile = path.join(repoRoot, 'src', 'shared', 'editionConfig.generated.ts');

const rawArg = (process.argv[2] || process.env.NOVA_DEPLOYMENT_MODE || 'developer')
  .trim()
  .toLowerCase();

if (rawArg !== 'developer' && rawArg !== 'production') {
  console.error(
    `[set-edition] Invalid edition '${rawArg}'. Expected 'developer' or 'production'.`
  );
  process.exit(1);
}

const metadata =
  rawArg === 'production'
    ? {
        mode: 'production',
        editionName: 'NOVA Machine Vision Platform — Production Edition',
        appId: 'com.nova.machinevision.production',
        productName: 'NOVA Machine Vision Platform Production',
      }
    : {
        mode: 'developer',
        editionName: 'NOVA Machine Vision Platform — Developer Edition',
        appId: 'com.nova.machinevision.developer',
        productName: 'NOVA Machine Vision Platform Developer',
      };

const content = `// AUTO-GENERATED FILE — DO NOT EDIT DIRECTLY
// Updated by scripts/set-edition.mjs during build:developer or build:production.
export type DeploymentMode = 'developer' | 'production';

export const BUILD_DEPLOYMENT_MODE: DeploymentMode = '${metadata.mode}';
export const BUILD_EDITION_NAME = '${metadata.editionName}';
export const BUILD_APP_ID = '${metadata.appId}';
export const BUILD_PRODUCT_NAME = '${metadata.productName}';
`;

fs.mkdirSync(path.dirname(targetFile), { recursive: true });
fs.writeFileSync(targetFile, content, 'utf-8');
console.log(
  `[set-edition] Configured build target: ${metadata.editionName} (deploymentMode='${metadata.mode}', appId='${metadata.appId}')`
);
