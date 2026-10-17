import { PROBE_MEASURE_MS, PROBE_WARMUP_MS } from '../config/quality';

// 접속할 때 한 번 도는 짧은 프레임 측정. 3D 라이브러리를 쓰지 않는다(첫 화면 묶음에 넣지 않으려고).
// 작은 캔버스에 겹쳐 그리는 일을 시키고 초당 몇 번 그려지는지 센다. 그래픽이 약한 기기는 이 수가 떨어진다.

const VERTEX = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FRAGMENT = `precision mediump float;
uniform float t;
void main(){
  vec2 uv = gl_FragCoord.xy / 320.0;
  float v = sin(uv.x * 9.0 + t) * cos(uv.y * 7.0 - t) + sin(length(uv - 0.5) * 14.0 + t);
  gl_FragColor = vec4(vec3(0.5 + 0.5 * v), 0.08);
}`;
/** 한 프레임에 겹쳐 그리는 횟수 */
const LAYERS = 24;
const GIVE_UP_MS = 4000;

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

/** 초당 프레임 수를 잰다. 그래픽을 쓸 수 없거나 화면이 숨겨져 있어 잴 수 없으면 null */
export function measureFps(): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || document.hidden || typeof requestAnimationFrame !== 'function') {
      resolve(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 400;
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, powerPreference: 'high-performance' });
    } catch {
      gl = null;
    }
    const vertex = gl && compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = gl && compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl?.createProgram() ?? null;
    if (!gl || !vertex || !fragment || !program) {
      resolve(null);
      return;
    }
    const g = gl;
    g.attachShader(program, vertex);
    g.attachShader(program, fragment);
    g.linkProgram(program);
    g.useProgram(program);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    const location = g.getAttribLocation(program, 'p');
    g.enableVertexAttribArray(location);
    g.vertexAttribPointer(location, 2, g.FLOAT, false, 0, 0);
    g.enable(g.BLEND);
    g.blendFunc(g.SRC_ALPHA, g.ONE_MINUS_SRC_ALPHA);
    const time = g.getUniformLocation(program, 't');
    const pixel = new Uint8Array(4);

    let done = false;
    let startedAt = 0;
    let measureFrom = 0;
    let frames = 0;
    const finish = (fps: number | null) => {
      if (done) return;
      done = true;
      clearTimeout(giveUp);
      g.getExtension('WEBGL_lose_context')?.loseContext();
      resolve(fps);
    };
    // 화면이 숨겨지면 프레임이 오지 않는다. 그때는 재지 못한 것으로 본다.
    const giveUp = setTimeout(() => finish(null), GIVE_UP_MS);

    const frame = (now: number) => {
      if (done) return;
      if (startedAt === 0) startedAt = now;
      g.uniform1f(time, now / 1000);
      for (let i = 0; i < LAYERS; i += 1) g.drawArrays(g.TRIANGLES, 0, 3);
      // 한 점을 읽어 와서 그리기가 실제로 끝나기를 기다린다
      g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, pixel);

      const elapsed = now - startedAt;
      if (elapsed >= PROBE_WARMUP_MS) {
        if (measureFrom === 0) measureFrom = now;
        else frames += 1;
        if (now - measureFrom >= PROBE_MEASURE_MS) {
          finish((frames * 1000) / (now - measureFrom));
          return;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
