import { Dialog } from '../../../components/common/Dialog';
import type { PopupTarget, RecordKind } from '../../../components/records/recordPopup';
import { shortId } from '../../../config/processDisplay';
import { BaleDetail } from '../BaleDetail';
import { BatchDetail } from '../BatchDetail';
import { VehicleDetail } from '../VehicleDetail';

const TITLE: Record<RecordKind, string> = { vehicle: '차량 기록', batch: '배치 상세', bale: '베일 상세' };
const NAME: Record<RecordKind, string> = { vehicle: '차량', batch: '배치', bale: '베일' };

/**
 * 기록 상세 팝업 하나. 폰은 아래 시트(길면 화면 높이 전체), 640px 이상은 가운데 대화상자(베일은 좁게).
 * 초점 가두기·Esc·바깥 누르기·초점 복귀는 `Dialog`가 한다. 닫기는 늘 이 팝업 하나만 닫는다(바로 전 팝업이 있으면 그것이 다시 보인다).
 */
export function RecordPopup({ target, previous, onClose, onOpen }: { target: PopupTarget; previous: PopupTarget | null; onClose: () => void; onOpen: (target: PopupTarget) => void }) {
  return (
    <Dialog open title={TITLE[target.kind]} onClose={onClose} size={target.kind === 'bale' ? 'popupNarrow' : 'popup'} closeLabel={`${TITLE[target.kind]} 닫기`}>
      {previous && (
        <p className="-mt-1 mb-2 text-xs text-ink-faint">
          닫으면 이전 팝업({NAME[previous.kind]} {previous.kind === 'vehicle' ? previous.id : shortId(previous.id)})이 다시 보입니다
        </p>
      )}
      {target.kind === 'vehicle' && <VehicleDetail id={target.id} />}
      {target.kind === 'batch' && <BatchDetail id={target.id} onOpen={onOpen} />}
      {target.kind === 'bale' && <BaleDetail id={target.id} onOpen={onOpen} />}
    </Dialog>
  );
}
