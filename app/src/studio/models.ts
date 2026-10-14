import { Box3, Color, Float32BufferAttribute, Group, Vector3 } from 'three';
import type { BufferGeometry, Mesh, MeshStandardMaterial, Texture } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MAT } from './three/kit';

// 스튜디오가 쓰는 모델 파일(glTF/GLB) 목록과 불러오기.
//  - 파일은 app/public/models 아래에 둔다. Draco·Meshopt 압축을 모두 읽을 수 있다 (Draco 디코더는 three가 품고 있어 빌드 때 함께 나온다).
//  - 모델마다 라이선스·출처·삼각형 수를 적는다. 목록에 없는 파일은 쓰지 않는다.
//  - 파일을 못 받으면 코드로 만든 모형(절차적 모형)을 그대로 쓴다. 모델이 없어도 화면은 완성되어 있어야 한다.
//
// 지금 쓰는 팩은 Kenney "Car Kit" 하나뿐이고(CC0), 주차된 승용차에만 쓴다.
// 트럭(적재함이 들림)·지게차(포크가 오르내림)·작업자(팔다리가 움직임)·나무·소품은 코드로 만든 모형이다:
// CC0 팩 하나로 이 전부를 갖추면서 움직이는 마디까지 나뉜 것을 찾지 못했다 (studio/CLAUDE.md "모델").

export interface ModelEntry {
  /** app/public/models 아래 경로 */
  file: string;
  /** 장면 크기에 맞추는 배율 */
  scale: number;
  /** 장면 방향(+X가 앞)에 맞추는 회전 (라디안, XYZ) */
  rotation: readonly [number, number, number];
  /** 원점을 옮길 양 (배율·회전 뒤, 장면 단위). 바닥 중심이 원점이 되게 한다 */
  pivot: readonly [number, number, number];
  licence: string;
  source: string;
  triangles: number;
  /** 원본 대비 바꾼 것 */
  note: string;
}

const KENNEY = {
  licence: 'CC0 1.0 (Kenney, www.kenney.nl)',
  source: 'https://kenney.nl/assets/car-kit',
  note: 'Car Kit 3.1의 GLB를 gltf-transform meshopt로 압축(텍스처 포함). 색은 불러올 때 스튜디오 색으로 바꾼다.',
  scale: 0.54,
  rotation: [0, Math.PI / 2, 0],
  pivot: [0, 0, 0],
} as const;

export const MODELS = {
  'car-sedan': { ...KENNEY, file: 'kenney-car-kit/sedan.glb', triangles: 2032 },
  'car-suv': { ...KENNEY, file: 'kenney-car-kit/suv.glb', triangles: 2474 },
  'car-hatchback': { ...KENNEY, file: 'kenney-car-kit/hatchback-sports.glb', triangles: 2088 },
  'car-van': { ...KENNEY, file: 'kenney-car-kit/van.glb', triangles: 2082 },
  'car-suv-luxury': { ...KENNEY, file: 'kenney-car-kit/suv-luxury.glb', triangles: 2086 },
  'car-sedan-sports': { ...KENNEY, file: 'kenney-car-kit/sedan-sports.glb', triangles: 2088 },
} as const satisfies Record<string, ModelEntry>;

export type ModelKey = keyof typeof MODELS;

const MODEL_BASE = '/models/';

let loader: GLTFLoader | null = null;

function gltfLoader(): GLTFLoader {
  if (loader) return loader;
  loader = new GLTFLoader();
  loader.setDRACOLoader(new DRACOLoader());
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

const cache = new Map<ModelKey, Promise<Group>>();

/** 모델 하나를 불러와 배율·방향·원점을 맞춘 그룹으로 돌려준다 (한 번만 받고, 쓸 때는 clone 한다) */
export function loadModel(key: ModelKey): Promise<Group> {
  let pending = cache.get(key);
  if (!pending) {
    const entry: ModelEntry = MODELS[key];
    pending = gltfLoader()
      .loadAsync(MODEL_BASE + entry.file)
      .then((gltf) => {
        const inner = gltf.scene;
        inner.scale.setScalar(entry.scale);
        inner.rotation.set(entry.rotation[0], entry.rotation[1], entry.rotation[2]);
        const holder = new Group();
        holder.add(inner);
        holder.updateMatrixWorld(true);
        // 바닥 중심이 원점이 되게 한다
        const box = new Box3().setFromObject(holder);
        const center = box.getCenter(new Vector3());
        inner.position.set(-center.x + entry.pivot[0], -box.min.y + entry.pivot[1], -center.z + entry.pivot[2]);
        holder.name = key;
        return holder;
      });
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  return pending;
}

// ── 색 맞추기 ─────────────────────────────────────────────────────────

function pixels(texture: Texture): { data: Uint8ClampedArray; width: number; height: number } | null {
  const image = texture.image as CanvasImageSource & { width: number; height: number };
  if (!image || !image.width) return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  return { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
}

const hsl = { h: 0, s: 0, l: 0 };
const paintHsl = { h: 0, s: 0, l: 0 };
const sample = new Color();
const paintColor = new Color();

/**
 * 팩의 모델은 색 지도(텍스처) 한 장으로 칠해져 있고 원색이 강하다. 스튜디오의 재질·색과 어울리도록
 * 텍스처 색을 꼭짓점 색으로 옮기고, 채도가 높은 부분(차체)만 고른 색으로 바꾼다. 유리·바퀴 같은 무채색은 그대로 둔다.
 * 그 뒤에는 스튜디오의 공용 재질(장난감 플라스틱)을 쓴다.
 */
export function repaint(model: Group, paint: string): Group {
  const copy = model.clone(true);
  paintColor.set(paint).getHSL(paintHsl);
  copy.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as MeshStandardMaterial;
    const map = material.map;
    const source = mesh.geometry as BufferGeometry;
    const uv = source.getAttribute('uv');
    const image = map ? pixels(map) : null;
    const geometry = source.clone();
    const count = geometry.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      if (image && uv && map) {
        // 텍스처 변환(KHR_texture_transform)과 반복을 반영해 해당 픽셀을 읽는다
        const u = uv.getX(i) * map.repeat.x + map.offset.x;
        const v = uv.getY(i) * map.repeat.y + map.offset.y;
        const px = Math.min(image.width - 1, Math.max(0, Math.floor((u - Math.floor(u)) * image.width)));
        const py = Math.min(image.height - 1, Math.max(0, Math.floor((v - Math.floor(v)) * image.height)));
        const at = (py * image.width + px) * 4;
        sample.setRGB(image.data[at]! / 255, image.data[at + 1]! / 255, image.data[at + 2]! / 255, 'srgb');
      } else {
        sample.copy(material.color);
      }
      sample.getHSL(hsl);
      if (hsl.s > 0.3 && hsl.l > 0.18) sample.setHSL(paintHsl.h, paintHsl.s, Math.min(0.92, paintHsl.l * (0.55 + hsl.l * 0.9)));
      colors[i * 3] = sample.r;
      colors[i * 3 + 1] = sample.g;
      colors[i * 3 + 2] = sample.b;
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    mesh.geometry = geometry;
    mesh.material = MAT.gloss;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return copy;
}
