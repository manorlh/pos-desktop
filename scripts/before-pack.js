// This script runs before electron-builder packages the app
// It helps handle native module issues when building for Windows on macOS

exports.default = async function(context) {
  const { platformName } = context;
  
  if (platformName === 'win') {
    console.log('⚠️  Building for Windows on macOS - native modules will use prebuilt binaries');
    console.log('⚠️  If prebuilt binaries are not available, you may need to build on Windows');
  }
  
  // Don't do anything - just let electron-builder handle it
  return;
};

