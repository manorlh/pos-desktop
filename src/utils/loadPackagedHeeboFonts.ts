/** Load Heebo in packaged Electron via main-process file:// URLs (asar-safe). */
export async function loadPackagedHeeboFonts(): Promise<void> {
  if (!window.electronAPI?.getHeeboFontCss) return;

  try {
    const css = await window.electronAPI.getHeeboFontCss();
    if (!css) return;

    const style = document.createElement('style');
    style.setAttribute('data-heebo-packaged', 'true');
    style.textContent = css;
    document.head.prepend(style);
  } catch (e) {
    console.warn('[fonts] Failed to load packaged Heebo:', e);
  }
}
