import { useContext, useEffect, useRef, useState } from 'react';
import { KpiDetailContext } from '../../components/charts/KpiDetailContext';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MutableRefObject, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { DEVICE_IDS, TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, DeviceState, DeviceStatus, PlantMetric, Vehicle } from '@ecocycle/shared';
import {
  DEVICE_NAMES,
  PHASE_STEPS,
  ROBOT_MODE_TEXT,
  STATUS_SYMBOL,
  STATUS_TEXT,
  formatLoadPercent,
  formatLocalTime,
  formatPercent,
  formatPressureMpa,
  formatTemperatureC,
  formatVolumeM3,
} from '../../config/display';
import type { PinElements } from '../three/Fx';
import type { RecordLink, RecordOpen, RecordTarget, RecordsListTab, StudioData } from '../types';
import { SECTOR_LABEL, actualMixText, sectorsText } from '../../config/processDisplay';
import { YARD_CAPACITY, YARD_FLOW } from '../../config/yard';
import { VIEWS } from '../world/views';
import type { ViewPreset } from '../world/views';
import { Icon } from './icons';
import type { IconName } from './icons';
import { BALE_STAGE_TEXT, BATCH_STAGE_TEXT, VEHICLE_STAGE_TEXT, cycleSteps, deviceLine, mixText, shortId } from './text';
import type { CycleStep } from './text';

// 스튜디오의 유리 패널들. 3D 위에 떠 있고, 값은 받은 그대로 표시한다.
// 연결이 끊기면(disconnected) 값을 흐리게 하고 "마지막 값"임을 알린다.
// 모양은 참고 화면(docs/reference/)을 따른다: 얇은 상단 바 하나, 작고 가는 글씨, 카드마다 강조 숫자 하나,
// 상세 패널은 4~5줄 + "자세히", 왼쪽 아래 둥근 단계 아이콘 줄, 오른쪽 아래 탭 표.

const time = (iso: string | null | undefined) => (iso ? formatLocalTime(iso).slice(-8) : '–');
const hhmm = (iso: string | null | undefined) => (iso ? formatLocalTime(iso).slice(-8, -3) : '–');

export interface PanelCommon {
  data: StudioData;
  disconnected: boolean;
  selection: string | null;
  onSelect: (key: string | null) => void;
}

/** 바깥을 누르면 닫히는 펼침 메뉴의 열림 상태 */
function usePopover(): [boolean, (open: boolean) => void, MutableRefObject<HTMLDivElement | null>] {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return [open, setOpen, ref];
}

// ── 카메라 지역 전환 ─────────────────────────────────────────────────
// 상단 바는 앱 전체에 하나(components/layout/TopBar)이고 3D 홈도 그것을 쓴다. 지역 전환은 카메라 조작이라 바에서 빼 지도 도구 곁에 둔다.

const AREA_BADGE: Record<string, IconName> = { site: 'layers', process: 'robot', inbound: 'scan', unload: 'unload', shipping: 'ship' };

/** 지역 전환 목록의 둘째 줄: 그 구역의 서버 값 한 줄 (세기만 하고 계산하지 않는다) */
function areaLine(key: string, data: StudioData): ReactNode {
  const onSite = data.vehicles.filter((v) => v.stage !== 'departed');
  const waiting = data.bales.filter((b) => b.stage === 'created').length;
  const compressor = data.devices['compressor-1'];
  switch (key) {
    case 'site':
      return `차량 ${onSite.length}대 · 적치 베일 ${waiting}개`;
    case 'process':
      return (
        <span className="st-area-bars" aria-label="섹터 적재율">
          {TANK_IDS.map((id) => {
            const tank = data.devices[id];
            return (
              <i key={id} title={`${SECTOR_LABEL[id]} ${tank?.type === 'tank' ? formatPercent(tank.fillPercent) : '–'}`}>
                <b style={{ width: `${tank?.type === 'tank' ? Math.min(100, tank.fillPercent) : 0}%` }} />
              </i>
            );
          })}
          <em>{compressor?.type === 'compressor' ? formatPressureMpa(compressor.pressureMpa) : ''}</em>
        </span>
      );
    case 'inbound':
      return `계량 중 ${onSite.filter((v) => v.stage === 'arrived').length} · 인식 완료 ${onSite.filter((v) => v.stage === 'identified').length}`;
    case 'unload':
      return `하역 중 ${onSite.filter((v) => v.stage === 'unloading').length} · 하역 완료 ${onSite.filter((v) => v.stage === 'unloaded').length}`;
    case 'shipping':
      return `적치 베일 ${waiting}개`;
    default:
      return null;
  }
}

/** 카메라 지역 전환: 상단 바가 아니라 지도 도구 곁에 뜬다 (카메라 조작이므로). 펼치면 구역마다 서버 값 한 줄 */
export function AreaSwitcher({ data, view, onView, stale }: { data: StudioData; view: string; onView: (preset: ViewPreset) => void; stale: boolean }) {
  const [open, setOpen, ref] = usePopover();
  const current = VIEWS.find((p) => p.key === view) ?? VIEWS[1]!;
  return (
    <div className="st-area" ref={ref}>
      <button type="button" className="st-area-button" aria-haspopup="listbox" aria-expanded={open} aria-label={`지역: ${current.label}`} onClick={() => setOpen(!open)}>
        <span className="st-area-badge">
          <Icon name={AREA_BADGE[current.key] ?? 'layers'} size={16} />
        </span>
        <span className="st-area-text">
          <b>{current.label}</b>
          <small className={stale ? 'st-stale' : undefined}>{areaLine(current.key, data)}</small>
        </span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <ul className="st-glass st-area-list" role="listbox" aria-label="카메라 지역">
          {VIEWS.map((preset) => (
            <li key={preset.key}>
              <button
                type="button"
                role="option"
                aria-selected={preset.key === view}
                onClick={() => {
                  onView(preset);
                  setOpen(false);
                }}
              >
                <span className="st-area-badge">
                  <Icon name={AREA_BADGE[preset.key] ?? 'layers'} size={16} />
                </span>
                <span className="st-area-text">
                  <b>{preset.label}</b>
                  <small className={stale ? 'st-stale' : undefined}>{areaLine(preset.key, data) ?? preset.hint}</small>
                </span>
                <em>{preset.tier === 'wide' ? '전체' : '구역'}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 연결 끊김 알림: 장면이 멈췄고 보이는 것은 마지막으로 받은 상태임을 크게 알린다 */
export function DisconnectBanner({ lastReceivedAt }: { lastReceivedAt: string | null }) {
  return (
    <div className="st-glass st-offline" role="alert">
      <span className="st-offline-dot" aria-hidden="true" />
      <div>
        <strong>연결 끊김</strong>
        <span>
          모든 움직임을 멈췄습니다 · 마지막 수신 <time dateTime={lastReceivedAt ?? undefined}>{lastReceivedAt ? formatLocalTime(lastReceivedAt) : '없음'}</time>
        </span>
      </div>
    </div>
  );
}

// ── 지도 도구 (확대·축소·회전·기본 화면) ──────────────────────────────

export function MapTools({ onZoom, onRotate, onHome }: { onZoom: (dir: 1 | -1) => void; onRotate: (deg: number) => void; onHome: () => void }) {
  return (
    <nav className="st-glass st-tools" aria-label="카메라 도구">
      <button type="button" aria-label="가까이 (부지 → 구역 → 대상)" onClick={() => onZoom(1)}>
        <Icon name="plus" />
      </button>
      <button type="button" aria-label="멀리 (대상 → 구역 → 부지)" onClick={() => onZoom(-1)}>
        <Icon name="minus" />
      </button>
      <span aria-hidden="true" />
      <button type="button" aria-label="왼쪽으로 돌리기" onClick={() => onRotate(-45)}>
        <Icon name="rotL" />
      </button>
      <button type="button" aria-label="오른쪽으로 돌리기" onClick={() => onRotate(45)}>
        <Icon name="rotR" />
      </button>
      <button type="button" aria-label="기본 화면" onClick={onHome}>
        <Icon name="home" />
      </button>
    </nav>
  );
}

// ── 지표 카드 ─────────────────────────────────────────────────────────

function Spark({ values }: { values: readonly number[] | undefined }) {
  const w = 64;
  const h = 26;
  if (!values || values.length < 2) return <svg className="st-spark" width={w} height={h} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (w - 4);
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 7);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="st-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={line} fill="none" stroke="#2563eb" strokeOpacity="0.55" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const KPIS: Array<{ metric: PlantMetric; label: string; unit: string; digits: number; icon: IconName }> = [
  { metric: 'balesToday', label: '오늘 생산 베일', unit: '개', digits: 0, icon: 'bale' },
  { metric: 'averageMoisturePercent', label: '평균 수분', unit: '%', digits: 1, icon: 'drop' },
  { metric: 'compressorUptimePercent', label: '압축기 가동률', unit: '%', digits: 1, icon: 'gauge' },
];

export function Kpis({ data, disconnected }: Pick<PanelCommon, 'data' | 'disconnected'>) {
  const openKpi = useContext(KpiDetailContext);
  return (
    <div className="st-kpis">
      {KPIS.map(({ metric, label, unit, digits, icon }) => {
        const value = data.summary?.[metric];
        return (
          <section key={metric} style={{ position: 'relative' }} className={`st-glass st-kpi${disconnected ? ' st-stale' : ''}`} aria-label={label}>
            <button type="button" aria-label={`${label} 상세 보기`} onClick={() => openKpi(metric)} style={{ position: 'absolute', inset: 0, zIndex: 1, minHeight: 48, borderRadius: 'inherit' }} />
            <span className="st-kpi-icon">
              <Icon name={icon} size={17} />
            </span>
            <div className="st-kpi-body">
              <p className="st-kpi-label">{label}</p>
              <p className="st-kpi-value">
                {disconnected || value === undefined ? '–' : value.toFixed(digits)}
                <span>{unit}</span>
              </p>
              <p className="st-kpi-note">{disconnected ? '연결 끊김' : '최근 24시간'}</p>
            </div>
            <Spark values={data.trends[metric]} />
          </section>
        );
      })}
    </div>
  );
}

// ── 오른쪽 상세 패널 ──────────────────────────────────────────────────

type Row = [string, ReactNode];

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="st-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 상세 패널은 4~5줄만 보이고 나머지는 "자세히" 안에 둔다 */
function More({ rows, children }: { rows?: Row[]; children?: ReactNode }) {
  if ((!rows || rows.length === 0) && !children) return null;
  return (
    <details className="st-more">
      <summary>
        자세히 <Icon name="chevron" size={14} />
      </summary>
      {rows && <Rows rows={rows} />}
      {children}
    </details>
  );
}

function Tone({ tone, label }: { tone: DeviceStatus; label?: string }) {
  return (
    <span className={`st-pill st-tone-${tone}`}>
      <i aria-hidden="true">{STATUS_SYMBOL[tone]}</i>
      {label ?? STATUS_TEXT[tone]}
    </span>
  );
}

function Meter({ percent, tone = 'normal' }: { percent: number; tone?: DeviceStatus }) {
  return (
    <span className={`st-meter st-meter-${tone}`} aria-hidden="true">
      <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </span>
  );
}

function deviceRows(device: DeviceState, data: StudioData): { rows: Row[]; more: Row[] } {
  switch (device.type) {
    case 'tank':
      return {
        rows: [
          ['부피(용량)', `${formatVolumeM3(device.volumeM3)} / ${formatVolumeM3(device.capacityM3)}`],
          ['수분', formatPercent(device.moisturePercent)],
          ['등급', `${device.grade}등급`],
        ],
        more: [['위치', `${device.section} 구역`]],
      };
    case 'robot':
      return {
        rows: [
          ['모드', device.mode === 'auto_pinned' ? `${ROBOT_MODE_TEXT[device.mode]} (${sectorsText(device.pinnedSectors)})` : ROBOT_MODE_TEXT[device.mode]],
          ['동작 단계', PHASE_STEPS.find((s) => s.phase === device.phase)?.label ?? '대기'],
          ['작업 중 섹터', device.targetTankId ? SECTOR_LABEL[device.targetTankId] : '없음'],
          ...(device.heldSectorId ? ([['들고 있음', `${SECTOR_LABEL[device.heldSectorId]}에서 집음${device.phase === 'idle' ? ' · 놓기 대기' : ''}`]] as Row[]) : []),
        ],
        more: [['그리퍼', device.gripper.holding ? '파지를 잡고 있음' : device.gripper.closed ? '닫힘' : '열림']],
      };
    case 'conveyor':
      return {
        rows: [
          ['가동 상태', device.running ? '가동' : '정지'],
          ['적재 정도', formatLoadPercent(device.loadPercent)],
        ],
        more: [],
      };
    case 'compressor': {
      const batch = data.batches.find((b) => b.stage === 'compressing');
      return {
        rows: [
          ['가동 상태', device.running ? '가동' : '정지'],
          ['목표 압력', batch ? formatPressureMpa(batch.targetPressureMpa) : '–'],
          ['온도', formatTemperatureC(device.temperatureC)],
        ],
        more: batch ? [['압축 중인 배치', `${batch.id} · ${mixText(batch)}`]] : [],
      };
    }
  }
}

const DEVICE_ICON = (id: DeviceId): IconName => (id.startsWith('tank') ? 'sector' : id === 'robot-1' ? 'robot' : id === 'conveyor-z' ? 'conveyor' : 'press');

function DetailHead({ icon, eyebrow, title, sub, onClose, closeLabel = '상세 패널 닫기' }: { icon: IconName; eyebrow: string; title: ReactNode; sub?: ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <header className="st-detail-head">
      <span className="st-detail-icon">
        <Icon name={icon} size={20} />
      </span>
      <div>
        <p className="st-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {sub && <p className="st-detail-sub">{sub}</p>}
      </div>
      {onClose && (
        <button type="button" className="st-close" aria-label={closeLabel} onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      )}
    </header>
  );
}

export interface DetailProps extends PanelCommon {
  /** 공정 기록 화면으로 가는 링크 ("이 차량 기록", "이 배치 상세"). 없으면 링크를 그리지 않는다 */
  recordLink?: RecordLink;
  /** 기기를 골랐을 때 넣을 조작 영역 (기존 조작 컴포넌트와 "상세 보기" 링크). 없으면 조작을 보여 주지 않는다 */
  deviceActions?: (id: DeviceId) => ReactNode;
  /** 폰의 아래 시트 안에 넣을 때: 유리 패널 틀 없이 내용만 */
  bare?: boolean;
  /** 세로 태블릿: 아무것도 고르지 않았을 때 배치 요약을 한 줄 칩으로 접어 두고 누르면 펼친다 (3D를 덜 가린다) */
  collapsible?: boolean;
}

export function Detail({ data, disconnected, selection, onSelect, deviceActions, recordLink, bare = false, collapsible = false }: DetailProps) {
  const [expanded, setExpanded] = useState(false);
  const shell = bare ? 'st-detail st-detail-bare' : 'st-glass st-detail';
  const [kind, id] = selection ? (selection.includes(':') ? [selection.slice(0, selection.indexOf(':')), selection.slice(selection.indexOf(':') + 1)] : [selection, '']) : ['', ''];
  const close = () => onSelect(null);
  const stale = disconnected ? ' st-stale' : '';

  if (kind === 'dev') {
    const deviceId = id as DeviceId;
    const device = data.devices[deviceId];
    const line = device ? deviceLine(device) : null;
    const alarms = data.alarms.filter((a) => a.deviceId === deviceId);
    const parts = device ? deviceRows(device, data) : null;
    return (
      <aside className={shell} aria-label={`${DEVICE_NAMES[deviceId]} 상세`}>
        <DetailHead icon={DEVICE_ICON(deviceId)} eyebrow={deviceId.startsWith('tank') ? '수납 섹터' : '설비'} title={DEVICE_NAMES[deviceId]} onClose={close} />
        {!device || !line || !parts ? (
          <p className="st-muted">상태를 불러오는 중…</p>
        ) : (
          <>
            <div className="st-detail-status">
              <Tone tone={disconnected ? 'offline' : line.tone} label={disconnected ? undefined : line.statusText} />
              <strong className={stale}>{line.value}</strong>
            </div>
            {device.type === 'tank' && <Meter percent={device.fillPercent} tone={disconnected ? 'offline' : device.status} />}
            <div className={stale}>
              <Rows rows={parts.rows} />
            </div>
            {alarms.length > 0 && (
              <ul className="st-alarms">
                {alarms.map((a) => (
                  <li key={a.id}>
                    <Tone tone={a.level} />
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
            <More rows={[...parts.more, ['갱신', `${disconnected ? '마지막으로 받은 값 · ' : ''}${time(device.updatedAt)}`]]} />
          </>
        )}
        {deviceActions && <div className="st-actions">{deviceActions(deviceId)}</div>}
      </aside>
    );
  }

  if (kind === 'veh') {
    const vehicle = data.vehicles.find((v) => v.id === id);
    return (
      <aside className={shell} aria-label="차량 상세">
        <DetailHead icon="truck" eyebrow="입고 차량" title={vehicle?.plate ?? '번호판 인식 중'} sub={vehicle?.companyName ?? undefined} onClose={close} />
        {vehicle ? (
          <div className={stale}>
            <div className="st-detail-status">
              <span className="st-pill st-pill-blue">{VEHICLE_STAGE_TEXT[vehicle.stage]}</span>
              <span className="st-muted">{time(vehicle.updatedAt)}</span>
            </div>
            <Rows
              rows={[
                ['배정 섹터', vehicle.sectorId ? SECTOR_LABEL[vehicle.sectorId] : '–'],
                ['계중대 도착', time(vehicle.stageTimes.arrived)],
                ['번호판 인식', time(vehicle.stageTimes.identified)],
                ['하역 시작', time(vehicle.stageTimes.unloading)],
              ]}
            />
            <More
              rows={[
                ['하역 완료', time(vehicle.stageTimes.unloaded)],
                ['출차', time(vehicle.stageTimes.departed)],
              ]}
            >
              <p className="st-muted">회사·배정 섹터는 서버가 번호판으로 정한 값입니다. 무게는 이 패널에 표시하지 않습니다.</p>
            </More>
            {recordLink && <div className="st-actions">{recordLink({ kind: 'vehicle', id: vehicle.id }, '이 차량 기록', 'st-link')}</div>}
          </div>
        ) : (
          <p className="st-muted">이 차량의 기록이 목록에서 지나갔습니다.</p>
        )}
      </aside>
    );
  }

  if (kind === 'bale') {
    const bale = data.bales.find((b) => b.id === id);
    const batch = bale ? data.batches.find((b) => b.id === bale.batchId) : undefined;
    return (
      <aside className={shell} aria-label="베일 상세">
        <DetailHead icon="bale" eyebrow="베일" title={bale?.id ?? id} onClose={close} />
        {bale ? (
          <div className={stale}>
            <div className="st-detail-status">
              <span className="st-pill st-pill-kraft">{BALE_STAGE_TEXT[bale.stage]}</span>
              <span className="st-muted">{time(bale.stageTimes.created)}</span>
            </div>
            <Rows
              rows={[
                ['배치', bale.batchId],
                ['배합', batch ? mixText(batch) : '–'],
                ['목표 압력', batch ? formatPressureMpa(batch.targetPressureMpa) : '–'],
              ]}
            />
            <More
              rows={[
                ['평균 수분', batch ? formatPercent(batch.avgMoisturePercent) : '–'],
                ['출하', time(bale.stageTimes.shipped)],
              ]}
            />
            {recordLink && (
              <div className="st-actions">
                {recordLink({ kind: 'bale', id: bale.id }, '이 베일 상세', 'st-link')}
                {recordLink({ kind: 'batch', id: bale.batchId }, '이 배치 상세', 'st-link')}
              </div>
            )}
          </div>
        ) : (
          <p className="st-muted">이 베일의 기록이 목록에서 지나갔습니다.</p>
        )}
      </aside>
    );
  }

  if (kind === 'forklift') {
    return (
      <aside className={shell} aria-label="지게차 상세">
        <DetailHead icon="forklift" eyebrow="출하 마당" title="지게차" onClose={close} />
        <p className="st-muted">지게차의 움직임은 베일의 단계(적치 → 출하)를 화면에 옮긴 연출입니다. 지게차 위치는 서버가 보내는 값이 아닙니다.</p>
        <Rows
          rows={[
            ['지게차', `${YARD_FLOW.forkliftCount}대`],
            ['적치 칸', `${YARD_CAPACITY}칸 (${YARD_FLOW.columns}열 × ${YARD_FLOW.levels}단)`],
            ['적치 베일', `${data.bales.filter((b) => b.stage === 'created').length}개`],
          ]}
        />
      </aside>
    );
  }

  // 아무것도 고르지 않았을 때: 지금 배치와 섹터 적재율
  const batch = data.batches.find((b) => b.stage === 'compressing') ?? data.batches.find((b) => b.stage === 'mixing') ?? data.batches.find((b) => b.stage === 'planned');
  const compressor = data.devices['compressor-1'];
  const status = data.summary?.status ?? null;
  const tone: DeviceStatus = disconnected ? 'offline' : (status ?? 'offline');
  const pressure = !disconnected && compressor?.type === 'compressor' ? formatPressureMpa(compressor.pressureMpa) : '–';
  if (collapsible && !expanded) {
    return (
      <button type="button" className={`st-glass st-batch-chip${stale}`} aria-expanded={false} aria-label={`지금 배치 ${batch ? batch.id : '대기 중'}, 펼치기`} onClick={() => setExpanded(true)}>
        <span className="st-batch-chip-icon" aria-hidden="true">
          <Icon name="batch" size={16} />
        </span>
        <b>{batch ? batch.id : '배치 대기'}</b>
        {batch && <span>{mixText(batch)}</span>}
        <span className="st-batch-chip-num">{pressure}</span>
        <Icon name="chevron" size={14} />
      </button>
    );
  }
  return (
    <aside className={shell} aria-label="공정 요약">
      <DetailHead
        icon="batch"
        eyebrow="지금 배치"
        title={batch ? batch.id : '대기 중'}
        sub={batch ? mixText(batch) : undefined}
        onClose={collapsible ? () => setExpanded(false) : undefined}
        closeLabel="지금 배치 접기"
      />
      <div className="st-detail-status">
        <Tone tone={tone} label={status || disconnected ? `시스템 ${STATUS_TEXT[tone]}` : '불러오는 중'} />
        {batch && <span className="st-muted">{BATCH_STAGE_TEXT[batch.stage]}</span>}
      </div>
      <div className={`st-tiles${stale}`}>
        {TANK_IDS.map((tankId) => {
          const tank = data.devices[tankId];
          const tankTone: DeviceStatus = disconnected || tank?.type !== 'tank' ? 'offline' : tank.status;
          return (
            <button key={tankId} type="button" className="st-tile" onClick={() => onSelect(`dev:${tankId}`)} aria-label={`섹터 ${SECTOR_LABEL[tankId]} 적재율 ${tank?.type === 'tank' ? formatPercent(tank.fillPercent) : '불러오는 중'}`}>
              <small>
                섹터 {SECTOR_LABEL[tankId]}
                {tank?.type === 'tank' ? ` · ${tank.grade}등급` : ''}
              </small>
              <b>{tank?.type === 'tank' ? formatPercent(tank.fillPercent) : '–'}</b>
              <Meter percent={tank?.type === 'tank' ? tank.fillPercent : 0} tone={tankTone} />
            </button>
          );
        })}
      </div>
      {batch && (
        <div className={stale.trim() || undefined}>
          <Rows
            rows={[
              ...(batch.actualMix !== null ? ([['실제 배합', actualMixText(batch) ?? '–']] as Row[]) : []),
              ...(batch.pinning ? ([['섹터 지정 중', sectorsText(batch.pinning.sectors)]] as Row[]) : []),
              ['목표 압력', formatPressureMpa(batch.targetPressureMpa)],
              ['현재 압력', pressure],
              ['평균 수분', formatPercent(batch.avgMoisturePercent)],
            ]}
          />
        </div>
      )}
      {batch && recordLink && <div className="st-actions">{recordLink({ kind: 'batch', id: batch.id }, '이 배치 상세', 'st-link')}</div>}
    </aside>
  );
}

// ── 공정 추적 (왼쪽 아래) ─────────────────────────────────────────────

const STEP_ICON: Record<CycleStep['key'], IconName> = { inbound: 'truck', identify: 'scan', unload: 'unload', mix: 'mix', press: 'press', ship: 'ship' };

/** 공정 추적 오른쪽의 "지금 보는 대상" 카드: 고른 차량, 없으면 가장 최근 차량, 차량이 없으면 지금 배치 */
function NowCard({ data, disconnected, selection, onSelect }: PanelCommon) {
  const vehicles = data.vehicles.filter((v) => v.stage !== 'departed');
  const picked: Vehicle | undefined = (selection?.startsWith('veh:') ? vehicles.find((v) => `veh:${v.id}` === selection) : undefined) ?? [...vehicles].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  const stale = disconnected ? ' st-stale' : '';
  if (picked) {
    return (
      <button type="button" className={`st-now${stale}`} onClick={() => onSelect(`veh:${picked.id}`)} aria-label={`차량 ${picked.plate ?? '번호판 인식 중'} 보기`}>
        <span className="st-now-icon">
          <Icon name="truck" size={22} />
        </span>
        <span className="st-now-text">
          <b>{picked.plate ?? '번호판 인식 중'}</b>
          <small>{picked.companyName ?? '계중대'}</small>
          <span className="st-pill st-pill-blue">{VEHICLE_STAGE_TEXT[picked.stage]}</span>
          <small>
            {picked.sectorId ? `섹터 ${SECTOR_LABEL[picked.sectorId]} · ` : ''}
            {hhmm(picked.updatedAt)}
          </small>
        </span>
      </button>
    );
  }
  const batch = data.batches.find((b) => b.stage !== 'completed');
  if (!batch) return null;
  return (
    <div className={`st-now${stale}`}>
      <span className="st-now-icon">
        <Icon name="batch" size={22} />
      </span>
      <span className="st-now-text">
        <b>{batch.id}</b>
        <small>{mixText(batch)}</small>
        <span className="st-pill st-pill-blue">{BATCH_STAGE_TEXT[batch.stage]}</span>
      </span>
    </div>
  );
}

export function Tracker(props: PanelCommon) {
  const { data, disconnected, selection, onSelect } = props;
  const steps = cycleSteps(data);
  const live = steps.find((s) => s.active);
  return (
    <section className={`st-glass st-tracker${disconnected ? ' st-tracker-offline' : ''}`} aria-label="공정 추적">
      <div className="st-tracker-main">
        <header>
          <span className="st-panel-title">
            <Icon name="truck" size={16} /> 공정 추적
          </span>
          <span className="st-muted">{disconnected ? '연결 끊김 · 마지막 상태' : (live?.detail ?? '')}</span>
        </header>
        <ol className="st-steps">
          {steps.map((step) => {
            const on = step.active && !disconnected;
            const state = on ? 'live' : step.at ? 'done' : 'idle';
            return (
              <li key={step.key} className={`st-step st-step-${state}`} aria-current={on ? 'step' : undefined}>
                <button
                  type="button"
                  disabled={!step.select}
                  aria-pressed={!!step.select && selection === step.select}
                  title={step.detail ?? undefined}
                  aria-label={`${step.label}${on ? ' 진행 중' : ''}${step.detail ? `, ${step.detail}` : ''}`}
                  onClick={() => onSelect(step.select)}
                >
                  <span className="st-step-dot">
                    <Icon name={STEP_ICON[step.key]} size={16} />
                  </span>
                  <b>{step.label}</b>
                  {on ? <em>진행 중</em> : <time dateTime={step.at ?? undefined}>{hhmm(step.at)}</time>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <NowCard {...props} />
    </section>
  );
}

// ── 표 (오른쪽 아래) ──────────────────────────────────────────────────

type TableTab = 'vehicles' | 'sectors' | 'batches' | 'bales';

const newest = <T extends { updatedAt: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

/**
 * 표 한 종류의 내용 (오른쪽 아래 표와 폰의 아래 시트가 같이 쓴다).
 * 줄을 누르면: 그 대상이 지금 3D 장면에 있으면(현장의 차량, 적치 중인 베일, 섹터) 고른다 → 카메라가 다가가고 상세 패널.
 * 장면에 없으면(출차한 차량, 출하된 베일, 배치) 카메라는 그대로 두고 기록 상세 팝업을 연다(`openRecord`, 없으면 누를 수 없다).
 */
function TableBody({ tab, data, disconnected, selection, onSelect, openRecord }: PanelCommon & { tab: TableTab; openRecord?: RecordOpen }) {
  const activate = (run: () => void) => ({
    onClick: run,
    onKeyDown: (e: ReactKeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        run();
      }
    },
    tabIndex: 0,
  });
  const row = (key: string | null, record?: RecordTarget) => {
    if (key) return { className: key === selection ? 'st-row-on' : undefined, ...activate(() => onSelect(key)) };
    if (record && openRecord) return { 'data-off-scene': true, ...activate(() => openRecord(record)) };
    return {};
  };
  return (
    <>
        {tab === 'vehicles' && (
        <table>
          <tbody>
            {newest(data.vehicles).map((v) => (
              <tr key={v.id} {...row(v.stage === 'departed' ? null : `veh:${v.id}`, { kind: 'vehicle', id: v.id })}>
                <td>
                  <b className="st-cell-main">{v.plate ?? '인식 중'}</b>
                  <small className="st-cell-sub">{v.companyName ?? '–'}</small>
                </td>
                <td className="st-col-opt">{v.sectorId ? `섹터 ${SECTOR_LABEL[v.sectorId]}` : '계중대'}</td>
                <td>
                  <span className={`st-pill${v.stage === 'departed' ? '' : ' st-pill-blue'}`}>{VEHICLE_STAGE_TEXT[v.stage]}</span>
                </td>
                <td className="st-cell-time">{hhmm(v.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === 'sectors' && (
        <table>
          <tbody>
            {TANK_IDS.map((tankId) => {
              const tank = data.devices[tankId];
              if (tank?.type !== 'tank') {
                return (
                  <tr key={tankId}>
                    <td>섹터 {SECTOR_LABEL[tankId]}</td>
                    <td colSpan={3}>불러오는 중</td>
                  </tr>
                );
              }
              const tone = disconnected ? 'offline' : tank.status;
              return (
                <tr key={tankId} {...row(`dev:${tankId}`)}>
                  <td>
                    <b className="st-cell-main">섹터 {SECTOR_LABEL[tankId]}</b>
                    <small className="st-cell-sub">{tank.grade}등급 · 수분 {formatPercent(tank.moisturePercent)}</small>
                  </td>
                  <td className="st-cell-meter st-col-opt">
                    <Meter percent={tank.fillPercent} tone={tone} />
                  </td>
                  <td>{formatPercent(tank.fillPercent)}</td>
                  <td>
                    <Tone tone={tone} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {tab === 'batches' && (
        <table>
          <tbody>
            {newest(data.batches).map((b) => (
              <tr key={b.id} {...row(null, { kind: 'batch', id: b.id })}>
                <td>
                  <b className="st-cell-main">{shortId(b.id)}</b>
                  <small className="st-cell-sub">{mixText(b)}</small>
                </td>
                <td className="st-col-opt">목표 {formatPressureMpa(b.targetPressureMpa)}</td>
                <td>
                  <span className={`st-pill${b.stage === 'completed' ? '' : ' st-pill-blue'}`}>{BATCH_STAGE_TEXT[b.stage]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === 'bales' && (
        <table>
          <tbody>
            {newest(data.bales).map((b) => (
              <tr key={b.id} {...row(b.stage === 'created' ? `bale:${b.id}` : null, { kind: 'bale', id: b.id })}>
                <td>
                  <b className="st-cell-main">베일 {shortId(b.id)}</b>
                  <small className="st-cell-sub">배치 {shortId(b.batchId)}</small>
                </td>
                <td>
                  <span className={`st-pill${b.stage === 'created' ? ' st-pill-kraft' : ''}`}>{BALE_STAGE_TEXT[b.stage]}</span>
                </td>
                <td className="st-cell-time">{hhmm(b.stageTimes.shipped ?? b.stageTimes.created)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** 표의 "기록 보기"가 여는 공정 기록 탭 (섹터는 공정 기록이 아니라 링크가 없다) */
const listTab = (tab: TableTab | SheetTab): RecordsListTab | null => (tab === 'sectors' ? null : tab);

/** 표를 접었는지: 기기마다 기억한다 (화면 표시 설정일 뿐이다) */
export const TABLE_COLLAPSED_KEY = 'ecocycle.studio.tableCollapsed';

function useRememberedFlag(key: string): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setOn(next);
    try {
      if (next) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    } catch {
      // 저장소를 못 써도 접기는 된다
    }
  };
  return [on, set];
}

/** 끌어서 여닫을 때 손가락(마우스)이 이만큼(px) 움직이면 끌기로 본다 */
const DRAG_TOGGLE_PX = 24;

/**
 * 아래 시트·표를 끌어서 여닫는다: 위로 끌면 펼치고 아래로 끌면 접는다. 누르기(탭)는 그대로 열고 닫는다.
 * 끌었을 때는 뒤따라오는 클릭을 막아 두 번 바뀌지 않게 한다. 반환값을 끌 수 있는 자리(손잡이·머리 줄)에 펼쳐 쓴다.
 * 포인터 캡처는 쓰지 않는다(안쪽 단추의 클릭이 깨진다). `touchAction`은 끌기 자리의 브라우저 기본 동작(스크롤·확대)을 막는 값이다.
 */
function useDragToggle(setOpen: (open: boolean) => void, touchAction: CSSProperties['touchAction'] = 'none') {
  const dragged = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  // 끌기가 시작되면 창 전체에서 움직임을 받는다: 손잡이가 작아 마우스는 첫 움직임에 자리를 벗어난다(터치는 시작한 곳이 계속 받는다)
  useEffect(() => () => stop.current?.(), []);
  return {
    style: { touchAction } as CSSProperties,
    onPointerDown: (e: ReactPointerEvent) => {
      stop.current?.();
      dragged.current = false;
      const id = e.pointerId;
      const startY = e.clientY;
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        const dy = ev.clientY - startY;
        if (Math.abs(dy) < DRAG_TOGGLE_PX) return;
        dragged.current = true;
        stop.current?.();
        setOpen(dy < 0);
      };
      const end = (ev: PointerEvent) => {
        if (ev.pointerId === id) stop.current?.();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
      stop.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        stop.current = null;
      };
    },
    onClickCapture: (e: { preventDefault: () => void; stopPropagation: () => void }) => {
      if (!dragged.current) return;
      dragged.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

/** 접힌 시트의 요약 줄이 차지하는 높이(줄 32px + 간격 8px): 펼친 시트의 접힌 높이를 구할 때 더한다 */
const SHEET_SUMMARY_PX = 40;
/** 손가락을 떼었을 때 이 속도(px/ms)보다 빠르면 높이와 상관없이 던진 방향으로 열거나 닫는다 */
const SHEET_FLING = 0.5;
/** 끌어서 열림·닫힘이 바뀌는 비율: 접힌 높이와 펼친 높이 사이의 이만큼 넘게 끌면 바뀐다 */
const SHEET_SNAP = 0.35;
/** 놓은 뒤 열림·닫힘 자리로 찾아가는 시간(ms). studio.css의 .st-sheet-settling과 같아야 한다 */
const SHEET_SETTLE_MS = 200;

/**
 * 폰의 아래 시트를 손가락을 따라 끌어 올리고 내린다. 끄는 동안 시트의 높이가 손가락 움직임과 같이 변하고(접힌 높이 ~ 펼친 높이),
 * 놓으면 더 가까운 쪽(또는 던진 방향)으로 찾아가 열림·닫힘이 된다. 누르기는 그대로 여닫는다(끌었을 때만 뒤따르는 클릭을 막는다).
 * 끄는 동안에는 펼친 내용을 그려 두어 올라오는 만큼 보이게 한다(`height`가 null이 아닌 동안).
 * 마우스는 손잡이가 작아 첫 움직임에 벗어나므로 시작하면 창 전체에서 움직임을 받는다(터치는 시작한 곳이 계속 받는다).
 */
function useSheetDrag(sheet: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
  const [height, setHeight] = useState<number | null>(null);
  const [settling, setSettling] = useState(false);
  const dragged = useRef(false);
  const stop = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      stop.current?.();
      clearTimeout(timer.current);
    },
    [],
  );
  return {
    height,
    settling,
    grip: {
      style: { touchAction: 'none' } as CSSProperties,
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        const el = sheet.current;
        const parent = el?.offsetParent as HTMLElement | null;
        if (!el || !parent) return;
        stop.current?.();
        clearTimeout(timer.current);
        setSettling(false);
        dragged.current = false;
        const style = getComputedStyle(el);
        const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const startH = el.offsetHeight;
        const minH = open ? pad + e.currentTarget.offsetHeight + SHEET_SUMMARY_PX : startH;
        const maxH = Math.max(minH, parent.clientHeight * 0.6);
        const id = e.pointerId;
        const startY = e.clientY;
        let current = startH;
        // 던지는 속도는 마지막 100ms의 움직임으로 잰다(끝의 흔들림 한 번이 던지기로 읽히지 않게)
        let trail = [{ t: e.timeStamp, y: e.clientY }];
        const move = (ev: PointerEvent) => {
          if (ev.pointerId !== id) return;
          const dy = ev.clientY - startY;
          if (!dragged.current && Math.abs(dy) < 6) return;
          dragged.current = true;
          trail = [...trail.filter((p) => ev.timeStamp - p.t <= 100), { t: ev.timeStamp, y: ev.clientY }];
          current = Math.min(maxH, Math.max(minH, startH - dy));
          setHeight(current);
        };
        const end = (ev: PointerEvent) => {
          if (ev.pointerId !== id) return;
          stop.current?.();
          if (!dragged.current) return;
          const first = trail[0]!;
          const lastPoint = trail[trail.length - 1]!;
          const span = lastPoint.t - first.t;
          const velocity = span >= 16 && ev.timeStamp - lastPoint.t <= 100 ? (lastPoint.y - first.y) / span : 0;
          // 펼친 내용의 자연스러운 높이(최대 60%)를 재서 펼침 자리로 쓴다
          const before = el.style.height;
          el.style.height = 'auto';
          const natural = Math.min(maxH, Math.max(minH, el.offsetHeight));
          el.style.height = before;
          // 시작한 상태에서 범위의 35% 넘게 끌면 바뀐다(열려 있던 것은 35% 넘게 내려야 닫힌다)
          const edge = (natural - minH) * SHEET_SNAP;
          const goOpen = Math.abs(velocity) > SHEET_FLING ? velocity < 0 : open ? current > natural - edge : current > minH + edge;
          setSettling(true);
          setHeight(goOpen ? natural : minH);
          timer.current = setTimeout(() => {
            setOpen(goOpen);
            setHeight(null);
            setSettling(false);
          }, SHEET_SETTLE_MS);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        stop.current = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', end);
          window.removeEventListener('pointercancel', end);
          stop.current = null;
        };
      },
      onClickCapture: (e: { preventDefault: () => void; stopPropagation: () => void }) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    },
  };
}

/**
 * 오른쪽 아래(세로 태블릿은 아래) 탭 표: 차량 · 섹터 · 배치 · 베일. 접기 단추로 요약 한 줄까지 접을 수 있고(3D를 덜 가린다),
 * 접었는지는 기기에 기억한다. 줄을 누르는 규칙은 TableBody.
 */
export function Tables({ data, disconnected, selection, onSelect, recordLink, openRecord }: PanelCommon & { recordLink?: RecordLink; openRecord?: RecordOpen }) {
  const [tab, setTab] = useState<TableTab>('vehicles');
  const [collapsed, setCollapsed] = useRememberedFlag(TABLE_COLLAPSED_KEY);
  // 머리 줄(접힌 때는 한 줄 전체)을 끌어서 여닫는다. 가로 끌기는 탭 줄에 남긴다
  const drag = useDragToggle((open) => setCollapsed(!open), 'pan-x');
  const onSite = data.vehicles.filter((v) => v.stage !== 'departed').length;
  const openBatches = data.batches.filter((b) => b.stage !== 'completed').length;
  const stacked = data.bales.filter((b) => b.stage === 'created').length;
  const tabs: Array<{ key: TableTab; label: string; count: number }> = [
    { key: 'vehicles', label: '차량', count: onSite },
    { key: 'sectors', label: '섹터', count: TANK_IDS.length },
    { key: 'batches', label: '배치', count: openBatches },
    { key: 'bales', label: '베일', count: stacked },
  ];
  const linkTab = listTab(tab);

  if (collapsed) {
    return (
      <section className="st-glass st-table st-table-collapsed" aria-label="공정 기록" {...drag}>
        <button type="button" className={`st-table-summary${disconnected ? ' st-stale' : ''}`} aria-expanded={false} onClick={() => setCollapsed(false)}>
          <span className="st-panel-icon" aria-hidden="true">
            <Icon name="batch" size={15} />
          </span>
          <span className="st-table-summary-text">
            차량 {onSite}대 · 진행 배치 {openBatches} · 적치 베일 {stacked}개
          </span>
          <span className="st-table-toggle" aria-hidden="true">
            <Icon name="chevron" size={16} />
          </span>
          <span className="st-sr">공정 기록 표 펼치기</span>
        </button>
      </section>
    );
  }
  return (
    <section className="st-glass st-table" aria-label="공정 기록">
      <div className="st-table-head" {...drag}>
        <span className="st-panel-icon" aria-hidden="true">
          <Icon name="batch" size={15} />
        </span>
        <div role="tablist" aria-label="기록 종류" className="st-seg">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label} <small>{t.count}</small>
            </button>
          ))}
        </div>
        {recordLink && linkTab && recordLink({ kind: 'list', tab: linkTab }, '기록 보기', 'st-link-mini')}
        <button type="button" className="st-table-toggle st-table-collapse" aria-expanded={true} aria-label="공정 기록 표 접기" onClick={() => setCollapsed(true)}>
          <Icon name="chevron" size={16} />
        </button>
      </div>
      <div className={`st-table-scroll${disconnected ? ' st-stale' : ''}`} role="tabpanel">
        <TableBody tab={tab} data={data} disconnected={disconnected} selection={selection} onSelect={onSelect} openRecord={openRecord} />
      </div>
    </section>
  );
}

// ── 폰: 아래 시트와 짧은 공정 막대 ─────────────────────────────────────

/** 여섯 단계를 막대 하나로: 지나간 칸·지금 칸을 칠하고 지금 단계 이름만 적는다 */
export function TrackerBar({ data, disconnected }: Pick<PanelCommon, 'data' | 'disconnected'>) {
  const steps = cycleSteps(data);
  const liveIndex = steps.findIndex((s) => s.active);
  const live = liveIndex >= 0 ? steps[liveIndex] : undefined;
  const label = disconnected ? '연결 끊김 · 마지막 상태' : live ? `${live.label} 진행 중` : '대기 중';
  return (
    <div className={`st-trackbar${disconnected ? ' st-trackbar-offline' : ''}`} role="group" aria-label={`공정 추적: ${label}`}>
      <ol aria-hidden="true">
        {steps.map((step, i) => (
          <li key={step.key} className={step.active && !disconnected ? 'on' : step.at || i < liveIndex ? 'done' : undefined} />
        ))}
      </ol>
      <span className="st-trackbar-label">
        <b>{label}</b>
        {live?.detail && !disconnected && <small>{live.detail}</small>}
      </span>
    </div>
  );
}

type SheetTab = 'batches' | 'vehicles' | 'sectors' | 'bales';
const SHEET_TABS: Array<{ key: SheetTab; label: string }> = [
  { key: 'batches', label: '배치' },
  { key: 'vehicles', label: '차량' },
  { key: 'sectors', label: '섹터' },
  { key: 'bales', label: '베일' },
];

/**
 * 폰의 아래 시트: 접힌 상태(기본)에서는 짧은 공정 막대와 요약 한 줄만, 펼치면 탭(배치 · 차량 · 섹터 · 베일)과 내용.
 * 대상을 고르면 펼쳐서 그 상세를 보여 준다 (상세의 닫기 = 고르기 풀기).
 */
export function PhoneSheet({ data, disconnected, selection, onSelect, deviceActions, recordLink, openRecord }: DetailProps & { openRecord?: RecordOpen }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<SheetTab>('batches');
  // 손잡이·공정 막대·접힌 요약 줄을 손가락을 따라 끌어 올리고 내린다 (펼친 안쪽 내용은 따로 스크롤된다)
  const sheetRef = useRef<HTMLElement>(null);
  const { height: dragHeight, settling, grip } = useSheetDrag(sheetRef, open, setOpen);
  // 끄는 동안(놓은 뒤 찾아가는 동안 포함)에는 펼친 내용을 그려 올라오는 만큼 보이게 한다
  const showBody = open || dragHeight !== null;
  useEffect(() => {
    if (selection) setOpen(true);
  }, [selection]);
  const batch = data.batches.find((b) => b.stage === 'compressing') ?? data.batches.find((b) => b.stage === 'mixing') ?? data.batches.find((b) => b.stage === 'planned');
  const onSite = data.vehicles.filter((v) => v.stage !== 'departed').length;
  const stacked = data.bales.filter((b) => b.stage === 'created').length;
  const counts: Record<SheetTab, number> = {
    batches: data.batches.filter((b) => b.stage !== 'completed').length,
    vehicles: onSite,
    sectors: TANK_IDS.length,
    bales: stacked,
  };
  const summary = `${batch ? `${shortId(batch.id)} ${BATCH_STAGE_TEXT[batch.stage]}` : '배치 대기'} · 차량 ${onSite}대 · 적치 베일 ${stacked}개`;
  const common = { data, disconnected, selection, onSelect };
  return (
    <section
      ref={sheetRef}
      className={`st-glass st-sheet${showBody ? ' st-sheet-open' : ''}${settling ? ' st-sheet-settling' : ''}`}
      style={dragHeight !== null ? { height: dragHeight, overflow: 'hidden' } : undefined}
      aria-label="공정 정보"
    >
      <div className="st-sheet-grip" {...grip}>
        <button type="button" className="st-sheet-handle" aria-expanded={open} aria-label={open ? '공정 정보 접기' : '공정 정보 펼치기'} onClick={() => setOpen(!open)}>
          <i aria-hidden="true" />
        </button>
        <TrackerBar data={data} disconnected={disconnected} />
        {!showBody && (
          <button type="button" className={`st-sheet-summary${disconnected ? ' st-stale' : ''}`} onClick={() => setOpen(true)}>
            {summary}
            <Icon name="chevron" size={16} />
          </button>
        )}
      </div>
      {!showBody ? null : selection ? (
        <div className="st-sheet-body">
          <Detail {...common} deviceActions={deviceActions} recordLink={recordLink} bare />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="공정 정보 종류" className="st-seg st-sheet-tabs">
            {SHEET_TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label} <small>{counts[t.key]}</small>
              </button>
            ))}
          </div>
          <div className={`st-sheet-body st-table${disconnected ? ' st-stale' : ''}`} role="tabpanel">
            {recordLink && listTab(tab) && <div className="st-list-link">{recordLink({ kind: 'list', tab: listTab(tab)! }, '기록 보기', 'st-link-mini')}</div>}
            {tab === 'batches' && <Detail {...common} selection={null} recordLink={recordLink} bare />}
            <TableBody tab={tab} {...common} openRecord={openRecord} />
          </div>
        </>
      )}
    </section>
  );
}

// ── 지도식 핀 ─────────────────────────────────────────────────────────

const PIN_NAME: Partial<Record<DeviceId, string>> = { 'robot-1': '로봇팔', 'conveyor-z': '컨베이어', 'compressor-1': '압축기' };

export interface PinsProps extends PanelCommon {
  pins: MutableRefObject<PinElements>;
  /** 출하 마당 칸이 다 차서 압축기가 기다린다: 압축기 핀에 알린다 */
  yardFull?: boolean;
}

/**
 * 지도식 핀: 흰 알약 칩(상태 점 또는 섹터 적재율 고리 + 이름 + 짧은 값) 아래에 대상을 가리키는 점 하나.
 * 고른 대상은 파랑 칩으로 바뀐다. 멀리서 볼 때(부지 전체)는 섹터는 고리만, 차량·베일은 숨긴다.
 * 연결이 끊기면 값 대신 "–"를 적고 핀 전체가 회색이 된다.
 */
export function Pins({ data, disconnected, selection, onSelect, pins, yardFull = false }: PinsProps) {
  const bind = (key: string) => (el: HTMLElement | null) => {
    if (el) pins.current[key] = el;
    else delete pins.current[key];
  };
  const pinProps = (key: string, label: string) => ({
    ref: bind(key),
    type: 'button' as const,
    'aria-label': label,
    'aria-pressed': selection === key,
    onClick: () => onSelect(selection === key ? null : key),
    // 위치가 계산되기 전에는 보이지 않게 둔다 (장면이 visible로 바꾼다)
    style: { visibility: 'hidden' as const },
  });

  return (
    <div className={`st-pins${disconnected ? ' st-pins-offline' : ''}`}>
      {DEVICE_IDS.map((id) => {
        const key = `dev:${id}`;
        const device = data.devices[id];
        const line = device ? deviceLine(device) : null;
        const tone: DeviceStatus = disconnected || !line ? 'offline' : line.tone;
        const tank = device?.type === 'tank' ? device : null;
        const full = id === 'compressor-1' && yardFull;
        const spoken = !line ? '불러오는 중' : disconnected ? STATUS_TEXT.offline : `${line.value}, ${line.statusText}${full ? ', 출하 마당 가득 참' : ''}`;
        return (
          <button key={key} {...pinProps(key, `${DEVICE_NAMES[id]} ${spoken}`)} className={`st-pin st-pin-${tone}${tank ? ' st-pin-sector' : ''}`}>
            <span className="st-pin-card">
              {tank ? (
                <span className="st-ring" style={{ ['--p' as string]: `${disconnected ? 0 : tank.fillPercent}` }}>
                  <b>{tank.section}</b>
                </span>
              ) : (
                <i className="st-pin-dot" aria-hidden="true">
                  {STATUS_SYMBOL[tone]}
                </i>
              )}
              <span className="st-pin-text">
                <small>{tank ? `${tank.grade}등급` : (PIN_NAME[id] ?? DEVICE_NAMES[id])}</small>
                <strong>{!line ? '…' : disconnected ? '–' : line.value}</strong>
                {full && <em className="st-pin-flag">출하 마당 가득 참</em>}
              </span>
            </span>
          </button>
        );
      })}
      {data.vehicles
        .filter((v) => v.stage !== 'departed')
        .map((v) => {
          const key = `veh:${v.id}`;
          return (
            <button key={key} {...pinProps(key, `차량 ${v.plate ?? '번호판 인식 중'} ${VEHICLE_STAGE_TEXT[v.stage]}`)} className="st-pin st-pin-vehicle">
              <span className="st-pin-card">
                <span className="st-plate">{v.plate ?? '인식 중…'}</span>
                <span className="st-pin-text">
                  <small>{v.companyName ?? '계중대'}</small>
                  <strong>
                    {v.sectorId ? `${SECTOR_LABEL[v.sectorId]} · ` : ''}
                    {VEHICLE_STAGE_TEXT[v.stage]}
                  </strong>
                </span>
              </span>
            </button>
          );
        })}
      {data.bales
        .filter((b) => b.stage === 'created')
        .map((b) => {
          const key = `bale:${b.id}`;
          return (
            <button key={key} {...pinProps(key, `베일 ${b.id} ${BALE_STAGE_TEXT[b.stage]}`)} className="st-pin st-pin-bale">
              <span className="st-pin-card">
                <span className="st-pin-text">
                  <small>베일</small>
                  <strong>{shortId(b.id)}</strong>
                </span>
              </span>
            </button>
          );
        })}
      {Array.from({ length: YARD_FLOW.forkliftCount }, (_, i) => {
        const key = `forklift:${i + 1}`;
        return (
          <button key={key} {...pinProps(key, `지게차 ${i + 1}`)} className={`st-pin st-pin-vehicle${selection === key ? '' : ' st-pin-quiet'}`}>
            <span className="st-pin-card">
              <span className="st-pin-text">
                <small>지게차{YARD_FLOW.forkliftCount > 1 ? ` ${i + 1}` : ''}</small>
                <strong>베일 운반</strong>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
