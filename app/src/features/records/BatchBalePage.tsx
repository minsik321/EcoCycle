import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { BatchEvent } from '@ecocycle/shared';
import { getRecords } from '../../api/records';
import { Dialog } from '../../components/common/Dialog';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { RecordList } from '../../components/records/RecordList';
import { useDeviceLive } from '../../components/device/live';
import { BATCH_STAGE_TEXT, SECTOR_LABEL } from '../../config/processDisplay';
import { formatLocalTime } from '../../config/display';
import { useAppSelector } from '../../store/hooks';
import { selectRecentCommands } from '../../store/selectors';
import { CONTROL_TEXT } from '../../config/controls';
import { BatchControls } from './BatchControls';
import { useBatchControl } from './useBatchControl';
import { BackToRecords, DetailRow } from './RecordDetail';

const EVENT_TEXT: Record<BatchEvent['type'],string> = {created:'배치 생성',mix_changed:'배합 변경',pressure_changed:'압력 변경',paused:'일시정지',resumed:'재개',skipped:'건너뜀',bale_produced:'베일 생산'};
export function BatchBalePage() {
  const { data, error, offline } = useBatchControl();
  const { lastReceivedAt } = useDeviceLive();
  const [event, setEvent] = useState<BatchEvent | null>(null);
  const [target, setTarget] = useState<'current'|'next'>('current');
  const current = data?.current;
  const selected = data?.[target];
  const navigate = useNavigate();
  const commands = useAppSelector(selectRecentCommands).filter(e=>e.type.includes('batch'));
  const unavailable = offline || error;
  const show = (value: string|number|undefined) => unavailable?'–':value ?? '–';
  return <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-4">
    <BackToRecords tab="batches"/><h1 className="text-xl font-bold">배치·베일</h1>
    {unavailable && <p role="alert">{offline?'연결 끊김':'현재 상태를 불러오지 못했습니다. 다시 연결 중입니다.'} · 마지막 수신 {lastReceivedAt?formatLocalTime(lastReceivedAt):'–'}</p>}
    {!data && !error && <p role="status">불러오는 중…</p>}
    <Card title="현재 배치" aria-label="현재 배치" aside={<span className="whitespace-nowrap text-sm font-semibold">{unavailable?'연결 끊김':current?(current.paused?'일시정지':BATCH_STAGE_TEXT[current.batch.stage]):'대기'}</span>}>
      {current ? <><p className="mb-3 text-lg font-bold">{show(current.batch.id)}</p>
        <div className="space-y-2" data-frozen={unavailable}>{current.batch.mix.map(m=><div key={m.sectorId}><div className="flex items-baseline justify-between text-sm"><span>섹터 {SECTOR_LABEL[m.sectorId]}</span><span>{show(m.percent)}%</span></div><div className="mt-1 h-2 rounded-full bg-paper-deep"><div className="h-2 rounded-full bg-accent" style={{width:`${unavailable?0:m.percent}%`}}/></div></div>)}</div>
        <dl className="mt-3"><DetailRow label="평균 수분">{show(current.batch.avgMoisturePercent)}%</DetailRow><DetailRow label="목표 압력">{show(current.batch.targetPressureMpa)} MPa</DetailRow><DetailRow label="현재 압력">{show(current.currentPressureMpa)} MPa</DetailRow><DetailRow label="진행률">{show(current.progressPercent)}%</DetailRow></dl>
        <div role="progressbar" aria-label="배치 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={unavailable?0:current.progressPercent} className="mt-2 h-2 rounded-full bg-paper-deep"><div className="h-2 rounded-full bg-accent" style={{width:`${unavailable?0:current.progressPercent}%`}}/></div>
        <p className="mt-3 text-sm font-semibold">생산 베일 {show(current.baleIds.length)}개</p>
        {!unavailable && (current.baleIds.length?current.baleIds.map(id=><Link className="flex min-h-12 items-center text-accent-strong" key={id} to={`/records/bales/${encodeURIComponent(id)}`}>{id} →</Link>):<p className="mt-1 text-sm text-ink-soft">아직 생산된 베일이 없습니다.</p>)}
      </>:<p className="text-sm text-ink-soft">진행 중인 배치가 없습니다.</p>}
    </Card>
    <div className="flex flex-wrap gap-2" aria-label="제어 대상"><Button variant={target==='current'?'primary':'secondary'} onClick={()=>setTarget('current')}>현재 배치</Button><Button variant={target==='next'?'primary':'secondary'} onClick={()=>setTarget('next')}>다음 배치</Button></div>
    {selected && data ? <BatchControls key={selected.batch.id} value={selected} range={data.pressureRange} unavailable={unavailable}/>:<p className="text-sm text-ink-soft">다음 배치가 아직 계획되지 않았습니다.</p>}
    {commands.length>0 && <Card title="명령 결과"><div aria-live="polite" className="space-y-2">{commands.slice(0,3).map(c=><p key={c.key} className="text-sm">{CONTROL_TEXT[c.type].label} · {c.status==='completed'?'적용됨':c.status==='sending'||c.status==='accepted'?'적용 대기':c.status==='rejected'?'거부됨':c.status==='unknown'?'결과 확인 불가':'실패'}{c.reason?` · ${c.reason}`:''}</p>)}</div></Card>}
    <Card title="배치·베일 사건 기록" aria-label="배치·베일 사건 기록">
      <RecordList<BatchEvent> label="배치·베일 사건 기록" refreshToken={`${data?.eventsRevision}:${commands.map(c=>`${c.key}:${c.status}`).join()}`} load={(q,s)=>getRecords('/batches/events/records',q,s)} rowKey={e=>e.id} time={e=>e.at} title={e=>`${EVENT_TEXT[e.type]} · ${e.batchId}`} detail={e=>e.detail} extra={e=>e.actor} dense columns={[{key:'event',header:'사건·수행자',cell:e=><div className="max-w-28 py-2"><p>{EVENT_TEXT[e.type]}</p><p className="truncate">{e.batchId}</p><p className="truncate text-xs text-ink-soft">{e.actor}</p></div>},{key:'detail',header:'변경·사유',cell:e=><p className="max-w-48 whitespace-normal py-2 text-sm">{e.detail}</p>}]} onOpen={e=>setEvent(e)}/>
    </Card>
    <Dialog open={!!event} title="사건 상세" onClose={()=>setEvent(null)} actions={<Button onClick={()=>setEvent(null)}>닫기</Button>}>
      {event && <><p className="font-semibold">{EVENT_TEXT[event.type]} · {event.batchId}</p><p className="my-2 text-sm">{formatLocalTime(event.at)} · {event.actor}</p><p className="text-sm">{event.detail}</p><Button className="mt-3" onClick={()=>navigate(event.baleId?`/records/bales/${encodeURIComponent(event.baleId)}`:`/records/batches/${encodeURIComponent(event.batchId)}`)}>{event.baleId?'베일 상세':'배치 상세'}</Button></>}
    </Dialog>
  </div>;
}
