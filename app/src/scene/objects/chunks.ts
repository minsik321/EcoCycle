// 탱크 안의 파지 조각 배치. 같은 모양 조각을 InstancedMesh 하나로 그리고, 수위(fillPercent)에 맞춰 보이는 개수만 조절한다.
// 위치는 한 번만 계산해 두고 매 프레임 새로 만들지 않는다.

export interface ChunkSlot {
  x: number;
  y: number;
  z: number;
  /** 조각마다 조금씩 다르게 돌려 보이게 하는 각(라디안). 같은 슬롯은 항상 같다 */
  rotationY: number;
}

/**
 * 원통 안쪽을 층층이 채우는 조각 자리. 아래층부터 순서대로이므로 앞에서 n개만 보이면 수위가 n에 맞게 차오른다.
 * 슬롯 수는 maxChunks를 넘지 않는다 (저사양 모드에서 줄인다).
 */
export function chunkSlots(innerRadius: number, innerHeight: number, chunkSize: number, maxChunks: number): ChunkSlot[] {
  const slots: ChunkSlot[] = [];
  const step = chunkSize * 1.08;
  const layers = Math.max(1, Math.floor(innerHeight / step));
  const perLayer: Array<Array<[number, number]>> = [];
  for (let layer = 0; layer < layers; layer += 1) {
    const cells: Array<[number, number]> = [];
    const shift = layer % 2 === 0 ? 0 : step / 2; // 층마다 반 칸씩 어긋나게 쌓는다
    for (let ix = -Math.ceil(innerRadius / step); ix <= Math.ceil(innerRadius / step); ix += 1) {
      for (let iz = -Math.ceil(innerRadius / step); iz <= Math.ceil(innerRadius / step); iz += 1) {
        const x = ix * step + shift;
        const z = iz * step;
        if (Math.hypot(x, z) + chunkSize * 0.5 <= innerRadius) cells.push([x, z]);
      }
    }
    perLayer.push(cells);
  }

  const total = perLayer.reduce((sum, cells) => sum + cells.length, 0);
  // 슬롯이 상한보다 많으면 한 층의 칸 수를 줄이는 대신 조각을 더 크게 보이게 하는 편이 단순하다:
  // 여기서는 각 층에서 균등하게 솎아 내어 상한 안에 넣는다.
  const keepRatio = total > maxChunks ? maxChunks / total : 1;
  perLayer.forEach((cells, layer) => {
    const keep = Math.max(1, Math.round(cells.length * keepRatio));
    for (let i = 0; i < keep; i += 1) {
      const [x, z] = cells[Math.floor((i * cells.length) / keep)]!;
      // 같은 자리에서 항상 같은 값이 나오는 가짜 난수
      const seed = Math.sin((layer + 1) * 12.9898 + (i + 1) * 78.233) * 43758.5453;
      slots.push({ x, y: chunkSize / 2 + layer * step, z, rotationY: (seed - Math.floor(seed)) * Math.PI });
    }
  });
  return slots.slice(0, maxChunks);
}

/** 수위(%)에 맞춰 보여 줄 조각 수. 수위가 0이면 0개, 100이면 전부 */
export function visibleChunkCount(fillPercent: number, totalSlots: number): number {
  if (!Number.isFinite(fillPercent) || totalSlots <= 0) return 0;
  const fraction = Math.min(1, Math.max(0, fillPercent / 100));
  return Math.round(fraction * totalSlots);
}
