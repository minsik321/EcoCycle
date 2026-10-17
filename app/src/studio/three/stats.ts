/**
 * 스튜디오 무대가 그린 양 (측정 화면 /scene-demo가 읽는다). 3D 라이브러리를 import하지 않는다:
 * 측정 화면이 이 값을 읽어도 3D 묶음이 처음 화면에 딸려 오지 않는다.
 */
/** 지금까지 그린 장 수와 마지막으로 그린 시각(performance.now 기준 ms) */
export const frameStats = { frames: 0, lastFrameMs: 0 };

/** 한 프레임에 그린 양. 그림자·후처리 단계까지 한 프레임 전체를 합친 값이다 */
export const studioStats = { calls: 0, triangles: 0, geometries: 0, textures: 0 };
