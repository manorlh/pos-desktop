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

    // Warm both scripts (Hebrew + Latin/digits) for each weight so the correct
    // subset face is ready before first paint.
    const samples = ['שלום 0123', 'Abc 0123'];
    await Promise.all(
      ['400', '500', '600', '700'].flatMap((w) =>
        samples.map((s) => document.fonts.load(`${w} 16px Heebo`, s)),
      ),
    );
  } catch (e) {
    console.warn('[fonts] Failed to load packaged Heebo:', e);
  }
}
