# Hz 카페 대문

`Hz Artists` 대문 이미지를 카드 단위로 자르고, 각 카드에 SOOP 방송국 링크를 건 HTML.

```
cafe/                     이미지 19조각 + 원본 1장
daemun-table.html         테이블 방식 (메인)
daemun-imagemap.html      이미지맵 방식 (한 장 + area)
preview-local.html        로컬에서 열어보는 용도 (카페에 붙여넣지 말 것)
```

## 1. 이미지 올리기

두 가지 중 하나를 고르면 된다.

### A. hzSite에 같이 올리기 (권장)

`cafe` 폴더를 그대로 hzSite 리포의 `public/` 밑에 넣고 푸시한다.

```
public/cafe/01-header.png
public/cafe/02-heochuin-a.png
...
```

배포되면 `https://hzsite.pages.dev/cafe/01-header.png` 로 열린다.
HTML이 이미 이 주소를 보고 있어서 붙여넣기만 하면 끝.

> Pages 프로젝트 이름을 `hzsite` 가 아닌 다른 걸로 만들었다면
> HTML 안의 `https://hzsite.pages.dev/cafe` 를 실제 주소로 바꿔야 한다.

### B. 네이버에 직접 올리기

대문 편집기에서 `사진` 버튼으로 `cafe` 폴더의 19장을 올린 뒤,
`html` 체크박스를 켜서 각 이미지의 `src`(`https://cafeptthumb-phinf.pstatic.net/...`)를 복사하고
HTML 안의 해당 파일명 자리에 바꿔 넣는다. 손이 많이 가지만 외부 주소에 의존하지 않는다.

## 2. 카페 주소 바꾸기

로고 카드(하나망 옆)가 카페 홈으로 가도록 되어 있는데 주소가 비어 있다.
HTML 안의 이 부분을 실제 카페 주소로 교체할 것.

```
https://cafe.naver.com/여기에_카페주소
```

## 3. 붙여넣기

카페 관리 → 꾸미기 → 카페 대문 → 스마트 에디터에서
오른쪽 위 **`html` 체크박스를 켜고** `daemun-table.html` 내용을 통째로 붙여넣는다.
체크를 다시 끄면 결과가 보이고, `미리보기`로 확인한 뒤 `바로적용`.

## 두 버전 중 무엇을 쓸까

**`daemun-imagemap.html` 을 먼저 시도해볼 것.** 이미지 한 장만 올리면 되고 제일 간단하다.
미리보기에서 카드를 눌렀을 때 방송국으로 넘어가면 그대로 쓰면 된다.

네이버가 `<map>`/`<area>` 를 지워버려서 클릭이 안 먹으면 `daemun-table.html` 로 간다.
이쪽은 `<table>` + `<a>` + `<img>` 만 써서 에디터가 태그를 정리해도 살아남는다.

## 링크 연결 상태

| 카드 | SOOP 아이디 |
|---|---|
| 허추인 | ssad3267 |
| 감동쌤 | qkrrjsdn121 |
| 유필철 | jerichoyoo |
| 깅도일 | jy720923 |
| 깅두부 | imyourr |
| 숫장 | jjrroesem |
| 초이 | chohee13 |
| 나하로 | cso1216 |
| 뽐나연 | imyeon06 |
| 춘빵이 | s970824 |
| 키젤 | rydwl0214 |
| 하나망 | hanamang |
| Hz 로고 | 카페 홈 (주소 입력 필요) |
| 슈힌 | shuhin0817 |
| 쿠룽 | kururung |
| 해또잉 | haettoing |
| 해레느 | thal1713 |

허추인 카드는 세로로 긴 카드라 이미지가 위아래 두 장으로 나뉘어 있는데,
두 장 다 같은 주소로 연결돼서 어디를 눌러도 똑같이 동작한다.

## 나중에 디자인을 고치면

피그마에서 835×1417 로 다시 뽑아서 같은 좌표로 자르면 된다.
카드 격자는 좌우 여백 36px, 카드 폭 178px, 카드 간격 17px, 행 간격 17px 기준이다.
