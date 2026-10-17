import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RecordPage, RecordQuery } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { Sidebar } from '../../components/layout/Sidebar';
import { SHELL_GAP_TOP, SHELL_GAP_X } from '../../components/layout/AppShell';
import { TopBar } from '../../components/layout/TopBar';
import { RecordList } from '../../components/records/RecordList';
import { connectionChanged } from '../../store';
import { useAppDispatch } from '../../store/hooks';

// 기록 목록 미리 보기(/design/records, 개발용, 로그인 불필요). 값은 모두 보기용 예시이고 서버에 요청하지 않는다.
// 실제 화면과 같은 상단 바·주 메뉴 안에 놓아 폰·태블릿에서 줄·표·쪽 넘기기를 본다.
// ?empty=1이면 기록 없음, ?offline=1이면 연결 끊김 모습.

interface ExampleRecord {
  id: string;
  ts: string;
  plate: string;
  company: string;
  sector: string;
  netT: number;
}

const COMPANIES = ['한빛자원', '동해페이퍼', '새솔리싸이클'];
const SECTORS = ['A1', 'A2', 'B1', 'B2'];

/** 최근 7일에 흩어진 예시 기록 (같은 값이 나오도록 고정된 규칙으로 만든다) */
function exampleRecords(now: number): ExampleRecord[] {
  return Array.from({ length: 37 }, (_, i) => ({
    id: `ex-${i}`,
    ts: new Date(now - (i * 4.3 + 0.2) * 60 * 60 * 1000).toISOString(),
    plate: `${12 + (i % 7)}가 ${String(3456 + i * 37).slice(-4)}`,
    company: COMPANIES[i % COMPANIES.length]!,
    sector: SECTORS[(i * 3) % SECTORS.length]!,
    netT: Math.round((6.2 + ((i * 7) % 23) / 10) * 10) / 10,
  }));
}

export function RecordsPreviewPage() {
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const empty = params.get('empty') === '1';
  const offline = params.get('offline') === '1';

  // 로그인하지 않은 미리 보기라 연결 상태를 여기서 정한다
  useEffect(() => {
    dispatch(connectionChanged({ status: offline ? 'offline' : 'online', lastReceivedAt: new Date(Date.now() - 90_000).toISOString() }));
  }, [dispatch, offline]);

  const load = useCallback(
    async (query: RecordQuery): Promise<RecordPage<ExampleRecord>> => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const from = Date.parse(query.from);
      const to = Date.parse(query.to);
      const all = empty ? [] : exampleRecords(Date.now()).filter((r) => Date.parse(r.ts) >= from && Date.parse(r.ts) < to);
      const start = (query.page - 1) * query.pageSize;
      return { items: all.slice(start, start + query.pageSize), total: all.length, page: query.page, pageSize: query.pageSize };
    },
    [empty],
  );

  return (
    <div className="flex h-full flex-col bg-paper text-ink md:flex-row">
      <Sidebar className="order-last md:order-first" />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className={`${SHELL_GAP_X} ${SHELL_GAP_TOP}`}>
          <TopBar />
        </div>
        <main className={`min-h-0 flex-1 overflow-auto pb-4 ${SHELL_GAP_X} ${SHELL_GAP_TOP}`}>
          <Card className="mx-auto max-w-5xl">
            <h1 className="mb-3 text-lg font-bold">
              하역 기록 <span className="text-sm font-semibold text-ink-faint">(예시 데이터)</span>
            </h1>
            <RecordList<ExampleRecord>
              label="하역 기록"
              initialRange="last7d"
              load={load}
              rowKey={(r) => r.id}
              time={(r) => r.ts}
              title={(r) => r.plate}
              detail={(r) => `${r.company} · 섹터 ${r.sector} · 순중량 ${r.netT.toFixed(1)} t`}
              columns={[
                { key: 'plate', header: '번호판', cell: (r) => r.plate },
                { key: 'company', header: '회사', cell: (r) => r.company },
                { key: 'sector', header: '섹터', cell: (r) => r.sector },
                { key: 'net', header: '순중량', align: 'right', cell: (r) => <span className="tabular-nums">{r.netT.toFixed(1)} t</span> },
              ]}
            />
          </Card>
        </main>
      </div>
    </div>
  );
}
