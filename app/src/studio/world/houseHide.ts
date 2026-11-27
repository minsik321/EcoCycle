import type { Group, Material, Mesh, Object3D } from 'three';

/**
 * 압축기 건물 벽·지붕 걷기 (S2o: 그림자 깜빡임 고침).
 * 전에는 카메라 쪽 벽과 가까이 온 때의 지붕을 visible=false로 숨겼다. 숨긴 메시는 그림자 지도에서도 빠지므로
 * 카메라를 돌리거나 당겨 문턱을 넘나들 때마다 건물 안 그림자가 켜졌다 꺼졌다(문턱에 여유도 없어 문턱 근처에서 계속 깜빡임).
 * S2o에서 걷힌 벽은 그림자만 그리게 했지만 깜빡임이 남았다(S2r). 이제 건물 벽·지붕·고정물은 실시간 그림자를 아예 만들지 않고
 * (`noCastShadow`), 건물 그림자는 바닥에 구운 한 장(`bakeGroundShadow(houseFootprints)`)만 둔다. 걷기·덮기는 화면 모습만 바꾼다.
 * 두 문턱에는 여유(히스테리시스)를 둔다.
 */

/** 벽이 카메라 쪽을 보는 정도(내적)의 문턱: 이보다 크면 걷는다. 걷힌 벽은 HIDE − 2·BAND보다 작아져야 다시 세운다 */
export const WALL_HIDE_DOT = 0.24;
export const WALL_BAND = 0.06;
/** 지붕을 걷는 카메라 거리: 이보다 가까우면 걷고, 덮인 지붕은 ROOF_SHOW_DIST보다 멀어져야 다시 덮는다 */
export const ROOF_HIDE_DIST = 70;
export const ROOF_SHOW_DIST = 80;

/** 벽을 세워 둘까 (shown: 지금 세워져 있나, dot: 벽 바깥 방향 · 카메라 쪽 방향) */
export function wallShown(shown: boolean, dot: number): boolean {
  return shown ? dot < WALL_HIDE_DOT : dot < WALL_HIDE_DOT - 2 * WALL_BAND;
}

/** 지붕을 덮어 둘까 (dist: 건물 가운데에서 카메라까지) */
export function roofShown(shown: boolean, dist: number): boolean {
  return shown ? dist > ROOF_HIDE_DIST : dist > ROOF_SHOW_DIST;
}

interface Part {
  mesh: Mesh;
  material: Material | Material[];
}

/** 벽 하나의 메시와 원래 재질 */
export function wallParts(group: Group): Part[] {
  const parts: Part[] = [];
  group.traverse((o) => {
    const mesh = o as Mesh;
    if (mesh.isMesh) parts.push({ mesh, material: mesh.material });
  });
  return parts;
}

/**
 * 벽을 세우거나 걷는다 (S2r: 건물은 실시간 그림자를 만들지 않으므로 걷힌 벽은 그냥 숨긴다).
 * 걷어도 그림자 지도가 바뀌지 않아 그림자가 깜빡일 일이 없다. 건물 그림자는 바닥에 구운 것(houseFootprints)뿐이다
 */
export function applyWall(parts: readonly Part[], shown: boolean): void {
  for (const p of parts) {
    p.mesh.visible = shown;
    p.mesh.material = p.material;
  }
}

/** 그룹 안 메시가 실시간 그림자를 드리우지 않게 한다(받기는 그대로). 압축기 건물 벽·지붕·고정물·움직이는 부품 (S2r) */
export function noCastShadow<T extends Object3D>(root: T): T {
  root.traverse((o) => {
    if ((o as Mesh).isMesh) (o as Mesh).castShadow = false;
  });
  return root;
}
