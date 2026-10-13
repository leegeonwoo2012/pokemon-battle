# 스프라이트 수정과 실제 검사 결과

후속 수정 완료: 현재 정면 180/180, 후면 180/180이며 실패 0개입니다. 최신 검사와 수정 전 52종·누락 128종 목록은 [sprite-completion-report.md](sprite-completion-report.md)를 확인하세요. 아래는 이전 52종 확보 시점의 기록입니다.

검사일: 2026-10-09. **부분 확보: 180종 중 52종의 정면·후면 104개. 128종의 256개 파일은 누락 상태입니다.**

## 원인

1. 처음의 `public/sprites/manifest.json`은 빈 목록이었고 실제 정면·후면 PNG도 없었습니다. 런타임에서 외부 이미지 API를 요청하는 구조가 아니었습니다.
2. 도감 번호·방향과 다른 manifest 경로가 허용되고, 이미지 디코딩 전에 준비 상태로 집계될 수 있었습니다. 하위 경로 배포에서 절대 `/sprites/` 경로가 어긋났고, 일부 로딩 오류는 조용히 처리되었습니다.
3. Vite는 없는 PNG 주소에 **HTTP 200 / text/html**을 반환할 수 있습니다. 이를 이미지 요청 성공으로 해석하면 안 됩니다. 파일 존재 여부, MIME, PNG 바이트와 실제 디코딩을 함께 검사했습니다.

## 실제 결과

| 검사 | 성공 | 누락·실패 | 확인 방법 |
| --- | ---: | ---: | --- |
| 내부 ID와 전국도감 번호 | 180 | 0 | 모두 서로 다른 ID와 도감 번호 |
| 대표 5종의 정면·후면 | 10 | 0 | 파일·HTTP·MIME·디코딩·출처 해시·이미지 시트 |
| 전체 정면 | 52 | 128 | 실제 로컬 파일과 브라우저 응답 |
| 전체 후면 | 52 | 128 | 실제 후면 프레임, 정면 대체는 성공에 미포함 |
| 전체 360개 경로 | 104 | 256 | 누락 256, 존재하지만 손상된 파일 0 |
| PokeAPI 외부 진단 주소 | 10 | 0 | HTTP 200 / image/png / 실제 디코딩; 배포본에 포함하지 않음 |
| 커뮤니티 소스 HTTP 요청 | 161 | 0 | 전부 200, 그중 실제 PNG atlas 52개 |

대표 5종은 리자몽 #6, 이상해꽃 #3, 마기라스 #248, 라프라스 #131, 루카리오 #448입니다. 이 10개를 먼저 검증하고 직접 이미지 시트를 확인한 뒤 동일한 절차로 180종을 처리했습니다. 전체 52종 이미지 시트도 직접 확인했습니다. 성공 파일은 종 이름·영문 이름·ID·전국도감 번호·출처 SHA-256·로컬 응답 SHA-256을 대조했습니다.

외부 진단 주소는 #25, #6, #9, #3, #445의 PokeAPI 정면·후면입니다. 외부 HTTP 실패와 로컬 파일 누락을 구분했습니다. 이번 전체 검사에서 로컬 실패는 모두 `LOCAL_FILE_MISSING`이며 누락 URL의 실제 응답은 200 HTML이었습니다.

## 수정한 코드와 리소스

- `src/presentation/sprites.ts`: HTTP·MIME·PNG 바이트·실제 디코딩 검사, 캐시 재검증, 오류 진단, 실패한 렌더링을 성공 집계에서 제거, 중복 키와 초기 로딩 처리.
- `src/presentation/sprite-validation.ts`: 종·도감 번호·방향·파일 경로 일치 검사와 Vite 배포 경로 지원.
- `src/components/PokemonArtwork.tsx`: 실제 정면/후면 이미지, 같은 종의 정면 대체를 명시, 종 교체 시 이전 로딩 실패 상태 초기화. 누락 시 원본 없음 안내와 전체 이름·도감 번호·직접 만든 SVG 표시.
- `src/App.tsx`: 검증된 정면/후면 수, 오류 상세, 다시 검사, 진단 JSON 다운로드와 저작자 고지.
- `src/styles.css`: 대체 이미지 스타일, 큰 후면 이미지가 정보창에 가려지지 않도록 크기 제한.
- `public/sprites/front/`, `back/`: 104개의 실제 PNG. `manifest.json`, `attribution.json`, `CREDITS.md`, `licenses/` 보존.
- `scripts/acquire-sprites.mjs`: 고정 커밋의 커뮤니티 작품과 저작자를 검토하고 실제 atlas를 다운로드·디코딩·방향 프레임 추출.
- `scripts/verify-sprites.mjs`, `audit-sprites.mjs`: 파일의 실제 디코딩과 전체 경로·응답·출처·이름 대조.
- 신규 단위 테스트와 `browser-sprite-errors.mjs`, `browser-sprite-scenes.mjs`. 기존 가져오기/배틀 검사도 현재 리소스에 맞게 수정.
- `README.md`, `THIRD_PARTY_NOTICES.md`, `docs/sprite-sources.md`: 실제 확보 범위와 검사·이용 조건 기록.

전투 계산과 CPU 엔진은 변경하지 않았습니다.

## 출처와 남은 범위

PMDCollab/SpriteCollab 커밋 `47e5b9920bc5b2b491c53b18076300dc6813f103`의 **CC BY-NC 4.0 커뮤니티 작품**입니다. 비상업적 사용, 저작자 표시와 변경 사항 고지가 필요합니다. 각 그림의 tracker와 credits 이력을 확인하고 공식 CHUNSOFT 원본과 다른 폼은 제외했습니다. 동일 종의 Alternate 그림을 포함해 52종을 확보했습니다. 그림은 PMD 스타일 Idle의 South/North 첫 프레임으로 본가 배틀 스프라이트의 시점·비율과 차이가 있습니다. Pokémon 캐릭터와 상표 권리는 각 권리자에게 있습니다.

나머지 128종은 검토한 커밋에서 조건을 통과한 기본 종 그림을 확보하지 못했습니다. 피카츄·거북왕·한카리아스 등도 이 누락 목록에 포함됩니다. 누락 파일과 임시 대체 그림을 로딩 성공으로 세지 않습니다. 권한 있는 사용자 파일은 설정에서 가져올 수 있으며, 임의로 이름을 바꾼 파일의 종 일치는 직접 확인해야 합니다.

## 실행한 검증

- `npm test`: **13개 파일, 95개 테스트 통과**.
- `npm run build`: TypeScript와 Vite 프로덕션 빌드 통과.
- `npm run assets:pilot`: 대표 5종 정면·후면 10/10 통과.
- `npm run assets:audit`: 104 성공, 256 누락, 브라우저 오류 0.
- `npm run assets:index`: 실제 디코딩된 104개 등록, 누락 256 / 손상 0. 전체가 미완성이라 **의도된 종료 코드 1**.
- `npm run test:assets`: PNG 가져오기, IndexedDB 복원, 같은 종 정면 대체, 최종 누락 표시 통과. 진단용 테스트 그림을 실물 그림 성공 수로 세지 않습니다.
- `npm run test:sprite-errors`: 404, 200 HTML, 손상 PNG, 다른 도감 번호, 정면 대체 표시, SVG 대체, 수정 후 재검사, 손상 캐시 재로딩 통과. `/arena/` 하위 경로도 확인.
- `npm run test:browser`: 팀 편성·저장, 실제 싱글 5턴, 기술/HP/교체, 더블 행동, 모바일, 오류 0.
- `npm run test:sprite-scenes`: 빌드된 게임에서 실제 후면 #6/#3와 정면 #248, 교체 후 이미지 갱신, 더블 배틀, 정보창 겹침 없음, 모바일 확인.

## 확인 자료

- [전체 360개 검사 JSON](sprite-audit.json)
- [실제 소스 HTTP 요청과 종별 제외 사유](sprite-source-audit.json)
- [대표 5종 검사 JSON](sprite-pilot.json)
- [52종 정면·후면 이미지 시트](sprites-verified.png)
- [싱글 배틀 캡처](sprite-battle-single.png)
- [더블 배틀 캡처](sprite-battle-double.png)
- [모바일 캡처](sprite-battle-mobile.png)
- [브라우저 오류 처리 검사](sprite-error-tests.json)
- [프로덕션 화면 검사](sprite-scene-tests.json)

게임 실행: 프로젝트 루트에서 `npm ci` 후 `npm run dev`. 이미지 검사는 `npm run assets:audit`. 설치된 Chrome/Edge가 필요하며 자동 탐색이 안 되면 `CHROME_PATH`를 지정합니다.
