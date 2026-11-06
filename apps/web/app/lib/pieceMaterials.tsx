/**
 * Shared SVG "material" building block for renderBody pieces: a metallic
 * lead-wire gradient and a soft drop shadow. All ids are keyed by the
 * piece's own uid — SVG ids must be unique per document, and a scene can
 * hold many pieces of the same type — so each piece reads as a real object
 * sitting slightly above the board instead of a flat icon. Used by
 * electronics and networking's canvasAdapters; extract further (not
 * before) the next lab that needs the same look.
 */
export function materialDefs(uid: string, shadowId: string): { defs: JSX.Element; leadStroke: string } {
  const wireId = `wire-sheen-${uid}`;
  return { defs: materialDefsMarkup(wireId, shadowId), leadStroke: `url(#${wireId})` };
}

function materialDefsMarkup(wireId: string, shadowId: string) {
  return (
    <defs>
      <linearGradient id={wireId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#cbd5e1" />
        <stop offset="50%" stopColor="#64748b" />
        <stop offset="100%" stopColor="#94a3b8" />
      </linearGradient>
      <filter id={shadowId} x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#000" floodOpacity="0.45" />
      </filter>
    </defs>
  );
}
