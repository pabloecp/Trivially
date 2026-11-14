import { translate as tr } from "../lib/i18n.js";
// The Blob's skins (Blob.jsx): drawings that go inside its black line instead of a plain colour, each with a name.
// With an account, like the colours (backend db/store.js BLOB_SKINS has the same ids). Each draw(u, small) gives SVG
// markup for <defs> and for the skin's layers, with ids that start with `u` (one per Blob, so two never mix). `small`
// is a Blob under 40 px: fine details (stars, bubbles, thin lines) go and what's left grows a little. What moves (SMIL
// animations: twinkles, a shine, clouds) is left out when the Blobs are kept still ("Animaciones: Quietos" in Ajustes).
// Nothing leaves the line, and the background behind the eyes is always light enough for them to read.

const BODY = "M50 9 C80 9 96 28 96 52 C96 77 79 91 50 91 C21 91 4 77 4 52 C4 28 20 9 50 9 Z";
// Set by skinMarkup while one skin is drawn.
let RM = false;
const anim = (x) => (RM ? "" : x);
const mask = (id, dx, dy) =>
  `<mask id="${id}"><rect x="-10" y="-10" width="120" height="120" fill="#fff"/><path d="${BODY}" transform="translate(${dx} ${dy})" fill="#000"/></mask>`;

// Deterministic stars, kept away from the eyes and inside the body.
function stars(seed, count) {
  let s = seed, out = [];
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  while (out.length < count) {
    const x = 8 + r() * 84, y = 12 + r() * 76;
    const inBody = ((x - 50) / 42) ** 2 + ((y - 52) / 38) ** 2 < 1;
    const nearEye = [34, 66].some((ex) => ((x - ex) / 9) ** 2 + ((y - 45) / 12) ** 2 < 1);
    if (inBody && !nearEye) out.push([x.toFixed(1), y.toFixed(1), (0.45 + r() * 0.8).toFixed(2), (0.45 + r() * 0.55).toFixed(2)]);
  }
  return out;
}
const STARS = stars(7, 26);
const sparkle = (x, y, size, delay) =>
  `<g transform="translate(${x} ${y})"><path d="M0 -${size} Q0.8 -0.8 ${size} 0 Q0.8 0.8 0 ${size} Q-0.8 0.8 -${size} 0 Q-0.8 -0.8 0 -${size} Z" fill="#fff">${anim(
    `<animateTransform attributeName="transform" type="scale" values="0.25;1;0.25" dur="2.4s" begin="${delay}s" repeatCount="indefinite"/>`
  )}</path></g>`;

const SKINS = {
  gomita: {
    get name() { return tr("Gomita"); },
    draw: (u, small) => ({
      defs: `
        <radialGradient id="${u}g" cx=".42" cy=".38" r=".72">
          <stop offset="0" stop-color="#FF9BE6"/><stop offset=".5" stop-color="#FF2FC0"/><stop offset="1" stop-color="#B3127F"/>
        </radialGradient>
        ${mask(u + "t", 5, -7)}${mask(u + "s", -9, -1)}`,
      layers: `
        <path d="${BODY}" fill="url(#${u}g)"/>
        <path d="${BODY}" fill="#7A0D5A" opacity=".38" mask="url(#${u}s)"/>
        <path d="${BODY}" fill="#FFC2F0" opacity=".55" mask="url(#${u}t)"/>
        <path d="${BODY}" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="10"/>
        ${small ? "" : `<g fill="#fff" opacity=".35"><circle cx="64" cy="70" r="3.2"/><circle cx="72" cy="62" r="1.8"/><circle cx="27" cy="69" r="2.2"/><circle cx="56" cy="80" r="1.5"/><circle cx="40" cy="74" r="1.2"/></g>`}
        <ellipse cx="29" cy="25" rx="${small ? 14 : 12}" ry="${small ? 6.5 : 5.5}" transform="rotate(-28 29 25)" fill="#fff" opacity=".92"/>
        <circle cx="45.5" cy="17.5" r="${small ? 3 : 2.4}" fill="#fff" opacity=".92"/>`,
    }),
  },

  galaxia: {
    get name() { return tr("Galaxia"); },
    draw: (u, small) => ({
      defs: `
        <radialGradient id="${u}g" cx=".5" cy=".42" r=".66">
          <stop offset="0" stop-color="#9C80FF"/><stop offset=".38" stop-color="#5A2FD6"/><stop offset=".78" stop-color="#1F0E5E"/><stop offset="1" stop-color="#0E0730"/>
        </radialGradient>
        <filter id="${u}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
        ${mask(u + "s", -7, -9)}`,
      layers: `
        <path d="${BODY}" fill="url(#${u}g)"/>
        <g filter="url(#${u}f)">
          <ellipse cx="76" cy="74" rx="22" ry="12" fill="#FF2FC0" opacity=".6"/>
          <ellipse cx="18" cy="70" rx="13" ry="14" fill="#00D1C1" opacity=".45"/>
          <ellipse cx="66" cy="16" rx="18" ry="7" fill="#A63DFF" opacity=".7"/>
        </g>
        <path d="${BODY}" fill="#05031A" opacity=".5" mask="url(#${u}s)"/>
        ${small ? "" : `<g fill="#fff">${STARS.map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${o}"/>`).join("")}</g>`}
        ${sparkle(76, 27, small ? 6 : 4.5, 0)}
        ${small ? "" : sparkle(20, 38, 3.5, 0.9) + sparkle(54, 78, 3.2, 1.6)}`,
    }),
  },

  holo: {
    get name() { return tr("Holográfico"); },
    draw: (u, small) => ({
      defs: `
        <linearGradient id="${u}h" x1="0" y1="0" x2=".6" y2=".6" spreadMethod="reflect">
          <stop offset="0" stop-color="#9DB8FF"/><stop offset=".25" stop-color="#FFA6E6"/><stop offset=".5" stop-color="#FFE58A"/><stop offset=".75" stop-color="#8CF5E8"/><stop offset="1" stop-color="#B9A3FF"/>
          ${anim(`<animateTransform attributeName="gradientTransform" type="translate" values="0 0;.6 .6;0 0" dur="8s" repeatCount="indefinite"/>`)}
        </linearGradient>
        <pattern id="${u}p" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="3" height="1" fill="#fff" opacity=".22"/></pattern>
        ${mask(u + "s", -7, -9)}`,
      layers: `
        <path d="${BODY}" fill="#E6EBF5"/>
        <path d="${BODY}" fill="url(#${u}h)" opacity=".88"/>
        ${small ? "" : `<rect x="0" y="0" width="100" height="100" fill="url(#${u}p)"/>`}
        <path d="${BODY}" fill="#6E79A0" opacity=".42" mask="url(#${u}s)"/>
        <g>
          <g transform="rotate(25 50 50)"><rect x="34" y="-30" width="10" height="160" fill="#fff" opacity=".6"/><rect x="48" y="-30" width="4" height="160" fill="#fff" opacity=".45"/></g>
          ${anim(`<animateTransform attributeName="transform" type="translate" values="-90 0;90 0;90 0" keyTimes="0;.42;1" dur="4.2s" repeatCount="indefinite"/>`)}
        </g>
        <ellipse cx="28" cy="24" rx="9" ry="4" transform="rotate(-28 28 24)" fill="#fff" opacity=".75"/>`,
    }),
  },

  magma: {
    get name() { return tr("Magma"); },
    draw: (u, small) => {
      const cracks = small
        ? ["M50 9 L47 21 L53 30", "M96 58 L82 60 L74 70 L64 72", "M5 60 L17 63 L24 74", "M50 92 L52 82 L46 76"]
        : ["M50 9 L47 20 L53 28 L49 36", "M96 56 L84 58 L78 66 L70 64 L62 74", "M78 66 L80 78", "M5 60 L16 62 L22 72 L31 70", "M50 92 L52 82 L46 76 L50 68", "M12 32 L21 30 L24 21", "M88 26 L78 31", "M38 86 L40 80"];
      const d = cracks.join(" ");
      return {
        defs: `
          <radialGradient id="${u}r" cx=".5" cy=".35" r=".72">
            <stop offset="0" stop-color="#4A2F28"/><stop offset=".6" stop-color="#2B1A16"/><stop offset="1" stop-color="#160C0A"/>
          </radialGradient>
          <linearGradient id="${u}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD60A"/><stop offset="1" stop-color="#FF8A00"/></linearGradient>
          <filter id="${u}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>
          <filter id="${u}F" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="url(#${u}r)"/>
          <path d="${BODY}" fill="#000" opacity=".35" mask="url(#${u}s)"/>
          <ellipse cx="50" cy="98" rx="46" ry="18" fill="#FF5A1F" opacity=".6" filter="url(#${u}F)">${anim(`<animate attributeName="opacity" values=".4;.75;.4" dur="2.6s" repeatCount="indefinite"/>`)}</ellipse>
          ${small ? "" : `<g fill="#6B4A40" opacity=".55"><circle cx="24" cy="48" r="1.2"/><circle cx="78" cy="44" r="1"/><circle cx="58" cy="58" r="1.4"/><circle cx="36" cy="62" r="1"/><circle cx="70" cy="22" r="1.1"/></g>`}
          <g filter="url(#${u}f)">
            <path d="${d}" fill="none" stroke="#FF5A1F" stroke-width="${small ? 7 : 5.5}" stroke-linecap="round" stroke-linejoin="round"/>
            ${anim(`<animate attributeName="opacity" values=".5;1;.5" dur="2.6s" repeatCount="indefinite"/>`)}
          </g>
          <path d="${d}" fill="none" stroke="url(#${u}l)" stroke-width="${small ? 3.6 : 2.2}" stroke-linecap="round" stroke-linejoin="round"/>`,
      };
    },
  },

  vitral: {
    get name() { return tr("Vitral"); },
    draw: (u, small) => {
      const cells = [
        ["0,0 50,0 50,30 22,30 0,40", "#2F6BFF"],
        ["50,0 100,0 100,40 78,30 50,30", "#FF2FC0"],
        ["0,40 22,30 50,30 50,62 18,66 0,70", "#FFE58A"],
        ["50,30 78,30 100,40 100,70 82,66 50,62", "#8CF5E8"],
        ["0,70 18,66 34,100 0,100", "#A63DFF"],
        ["18,66 50,62 62,100 34,100", "#FF5A1F"],
        ["50,62 82,66 100,70 100,100 62,100", "#1FD24A"],
      ];
      return {
        defs: `
          <radialGradient id="${u}l" cx=".32" cy=".26" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          ${cells.map(([p, c]) => `<polygon points="${p}" fill="${c}"/>`).join("")}
          <path d="${BODY}" fill="url(#${u}l)"/>
          <path d="${BODY}" fill="#000" opacity=".3" mask="url(#${u}s)"/>
          <g fill="none" stroke="#0a0b0c" stroke-width="${small ? 3.6 : 2.4}" stroke-linejoin="round">${cells.map(([p]) => `<polygon points="${p}"/>`).join("")}</g>`,
      };
    },
  },

  sandia: {
    get name() { return tr("Sandía"); },
    draw: (u, small) => {
      const seeds = [[22, 62, 20], [40, 72, -10], [60, 72, 10], [78, 62, -20], [50, 26, 0], [26, 28, 30], [74, 28, -30]];
      return {
        defs: `${mask(u + "r1", 0, -10)}${mask(u + "r2", 0, -5)}${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="#FF3D5E"/>
          <path d="${BODY}" fill="#B3123A" opacity=".35" mask="url(#${u}s)"/>
          ${small ? "" : `<g fill="#FF8FA3" opacity=".6"><circle cx="30" cy="54" r=".9"/><circle cx="70" cy="56" r=".9"/><circle cx="50" cy="62" r=".9"/><circle cx="58" cy="38" r=".8"/><circle cx="42" cy="34" r=".8"/></g>`}
          <path d="${BODY}" fill="#F2FFE6" mask="url(#${u}r1)"/>
          <path d="${BODY}" fill="#1FA83F" mask="url(#${u}r2)"/>
          <g fill="#1A0F12">${seeds.slice(0, small ? 4 : 7).map(([x, y, a]) => `<ellipse cx="${x}" cy="${y}" rx="${small ? 2.2 : 1.6}" ry="${small ? 3.4 : 2.6}" transform="rotate(${a} ${x} ${y})"/>`).join("")}</g>
          <ellipse cx="28" cy="20" rx="7" ry="3" transform="rotate(-28 28 20)" fill="#fff" opacity=".55"/>`,
      };
    },
  },

  escarcha: {
    get name() { return tr("Escarcha"); },
    draw: (u, small) => {
      const flakes = [[20, 0, 6], [44, 2.5, 8], [70, 1, 7], [86, 4, 9], [32, 5, 6.5], [58, 3.5, 7.5]];
      const flake = `<path d="M0 -3 V3 M-2.6 -1.5 L2.6 1.5 M-2.6 1.5 L2.6 -1.5" stroke="#fff" stroke-width=".9" stroke-linecap="round"/>`;
      return {
        defs: `
          <linearGradient id="${u}g" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#E6F7FF"/><stop offset=".55" stop-color="#8FD3FF"/><stop offset="1" stop-color="#4FA3E0"/></linearGradient>
          <filter id="${u}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="url(#${u}g)"/>
          <path d="${BODY}" fill="#1F5C99" opacity=".35" mask="url(#${u}s)"/>
          <path d="${BODY}" fill="none" stroke="#fff" stroke-width="12" opacity=".75" filter="url(#${u}f)"/>
          <g stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"><path d="M14 30 L24 22 M18 27 L17 22 M20 25 L25 26"/><path d="M84 70 L76 78 M80 74 L85 76 M78 76 L77 81"/></g>
          ${small ? "" : flakes.map(([x, b, d], i) => `<g transform="translate(${x} -8)"><g ${RM ? `transform="translate(${i * 2} ${18 + i * 13})"` : ""}>${flake}${anim(`<animateTransform attributeName="transform" type="translate" values="0 0;6 116" dur="${d}s" begin="-${b}s" repeatCount="indefinite"/>`)}</g></g>`).join("")}
          <path d="M60 14 L70 24 M66 13 L72 19" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
      };
    },
  },

  atardecer: {
    get name() { return tr("Atardecer"); },
    draw: (u, small) => ({
      defs: `
        <linearGradient id="${u}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B1E9E"/><stop offset=".45" stop-color="#C23BD4"/><stop offset=".72" stop-color="#FF5A8A"/></linearGradient>
        <linearGradient id="${u}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD60A"/><stop offset="1" stop-color="#FF5A1F"/></linearGradient>
        <mask id="${u}m"><rect x="0" y="0" width="100" height="100" fill="#fff"/><g fill="#000"><rect x="0" y="60" width="100" height="1.2"/><rect x="0" y="64.4" width="100" height="1.8"/><rect x="0" y="69" width="100" height="2.4"/></g></mask>`,
      layers: `
        <path d="${BODY}" fill="url(#${u}k)"/>
        <circle cx="50" cy="68" r="20" fill="url(#${u}o)" mask="url(#${u}m)"/>
        <rect x="0" y="74" width="100" height="30" fill="#1B0D3A"/>
        <g stroke="#FF2FC0" stroke-width="${small ? 1.4 : 0.8}" fill="none">
          <path d="M0 77 H100 M0 81.5 H100 M0 88 H100"/>
          ${small ? "" : `<path d="M50 74 L-40 100 M50 74 L-10 100 M50 74 L20 100 M50 74 L50 100 M50 74 L80 100 M50 74 L110 100 M50 74 L140 100"/>`}
        </g>
        ${small ? "" : `<g fill="#fff"><circle cx="24" cy="22" r=".7"/><circle cx="72" cy="18" r=".9"/><circle cx="84" cy="34" r=".6"/><circle cx="40" cy="14" r=".6"/></g>`}`,
    }),
  },

  vaca: {
    get name() { return tr("Vaca"); },
    draw: (u, small) => ({
      defs: mask(u + "s", -7, -9),
      layers: `
        <path d="${BODY}" fill="#fff"/>
        <g fill="#141414">
          <path d="M60 8 C72 6 84 14 82 24 C80 32 68 30 62 26 C56 22 52 12 60 8 Z"/>
          <path d="M0 48 C8 44 18 54 19 64 C20 74 10 80 0 78 Z"/>
          <path d="M58 66 C70 60 86 66 84 78 C82 88 64 92 56 84 C50 78 50 70 58 66 Z"/>
          ${small ? "" : `<path d="M26 82 C32 80 38 84 36 90 C34 96 24 94 26 82 Z"/><path d="M14 20 C20 16 26 22 22 28 C18 30 12 26 14 20 Z"/>`}
        </g>
        <path d="${BODY}" fill="#AEB3BF" opacity=".5" mask="url(#${u}s)"/>`,
    }),
  },

  oro: {
    get name() { return tr("Oro"); },
    draw: (u, small) => ({
      defs: `
        <radialGradient id="${u}g" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#FFF1B0"/><stop offset=".35" stop-color="#FFD23F"/><stop offset=".75" stop-color="#E0A000"/><stop offset="1" stop-color="#B07800"/></radialGradient>
        ${mask(u + "s", -7, -9)}`,
      layers: `
        <path d="${BODY}" fill="url(#${u}g)"/>
        <path d="${BODY}" fill="#8A5A00" opacity=".4" mask="url(#${u}s)"/>
        <ellipse cx="29" cy="24" rx="${small ? 13 : 11}" ry="${small ? 5.5 : 4.5}" transform="rotate(-28 29 24)" fill="#fff" opacity=".9"/>
        ${sparkle(78, 26, small ? 7 : 5.5, 0.4)}`,
    }),
  },

  lava: {
    get name() { return tr("Lámpara de lava"); },
    draw: (u, small) => {
      // x, y from, y to, radius, seconds, horizontal drift
      const drops = [[30, 82, 22, 9, 14, 6], [66, 26, 80, 8, 17, -5], [46, 70, 16, 5.5, 11, 4], [76, 88, 40, 6.5, 19, -6], [20, 40, 86, 4.5, 13, 5], [58, 50, 12, 4, 15, -4]].slice(0, small ? 3 : 6);
      return {
        defs: `
          <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E0B55"/><stop offset=".55" stop-color="#5A26C2"/><stop offset="1" stop-color="#A63DFF"/></linearGradient>
          <radialGradient id="${u}h" cx=".5" cy="1" r=".75"><stop offset="0" stop-color="#FF8A00" stop-opacity=".7"/><stop offset="1" stop-color="#FF8A00" stop-opacity="0"/></radialGradient>
          <linearGradient id="${u}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE14D"/><stop offset=".55" stop-color="#FF8A00"/><stop offset="1" stop-color="#FF3D5E"/></linearGradient>
          <filter id="${u}f" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="b"/>
            <feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -8" result="goo"/>
            <feGaussianBlur in="goo" stdDeviation="1.6" result="gb"/>
            <feSpecularLighting in="gb" surfaceScale="3" specularConstant=".9" specularExponent="18" lighting-color="#fff" result="sp"><fePointLight x="20" y="0" z="40"/></feSpecularLighting>
            <feComposite in="sp" in2="goo" operator="in" result="spi"/>
            <feComposite in="goo" in2="spi" operator="arithmetic" k1="0" k2="1" k3=".75" k4="0"/>
          </filter>`,
        layers: `
          <path d="${BODY}" fill="url(#${u}g)"/>
          <path d="${BODY}" fill="url(#${u}h)"/>
          <g filter="url(#${u}f)" fill="url(#${u}o)">
            <ellipse cx="50" cy="101" rx="54" ry="14"/>
            ${drops.map(([x, a, b, r, d, dx]) => `<circle cx="${x}" cy="${a}" r="${small ? r + 2 : r}">${anim(`<animate attributeName="cy" values="${a};${b};${a}" keyTimes="0;.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1" dur="${d}s" repeatCount="indefinite"/><animate attributeName="cx" values="${x};${x + dx};${x}" dur="${d * 0.7}s" repeatCount="indefinite"/>`)}</circle>`).join("")}
          </g>
          <rect x="13" y="0" width="6" height="100" fill="#fff" opacity=".16"/>
          <rect x="22" y="0" width="2" height="100" fill="#fff" opacity=".12"/>
          ${small ? "" : `<g fill="#fff" opacity=".35"><circle cx="70" cy="60" r=".8"/><circle cx="38" cy="30" r=".7"/><circle cx="82" cy="40" r=".6"/></g>`}`,
      };
    },
  },
  cuaderno: {
    get name() { return tr("Cuaderno"); },
    draw: (u, small) => {
      let lines = "";
      for (let y = 22; y < 100; y += small ? 12 : 8) lines += `M0 ${y} H100 `;
      return {
        defs: mask(u + "s", -7, -9),
        layers: `
          <path d="${BODY}" fill="#FCFCF8"/>
          <path d="${lines}" stroke="#8FB2FF" stroke-width="${small ? 1.4 : 0.9}"/>
          <path d="M20 0 V100" stroke="#FF6B7A" stroke-width="${small ? 1.6 : 1.1}"/>
          ${small ? "" : `
          <path d="M78 19 L80 24 L85.5 24.5 L81.3 27.8 L82.8 33 L78 30 L73.2 33 L74.7 27.8 L70.5 24.5 L76 24 Z" fill="none" stroke="#2F6BFF" stroke-width="1.1" stroke-linejoin="round"/>
          <text x="27" y="82" font-family="Baloo 2, sans-serif" font-weight="800" font-size="17" fill="#2F6BFF" transform="rotate(-10 30 76)">?</text>
          <path d="M60 76 L65 81 L75 69" fill="none" stroke="#FF3D5E" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`}
          <path d="${BODY}" fill="#9AA0AA" opacity=".35" mask="url(#${u}s)"/>`,
      };
    },
  },

  mapa: {
    get name() { return tr("Mapamundi"); },
    draw: (u, small) => ({
      defs: `<radialGradient id="${u}g" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="#3FE6D8"/><stop offset=".6" stop-color="#00D1C1"/><stop offset="1" stop-color="#007A71"/></radialGradient>${mask(u + "s", -7, -9)}`,
      layers: `
        <path d="${BODY}" fill="url(#${u}g)"/>
        ${small ? "" : `<g fill="none" stroke="#fff" stroke-width=".6" opacity=".35"><ellipse cx="50" cy="52" rx="20" ry="46"/><ellipse cx="50" cy="52" rx="38" ry="46"/><path d="M50 0 V100 M0 30 H100 M0 52 H100 M0 74 H100"/></g>`}
        <g fill="#B6F7C4">
          <path d="M12 24 C20 16 36 18 40 26 C42 32 34 34 30 32 C26 38 18 38 12 32 Z"/>
          <path d="M58 18 C66 12 82 16 86 26 C88 32 80 34 76 32 C72 36 64 34 60 28 Z"/>
          <path d="M28 60 C34 56 44 60 42 68 C40 78 34 84 30 80 C26 74 24 64 28 60 Z"/>
          <path d="M62 58 C70 54 84 58 86 66 C88 74 78 80 70 76 C64 74 58 66 62 58 Z"/>
        </g>
        <path d="M30 66 Q50 44 70 64" fill="none" stroke="#FF5A1F" stroke-width="${small ? 2.6 : 1.6}" stroke-dasharray="${small ? "4 3" : "2.5 2.5"}" stroke-linecap="round">${anim(`<animate attributeName="stroke-dashoffset" values="10;0" dur="1.2s" repeatCount="indefinite"/>`)}</path>
        <circle cx="70" cy="64" r="${small ? 3.6 : 2.6}" fill="#FF5A1F" stroke="#0a0b0c" stroke-width="1.2"/>
        <path d="${BODY}" fill="#00403B" opacity=".45" mask="url(#${u}s)"/>`,
    }),
  },

  disco: {
    get name() { return tr("Disco"); },
    draw: (u, small) => {
      let s = 11;
      const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const t = small ? 10 : 7;
      let tiles = "";
      for (let y = 0; y < 100; y += t)
        for (let x = 0; x < 100; x += t) {
          const cx = x + t / 2, cy = y + t / 2;
          const v = ((cx - 35) / 60) ** 2 + ((cy - 28) / 60) ** 2 + (r() - 0.5) * 0.18;
          const roll = r();
          const col = roll < 0.1 ? ["#FF9BE6", "#8CF5E8", "#9DB8FF"][Math.floor(r() * 3)] : v < 0.1 ? "#F2F5FA" : v < 0.35 ? "#C8CFDC" : v < 0.6 ? "#9AA3B5" : "#6B7487";
          tiles += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${t - 1}" height="${t - 1}" rx=".6" fill="${col}"/>`;
        }
      return {
        defs: mask(u + "s", -7, -9),
        layers: `
          <path d="${BODY}" fill="#2E323B"/>
          ${tiles}
          <path d="${BODY}" fill="#000" opacity=".3" mask="url(#${u}s)"/>
          ${sparkle(26, 24, small ? 7 : 5.5, 0)}${small ? "" : sparkle(72, 58, 4, 0.8) + sparkle(56, 20, 3.5, 1.5)}`,
      };
    },
  },
  dona: {
    get name() { return tr("Dona"); },
    draw: (u, small) => {
      const ice = "M-5 -5 H105 V52 C98 52 96 60 92 60 C88 60 88 54 84 54 C80 54 80 66 75 66 C70 66 71 56 66 57 C61 58 62 62 56 62 C50 62 52 54 46 55 C40 56 42 70 36 70 C30 70 32 58 26 58 C21 58 22 64 17 64 C12 64 12 54 6 54 C2 54 0 58 -5 58 Z";
      const bits = [[50, 20, 20, "#FFD60A"], [24, 24, -40, "#00D1C1"], [72, 20, 60, "#2F6BFF"], [86, 38, 10, "#1FD24A"], [14, 44, 80, "#FFFFFF"], [50, 34, -70, "#00D1C1"], [62, 14, -20, "#FFFFFF"], [36, 14, 50, "#1FD24A"], [80, 50, -50, "#FFD60A"], [52, 52, 30, "#2F6BFF"], [20, 34, 15, "#FFD60A"]];
      return {
        defs: `
          <linearGradient id="${u}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB3E2"/><stop offset="1" stop-color="#FF5CB8"/></linearGradient>
          <radialGradient id="${u}d" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#F2BD78"/><stop offset="1" stop-color="#C98A45"/></radialGradient>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="url(#${u}d)"/>
          <path d="${BODY}" fill="#8A4A1A" opacity=".5" mask="url(#${u}s)"/>
          <path d="${ice}" transform="translate(0 2.6)" fill="#8A4A1A" opacity=".35"/>
          <path d="${ice}" fill="url(#${u}i)"/>
          <ellipse cx="28" cy="22" rx="11" ry="4.5" transform="rotate(-24 28 22)" fill="#fff" opacity=".55"/>
          <g>${bits.slice(0, small ? 6 : 11).map(([x, y, a, c]) => `<rect x="${x - (small ? 3 : 2.4)}" y="${y - (small ? 1.1 : 0.85)}" width="${small ? 6 : 4.8}" height="${small ? 2.2 : 1.7}" rx="${small ? 1.1 : 0.85}" fill="${c}" transform="rotate(${a} ${x} ${y})"/>`).join("")}</g>`,
      };
    },
  },

  mar: {
    get name() { return tr("Fondo del mar"); },
    draw: (u, small) => {
      const bubbles = [[24, 7, 0, 1.8], [62, 9, 3, 2.4], [80, 6, 1.5, 1.4], [40, 8, 5, 1.6]];
      return {
        defs: `
          <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4FD8FF"/><stop offset=".5" stop-color="#1F86D6"/><stop offset="1" stop-color="#0A3F7A"/></linearGradient>
          <filter id="${u}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="url(#${u}g)"/>
          <g filter="url(#${u}f)" fill="#fff" opacity=".2">
            <polygon points="30,-5 40,-5 28,100 10,100"/><polygon points="52,-5 58,-5 60,100 46,100"/><polygon points="72,-5 80,-5 96,100 78,100"/>
            ${anim(`<animateTransform attributeName="transform" type="rotate" values="-5 50 0;5 50 0;-5 50 0" dur="9s" repeatCount="indefinite"/>`)}
          </g>
          ${small ? "" : `<path d="M-10 16 Q-5 12 0 16 T10 16 T20 16 T30 16 T40 16 T50 16 T60 16 T70 16 T80 16 T90 16 T100 16 T110 16" fill="none" stroke="#fff" stroke-width="1.2" opacity=".45">${anim(`<animateTransform attributeName="transform" type="translate" values="0 0;10 0" dur="2.4s" repeatCount="indefinite"/>`)}</path>`}
          <path d="${BODY}" fill="#04203F" opacity=".35" mask="url(#${u}s)"/>
          <g fill="none" stroke="#1FD24A" stroke-width="${small ? 4.5 : 3.4}" stroke-linecap="round">
            <path d="M14 96 C10 88 18 82 14 74 C10 66 16 62 14 56">${anim(`<animateTransform attributeName="transform" type="rotate" values="-6 14 96;6 14 96;-6 14 96" dur="5s" repeatCount="indefinite"/>`)}</path>
            <path d="M86 96 C90 90 82 84 86 78">${anim(`<animateTransform attributeName="transform" type="rotate" values="5 86 96;-5 86 96;5 86 96" dur="6s" repeatCount="indefinite"/>`)}</path>
          </g>
          <path d="M-5 84 C15 78 30 86 50 82 S80 76 105 82 V105 H-5 Z" fill="#F2D58A"/>
          <path d="M-5 92 C20 88 40 94 60 90 S90 88 105 92 V105 H-5 Z" fill="#D9B464"/>
          ${small ? "" : bubbles.map(([x, d, b, r]) => `<circle cx="${x}" cy="${RM ? 60 : 92}" r="${r}" fill="none" stroke="#fff" stroke-width=".8" opacity=".8">${anim(`<animate attributeName="cy" values="92;6" dur="${d}s" begin="-${b}s" repeatCount="indefinite"/>`)}</circle>`).join("")}`,
      };
    },
  },

  arcoiris: {
    get name() { return tr("Arcoíris"); },
    // A blue sky with a rainbow low on the body, under the eyes, rising from two clouds.
    draw: (u, small) => {
      const bands = ["#FF3D5E", "#FF8A00", "#FFD60A", "#1FD24A", "#2F8BFF", "#A63DFF"];
      const w = small ? 5 : 4.4;
      const cloud = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k})" fill="#fff"><circle cx="-7" cy="2" r="6"/><circle cx="0" cy="-2" r="8"/><circle cx="8" cy="2" r="6"/><rect x="-13" y="2" width="27" height="7" rx="3.5"/></g>`;
      return {
        defs: `
          <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FDCFF"/><stop offset="1" stop-color="#5CB8FF"/></linearGradient>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="url(#${u}g)"/>
          <g fill="none" stroke-width="${w + 0.3}">${bands.map((c, i) => { const r = 34 - i * w; return `<path d="M${50 - r} 88 A${r} ${r} 0 0 1 ${50 + r} 88" stroke="${c}"/>`; }).join("")}</g>
          ${cloud(19, 81, small ? 1.4 : 1.2)}${cloud(81, 81, small ? 1.4 : 1.2)}
          <path d="${BODY}" fill="#1E6FB8" opacity=".3" mask="url(#${u}s)"/>
          <ellipse cx="29" cy="23" rx="${small ? 11 : 9}" ry="${small ? 4.4 : 3.6}" transform="rotate(-24 29 23)" fill="#fff" opacity=".55"/>
          ${sparkle(76, 24, small ? 6 : 4.5, 0.5)}`,
      };
    },
  },

  cielo: {
    get name() { return tr("Cielo"); },
    draw: (u, small) => {
      const cloud = (s) => `<g transform="scale(${s})"><g fill="#CFE3F5" transform="translate(0 2)"><circle cx="0" cy="0" r="7"/><circle cx="8" cy="-3" r="9"/><circle cx="17" cy="0" r="6.5"/><rect x="0" y="0" width="17" height="6.5"/></g><g fill="#fff"><circle cx="0" cy="0" r="7"/><circle cx="8" cy="-3" r="9"/><circle cx="17" cy="0" r="6.5"/><rect x="0" y="0" width="17" height="6.5"/></g></g>`;
      const clouds = small ? [[18, 70, 1.4, 0, 0]] : [[0, 26, 0.9, 30, 0], [0, 64, 1.2, 38, 14], [0, 84, 0.8, 26, 9]];
      return {
        defs: `
          <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE8FF"/><stop offset=".55" stop-color="#5CC2FF"/><stop offset="1" stop-color="#1E8FE0"/></linearGradient>
          <radialGradient id="${u}sun" cx=".85" cy=".1" r=".45"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".95"/><stop offset="1" stop-color="#FFF3B0" stop-opacity="0"/></radialGradient>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="url(#${u}g)"/>
          <path d="${BODY}" fill="url(#${u}sun)"/>
          <path d="${BODY}" fill="#0A62A8" opacity=".3" mask="url(#${u}s)"/>
          ${clouds.map(([x, y, s, d, b]) => `<g transform="translate(${x} ${y})"><g ${small || RM ? `transform="translate(${small ? 0 : 20 + y * 0.6} 0)"` : ""}>${cloud(s)}${small ? "" : anim(`<animateTransform attributeName="transform" type="translate" values="-30 0;120 0" dur="${d}s" begin="-${b}s" repeatCount="indefinite"/>`)}</g></g>`).join("")}`,
      };
    },
  },

  pinata: {
    get name() { return tr("Piñata"); },
    draw: (u, small) => {
      const step = small ? 12 : 9;
      const cycle = ["#FF2FC0", "#A63DFF", "#2F6BFF", "#FF5A1F", "#1FD24A"];
      let rows = "", i = 0;
      const ys = [];
      for (let y = step; y <= 100 + step; y += step) ys.push(y);
      const paths = ys.map((y) => {
        let col;
        if (y - step < 46 && y >= 46) col = "#FFD60A";
        else if (y - step < 46 + step && y >= 46 + step) col = "#00D1C1";
        else col = cycle[i++ % cycle.length];
        let d = `M-2 ${y - step - 6} H102 V${y}`;
        for (let x = 102, k = 0; x >= -2; x -= 3, k++) d += ` L${x} ${k % 2 ? y : y - 3.4}`;
        return `<path d="${d} Z" fill="${col}" stroke="#000" stroke-opacity=".16" stroke-width=".5"/>`;
      });
      rows = paths.reverse().join("");
      return {
        defs: mask(u + "s", -7, -9),
        layers: `
          <path d="${BODY}" fill="#FFD60A"/>
          ${rows}
          <path d="${BODY}" fill="#000" opacity=".22" mask="url(#${u}s)"/>
          <ellipse cx="28" cy="22" rx="10" ry="4" transform="rotate(-24 28 22)" fill="#fff" opacity=".35"/>`,
      };
    },
  },

  hamburguesa: {
    get name() { return tr("Hamburguesa"); },
    // The top bun is the face (the eyes sit on it); under it lettuce, cheese that drips, the meat and the bottom bun.
    draw: (u, small) => {
      const seeds = [[30, 20, -20], [50, 15, 0], [70, 20, 20], [20, 32, -40], [80, 32, 40], [42, 26, -10], [60, 27, 15]].slice(0, small ? 3 : 7);
      return {
        defs: `
          <radialGradient id="${u}b" cx=".45" cy=".25" r=".8"><stop offset="0" stop-color="#FFD08A"/><stop offset=".6" stop-color="#F2A54A"/><stop offset="1" stop-color="#D9822B"/></radialGradient>`,
        layers: `
          <path d="${BODY}" fill="#E38B32"/>
          <rect x="0" y="66" width="100" height="14" fill="#6B3412"/>
          ${small ? "" : `<g fill="#4A220A"><circle cx="24" cy="72" r="1.1"/><circle cx="46" cy="75" r="1"/><circle cx="68" cy="71" r="1.2"/><circle cx="84" cy="75" r=".9"/></g>`}
          <path d="M-2 62 H102 V66 L94 66 L90 74 L86 66 L60 66 L55 76 L50 66 L22 66 L17 73 L12 66 L-2 66 Z" fill="#FFC21F" stroke-linejoin="round"/>
          <path d="M-2 58 Q4 64 10 59 T22 59 T34 59 T46 59 T58 59 T70 59 T82 59 T94 59 T106 59 V64 H-2 Z" fill="#3DBE4A"/>
          <path d="M-5 -5 H105 V56 C100 60 90 61 50 61 C10 61 0 60 -5 56 Z" fill="url(#${u}b)"/>
          <path d="M-5 54 C10 58 30 59 50 59 C70 59 90 58 105 54 V57 C90 61 70 62 50 62 C30 62 10 61 -5 57 Z" fill="#B8651C" opacity=".5"/>
          <path d="M-5 84 H105" stroke="#B8651C" stroke-width="${small ? 2 : 1.2}" opacity=".6"/>
          <g fill="#FFF6DD">${seeds.map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${small ? 2.6 : 1.8}" ry="${small ? 1.4 : 1}" transform="rotate(${r} ${x} ${y})"/>`).join("")}</g>
          <ellipse cx="30" cy="22" rx="${small ? 11 : 9}" ry="${small ? 4.4 : 3.6}" transform="rotate(-24 30 22)" fill="#fff" opacity=".4"/>`,
      };
    },
  },

  tigre: {
    get name() { return tr("Tigre"); },
    draw: (u, small) => {
      // Stripes come in from the edges, tapering, and never reach the eyes.
      const stripes = [
        "M-2 26 C8 26 18 29 25 33 C17 33 8 32 -2 32 Z",
        "M-2 46 C6 44 15 46 21 50 C14 51 6 52 -2 53 Z",
        "M-2 66 C8 63 18 64 26 68 C18 70 8 72 -2 73 Z",
        "M102 26 C92 26 82 29 75 33 C83 33 92 32 102 32 Z",
        "M102 46 C94 44 85 46 79 50 C86 51 94 52 102 53 Z",
        "M102 66 C92 63 82 64 74 68 C82 70 92 72 102 73 Z",
        "M44 6 C44 14 46 21 49 26 C50 20 50 13 50 6 Z",
        "M58 6 C57 12 56 18 54 22 C58 18 61 12 63 6 Z",
        "M34 7 C35 12 37 16 40 19 C40 14 40 10 39 7 Z",
      ];
      return {
        defs: `
          <radialGradient id="${u}g" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#FFB347"/><stop offset=".6" stop-color="#FF8A00"/><stop offset="1" stop-color="#D45A00"/></radialGradient>
          <filter id="${u}f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="url(#${u}g)"/>
          <ellipse cx="50" cy="86" rx="${small ? 30 : 26}" ry="18" fill="#FFF4E0" filter="url(#${u}f)"/>
          <g fill="#1A1008">${stripes.slice(0, small ? 6 : 9).map((d) => `<path d="${d}"/>`).join("")}</g>
          <path d="${BODY}" fill="#7A2E00" opacity=".35" mask="url(#${u}s)"/>
          <ellipse cx="28" cy="22" rx="8" ry="3.2" transform="rotate(-24 28 22)" fill="#fff" opacity=".35"/>`,
      };
    },
  },

  panal: {
    get name() { return tr("Panal"); },
    draw: (u, small) => {
      // Honey that drips from the top, three drops long; the middle one stops between the eyes.
      const honey = "M-5 -5 H105 V26 C100 26 98 30 96 34 C94 40 88 40 87 34 C86 28 82 26 78 28 C74 30 72 30 70 26 C68 23 62 23 60 28 C58 34 58 40 54 40 C50 40 50 33 48 28 C46 24 40 24 38 28 C36 30 34 31 30 29 C26 26 20 26 18 32 C16 40 15 50 11 50 C7 50 7 42 6 34 C5 28 0 26 -5 26 Z";
      return {
        defs: `
          <pattern id="${u}p" width="8.66" height="15" patternUnits="userSpaceOnUse" patternTransform="translate(2 3)"><path d="M4.33 0 L8.66 2.5 V7.5 L4.33 10 L0 7.5 V2.5 Z M4.33 10 V15" fill="none" stroke="#C77A00" stroke-width="1"/></pattern>
          <radialGradient id="${u}g" cx=".5" cy=".6" r=".7"><stop offset="0" stop-color="#FFE58A"/><stop offset=".7" stop-color="#FFC93C"/><stop offset="1" stop-color="#F0A500"/></radialGradient>
          <linearGradient id="${u}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C96A00"/><stop offset="1" stop-color="#F59A00"/></linearGradient>
          ${mask(u + "s", -7, -9)}`,
        layers: `
          <path d="${BODY}" fill="url(#${u}g)"/>
          ${small ? "" : `<rect width="100" height="100" fill="url(#${u}p)" opacity=".55"/>`}
          <path d="${BODY}" fill="#8A4A00" opacity=".35" mask="url(#${u}s)"/>
          <path d="${honey}" transform="translate(0 2.4)" fill="#8A4A00" opacity=".3"/>
          <path d="${honey}" fill="url(#${u}h)"/>
          <path d="M14 14 C30 10 46 10 62 12" fill="none" stroke="#FFE9B0" stroke-width="${small ? 3.4 : 2.4}" stroke-linecap="round" opacity=".8"/>
          <ellipse cx="11" cy="44" rx="${small ? 1.6 : 1.2}" ry="${small ? 3 : 2.4}" fill="#FFE9B0" opacity=".8"/>
          ${small ? "" : `<ellipse cx="54" cy="35" rx="1" ry="2" fill="#FFE9B0" opacity=".8"/><ellipse cx="91" cy="31" rx=".9" ry="1.8" fill="#FFE9B0" opacity=".8"/>`}`,
      };
    },
  },

  aurora: {
    get name() { return tr("Aurora"); },
    draw: (u, small) => {
      const curtains = [
        ["M-10 40 C10 20 30 34 50 22 C70 10 90 26 110 14 L110 38 C90 50 70 34 50 46 C30 58 10 44 -10 62 Z", "#3CFFB0", ".75", "8s"],
        ["M-10 28 C14 12 34 22 54 12 C74 2 92 14 110 4 L110 22 C92 32 74 22 54 32 C34 42 14 32 -10 46 Z", "#A63DFF", ".6", "11s"],
        ["M-10 58 C12 44 32 54 52 44 C72 34 92 46 110 36 L110 52 C92 62 72 50 52 60 C32 70 12 60 -10 72 Z", "#00D1C1", ".55", "9.5s"],
      ];
      return {
        defs: `
          <linearGradient id="${u}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1440"/><stop offset=".6" stop-color="#1B2A6B"/><stop offset="1" stop-color="#2E4A8F"/></linearGradient>
          <filter id="${u}f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${small ? 3 : 4}"/></filter>`,
        layers: `
          <path d="${BODY}" fill="url(#${u}g)"/>
          ${small ? "" : `<g fill="#fff">${STARS.slice(0, 14).map(([x, y, r, o]) => `<circle cx="${x}" cy="${(y * 0.7).toFixed(1)}" r="${(r * 0.8).toFixed(2)}" opacity="${o}"/>`).join("")}</g>`}
          <g filter="url(#${u}f)">
            ${curtains.map(([d, c, o, dur]) => `<path d="${d}" fill="${c}" opacity="${o}">${anim(`<animateTransform attributeName="transform" type="translate" values="-6 0;6 3;-6 0" dur="${dur}" repeatCount="indefinite"/><animate attributeName="opacity" values="${o};${(o * 0.5).toFixed(2)};${o}" dur="${dur}" repeatCount="indefinite"/>`)}</path>`).join("")}
          </g>
          <path d="M-5 100 L-5 80 L14 68 L24 74 L38 62 L52 76 L64 66 L78 76 L90 70 L105 80 L105 100 Z" fill="#0A1030"/>
          <path d="M14 68 L19 71 L16 73 L11 70 Z M38 62 L44 67 L40 68 L36 66 L33 66 Z M64 66 L70 70 L66 71 L62 69 L59 70 Z" fill="#E6F7FF"/>
          ${sparkle(78, 22, small ? 5.5 : 3.6, 0.6)}`,
      };
    },
  },

  casino: {
    get name() { return tr("Casino"); },
    // The ace of spades: a white card with "A" and a spade in two corners, and a big
    // spade under the eyes.
    draw: (u, small) => {
      const spade = `<path d="M0 -10 C-11 -2 -13 4 -9 7.4 C-5.8 10 -2 8.4 -0.8 5.4 L-3.8 11 H3.8 L0.8 5.4 C2 8.4 5.8 10 9 7.4 C13 4 11 -2 0 -10 Z" fill="#141414"/>`;
      const corner = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><text x="0" y="0" text-anchor="middle" font-family="Baloo 2, Arial, sans-serif" font-weight="800" font-size="${small ? 15 : 12}" fill="#141414">A</text><g transform="translate(0 ${small ? 7 : 6}) scale(${small ? 0.5 : 0.4})">${spade}</g></g>`;
      return {
        defs: mask(u + "s", -7, -9),
        layers: `
          <path d="${BODY}" fill="#FFFDF7"/>
          ${corner(small ? 25 : 25, small ? 37 : 35, 0)}${small ? "" : corner(75, 69, 180)}
          <g transform="translate(50 ${small ? 72 : 70}) scale(${small ? 1.2 : 1.05})">${spade}</g>
          <path d="${BODY}" fill="#AEB3BF" opacity=".45" mask="url(#${u}s)"/>`,
      };
    },
  },
};

const ORDER = ["gomita", "galaxia", "holo", "magma", "oro", "lava", "vitral", "sandia", "dona", "escarcha", "cielo", "mar", "atardecer", "vaca", "arcoiris", "pinata", "cuaderno", "mapa", "disco", "hamburguesa", "tigre", "panal", "aurora", "casino"];

/** The skins in the profile's order: { id, name, needs }. */
export const BLOB_SKINS = ORDER.map((id) => ({ id, name: SKINS[id].name, needs: "account", how: "skin" }));

/** Whether a saved avatar is one of the skins. */
export const isBlobSkin = (id) => Object.prototype.hasOwnProperty.call(SKINS, String(id || "").toLowerCase());

/** The markup of skin `id` for one Blob: { defs, layers }. */
export function skinMarkup(id, u, { small = false, still = false } = {}) {
  RM = still;
  try {
    const out = SKINS[String(id).toLowerCase()].draw(u, small);
    return { defs: out.defs || "", layers: out.layers };
  } finally {
    RM = false;
  }
}
