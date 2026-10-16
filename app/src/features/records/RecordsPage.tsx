import { Link } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/common/Card';
import { Tabs } from '../../components/common/Tabs';
import type { TabItem } from '../../components/common/Tabs';
import { RECORDS_TABS } from '../../config/navigation';
import type { RecordsTab } from '../../config/navigation';
import { BaleRecords } from './BaleRecords';
import { BatchRecords } from './BatchRecords';
import { VehicleRecords } from './VehicleRecords';

const TAB_ITEMS: readonly TabItem<RecordsTab>[] = [
  { key: 'vehicles', label: '차량' },
  { key: 'batches', label: '배치' },
  { key: 'bales', label: '베일' },
];

const isTab = (value: string | null): value is RecordsTab => RECORDS_TABS.some((tab) => tab === value);

/**
 * 공정 기록 (`/records`): 지난 차량·배치·베일 기록. 탭은 주소의 `?tab=vehicles|batches|bales`로 정해서(홈의 "기록 보기"가 탭을 골라 연다)
 * 뒤로 가기·새로고침에도 같은 탭이 열린다. 목록은 모두 `RecordList`(기간 + 10줄씩)이고 줄을 누르면 이 화면 위에 상세 팝업이 뜬다.
 */
export function RecordsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: RecordsTab = isTab(requested) ? requested : 'vehicles';
  return (
    <PageContainer>
      <h1 className="text-xl font-bold">공정 기록</h1>
      <Link to="/records/batches" className="inline-flex min-h-12 items-center text-accent-strong font-semibold">배치·베일 · 현재 배치 제어 →</Link>
      <Card aria-label="공정 기록">
        <Tabs<RecordsTab> label="기록 종류" items={TAB_ITEMS} value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })}>
          {tab === 'vehicles' ? <VehicleRecords /> : tab === 'batches' ? <BatchRecords /> : <BaleRecords />}
        </Tabs>
      </Card>
    </PageContainer>
  );
}
