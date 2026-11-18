/** Decorative loop under the home cards: a rider dot climbing a rolling profile, with moving hills. */

const ROAD =
  'M0 210 C120 210 160 120 300 120 S470 190 620 170 S800 70 960 90 S1130 180 1280 150 S1440 120 1600 130';

export function HomeAnimation() {
  return (
    <div className="home-anim" aria-hidden="true">
      <svg
        viewBox="0 0 1600 260"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="home-anim-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="home-anim__far">
          <path d="M0 160 C200 80 360 190 560 120 S900 60 1100 130 S1400 90 1600 140 V260 H0Z" />
        </g>
        <path d={`${ROAD} V260 H0Z`} fill="url(#home-anim-fill)" />
        <path className="home-anim__road" d={ROAD} />
        <path className="home-anim__dash" d={ROAD} />
        <g className="home-anim__rider">
          <g className="home-anim__bike" transform="scale(1.25)">
            {[-26.5, 26.5].map((x) => (
              <g key={x}>
                <circle className="home-anim__tire" cx={x} cy={-18} r={18} />
                <circle className="home-anim__rim" cx={x} cy={-18} r={15.5} />
                <g className="home-anim__spin">
                  <line className="home-anim__spoke" x1={x - 15} y1={-18} x2={x + 15} y2={-18} />
                  <line className="home-anim__spoke" x1={x - 7.5} y1={-31} x2={x + 7.5} y2={-5} />
                  <line className="home-anim__spoke" x1={x - 7.5} y1={-5} x2={x + 7.5} y2={-31} />
                </g>
                <circle className="home-anim__hub" cx={x} cy={-18} r={2} />
              </g>
            ))}
            {/* frame: chainstay, seat stay, seat tube, top tube, down tube */}
            <path
              className="home-anim__frame"
              d="M-26.5 -18 L-2 -14.3 L-10 -41.7 L-26.5 -18 M-10 -41.7 L19 -42 L-2 -14.3 L17.5 -37"
            />
            {/* fork and head tube */}
            <path className="home-anim__frame" d="M19 -42 L17.5 -37 M18.5 -39 L26.5 -18" />
            {/* seat post, saddle, stem, drop handlebar */}
            <path
              className="home-anim__part"
              d="M-10 -41.7 L-11.5 -48 M-17.5 -49 L-5.5 -49 M19 -42 L23 -46 M23 -46 Q31 -46 31 -40 Q31 -35 26 -35"
            />
            {/* chainring and crank */}
            <circle className="home-anim__ring" cx={-2} cy={-14.3} r={5.5} />
            <g className="home-anim__crank">
              <line className="home-anim__part" x1={-2} y1={-14.3} x2={-2} y2={-4} />
              <line className="home-anim__part" x1={-2} y1={-14.3} x2={-2} y2={-24.6} />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
