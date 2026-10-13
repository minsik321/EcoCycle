/**
 * 장면이 얼마나 그렸는지. 실기기에서 프레임을 재는 데 쓴다 (화면에는 영향 없음).
 * 3D 라이브러리를 import하지 않는 파일로 따로 둔다: 측정 화면이 이 값을 읽어도 3D 묶음이 처음 화면에 딸려 오지 않는다.
 */
export const sceneStats = { frames: 0, lastFrameMs: 0 };
