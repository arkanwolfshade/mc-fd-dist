// Guides imported with ?guide arrive as HTML, converted at build time (tools/vite-guides.ts).
declare module "*.md?guide" {
  const html: string;
  export default html;
}

// The lines a guide marks for the help popouts, as HTML by popout name (ADR 0038).
declare module "*.md?help" {
  const topics: Record<string, string>;
  export default topics;
}
