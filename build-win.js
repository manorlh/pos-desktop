const { build } = require('electron-builder');
const path = require('path');

async function buildWindows() {
  try {
    console.log('🏗️  Building for Windows...');
    
    const result = await build({
      targets: [
        {
          target: 'nsis',
          arch: ['x64']
        }
      ],
      config: {
        appId: 'com.posdesktop.app',
        productName: 'POS Desktop',
        directories: {
          output: 'release/${version}'
        },
        files: [
          'dist/**/*',
          'dist-electron/**/*',
          'node_modules/**/*'
        ],
        win: {
          icon: 'assets/icon.ico',
          target: [
            {
              target: 'nsis',
              arch: ['x64']
            }
          ]
        },
        nsis: {
          oneClick: false,
          allowToChangeInstallationDirectory: true,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          shortcutName: 'POS Desktop'
        }
      }
    });

    console.log('✅ Windows build completed successfully!');
    console.log('📦 Installer created in release/ directory');
    
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildWindows();
