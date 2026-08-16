# Apple Pro Video MCP 사용 가이드

Final Cut Pro의 FCPXML 작업과 Apple Motion 템플릿 조사를 위한 로컬 MCP 서버입니다.

> 현재 버전은 MVP입니다. FCPXML 생성·검사·열기와 Motion 템플릿 읽기를 지원합니다. Motion 프로젝트 수정 및 설치는 실제 Motion/Final Cut Pro 왕복 검증 전까지 의도적으로 비활성화되어 있습니다.

## 현재 제공되는 도구

| 도구 | 기능 |
|---|---|
| `system_capabilities` | macOS, Node.js, Final Cut Pro, Motion, 보조 명령 및 템플릿 경로 확인 |
| `fcpxml_validate` | FCPXML 문법, 루트·버전, 리소스 ID, 참조, 시간 값 검사 |
| `fcpxml_inspect` | 프로젝트·이벤트·클립·타이틀·마커·리소스·길이 요약 |
| `fcpxml_create_project` | 로컬 미디어 파일 목록으로 프레임 단위 FCPXML 프로젝트 생성 |
| `finalcut_open_fcpxml` | `.fcpxml` 또는 `.fcpxmld`를 Final Cut Pro에서 열기 |
| `motion_list_templates` | 설치된 Motion 타이틀·전환·효과·제너레이터 검색 |
| `motion_inspect_template` | Motion XML 메타데이터와 publish된 것으로 보이는 파라미터 조사 |

## 준비물

- Node.js 20 이상
- Final Cut Pro 실행 기능을 사용할 경우 macOS와 Final Cut Pro
- Motion 템플릿을 실제 설치 경로에서 조사할 경우 macOS와 Motion

FCPXML을 생성하거나 inline XML을 검사하는 기능은 Final Cut Pro가 설치되지 않아도 사용할 수 있습니다.

## 설치

초기 PR이 merge되기 전에는 기능 브랜치를 사용합니다.

```bash
git clone https://github.com/kwd421/Apple-Pro-Video-MCP.git
cd Apple-Pro-Video-MCP
git switch agent/initial-mcp

npm install
npm run check
```

`npm run check`가 성공하면 설치와 테스트가 완료된 것입니다.

## MCP 클라이언트에 등록

`src/index.js`의 **절대 경로**를 설정에 넣습니다.

```json
{
  "mcpServers": {
    "apple-pro-video": {
      "command": "node",
      "args": [
        "/Users/사용자이름/Developer/Apple-Pro-Video-MCP/src/index.js"
      ]
    }
  }
}
```

저장소의 `mcp-config.example.json`도 같은 형식입니다. 설정을 저장한 뒤 MCP 클라이언트를 완전히 종료하고 다시 실행합니다.

## 연결 확인

MCP 클라이언트에서 다음과 같이 요청합니다.

```text
system_capabilities를 실행해서
Final Cut Pro와 Motion 설치 여부,
사용 가능한 Motion 템플릿 경로를 알려줘.
```

도구 목록에 `system_capabilities`, `fcpxml_validate`, `fcpxml_create_project` 등이 표시되면 연결된 것입니다.

직접 검사하려면 다음 명령을 사용할 수 있습니다.

```bash
npm run inspect
```

공식 MCP Inspector가 열리면 서버에 연결한 뒤 Tools 탭에서 각 도구를 호출할 수 있습니다.

## 기존 FCPXML 검사

```text
/Users/me/Desktop/sample.fcpxml을 검사해줘.
깨진 리소스 참조, 프로젝트 이름, 클립 수,
타이틀과 마커 수, 시퀀스 길이를 알려줘.
```

`fcpxml_validate`와 `fcpxml_inspect`에는 다음 두 입력 방식 중 하나만 전달합니다.

- `path`: 절대 경로 또는 `~/`로 시작하는 경로
- `xml`: inline FCPXML 문자열

`.fcpxml` 파일과 `.fcpxmld` 번들을 모두 읽을 수 있습니다. `.fcpxmld`에서는 `Info.fcpxml`을 우선 사용합니다.

## 새 FCPXML 프로젝트 생성

자연어 예시:

```text
/Users/me/Desktop/interview-selects.fcpxml을 만들어줘.
프로젝트 이름은 Interview Selects,
이벤트 이름은 AI Edits,
프레임레이트는 29.97,
해상도는 1920x1080이야.

클립 순서는 다음과 같아.
1. /Users/me/Movies/A001.mov의 처음 12.5초
2. /Users/me/Movies/A002.mov의 3초 지점부터 8초

기존 파일이 있으면 덮어쓰지 마.
```

도구 인자 형태:

```json
{
  "outputPath": "/Users/me/Desktop/interview-selects.fcpxml",
  "projectName": "Interview Selects",
  "eventName": "AI Edits",
  "frameRate": "29.97",
  "width": 1920,
  "height": 1080,
  "overwrite": false,
  "clips": [
    {
      "path": "/Users/me/Movies/A001.mov",
      "durationSeconds": 12.5
    },
    {
      "path": "/Users/me/Movies/A002.mov",
      "sourceStartSeconds": 3,
      "durationSeconds": 8
    }
  ]
}
```

지원 프레임레이트:

```text
23.976, 24, 25, 29.97, 30, 50, 59.94, 60
```

클립 길이와 시작점은 가장 가까운 프레임으로 맞춰지고 FCPXML에는 정확한 유리수 시간으로 기록됩니다.

미디어 경로는 기본적으로 실제 파일이어야 합니다. 오프라인 미디어 프로젝트를 의도적으로 만들 때만 `allowMissingMedia: true`를 사용합니다.

기존 출력 파일은 `overwrite: true`를 명시하지 않는 한 보존됩니다.

## Final Cut Pro에서 열기

FCPXML을 만든 다음 다음과 같이 요청합니다.

```text
/Users/me/Desktop/interview-selects.fcpxml을
Final Cut Pro에서 열어줘.
```

`finalcut_open_fcpxml`은 macOS의 `/usr/bin/open`을 argument array 방식으로 호출하며, 사용자 경로를 shell 문자열에 삽입하지 않습니다.

Final Cut Pro의 import 창이 열린 뒤에는 라이브러리와 이벤트 위치를 직접 확인하고 import를 완료합니다.

## Motion 템플릿 목록 확인

```text
설치된 Motion 타이틀 템플릿을 최대 100개 보여줘.
경로와 카테고리도 함께 알려줘.
```

기본 검색 경로:

```text
~/Movies/Motion Templates.localized
~/Movies/Motion Templates
/Library/Application Support/Final Cut Pro/Templates.localized
/Library/Application Support/Final Cut Pro/Templates
```

지원 확장자:

| 확장자 | 종류 |
|---|---|
| `.moti` | 타이틀 |
| `.motr` | 전환 |
| `.moef` | 효과 |
| `.motn` | 제너레이터 |

심볼릭 링크는 따라가지 않습니다.

## Motion 템플릿 조사

```text
다음 Motion 타이틀을 검사해서
프로젝트 메타데이터와 publish된 것으로 보이는 파라미터를 알려줘.

/Users/me/Movies/Motion Templates.localized/Titles/Custom/Lower Third/Lower Third.moti
```

현재 이 기능은 읽기 전용입니다. Motion 문서를 임의로 수정하거나 템플릿 폴더에 설치하지 않습니다.

## 안전 동작

- FCPXML 입력은 10MB로 제한됩니다.
- Motion 템플릿 입력은 20MB로 제한됩니다.
- custom XML entity와 외부·내부 subset DTD는 거부됩니다.
- 파일 인자는 절대 경로 또는 `~/` 경로여야 합니다.
- 기존 FCPXML은 명시적인 `overwrite: true` 없이는 덮어쓰지 않습니다.
- 앱 실행 시 shell interpolation을 사용하지 않습니다.
- 재귀 검색은 심볼릭 링크를 건너뛰고 깊이·결과 수 제한을 적용합니다.

이 보호 장치는 실수를 줄이기 위한 것이며 보안 sandbox는 아닙니다. 편집 프로젝트에 적절한 macOS 사용자 권한으로 실행하세요.

## 개발용 명령

```bash
npm install
npm run lint
npm test
npm run check
npm run inspect
```

## 현재 검증 범위

자동 테스트는 다음을 확인합니다.

- XML parser와 위험한 entity 거부
- 29.97fps의 정확한 유리수 시간 변환
- 클립 offset·start·duration 생성
- 기존 출력 보호
- 중복 리소스 ID와 깨진 참조 탐지
- `.fcpxmld` 번들 읽기
- Motion 템플릿 검색과 읽기
- 실제 stdio MCP 초기화, 7개 도구 조회, 도구 호출

아직 자동 테스트로 증명되지 않은 부분:

- 사용자의 Final Cut Pro 버전에서 생성된 프로젝트가 실제로 import되는지
- Final Cut Pro에서 다시 export했을 때 구조와 시간이 보존되는지
- 실제 Motion 버전별 XML 필드가 동일한 의미를 갖는지

다음 검증은 Mac에서 두 클립짜리 FCPXML을 생성해 Final Cut Pro로 import한 뒤 다시 export하여 두 파일을 비교하는 것입니다.
