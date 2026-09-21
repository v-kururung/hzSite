// Hz 멤버 목록 — 프론트와 API가 공유하는 단일 소스
// id: SOOP 방송국 아이디 (https://www.sooplive.com/station/{id})
// name: 사이트에 표시할 이름 (비워두면 SOOP 닉네임을 그대로 사용)
// role: 선택. 대표/멤버 등 구분 라벨
// links: 선택. 유튜브·X 주소

export const MEMBERS = [
  { id: 'ssad3267',    name: '허추인', role: '대표', links: {} },
  { id: 'qkrrjsdn121', name: '감동쌤', role: '',     links: {} },
  { id: 'jerichoyoo',  name: '유필철', role: '',     links: {} },
  { id: 'jy720923',    name: '깅도일', role: '',     links: {} },
  { id: 'imyourr',     name: '깅두부', role: '',     links: {} },
  { id: 'jjrroesem',   name: '슷쟝',   role: '',     links: {} },
  { id: 'chohee13',    name: '초이',   role: '',     links: {} },
  { id: 'cso1216',     name: '나하로', role: '',     links: {} },
  { id: 'imyeon06',    name: '뽐나연', role: '',     links: {} },
  { id: 's970824',     name: '춘빵이', role: '',     links: {} },
  { id: 'rydwl0214',   name: '키젤',   role: '',     links: {} },
  { id: 'hanamang',    name: '하나망', role: '',     links: {} },
  { id: 'shuhin0817',  name: '슈힌',   role: '',     links: {} },
  { id: 'kururung',    name: '쿠룽',   role: '',     links: {} },
  { id: 'haettoing',   name: '해또잉', role: '',     links: {} },
  { id: 'thal1713',    name: '해레느', role: '',     links: {} },
];

export const MEMBER_IDS = MEMBERS.map((m) => m.id);

export function findMember(id) {
  return MEMBERS.find((m) => m.id === id) || null;
}
