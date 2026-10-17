import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ControlledBatch } from '@ecocycle/shared';
import { ADMIN, OPERATOR, VIEWER, NOW, renderWithStore } from '../../test/utils';
import { BatchControls } from './BatchControls';
const send = vi.fn();
vi.mock('../../components/controls/useDeviceCommand',()=>({useDeviceCommand:()=>send}));
const value: ControlledBatch = { batch: {id:'batch-test',stage:'planned',mix:[{sectorId:'tank-a1',percent:100}],actualMix:null,pinning:null,pinChanges:[],avgMoisturePercent:12,targetPressureMpa:28,stageTimes:{planned:NOW},updatedAt:NOW},paused:false,skipped:false,progressPercent:0,currentPressureMpa:0,baleIds:[] };
const render = (me=ADMIN,unavailable=false)=>renderWithStore(<BatchControls value={value} range={{min:27,max:30}} unavailable={unavailable}/>,{me});
describe('배치 수동 제어',()=>{
  it('합계와 압력 범위를 검증하고 확인 전에는 전송하지 않는다',()=>{
    send.mockClear();render();
    fireEvent.change(screen.getByLabelText('A1 (%)'),{target:{value:'80'}});
    expect(screen.getByText(/합계 80%/)).toBeVisible();
    expect(screen.getByRole('button',{name:'배합 변경'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('A2 (%)'),{target:{value:'20'}});
    fireEvent.click(screen.getByRole('button',{name:'배합 변경'}));
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'확인'}));
    expect(send).toHaveBeenCalledWith('compressor-1',expect.objectContaining({type:'set_batch_mix',batchId:'batch-test',confirm:true}));
    expect(value.batch.mix[0]?.percent).toBe(100);
    fireEvent.change(screen.getByLabelText('목표 압력 (MPa)'),{target:{value:'31'}});
    expect(screen.getByRole('button',{name:'압력 변경'})).toBeDisabled();
  });
  it('사유가 있어야 건너뛰기 확인 단계로 간다',()=>{
    render();expect(screen.getByRole('button',{name:'배치 건너뛰기'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('건너뛰기 사유'),{target:{value:'품질 재점검'}});
    fireEvent.click(screen.getByRole('button',{name:'배치 건너뛰기'}));
    expect(within(screen.getByRole('dialog')).getByText('사유: 품질 재점검')).toBeVisible();
  });
  it.each([[VIEWER,false],[OPERATOR,false],[ADMIN,true]] as const)('권한 없음 또는 연결 끊김이면 조작 차단', (me,offline)=>{
    render(me,offline);expect(screen.getByRole('button',{name:'배치 일시정지'})).toBeDisabled();
    expect(screen.getByLabelText('A1 (%)')).toBeDisabled();
  });
});
