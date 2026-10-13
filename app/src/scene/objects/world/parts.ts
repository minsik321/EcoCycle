import { BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Euler, Matrix3, Matrix4, Quaternion, Vector3 } from 'three';

// 고정물(건물·도로 시설·소품)은 "조각" 목록으로 적고, 한꺼번에 지오메트리 하나로 합쳐 한 번에 그린다.
// 조각마다 색을 꼭짓점에 넣으므로 재질도 하나면 된다. 미리 그리는 바닥 그림자(objects/ground)도 같은 목록에서 만든다.

export type PartShape = 'box' | 'cyl' | 'cone';

export interface Part {
  shape: PartShape;
  color: string;
  /** 중심 */
  x: number;
  y: number;
  z: number;
  /** 크기 (원통·원뿔은 sx, sz가 지름) */
  sx: number;
  sy: number;
  sz: number;
  /** 회전(라디안) */
  rx: number;
  ry: number;
  rz: number;
  /** 바닥에 그림자를 드리우는가 */
  shadow: boolean;
}

export interface PartOptions {
  rx?: number;
  ry?: number;
  rz?: number;
  shadow?: boolean;
}

type Triple = readonly [number, number, number];

export class PartList {
  readonly parts: Part[] = [];

  private add(shape: PartShape, color: string, at: Triple, size: Triple, options: PartOptions): void {
    this.parts.push({
      shape,
      color,
      x: at[0],
      y: at[1] + size[1] / 2,
      z: at[2],
      sx: size[0],
      sy: size[1],
      sz: size[2],
      rx: options.rx ?? 0,
      ry: options.ry ?? 0,
      rz: options.rz ?? 0,
      shadow: options.shadow ?? true,
    });
  }

  /** 상자. at은 밑면 중심(놓는 자리), size는 [X, Y, Z] 길이 */
  box(color: string, at: Triple, size: Triple, options: PartOptions = {}): void {
    this.add('box', color, at, size, options);
  }

  /** 원통. at은 밑면 중심, size는 [지름, 높이, 지름] */
  cyl(color: string, at: Triple, size: Triple, options: PartOptions = {}): void {
    this.add('cyl', color, at, size, options);
  }

  /** 원뿔. at은 밑면 중심, size는 [지름, 높이, 지름] */
  cone(color: string, at: Triple, size: Triple, options: PartOptions = {}): void {
    this.add('cone', color, at, size, options);
  }
}

/** 자리 (x, z)에서 ry만큼 돌린 물체 안의 (dx, dz)가 장면에서 어디인지 */
export function offset(x: number, z: number, ry: number, dx: number, dz: number): [number, number] {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return [x + dx * cos + dz * sin, z - dx * sin + dz * cos];
}

const TEMPLATES: Record<PartShape, BufferGeometry> = {
  box: new BoxGeometry(1, 1, 1).toNonIndexed(),
  cyl: new CylinderGeometry(0.5, 0.5, 1, 10).toNonIndexed(),
  cone: new ConeGeometry(0.5, 1, 6).toNonIndexed(),
};

/** 조각 하나가 차지하는 꼭짓점 수 */
export const vertexCountOf = (shape: PartShape): number => TEMPLATES[shape].getAttribute('position').count;

/** 조각 목록을 지오메트리 하나로 합친다 (위치·법선·색). 장면을 만들 때 한 번만 부른다. */
export function buildGeometry(parts: readonly Part[]): BufferGeometry {
  const total = parts.reduce((sum, part) => sum + vertexCountOf(part.shape), 0);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);

  const matrix = new Matrix4();
  const normalMatrix = new Matrix3();
  const position = new Vector3();
  const scale = new Vector3();
  const rotation = new Quaternion();
  const euler = new Euler();
  const color = new Color();
  const v = new Vector3();

  let at = 0;
  for (const part of parts) {
    const template = TEMPLATES[part.shape];
    const srcPosition = template.getAttribute('position');
    const srcNormal = template.getAttribute('normal');
    matrix.compose(position.set(part.x, part.y, part.z), rotation.setFromEuler(euler.set(part.rx, part.ry, part.rz)), scale.set(part.sx, part.sy, part.sz));
    normalMatrix.getNormalMatrix(matrix);
    color.set(part.color);
    for (let i = 0; i < srcPosition.count; i += 1) {
      v.fromBufferAttribute(srcPosition, i).applyMatrix4(matrix);
      positions[at] = v.x;
      positions[at + 1] = v.y;
      positions[at + 2] = v.z;
      v.fromBufferAttribute(srcNormal, i).applyMatrix3(normalMatrix).normalize();
      normals[at] = v.x;
      normals[at + 1] = v.y;
      normals[at + 2] = v.z;
      colors[at] = color.r;
      colors[at + 1] = color.g;
      colors[at + 2] = color.b;
      at += 3;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
