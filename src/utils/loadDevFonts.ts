/**
 * Dev-only: Vite bundles @fontsource CSS + assets from node_modules.
 * Load both Hebrew and Latin subsets (matching the packaged build) so Latin
 * text and digits also render in Heebo, not the OS fallback font.
 */
export async function loadDevFonts(): Promise<void> {
  await Promise.all([
    import('@fontsource/heebo/hebrew-400.css'),
    import('@fontsource/heebo/hebrew-500.css'),
    import('@fontsource/heebo/hebrew-600.css'),
    import('@fontsource/heebo/hebrew-700.css'),
    import('@fontsource/heebo/latin-400.css'),
    import('@fontsource/heebo/latin-500.css'),
    import('@fontsource/heebo/latin-600.css'),
    import('@fontsource/heebo/latin-700.css'),
    import('@fontsource/heebo/latin-ext-400.css'),
    import('@fontsource/heebo/latin-ext-500.css'),
    import('@fontsource/heebo/latin-ext-600.css'),
    import('@fontsource/heebo/latin-ext-700.css'),
  ]);
}
