// 섹터 안의 파지 더미 배치. 같은 모양 조각을 InstancedMesh 하나로 그리고, 적재율(fillPercent)에 맞춰 보이는 개수만 조절한다.
// 위치는 한 번만 계산해 두고 매 프레임 새로 만들지 않는다.

export interface ChunkSlot {
  /** 칸 중심에서 본 자리 */
  x: number;
  y: number;
  z: number;
  /** 조각마다 조금씩 다르게 돌려 보이게 하는 각(라디안). 같은 슬롯은 항상 같다 */
  rotationY: number;
  /** 크기 배율 (조각마다 조금씩 다르다) */
  scale: number;
  /** 색을 고르는 데 쓰는 0 이상 1 미만의 값 */
  tint: number;
}

export interface Pile {
  /** 조각 한 변의 길이 */
  size: number;
  slots: ChunkSlot[];
}

/** 같은 자리에서 항상 같은 값이 나오는 가짜 난수 (0 이상 1 미만) */
function hash(a: number, b: number): number {
  const v = Math.sin((a + 1) * 12.9898 + (b + 1) * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function slotsFor(width: number, depth: number, maxHeight: number, size: number): ChunkSlot[] {
  const slots: ChunkSlot[] = [];
  const step = size * 1.02;
  const rise = size * 0.86;
  const layers = Math.max(1, Math.floor(maxHeight / rise));
  for (let layer = 0; layer < layers; layer += 1) {
    // 위로 갈수록 좁아지는 더미 모양
    const inset = (layer / layers) * 0.36 * Math.min(width, depth);
    const spanX = Math.max(0, width - size - inset * 2);
    const spanZ = Math.max(0, depth - size - inset * 2);
    const nx = Math.floor(spanX / step) + 1;
    const nz = Math.floor(spanZ / step) + 1;
    const cells: ChunkSlot[] = [];
    for (let ix = 0; ix < nx; ix += 1) {
      for (let iz = 0; iz < nz; iz += 1) {
        const seed = layer * 97 + ix * 13 + iz;
        const jitter = size * 0.1;
        cells.push({
          x: (nx === 1 ? 0 : -spanX / 2 + (ix * spanX) / (nx - 1)) + (hash(seed, 1) - 0.5) * jitter,
          y: size / 2 + layer * rise,
          z: (nz === 1 ? 0 : -spanZ / 2 + (iz * spanZ) / (nz - 1)) + (hash(seed, 2) - 0.5) * jitter,
          rotationY: hash(seed, 3) * Math.PI,
          scale: 0.86 + hash(seed, 4) * 0.22,
          tint: hash(seed, 5),
        });
      }
    }
    // 한 층은 가운데부터 채운다 (덜 찬 층이 가운데에 봉긋하게 쌓인다)
    cells.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    slots.push(...cells);
  }
  return slots;
}

/**
 * 네모난 칸(가로 width × 세로 depth)에 maxHeight까지 쌓이는 더미의 조각 자리. 아래층부터 순서대로이므로
 * 앞에서 n개만 보이면 적재율이 n에 맞게 차오른다. 조각 수가 maxChunks를 넘지 않도록 조각 크기를 정한다
 * (저사양 화질에서는 큰 조각 적게, 고화질에서는 작은 조각 많이).
 */
export function pileSlots(width: number, depth: number, maxHeight: number, maxChunks: number): Pile {
  let size = Math.cbrt((width * depth * maxHeight * 0.6) / Math.max(1, maxChunks));
  let slots = slotsFor(width, depth, maxHeight, size);
  for (let i = 0; i < 40 && slots.length > maxChunks; i += 1) {
    size *= 1.04;
    slots = slotsFor(width, depth, maxHeight, size);
  }
  return { size, slots: slots.slice(0, maxChunks) };
}

/** 적재율(%)에 맞춰 보여 줄 조각 수. 0이면 0개, 100이면 전부 */
export function visibleChunkCount(fillPercent: number, totalSlots: number): number {
  if (!Number.isFinite(fillPercent) || totalSlots <= 0) return 0;
  const fraction = Math.min(1, Math.max(0, fillPercent / 100));
  return Math.round(fraction * totalSlots);
}
