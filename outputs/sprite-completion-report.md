# 180종 스프라이트 확보 및 실제 검증 결과

검사 시각: 2026-10-09T06:38:01.995Z. **정면 180/180, 후면 180/180. 실패한 포켓몬: 없음.**

| 항목 | 수정 전 | 수정 후 |
|---|---:|---:|
| 정면 실제 PNG | 52/180 | 180/180 |
| 후면 실제 PNG | 52/180 | 180/180 |
| 성공 이미지 합계 | 104/360 | 360/360 |
| 파일 누락·실패 | 256 | 0 |
| 기존 52종 파일 변경 | — | 0 |

## 누락 원인과 수정

128종 모두 이전의 커뮤니티 작품 수집 필터에서 제외되어 로컬 PNG와 manifest 항목이 생성되지 않았습니다. 당시 잘못된 URL·대소문자·포켓몬 ID·네트워크 차단으로 분류할 기록은 없었습니다. 누락된 로컬 주소는 Vite에서 HTTP 200 text/html을 반환했으며 PNG로 디코딩되지 않았습니다.

[수정 전 52종의 이름·정면/후면 경로·출처·로딩 결과와 누락 128종 전체 목록](sprite-baseline-52.md)은 별도로 보존했습니다.

추가 128종의 256개 PNG를 PokeAPI의 문서화된 기본 경로에서 받아 로컬에 저장했습니다. 모든 이미지 요청은 HTTP 200 / image/png였습니다. 저장 전에 PNG 바이트·실제 Chrome 디코딩·크기·투명 픽셀을 제외한 내용과 PokeAPI 종 카탈로그의 전국도감 번호·식별자를 확인했습니다. 소스 커밋은 35fdbe9bdec8f519f882c3edc3c0185f08af4d86이며, 파일은 수정 없이 복사했습니다.

피카츄 #25, 거북왕 #9, 한카리아스 #445, 팬텀 #94, 프레프티르 #683의 정면/후면 10개를 먼저 확보해 로컬 HTTP·디코딩·표시를 검증하고 직접 이미지 시트를 확인한 다음 같은 절차로 전체에 적용했습니다.

로딩 오류 뒤 같은 URL이 복구되어도 이전 실패 커서 때문에 대체 그림이 남는 버그를 수정했습니다. 컴포넌트는 현재 검증된 첫 번째 이미지를 사용합니다. 최초 검사 중에는 로딩 표시를 사용하며 실제 검증 실패 시에만 대체 그림을 표시합니다.

## 실제 전체 검사

- 내부 ID / 전국도감 번호: 각각 서로 다른 180개.
- 로컬 정면·후면 360개: HTTP 200, image/png, 실제 디코딩 및 출처·이름·도감 번호·SHA-256 일치.
- 실제 도감 UI: 180개 정상 이미지, 대체 그림 0개, ID 매핑 불일치 0개.
- 전체 정면/후면 이미지 시트도 직접 확인했습니다. 후면 자리에 정면을 대체한 것을 성공으로 계산하지 않았습니다.
- 실패 포켓몬 목록: **없음**. 실패 원인 목록: 해당 없음 (현재 누락·HTTP·디코딩·ID 불일치 모두 0)。

## 변경 파일

- public/sprites/front/, back/: 새 128종의 실제 PNG 256개 추가. 기존 52종의 104개는 해시 비교로 보존을 확인했습니다.
- public/sprites/manifest.json, attribution.json, CREDITS.md, licenses/PokeAPI-sprites-LICENCE.txt: 검증된 360개 등록과 각 출처·고지·원문 URL·커밋·파일 해시.
- scripts/supplement-sprites.mjs: PokeAPI 획득·종 ID 확인·디코딩·출처 기록. assets:supplement-pilot / assets:supplement 명령 추가.
- scripts/audit-sprites.mjs: 새 5종 파일럿, 전체 파일·HTTP·출처 검사, 실제 180종 도감 표시 검사.
- scripts/sprite-baseline.mjs: 기존 52종과 누락 128종의 목록·원인 보존.
- scripts/acquire-sprites.mjs: 커뮤니티 재수집 시 추가 출처의 별도 고지 보존.
- src/components/PokemonArtwork.tsx: 실패 커서 제거와 정상 URL 복구, 최초 로딩 표시.
- src/App.tsx, src/styles.css, src/App.test.tsx: 로딩 상태·혼합 출처 고지와 관련 UI 확인.
- scripts/browser-sprite-errors.mjs, browser-sprite-scenes.mjs: 같은 URL 복구와 전체 360개 빌드 결과 검사.
- README.md, THIRD_PARTY_NOTICES.md, docs/sprite-sources.md, public/sprites/README.md: 현재 범위와 이용 고지 반영.

전투 엔진과 기존 애니메이션 코드는 변경하지 않았습니다. 실제 싱글 턴 진행과 교체, 더블 행동, 모바일 화면으로 유지 동작을 확인했습니다.

## 실행한 검증

- npm test: 13개 파일 / 95개 테스트 통과.
- npm run build: TypeScript / Vite 프로덕션 빌드 통과.
- npm run assets:index: 실제 디코딩된 360개 등록, 누락·손상 0, 종료 코드 0.
- node scripts/audit-sprites.mjs --supplement-pilot: 새 5종 정면·후면 10/10 성공.
- node scripts/audit-sprites.mjs --require-complete: 전체 360/360 성공, 브라우저 오류 0.
- npm run test:browser: 팀 저장·싱글 5턴·기술/HP·교체·더블·애니메이션·모바일 통과.
- npm run test:assets: 폴더 가져오기·PNG 검사·IndexedDB 복원·정면 대체·누락 표시 통과. 테스트용 그림은 실물 이미지 성공 수에 포함하지 않았습니다.
- npm run test:sprite-errors: 9개 오류/복구 사례 통과. HTTP 404, 200 HTML, 손상 PNG, 잘못된 ID, 같은 URL 복구, 손상된 캐시와 하위 경로 포함.
- npm run test:sprite-scenes: 빌드된 게임의 실제 정면/후면, 교체, 더블 정상 이미지 4개 / 대체 0개, 상태창 겹침 없음, 모바일 확인.

## 출처와 이용 조건

기존 PMDCollab 52종에는 CC BY-NC 4.0 조건과 저작자·변경 사항 고지를 유지했습니다. 추가 PokeAPI 128종은 저장소 README의 앱용 직접 다운로드 안내에 따라 기본 PNG를 사용했습니다. 저장소 고지는 CC0 1.0이지만 이미지 저작권은 The Pokémon Company라고 명시되어 있어 캐릭터 그림 자체를 퍼블릭 도메인으로 주장하지 않습니다. 전체 고지 원문과 개별 출처는 public/sprites/CREDITS.md 및 licenses/에 있습니다.

두 출처의 그림은 비율과 시점이 다를 수 있습니다. 런타임은 외부 네트워크 없이 로컬 파일을 사용합니다. 정상 파일이 삭제되거나 가져온 파일이 손상된 경우에만 경고와 대체 표시가 적용됩니다.

## 자료와 실행

[전체 360개 개별 검사 JSON](sprite-audit.json) · [요약과 실패 목록 JSON](sprite-completion-summary.json) · [수정 전 52종/누락 128종 목록](sprite-baseline-52.md) · [새 5종 파일럿](sprites-supplement-pilot.png) · [전체 정면·후면 이미지](sprites-verified.png) · [더블 배틀 화면](sprite-battle-double.png) · [모바일 화면](sprite-battle-mobile.png)

서버가 실행 중이면 게임을 새로고침하세요. 새로 실행하려면 프로젝트 폴더에서 npm run dev를 실행하고 터미널에 표시되는 주소를 여세요.
