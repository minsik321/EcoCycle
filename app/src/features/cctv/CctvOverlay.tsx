import { useCallback, useEffect, useState } from 'react';
import type { Camera, StreamInfo } from '@ecocycle/shared';
import { getCameras, getStreamInfo } from '../../api';
import { Button } from '../../components/common/Button';
import { Dialog } from '../../components/common/Dialog';
import { cctvToggled } from '../../store';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { VideoPlayer } from './VideoPlayer';

/** 서명 주소가 만료되기 이만큼(ms) 전에 새 주소를 받는다 */
const REFRESH_BEFORE_EXPIRY_MS = 30_000;
const MIN_REFRESH_MS = 5_000;

export function CctvButton() {
  const dispatch = useAppDispatch();
  return (
    <Button variant="secondary" onClick={() => dispatch(cctvToggled(true))}>
      CCTV
    </Button>
  );
}

/**
 * CCTV 화면(오버레이). 열려 있는 동안 `ui.cctvOpen`이 true라서 3D 그리기 루프를 멈춘다(2단계).
 * 재생 주소는 만료되는 서명 주소라서 만료 전에 다시 받는다. 로봇 조작과 함께 볼 때는 지연이 짧은 WebRTC가 좋고,
 * HLS는 수 초 지연이 있어 참고용이다.
 */
export function CctvOverlay({ now = Date.now }: { now?: () => number }) {
  const dispatch = useAppDispatch();
  const open = useAppSelector((state) => state.ui.cctvOpen);
  const close = useCallback(() => dispatch(cctvToggled(false)), [dispatch]);

  const [cameras, setCameras] = useState<Camera[] | null>(null);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [stream, setStream] = useState<StreamInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  // 열 때마다 카메라 목록을 새로 받는다
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCameras(null);
    setStream(null);
    setError(null);
    getCameras()
      .then((list) => {
        if (cancelled) return;
        setCameras(list);
        setCameraId((current) => (current && list.some((c) => c.id === current) ? current : (list[0]?.id ?? null)));
      })
      .catch(() => {
        if (!cancelled) setError('카메라 목록을 불러오지 못했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, retry]);

  // 고른 카메라의 재생 주소를 받고, 만료 전에 다시 받는다
  useEffect(() => {
    if (!open || !cameraId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => {
      getStreamInfo(cameraId)
        .then((info) => {
          if (cancelled) return;
          setStream((prev) => (prev && prev.url === info.url ? prev : info));
          setError(null);
          const wait = Math.max(MIN_REFRESH_MS, Date.parse(info.expiresAt) - now() - REFRESH_BEFORE_EXPIRY_MS);
          timer = setTimeout(load, wait);
        })
        .catch(() => {
          if (!cancelled) setError('영상 주소를 받지 못했습니다.');
        });
    };
    setStream(null);
    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, cameraId, retry, now]);

  return (
    <Dialog open={open} title="CCTV" onClose={close} size="xl" actions={<Button onClick={close}>닫기</Button>}>
      <div className="flex flex-col gap-3">
        {cameras && cameras.length > 1 && (
          <div role="group" aria-label="카메라" className="flex flex-wrap gap-2">
            {cameras.map((camera) => (
              <Button
                key={camera.id}
                variant={camera.id === cameraId ? 'primary' : 'secondary'}
                aria-pressed={camera.id === cameraId}
                onClick={() => setCameraId(camera.id)}
              >
                {camera.name}
              </Button>
            ))}
          </div>
        )}
        {cameras && cameras.length === 0 && <p className="text-slate-600">등록된 카메라가 없습니다.</p>}
        {cameras?.find((c) => c.id === cameraId) && (
          <p className="text-sm text-slate-600">{cameras.find((c) => c.id === cameraId)!.location}</p>
        )}

        {error ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-status-alarm bg-red-50 p-6 text-center">
            <p className="font-medium text-status-alarm">
              <span aria-hidden="true">✕ </span>
              {error}
            </p>
            <Button onClick={() => setRetry((n) => n + 1)}>다시 시도</Button>
          </div>
        ) : stream ? (
          <>
            <VideoPlayer url={stream.url} protocol={stream.protocol} onError={setError} />
            {stream.protocol === 'hls' && (
              <p className="text-xs text-slate-500">이 영상(HLS)은 실제 모습보다 수 초 늦습니다. 로봇을 조작할 때는 참고용으로만 보세요.</p>
            )}
          </>
        ) : cameras && cameras.length > 0 ? (
          <p role="status" className="py-10 text-center text-slate-500">
            영상 주소를 받는 중…
          </p>
        ) : cameras === null ? (
          <p role="status" className="py-10 text-center text-slate-500">
            카메라 목록을 불러오는 중…
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
