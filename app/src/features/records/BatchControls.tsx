import { useState } from 'react';
import { TANK_IDS } from '@ecocycle/shared';
import type { BatchCommand, ControlledBatch } from '@ecocycle/shared';
import { Card } from '../../components/common/Card';
import { CommandButton } from '../../components/controls/CommandButton';
import { ConfirmDialog } from '../../components/controls/ConfirmDialog';
import { useDeviceCommand } from '../../components/controls/useDeviceCommand';
import { useAppSelector } from '../../store/hooks';
import { selectCan, selectRecentCommands } from '../../store/selectors';
import { CONTROL_TEXT } from '../../config/controls';
import { mixPercentText, SECTOR_LABEL } from '../../config/processDisplay';

export function BatchControls({ value, range, unavailable }: { value: ControlledBatch; range: {min:number;max:number}; unavailable: boolean }) {
  const { batch } = value;
  const [mix, setMix] = useState(() => TANK_IDS.map(sectorId=>({ sectorId, percent: String(batch.mix.find(m=>m.sectorId===sectorId)?.percent ?? 0) })));
  const [pressure, setPressure] = useState(String(batch.targetPressureMpa));
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState<BatchCommand | null>(null);
  const can = useAppSelector(selectCan('batch.control'));
  const entries = useAppSelector(selectRecentCommands);
  const pending = entries.some(e=>e.type.includes('batch') && (e.status==='sending' || e.status==='accepted'));
  const send = useDeviceCommand();
  const total = mix.reduce((sum,m)=>sum+Number(m.percent),0);
  const validMix = mix.every(m=>m.percent.trim()!=='' && Number.isFinite(Number(m.percent)) && Number(m.percent)>=0 && Number(m.percent)<=100) && Math.abs(total-100)<1e-8;
  const validPressure = pressure.trim()!=='' && Number.isFinite(Number(pressure)) && Number(pressure)>=range.min && Number(pressure)<=range.max;
  const disabled = !can || unavailable || pending;
  const base = { batchId: batch.id, confirm: true as const };
  const ask = (command: BatchCommand) => setConfirm(command);
  const inputClass = 'min-h-12 w-full min-w-0 rounded-control border border-line bg-surface px-3 text-ink tabular-nums';
  return <Card title="수동 제어" aria-label="수동 제어">
    <p className="mb-3 text-sm text-ink-soft">대상 {batch.id} · 입력값은 확인 후 서버에서 적용합니다.</p>
    <div className="mb-4 rounded-control bg-paper p-3 text-sm"><p>서버 확정 배합: {unavailable?'–':mixPercentText(batch)}</p><p className="mt-1">서버 확정 목표: {unavailable?'–':batch.targetPressureMpa} MPa</p></div>
    {!can && <p role="status">배치 수동 제어 권한이 없습니다.</p>}
    <fieldset disabled={disabled} className="space-y-4">
      <div><h3 className="mb-2 font-semibold">섹터 배합비</h3>
        <div className="grid grid-cols-2 gap-3">{mix.map((part,index)=><label key={part.sectorId} className="min-w-0 text-sm"><span className="mb-1 block">{SECTOR_LABEL[part.sectorId]} (%)</span><input className={inputClass} type="number" min="0" max="100" step="any" value={part.percent} aria-invalid={!validMix} aria-describedby="mix-validation" onChange={e=>setMix(old=>old.map((m,i)=>i===index?{...m,percent:e.target.value}:m))}/></label>)}</div>
        <p id="mix-validation" role="status" className={`my-2 text-sm ${validMix?'text-ink-soft':'text-status-alarm'}`}>합계 {Number.isFinite(total)?total:'–'}% · {validMix?'합계가 100%입니다.':'0~100%로 입력하고 합계를 100%로 맞추세요.'}</p>
        <CommandButton label="배합 변경" disabled={disabled || !validMix} onClick={()=>ask({...base,type:'set_batch_mix',mix:mix.map(m=>({...m,percent:Number(m.percent)}))})}/>
      </div>
      <div><label className="flex min-w-0 flex-col items-start gap-1 text-sm">목표 압력 (MPa)<input className={`${inputClass} mt-1`} type="number" step="any" min={range.min} max={range.max} value={pressure} aria-invalid={!validPressure} aria-describedby="pressure-validation" onChange={e=>setPressure(e.target.value)}/></label>
        <p id="pressure-validation" className="my-2 text-sm text-ink-soft">허용 범위 {range.min}~{range.max} MPa{!validPressure?' · 범위 안의 숫자를 입력하세요.':''}</p>
        <CommandButton label="압력 변경" disabled={disabled || !validPressure} onClick={()=>ask({...base,type:'set_batch_pressure',targetPressureMpa:Number(pressure)})}/>
      </div>
      <CommandButton label={value.paused?'배치 재개':'배치 일시정지'} disabled={disabled} onClick={()=>ask({...base,type:value.paused?'resume_batch':'pause_batch'})}/>
      <div><label className="flex min-w-0 flex-col items-start gap-1 text-sm">건너뛰기 사유<input className={`${inputClass} my-2`} maxLength={120} value={reason} placeholder="짧은 사유를 입력하세요" onChange={e=>setReason(e.target.value)}/></label>
        <CommandButton label="배치 건너뛰기" disabled={disabled || !reason.trim()} onClick={()=>ask({...base,type:'skip_batch',reason:reason.trim()})}/>
      </div>
    </fieldset>
    <ConfirmDialog open={!!confirm} title={confirm?`${CONTROL_TEXT[confirm.type].label} 확인`:''} message={`${batch.id}에 적용을 요청합니다. 서버가 현재 공정 상태를 확인하고 승인 또는 거부합니다.`} pending={pending} onCancel={()=>setConfirm(null)} onConfirm={()=>{if(confirm && !disabled){send('compressor-1',confirm);setConfirm(null);}}}>
      {confirm && <p className="mt-3 text-sm font-semibold">{confirm.type==='set_batch_mix'?confirm.mix.map(m=>`${SECTOR_LABEL[m.sectorId]} ${m.percent}%`).join(' · '):confirm.type==='set_batch_pressure'?`${confirm.targetPressureMpa} MPa`:confirm.type==='skip_batch'?`사유: ${confirm.reason}`:CONTROL_TEXT[confirm.type].label}</p>}
    </ConfirmDialog>
  </Card>;
}
