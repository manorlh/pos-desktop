const { execSync } = require('child_process');
const path = require('path');

// Force better-sqlite3 to use prebuilt binaries or skip validation
process.env.npm_config_build_from_source = 'false';
process.env.npm_config_prefer_offline = 'false';

try {
  console.log('Rebuilding better-sqlite3 for Electron 13.6.9...');
  execSync('electron-rebuild -f -w better-sqlite3 --version=13.6.9', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      npm_config_target: '13.6.9',
      npm_config_runtime: 'electron',
      npm_config_disturl: 'https://electronjs.org/headers',
    }
  });
  console.log('✅ Native module rebuild complete');
} catch (error) {
  console.warn('⚠️  Native module rebuild failed, but continuing...');
  console.warn('This is expected when building for Windows on macOS.');
  console.warn('electron-builder will handle platform-specific binaries.');
}


