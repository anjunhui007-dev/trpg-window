# TRPG Window 시트 명령 연결

이 연결은 다음 작업을 처리합니다.

- Gemini API 키를 브라우저에 노출하지 않고 왼쪽 GM 채팅을 중계합니다.
- 비공개 `TRPG_COMMANDS` 탭에서 `pending` 명령을 읽습니다.
- 명령 처리 상태를 `processing → applied` 또는 `processing → failed`로 기록하고 `result_json`, `processed_at`을 채웁니다.
- 웹앱에서 만든 캐릭터를 `TRPG_CHARACTERS` 탭에 등록합니다. GM은 캐릭터 이름으로 행을 찾고 정확한 `character_id`를 사용할 수 있습니다.
- 캐릭터 삭제 시 `TRPG_COMMANDS`와 `TRPG_CHARACTERS`에서 같은 `character_id`를 가진 행만 삭제합니다. 다른 캐릭터의 행과 `character_id`가 비어 있는 공용 행은 유지합니다.

## 한 번만 설정하기

1. `아르켈리온` Google Sheet에서 **확장 프로그램 → Apps Script**를 엽니다.
2. 기본 `Code.gs` 내용을 이 폴더의 `Code.gs` 내용으로 교체하고 저장합니다.
3. 함수 목록에서 `configureWriteToken`을 선택해 실행하고 권한을 승인합니다.
4. 20자 이상의 임의 보안 토큰을 입력합니다.
5. Google AI Studio에서 Gemini API 키를 만든 뒤 함수 목록에서 `configureGeminiApiKey`를 실행해 키를 저장합니다.
6. **배포 → 새 배포 → 웹 앱**을 선택합니다.
7. 실행 사용자는 **나**, 액세스 권한은 **모든 사용자**로 설정하고 배포합니다.
8. 생성된 `/exec` 웹 앱 주소를 TRPG Window의 **설정 → 시트 명령 연결**에 입력합니다.
9. 같은 보안 토큰을 앱 설정에도 입력하고 저장합니다.

Apps Script를 수정했다면 **배포 관리 → 수정 → 새 버전**으로 다시 배포해야 변경 내용이 반영됩니다.

## 명령 대상 규칙

- `upsert_character`에서 `character_id`가 payload의 `id`와 같으면 등장인물 ID로 취급하며 현재 활성 세이브에 적용합니다. 예: `npc_riena_ersil`.
- 특정 플레이어 세이브만 대상으로 할 때는 payload에 `targetSaveId`를 넣습니다.
- 이전 형식 호환을 위해 `character_id`가 `character_...` 형식이면 플레이어 세이브 ID로도 인식합니다.
- 활성 세이브가 없으면 명령을 소비하지 않고 `pending`으로 둡니다.
