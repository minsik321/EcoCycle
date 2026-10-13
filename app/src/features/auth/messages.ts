import type { LoginError } from '../../store';

/** 로그인 오류를 사용자에게 보여 줄 문장으로 바꾼다. 비밀번호가 틀렸는지 아이디가 없는지는 알려 주지 않는다. */
export function loginErrorMessage(error: LoginError): string {
  switch (error.status) {
    case 401:
      return '아이디 또는 비밀번호가 올바르지 않습니다.';
    case 429:
      return error.retryAfterSec
        ? `로그인 시도가 너무 많습니다. ${error.retryAfterSec}초 뒤에 다시 시도하세요.`
        : '로그인 시도가 너무 많습니다. 잠시 뒤에 다시 시도하세요.';
    case 422:
      return '아이디와 비밀번호를 모두 입력하세요.';
    case 0:
    case 503:
      return '서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도하세요.';
    default:
      return error.message || '로그인에 실패했습니다.';
  }
}
