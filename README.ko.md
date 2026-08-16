# Apple Pro Video MCP 사용 가이드

Final Cut Pro의 FCPXML 작업, 투명한 편집 후보 점수화, 편집 계획 재배치, SRT 자막 생성, Apple Motion 템플릿 읽기를 제공하는 로컬 MCP 서버입니다.

> **현재 상태:** 저장소 코드와 MCP 프로토콜은 자동 테스트로 검증합니다. 실제 Final Cut Pro import/export 및 Motion 왕복 호환성은 편집용 Mac에서 fixture가 확보되기 전까지 `미검증`입니다.

[편집 판단·자막 상세 가이드](docs/EDITING_PIPELINE.ko.md)

## 제공 도구

| 도구 | 기능 |
|---|---|
| `system_capabilities` | macOS, Node.js, Final Cut Pro, Motion 및 템플릿 경로 확인 |
| `highlight_rank` | 모델·사람이 평가한 후보를 프로필별 가중치와 감점으로 순위화 |
| `edit_plan_build` | 선택 구간을 타임라인으로 이어 붙이고 단어 타임스탬프를 재배치 |
| `subtitle_segment` | 단어 타임스탬프를 읽기 좋은 자막 큐와 SRT 문자열로 분할 |
| `subtitle_write_srt` | 자막 큐를 보호된 `.srt` 파일로 저장 |
| `fcpxml_validate` | FCPXML 문법, 루트·버전, 리소스 ID, 참조, 시간 값 검사 |
| `fcpxml_inspect` | 프로젝트·이벤트·클립·타이틀·마커·리소스·길이 요약 |
| `fcpxml_create_project` | 로컬 미디어 구간 목록으로 프레임 단위 FCPXML 프로젝트 생성 |
| `finalcut_open_fcpxml` | `.fcpxml` 또는 `.fcpxmld`를 Final Cut Pro에서 열기 |
| `motion_list_templates` | 설치된 Motion 타이틀·전환·효과·제너레이터 검색 |
| `motion_inspect_template` | Motion XML 메타데이터와 publish 후보 조사 |

`highlight_rank`와 자막 도구는 영상을 직접 보거나 음성을 전사하지 않습니다. 모델, 사람, 외부 ASR이 제공한 평가와 단어별 타임스탬프를 검증하고 변환합니다.

## 설치

```bash
git clone https://github.com/kwd421/Apple-Pro-Video-MCP.git
cd Apple-Pro-Video-MCP
git switch agent/initial-mcp

npm install
npm run check
```

Node.js 20 이상이 필요합니다.

## MCP 클라이언트 등록

`which node`와 `pwd`로 절대 경로를 확인한 뒤 설정합니다.

```json
{
  "mcpServers": {
    "apple-pro-video": {
      "command": "/opt/homebrew/bin/node",
      "args": [
        "/Users/사용자이름/Developer/Apple-Pro-Video-MCP/src/index.js"
      ]
    }
  }
}
```

설정을 저장한 뒤 MCP 클라이언트를 완전히 종료하고 다시 실행합니다.

Inspector로 확인:

```bash
npm run inspect
```

`system_capabilities`를 실행하고 11개 도구가 표시되면 연결된 것입니다.

## 기본 FCPXML 생성

```text
/Users/me/Desktop/interview-selects.fcpxml을 만들어줘.
프로젝트 이름은 Interview Selects,
프레임레이트는 29.97로 해줘.

/Users/me/Movies/A001.mov의 처음 12.5초 다음에
/Users/me/Movies/A002.mov의 3초 지점부터 8초를 이어 붙여줘.
기존 파일은 덮어쓰지 마.
```

지원 프레임레이트:

```text
23.976, 24, 25, 29.97, 30, 50, 59.94, 60
```

시작점과 길이는 가장 가까운 프레임에 맞춰지고 FCPXML에는 정확한 유리수 시간으로 기록됩니다.

## 편집 판단과 자막

현재 권장 흐름:

```text
외부 전사/분석
  → highlight_rank
  → edit_plan_build
      ├─ fcpxmlClips → fcpxml_create_project
      └─ timelineWords → subtitle_segment → subtitle_write_srt
```

예를 들어 모델에게 다음처럼 요청할 수 있습니다.

```text
전사 결과에서 인터뷰 쇼츠 후보를 평가해 60초 안으로 골라줘.
선택 구간을 Hook → 설명 → 결론 순서로 edit_plan_build에 넣어.
반환된 fcpxmlClips로 FCPXML을 만들고,
timelineWords로 한국어 2줄 자막을 만들어 같은 이름의 SRT로 저장해.
기존 파일은 덮어쓰지 마.
```

점수 항목, 프로필, 감점 규칙, JSON 예제와 한국어 자막 기본 설정은 [`docs/EDITING_PIPELINE.ko.md`](docs/EDITING_PIPELINE.ko.md)에 있습니다.

## Motion

현재 Motion 기능은 읽기 전용입니다. 실제 Motion 프로젝트와 Final Cut 왕복 fixture 없이 추측한 XML 구조를 수정하거나 설치하지 않습니다.

## 안전 동작

- FCPXML 입력은 10MB, Motion 입력은 20MB로 제한됩니다.
- custom XML entity와 외부·내부 subset DTD를 거부합니다.
- 파일 인자는 절대 경로 또는 `~/` 경로여야 합니다.
- 기존 `.fcpxml`과 `.srt`는 `overwrite: true` 없이는 교체하지 않습니다.
- 앱 실행은 shell 문자열이 아닌 executable + argument array 방식입니다.
- 재귀 검색은 심볼릭 링크를 건너뛰고 깊이·결과 수 제한을 적용합니다.

이 보호 장치는 실수를 줄이기 위한 것이며 보안 sandbox는 아닙니다.

## 검증 범위

자동 테스트는 다음을 확인합니다.

- XML parser와 위험한 entity 거부
- 프레임 시간 계산과 FCPXML 생성
- 기존 FCPXML/SRT 덮어쓰기 방지
- Motion 템플릿 검색과 읽기
- 후보 가중치·감점·겹침 제외
- 선택 구간과 단어 타임스탬프 재배치
- 문장 부호·공백·길이 기반 자막 분할
- SRT 타임코드 생성
- MCP stdio 초기화, 도구 조회, 기존·신규 도구 호출

아직 실제 앱에서 확인해야 하는 부분:

- 생성 FCPXML의 Final Cut Pro import
- SRT와 편집 타임라인의 실제 정렬
- Final Cut에서 다시 export했을 때 의미 보존
- 실제 Motion 버전별 XML 의미

다음 real-app 검증 절차는 [`.claude/skills/fcpxml-roundtrip/SKILL.md`](.claude/skills/fcpxml-roundtrip/SKILL.md)에 있습니다.
