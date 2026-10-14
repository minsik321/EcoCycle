import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/common/Button';
import { ActionBar } from '../../components/device/ActionBar';
import { DetailsSection } from '../../components/device/DetailsSection';
import { DeviceHero } from '../../components/device/DeviceHero';
import { DevicePage } from '../../components/device/DevicePage';
import { KeyTiles } from '../../components/device/KeyTile';
import { DeviceLiveOverride } from '../../components/device/live';
import { NowNext } from '../../components/device/NowNext';
import { Sidebar } from '../../components/layout/Sidebar';
import { TopBar } from '../../components/layout/TopBar';

// 기기 페이지 틀 미리 보기(/design/device, 개발용). 값은 모두 보기용 예시이고 조작 버튼은 명령을 보내지 않는다.
// 실제 화면과 같은 상단 바·주 메뉴 안에 놓아 폰에서 첫 화면에 무엇이 들어오는지 확인한다. ?offline=1이면 연결 끊김 모습.

const EXAMPLE_TIME = '2026-10-14T05:23:11.000Z';

function PlaceholderIllustration() {
  // 기기별 그림은 3~6단계에서 넣는다. 끊김 때 멈추는지 보이도록 움직이는 띠 하나만 둔다.
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-ink-faint">
      <div className="h-3 w-2/3 animate-pulse rounded-full bg-kraft-soft" />
      기기 그림 자리 (예시)
    </div>
  );
}

export function DevicePreviewPage() {
  const [params] = useSearchParams();
  const offline = params.get('offline') === '1';

  return (
    <DeviceLiveOverride value={{ disconnected: offline, lastReceivedAt: EXAMPLE_TIME }}>
      <div className="flex h-full flex-col bg-paper text-ink md:flex-row">
        <Sidebar className="order-last md:order-first" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="min-h-0 flex-1 overflow-auto p-4">
            <DevicePage
              hero={
                <DeviceHero
                  name="압축기"
                  status="normal"
                  statusLabel="가동 중"
                  activity="batch-0412 압축 중 · 목표 28.5 MPa"
                  updatedAt={EXAMPLE_TIME}
                  illustration={<PlaceholderIllustration />}
                />
              }
              tiles={
                <KeyTiles
                  tiles={[
                    { label: '압력', value: '28.1', unit: 'MPa', sub: '/ 28.5', trend: [22, 23, 27, 28, 22, 26, 28, 28.1] },
                    { label: '온도', value: '42.3', unit: '°C', trend: [41, 42, 43, 42, 41, 42, 43, 42.3] },
                    { label: '오늘 베일', value: '412', unit: '개', trend: [380, 388, 395, 401, 407, 412] },
                    { label: '단계', value: '압축' },
                  ]}
                />
              }
              now={<NowNext now="batch-0412 · A1 40% + B2 60% · 평균 수분 11.8%" next="마지막 베일 BL-20261014-0411" />}
              actions={
                <ActionBar>
                  <div className="flex flex-wrap gap-3">
                    <Button disabled={offline}>일시정지</Button>
                    <Button disabled={offline}>정지</Button>
                    <Button disabled={offline}>알람 확인</Button>
                  </div>
                </ActionBar>
              }
              details={
                <DetailsSection>
                  <p className="text-sm text-ink-soft">이력 그래프(1시간·24시간·7일), 설정, 알람 이력이 여기에 들어간다 (예시).</p>
                  <a href={offline ? '/design/device' : '/design/device?offline=1'} className="inline-flex min-h-12 items-center text-accent underline">
                    {offline ? '연결된 모습 보기' : '연결 끊김 모습 보기'}
                  </a>
                </DetailsSection>
              }
            />
          </main>
        </div>
      </div>
    </DeviceLiveOverride>
  );
}
