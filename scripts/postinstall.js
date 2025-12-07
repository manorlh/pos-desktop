const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const platform = os.platform();
const arch = os.arch();

// Map architecture
let electronArch = arch === 'x64' ? 'x64' : arch === 'arm64' ? 'arm64' : 'x64';

console.log(`Rebuilding better-sqlite3 for Electron 13.6.9 (${platform}, ${electronArch})...`);

const betterSqlite3Path = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');

if (!fs.existsSync(betterSqlite3Path)) {
  console.error('better-sqlite3 not found at:', betterSqlite3Path);
  process.exit(1);
}

// Remove existing build
const buildPath = path.join(betterSqlite3Path, 'build');
if (fs.existsSync(buildPath)) {
  console.log('Removing existing build...');
  fs.rmSync(buildPath, { recursive: true, force: true });
}

// Set environment variables
const env = {
  ...process.env,
  npm_config_target: '13.6.9',
  npm_config_runtime: 'electron',
  npm_config_disturl: 'https://electronjs.org/headers',
  npm_config_arch: electronArch,
  npm_config_build_from_source: 'true',
};

// Build command
const command = `npx node-gyp rebuild --target=13.6.9 --arch=${electronArch} --dist-url=https://electronjs.org/headers`;

try {
  console.log('Running:', command);
  execSync(command, {
    cwd: betterSqlite3Path,
    env,
    stdio: 'inherit',
  });
  console.log('✅ Successfully rebuilt better-sqlite3');
} catch (error) {
  console.error('❌ Failed to rebuild better-sqlite3:', error.message);
  console.warn('⚠️  Continuing anyway - electron-builder may handle this during packaging');
  // Don't exit with error - let electron-builder try to handle it
}


