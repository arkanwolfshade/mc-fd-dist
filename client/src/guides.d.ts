// Guides imported with ?guide arrive as HTML, converted at build time (tools/vite-guides.ts).
declare module "*.md?guide" {
  const html: string;
  export default html;
}
