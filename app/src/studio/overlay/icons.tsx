// 스튜디오 패널의 작은 선 아이콘 (24 격자, 선 1.8). 그림만으로 뜻을 전하지 않고 늘 글자와 함께 쓴다.

const PATHS = {
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  more: 'M5.5 12h.01M12 12h.01M18.5 12h.01',
  chevron: 'M7 10l5 5 5-5',
  close: 'M6 6l12 12M18 6 6 18',
  bell: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7 2.5 7h-17S6 15 6 9M10 20a2 2 0 0 0 4 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  rotL: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
  rotR: 'M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5',
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  truck: 'M3 7h11v9H3zM14 10h4l3 3v3h-7M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  scan: 'M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M7 12h10M8 9h1M11 9h1M14 9h2M8 15h8',
  unload: 'M4 15h9l3-6h4M4 15v3h16v-3M12 4v6M9 7l3 3 3-3',
  mix: 'M5 19h14M8 19v-5l-3-4 5-4 4 3M14 9l3 1M17 10l2 2',
  press: 'M5 4h14v4H5zM12 8v3M7 11h10v9H7zM10 15h4',
  ship: 'M4 9l8-4 8 4v9l-8 4-8-4zM4 9l8 4 8-4M12 13v9',
  bale: 'M4 8h16v10H4zM4 12h16M9 8v10M15 8v10',
  robot: 'M6 20h8M10 20v-4M10 16l-3-6 6-4 4 3M17 9l2 2M17 9l-1 3',
  conveyor: 'M4 10h16M4 14h16M7 17a1.5 1.5 0 1 0 0 .01M12 17a1.5 1.5 0 1 0 0 .01M17 17a1.5 1.5 0 1 0 0 .01M9 6h6v4H9z',
  sector: 'M4 6h16v13H4zM9 6v13M15 6v13M4 14h16',
  forklift: 'M4 17h9V9H7l-3 4zM13 17V5M13 15h6M8 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  layers: 'M12 4 3 9l9 5 9-5zM3 14l9 5 9-5',
  batch: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3',
  drop: 'M12 4c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10z',
  gauge: 'M5 17a7 7 0 1 1 14 0M12 17l3-5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="st-icon">
      <path d={PATHS[name]} />
    </svg>
  );
}
