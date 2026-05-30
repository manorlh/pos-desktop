/** Dev-only: Vite bundles @fontsource CSS + assets from node_modules. */
export async function loadDevFonts(): Promise<void> {
  await Promise.all([
    import('@fontsource/heebo/400.css'),
    import('@fontsource/heebo/500.css'),
    import('@fontsource/heebo/600.css'),
    import('@fontsource/heebo/700.css'),
  ]);
}
