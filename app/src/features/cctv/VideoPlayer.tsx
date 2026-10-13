import { useEffect, useRef, useState } from 'react';

export interface VideoPlayerProps {
  url: string;
  protocol: 'hls' | 'webrtc';
  /** 재생을 계속할 수 없는 오류가 났다 */
  onError: (message: string) => void;
}

const HLS_MIME = 'application/vnd.apple.mpegurl';

/**
 * 서버가 변환해 준 주소를 `<video>`로 재생하기만 한다. 영상 변환은 서버 몫이다.
 * HLS는 안드로이드·사파리 등 기본 재생이 되는 곳은 그대로 쓰고, 안 되는 곳(데스크톱 Chrome 등)에서만 hls.js를 그때 불러온다.
 * WebRTC는 아직 지원하지 않는다 (서버가 WebRTC를 제공하게 되면 추가한다).
 */
export function VideoPlayer({ url, protocol, onError }: VideoPlayerProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const video = ref.current;
    if (!video || protocol !== 'hls') return;
    setStarting(true);
    let cancelled = false;
    let destroy: (() => void) | null = null;

    if (video.canPlayType(HLS_MIME)) {
      video.src = url;
      destroy = () => {
        video.removeAttribute('src');
        video.load();
      };
    } else {
      import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled) return;
          if (!Hls.isSupported()) {
            onErrorRef.current('이 기기에서는 영상을 재생할 수 없습니다.');
            return;
          }
          const hls = new Hls({ lowLatencyMode: false });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) onErrorRef.current('영상을 불러오지 못했습니다.');
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          destroy = () => hls.destroy();
        })
        .catch(() => {
          if (!cancelled) onErrorRef.current('영상 재생 도구를 불러오지 못했습니다.');
        });
    }

    return () => {
      cancelled = true;
      destroy?.();
    };
  }, [url, protocol]);

  if (protocol !== 'hls') {
    return (
      <p role="alert" className="flex aspect-video items-center justify-center rounded-lg bg-slate-100 p-4 text-center text-slate-700">
        이 영상 방식({protocol})은 아직 지원하지 않습니다.
      </p>
    );
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
      <video
        ref={ref}
        controls
        muted
        autoPlay
        playsInline
        onPlaying={() => setStarting(false)}
        onError={() => onErrorRef.current('영상을 불러오지 못했습니다.')}
        className="h-full w-full"
      />
      {starting && (
        <span role="status" className="absolute left-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-800">
          영상을 불러오는 중…
        </span>
      )}
    </div>
  );
}
