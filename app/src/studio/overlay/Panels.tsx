import { useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { DEVICE_IDS, TANK_IDS } from '@ecocycle/shared';
import type { DeviceId, DeviceState, DeviceStatus, PlantMetric } from '@ecocycle/shared';
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
import type { StudioData } from '../types';
import { SECTOR_LABEL, VIEWS } from '../world/layout';
import type { ViewPreset } from '../world/layout';
import { BALE_STAGE_TEXT, BATCH_STAGE_TEXT, VEHICLE_STAGE_TEXT, cycleSteps, deviceLine, mixText, shortId } from './text';

// 스튜디오의 유리 패널들. 3D 위에 떠 있고, 값은 받은 그대로 표시한다.
// 연결이 끊기면(disconnected) 값을 흐리게 하고 "마지막 값"임을 알린다.

const time = (iso: string | null | undefined) => (iso ? formatLocalTime(iso).slice(-8) : '–');

export interface PanelCommon {
  data: StudioData;
  disconnected: boolean;
  selection: string | null;
  onSelect: (key: string | null) => void;
}

// ── 상단 바 ───────────────────────────────────────────────────────────

export interface TopBarProps {
  tabs?: ReactNode;
  status: DeviceStatus | null;
  disconnected: boolean;
  lastReceivedAt: string | null;
  example: boolean;
  alarmCount: number;
  view: string;
  onView: (preset: ViewPreset) => void;
}

export function TopBar({ tabs, status, disconnected, lastReceivedAt, example, alarmCount, view, onView }: TopBarProps) {
  const tone: DeviceStatus = disconnected ? 'offline' : (status ?? 'offline');
  return (
    <header className="st-glass st-top">
      <div className="st-brand">
        <span className="st-logo" aria-hidden="true" />
        <div>
          <strong>EcoCycle</strong>
          <span>스튜디오</span>
        </div>
      </div>
      {tabs && <div className="st-tabs-slot">{tabs}</div>}
      <nav className="st-views" aria-label="카메라 지역">
        {VIEWS.map((preset) => (
          <button key={preset.key} type="button" aria-pressed={view === preset.key} onClick={() => onView(preset)}>
            {preset.label}
          </button>
        ))}
      </nav>
      <div className="st-top-right">
        {example && <span className="st-chip st-chip-example">예시 데이터</span>}
        {alarmCount > 0 && <span className="st-chip st-tone-alarm">✕ 알람 {alarmCount}</span>}
        <span className={`st-chip st-tone-${tone}`} role="status">
          <i aria-hidden="true">{STATUS_SYMBOL[tone]}</i>
          {status || disconnected ? `시스템 ${STATUS_TEXT[tone]}` : '불러오는 중'}
        </span>
        <span className="st-chip st-chip-quiet">
          {disconnected ? '마지막 수신' : '수신'} <time dateTime={lastReceivedAt ?? undefined}>{time(lastReceivedAt)}</time>
        </span>
      </div>
    </header>
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

// ── 지표 카드 ─────────────────────────────────────────────────────────

function Spark({ values }: { values: readonly number[] | undefined }) {
  const w = 96;
  const h = 40;
  if (!values || values.length < 2) return <svg className="st-spark" width={w} height={h} aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => 3 + (i / (values.length - 1)) * (w - 6);
  const y = (v: number) => h - 5 - ((v - min) / span) * (h - 12);
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const endX = x(values.length - 1);
  const endY = y(values[values.length - 1]!);
  return (
    <svg className="st-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id="st-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2f6bff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#2f6bff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${endX.toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`} fill="url(#st-spark-fill)" />
      <path d={line} fill="none" stroke="#2f6bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={endX} cy={endY} r="3.2" fill="#fff" stroke="#2f6bff" strokeWidth="2" />
    </svg>
  );
}

const KPIS: Array<{ metric: PlantMetric; label: string; unit: string; digits: number }> = [
  { metric: 'balesToday', label: '오늘 생산 베일', unit: '개', digits: 0 },
  { metric: 'averageMoisturePercent', label: '평균 수분', unit: '%', digits: 1 },
  { metric: 'compressorUptimePercent', label: '압축기 가동률', unit: '%', digits: 1 },
];

export function Kpis({ data, disconnected }: Pick<PanelCommon, 'data' | 'disconnected'>) {
  return (
    <div className="st-kpis">
      {KPIS.map(({ metric, label, unit, digits }) => {
        const value = data.summary?.[metric];
        return (
          <section key={metric} className={`st-glass st-kpi${disconnected ? ' st-stale' : ''}`} aria-label={label}>
            <p className="st-kpi-label">{label}</p>
            <p className="st-kpi-value">
              {value === undefined ? '–' : value.toFixed(digits)}
              <span>{unit}</span>
            </p>
            <Spark values={data.trends[metric]} />
            <p className="st-kpi-note">{disconnected ? '마지막 값' : '최근 24시간'}</p>
          </section>
        );
      })}
    </div>
  );
}

// ── 오른쪽 상세 패널 ──────────────────────────────────────────────────

function Rows({ rows }: { rows: Array<[string, ReactNode]> }) {
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

function Tone({ tone, label }: { tone: DeviceStatus; label?: string }) {
  return (
    <span className={`st-chip st-tone-${tone}`}>
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

function deviceRows(device: DeviceState, data: StudioData): Array<[string, ReactNode]> {
  switch (device.type) {
    case 'tank':
      return [
        ['적재율', formatPercent(device.fillPercent)],
        ['부피(용량)', `${formatVolumeM3(device.volumeM3)} / ${formatVolumeM3(device.capacityM3)}`],
        ['수분', formatPercent(device.moisturePercent)],
        ['등급', `${device.grade}`],
        ['위치', `${device.section} 구역`],
      ];
    case 'robot':
      return [
        ['모드', ROBOT_MODE_TEXT[device.mode]],
        ['동작 단계', PHASE_STEPS.find((s) => s.phase === device.phase)?.label ?? '대기'],
        ['작업 중 섹터', device.targetTankId ? SECTOR_LABEL[device.targetTankId] : '없음'],
        ['그리퍼', device.gripper.holding ? '파지를 잡고 있음' : device.gripper.closed ? '닫힘' : '열림'],
      ];
    case 'conveyor':
      return [
        ['가동 상태', device.running ? '가동' : '정지'],
        ['적재 정도', formatLoadPercent(device.loadPercent)],
      ];
    case 'compressor': {
      const batch = data.batches.find((b) => b.stage === 'compressing');
      return [
        ['가동 상태', device.running ? '가동' : '정지'],
        ['압력', formatPressureMpa(device.pressureMpa)],
        ['목표 압력', batch ? formatPressureMpa(batch.targetPressureMpa) : '–'],
        ['온도', formatTemperatureC(device.temperatureC)],
      ];
    }
  }
}

export interface DetailProps extends PanelCommon {
  /** 기기를 골랐을 때 넣을 조작 영역 (기존 조작 컴포넌트와 "상세 보기" 링크). 없으면 조작을 보여 주지 않는다 */
  deviceActions?: (id: DeviceId) => ReactNode;
}

export function Detail({ data, disconnected, selection, onSelect, deviceActions }: DetailProps) {
  const [kind, id] = selection ? (selection.includes(':') ? [selection.slice(0, selection.indexOf(':')), selection.slice(selection.indexOf(':') + 1)] : [selection, '']) : ['', ''];
  const close = (
    <button type="button" className="st-close" aria-label="상세 패널 닫기" onClick={() => onSelect(null)}>
      ✕
    </button>
  );
  const stale = disconnected ? ' st-stale' : '';

  if (kind === 'dev') {
    const deviceId = id as DeviceId;
    const device = data.devices[deviceId];
    const line = device ? deviceLine(device) : null;
    const alarms = data.alarms.filter((a) => a.deviceId === deviceId);
    return (
      <aside className="st-glass st-detail" aria-label={`${DEVICE_NAMES[deviceId]} 상세`}>
        <header>
          <div>
            <p className="st-eyebrow">{deviceId.startsWith('tank') ? '수납 섹터' : '설비'}</p>
            <h2>{DEVICE_NAMES[deviceId]}</h2>
          </div>
          {close}
        </header>
        {!device || !line ? (
          <p className="st-muted">상태를 불러오는 중…</p>
        ) : (
          <>
            <div className="st-detail-hero">
              <Tone tone={disconnected ? 'offline' : line.tone} label={disconnected ? undefined : line.statusText} />
              <strong className={stale}>{line.value}</strong>
            </div>
            {device.type === 'tank' && <Meter percent={device.fillPercent} tone={disconnected ? 'offline' : device.status} />}
            <div className={stale}>
              <Rows rows={deviceRows(device, data)} />
            </div>
            <p className="st-muted">
              {disconnected ? '마지막으로 받은 값 · ' : ''}갱신 {time(device.updatedAt)}
            </p>
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
          </>
        )}
        {deviceActions && <div className="st-actions">{deviceActions(deviceId)}</div>}
      </aside>
    );
  }

  if (kind === 'veh') {
    const vehicle = data.vehicles.find((v) => v.id === id);
    return (
      <aside className="st-glass st-detail" aria-label="차량 상세">
        <header>
          <div>
            <p className="st-eyebrow">입고 차량</p>
            <h2>{vehicle?.plate ?? '번호판 인식 중'}</h2>
          </div>
          {close}
        </header>
        {vehicle ? (
          <div className={stale}>
            <div className="st-detail-hero">
              <span className="st-chip st-chip-blue">{VEHICLE_STAGE_TEXT[vehicle.stage]}</span>
            </div>
            <Rows
              rows={[
                ['회사', vehicle.companyName ?? '–'],
                ['배정 섹터', vehicle.sectorId ? SECTOR_LABEL[vehicle.sectorId] : '–'],
                ['계중대 도착', time(vehicle.stageTimes.arrived)],
                ['번호판 인식', time(vehicle.stageTimes.identified)],
                ['하역 시작', time(vehicle.stageTimes.unloading)],
                ['하역 완료', time(vehicle.stageTimes.unloaded)],
                ['출차', time(vehicle.stageTimes.departed)],
              ]}
            />
            <p className="st-muted">회사·배정 섹터는 서버가 번호판으로 정한 값입니다. 계량 값(무게)은 표시하지 않습니다.</p>
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
      <aside className="st-glass st-detail" aria-label="베일 상세">
        <header>
          <div>
            <p className="st-eyebrow">베일</p>
            <h2>{bale?.id ?? id}</h2>
          </div>
          {close}
        </header>
        {bale ? (
          <div className={stale}>
            <div className="st-detail-hero">
              <span className="st-chip st-chip-kraft">{BALE_STAGE_TEXT[bale.stage]}</span>
            </div>
            <Rows
              rows={[
                ['배치', bale.batchId],
                ['배합', batch ? mixText(batch) : '–'],
                ['평균 수분', batch ? formatPercent(batch.avgMoisturePercent) : '–'],
                ['목표 압력', batch ? formatPressureMpa(batch.targetPressureMpa) : '–'],
                ['배출', time(bale.stageTimes.created)],
                ['출하', time(bale.stageTimes.shipped)],
              ]}
            />
          </div>
        ) : (
          <p className="st-muted">이 베일의 기록이 목록에서 지나갔습니다.</p>
        )}
      </aside>
    );
  }

  if (kind === 'forklift') {
    return (
      <aside className="st-glass st-detail" aria-label="지게차 상세">
        <header>
          <div>
            <p className="st-eyebrow">출하 마당</p>
            <h2>지게차</h2>
          </div>
          {close}
        </header>
        <p className="st-muted">
          지게차의 움직임은 베일의 단계(적치 → 출하)를 화면에 옮긴 연출입니다. 지게차 위치는 서버가 보내는 값이 아닙니다.
        </p>
      </aside>
    );
  }

  // 아무것도 고르지 않았을 때: 지금 배치와 섹터 요약
  const batch = data.batches.find((b) => b.stage === 'compressing') ?? data.batches.find((b) => b.stage === 'mixing') ?? data.batches.find((b) => b.stage === 'planned');
  const compressor = data.devices['compressor-1'];
  return (
    <aside className="st-glass st-detail" aria-label="공정 요약">
      <header>
        <div>
          <p className="st-eyebrow">지금 배치</p>
          <h2>{batch ? batch.id : '대기 중'}</h2>
        </div>
        {batch && <span className="st-chip st-chip-blue">{BATCH_STAGE_TEXT[batch.stage]}</span>}
      </header>
      <div className={stale}>
        {batch ? (
          <>
            <div className="st-mix" aria-label={`배합비 ${mixText(batch)}`}>
              {batch.mix.map((part, i) => (
                <span key={part.sectorId} style={{ flexGrow: part.percent }} className={i % 2 ? 'st-mix-b' : 'st-mix-a'}>
                  {SECTOR_LABEL[part.sectorId]} {part.percent}%
                </span>
              ))}
            </div>
            <Rows
              rows={[
                ['평균 수분', formatPercent(batch.avgMoisturePercent)],
                ['목표 압력', formatPressureMpa(batch.targetPressureMpa)],
                ['현재 압력', compressor?.type === 'compressor' ? formatPressureMpa(compressor.pressureMpa) : '–'],
              ]}
            />
          </>
        ) : (
          <p className="st-muted">진행 중인 배치가 없습니다.</p>
        )}
        <h3>섹터 적재율</h3>
        <ul className="st-sectors">
          {TANK_IDS.map((tankId) => {
            const tank = data.devices[tankId];
            const tone: DeviceStatus = disconnected || tank?.type !== 'tank' ? 'offline' : tank.status;
            return (
              <li key={tankId}>
                <button type="button" onClick={() => onSelect(`dev:${tankId}`)}>
                  <b>{SECTOR_LABEL[tankId]}</b>
                  <Meter percent={tank?.type === 'tank' ? tank.fillPercent : 0} tone={tone} />
                  <span>{tank?.type === 'tank' ? formatPercent(tank.fillPercent) : '–'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="st-muted">장면의 설비·차량·베일을 누르면 상세가 열립니다.</p>
    </aside>
  );
}

// ── 공정 추적 (왼쪽 아래) ─────────────────────────────────────────────

export function Tracker({ data, disconnected, selection, onSelect }: PanelCommon) {
  const steps = cycleSteps(data);
  return (
    <section className={`st-glass st-tracker${disconnected ? ' st-tracker-offline' : ''}`} aria-label="공정 추적">
      <ol>
        {steps.map((step, i) => {
          const live = step.active && !disconnected;
          return (
            <li key={step.key} className={live ? 'st-step-live' : undefined} aria-current={live ? 'step' : undefined}>
              <button type="button" disabled={!step.select} aria-pressed={!!step.select && selection === step.select} onClick={() => onSelect(step.select)}>
                <span className="st-step-no">{i + 1}</span>
                <span className="st-step-body">
                  <b>{step.label}</b>
                  <em>{disconnected ? '연결 끊김' : step.active ? '진행 중' : '대기'}</em>
                  <span className="st-step-detail">{step.detail ?? '–'}</span>
                  <time dateTime={step.at ?? undefined}>{time(step.at)}</time>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ── 표 (오른쪽 아래) ──────────────────────────────────────────────────

const TABLE_TABS = [
  { key: 'vehicles', label: '차량' },
  { key: 'sectors', label: '섹터' },
  { key: 'batches', label: '배치' },
  { key: 'bales', label: '베일' },
] as const;
type TableTab = (typeof TABLE_TABS)[number]['key'];

const newest = <T extends { updatedAt: string }>(list: readonly T[]): T[] => [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

export function Tables({ data, disconnected, selection, onSelect }: PanelCommon) {
  const [tab, setTab] = useState<TableTab>('vehicles');
  const row = (key: string | null) => ({
    className: key && key === selection ? 'st-row-on' : undefined,
    onClick: key ? () => onSelect(key) : undefined,
    tabIndex: key ? 0 : undefined,
  });
  return (
    <section className="st-glass st-table" aria-label="공정 기록">
      <div role="tablist" aria-label="기록 종류" className="st-seg">
        {TABLE_TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={`st-table-scroll${disconnected ? ' st-stale' : ''}`} role="tabpanel">
        {tab === 'vehicles' && (
          <table>
            <thead>
              <tr>
                <th>번호판</th>
                <th>회사</th>
                <th>섹터</th>
                <th>단계</th>
                <th>시각</th>
              </tr>
            </thead>
            <tbody>
              {newest(data.vehicles).map((v) => (
                <tr key={v.id} {...row(v.stage === 'departed' ? null : `veh:${v.id}`)}>
                  <td>
                    <span className="st-plate">{v.plate ?? '인식 중'}</span>
                  </td>
                  <td>{v.companyName ?? '–'}</td>
                  <td>{v.sectorId ? SECTOR_LABEL[v.sectorId] : '–'}</td>
                  <td>
                    <span className={`st-tag${v.stage === 'departed' ? '' : ' st-tag-on'}`}>{VEHICLE_STAGE_TEXT[v.stage]}</span>
                  </td>
                  <td>{time(v.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'sectors' && (
          <table>
            <thead>
              <tr>
                <th>섹터</th>
                <th>등급</th>
                <th>적재율</th>
                <th>수분</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {TANK_IDS.map((tankId) => {
                const tank = data.devices[tankId];
                if (tank?.type !== 'tank') {
                  return (
                    <tr key={tankId}>
                      <td>{SECTOR_LABEL[tankId]}</td>
                      <td colSpan={4}>불러오는 중</td>
                    </tr>
                  );
                }
                const tone = disconnected ? 'offline' : tank.status;
                return (
                  <tr key={tankId} {...row(`dev:${tankId}`)}>
                    <td>
                      <b>{SECTOR_LABEL[tankId]}</b>
                    </td>
                    <td>{tank.grade}</td>
                    <td>
                      <Meter percent={tank.fillPercent} tone={tone} /> {formatPercent(tank.fillPercent)}
                    </td>
                    <td>{formatPercent(tank.moisturePercent)}</td>
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
            <thead>
              <tr>
                <th>배치</th>
                <th>배합</th>
                <th>평균 수분</th>
                <th>목표 압력</th>
                <th>단계</th>
              </tr>
            </thead>
            <tbody>
              {newest(data.batches).map((b) => (
                <tr key={b.id}>
                  <td>{shortId(b.id)}</td>
                  <td>{mixText(b)}</td>
                  <td>{formatPercent(b.avgMoisturePercent)}</td>
                  <td>{formatPressureMpa(b.targetPressureMpa)}</td>
                  <td>
                    <span className={`st-tag${b.stage === 'completed' ? '' : ' st-tag-on'}`}>{BATCH_STAGE_TEXT[b.stage]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'bales' && (
          <table>
            <thead>
              <tr>
                <th>베일</th>
                <th>배치</th>
                <th>단계</th>
                <th>배출</th>
                <th>출하</th>
              </tr>
            </thead>
            <tbody>
              {newest(data.bales).map((b) => (
                <tr key={b.id} {...row(b.stage === 'created' ? `bale:${b.id}` : null)}>
                  <td>{shortId(b.id)}</td>
                  <td>{shortId(b.batchId)}</td>
                  <td>
                    <span className={`st-tag${b.stage === 'created' ? ' st-tag-kraft' : ''}`}>{BALE_STAGE_TEXT[b.stage]}</span>
                  </td>
                  <td>{time(b.stageTimes.created)}</td>
                  <td>{time(b.stageTimes.shipped)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ── 지도식 핀 ─────────────────────────────────────────────────────────

const PIN_NAME: Partial<Record<DeviceId, string>> = { 'robot-1': '로봇팔', 'conveyor-z': '컨베이어', 'compressor-1': '압축기' };

export interface PinsProps extends PanelCommon {
  pins: MutableRefObject<PinElements>;
}

export function Pins({ data, disconnected, selection, onSelect, pins }: PinsProps) {
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
        const spoken = !line ? '불러오는 중' : disconnected ? STATUS_TEXT.offline : `${line.value}, ${line.statusText}`;
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
                <small>{tank ? `${tank.grade}등급` : PIN_NAME[id]}</small>
                <strong>{!line ? '…' : disconnected ? '–' : line.value}</strong>
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
    </div>
  );
}
