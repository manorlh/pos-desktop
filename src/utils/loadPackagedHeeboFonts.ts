/** Load Heebo in packaged Electron via main-process file:// URLs (outside asar). */
export async function loadPackagedHeeboFonts(): Promise<void> {
  if (!window.electronAPI?.getHeeboFontCss) return;

  try {
    const css = await window.electronAPI.getHeeboFontCss();
    if (!css) {
      console.warn('[fonts] No packaged Heebo CSS returned from main process');
      return;
    }

    const style = document.createElement('style');
    style.setAttribute('data-heebo-packaged', 'true');
    style.textContent = css;
    document.head.prepend(style);

    await Promise.all([
      document.fonts.load('400 16px Heebo'),
      document.fonts.load('500 16px Heebo'),
      document.fonts.load('600 16px Heebo'),
      document.fonts.load('700 16px Heebo'),
    ]);
  } catch (e) {
    console.warn('[fonts] Failed to load packaged Heebo:', e);
  }
}
