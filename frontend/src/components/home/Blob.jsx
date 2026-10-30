// Blob, the player's character (an egg-shaped body, two arms at its sides, two feet
// under it and two eyes), white with a black line. The arms and feet go first so the body covers where they meet it.
export default function Blob({ className = "" }) {
  return (
    <svg className={`tv-blob ${className}`} viewBox="180 190 664 664" aria-hidden="true">
      <g fill="#fff" stroke="#111" strokeWidth="9" strokeLinejoin="round">
        <path d="M282 438 C240 488 205 540 207 590 C209 622 232 634 256 628" />
        <path d="M742 438 C784 488 819 540 817 590 C815 622 792 634 768 628" />
        <path d="M366 760 C348 784 350 822 384 830 C420 838 470 830 480 800 C486 780 476 768 466 760 Z" />
        <path d="M658 760 C676 784 674 822 640 830 C604 838 554 830 544 800 C538 780 548 768 558 760 Z" />
        <path d="M512 212 C640 212 722 302 760 452 C788 560 790 640 752 700 C704 762 600 778 512 778 C424 778 320 762 272 700 C234 640 236 560 264 452 C302 302 384 212 512 212 Z" />
      </g>
      <g fill="#111">
        <ellipse cx="431" cy="395" rx="27" ry="38" />
        <ellipse cx="593" cy="395" rx="27" ry="38" />
      </g>
      <g fill="#fff">
        <circle cx="428" cy="377" r="10" />
        <circle cx="590" cy="377" r="10" />
      </g>
    </svg>
  );
}
