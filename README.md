# Apple Pro Video MCP

macOS에서 Final Cut Pro의 FCPXML 작업과 Apple Motion 템플릿 조사를 MCP 도구로 제공하는 로컬 stdio 서버입니다.

> **MVP 상태:** FCPXML 생성·구조 검사, Motion 템플릿 읽기, 공식 MCP SDK v2 기반 stdio 서버가 구현되어 있습니다. 실제 Final Cut Pro import/export round trip과 실제 Motion 템플릿 fixture 검증은 편집용 Mac에서 추가로 수행해야 합니다.

## 현재 제공 도구

| 도구 | 기능 | 변경 여부 |
|---|---|---:|
| `system_capabilities` | macOS, Node, Final Cut Pro, Motion, 명령 및 템플릿 폴더 확인 | 읽기 전용 |
| `fcpxml_validate` | XML 구조, FCPXML root/version, ID, 참조, 시간 값 검사 | 읽기 전용 |
| `fcpxml_inspect` | 프로젝트·이벤트·클립·타이틀·마커·리소스 요약 | 읽기 전용 |
| `fcpxml_create_project` | 로컬 미디어 목록으로 FCPXML 1.11 프로젝트 생성 | 파일 생성 |
| `finalcut_open_fcpxml` | `.fcpxml` 또는 `.fcpxmld`를 Final Cut Pro에서 열기 | 앱 실행 |
| `motion_list_templates` | `.moti`, `.motr`, `.moef`, `.motn` 검색 | 읽기 전용 |
| `motion_inspect_template` | Motion XML 메타데이터와 publish 후보 조사 | 읽기 전용 |

Motion 프로젝트 수정·설치는 아직 넣지 않았습니다. 실제 Motion/Final Cut round trip으로 포맷 동작을 검증하기 전까지 읽기 전용으로 유지합니다.

## 요구 사항

- macOS
- Node.js 20 이상
- Final Cut Pro: `finalcut_open_fcpxml`을 사용할 때 필요
- Motion: 실제 설치 템플릿을 조사할 때 필요

서버는 공식 `@modelcontextprotocol/server` v2와 Zod v4를 사용합니다.

## 1. 설치

초기 PR이 병합되기 전에는 기능 브랜치를 사용합니다.

```bash
git clone https://github.com/kwd421/Apple-Pro-Video-MCP.git
cd Apple-Pro-Video-MCP
git switch agent/initial-mcp

npm install
npm run check
```

서버를 직접 실행하려면:

```bash
npm start
```

stdio 서버이므로 시작 후 터미널에서 입력을 기다리는 것이 정상입니다. 프로토콜은 stdout, 진단 로그는 stderr를 사용합니다.

## 2. MCP 클라이언트에 등록

`src/index.js`의 **절대 경로**를 MCP 클라이언트 설정에 넣습니다.

```json
{
  "mcpServers": {
    "apple-pro-video": {
      "command": "node",
      "args": [
        "/Users/YOUR_NAME/Developer/Apple-Pro-Video-MCP/src/index.js"
      ]
    }
  }
}
```

[`mcp-config.example.json`](mcp-config.example.json)도 같은 형태입니다. 설정을 저장한 뒤 MCP 호스트를 완전히 종료했다가 다시 실행합니다.

MCP Inspector로 먼저 확인할 수도 있습니다.

```bash
npm run inspect
```

## 3. 첫 실행

연결된 모델에 다음처럼 요청합니다.

```text
apple-pro-video의 system_capabilities를 실행해서
Final Cut Pro, Motion, 템플릿 폴더가 이 Mac에 있는지 알려줘.
```

정상이라면 플랫폼, Node 버전, 앱 경로, 기본 Motion Templates 폴더가 JSON으로 반환됩니다.

## 4. 기존 FCPXML 검사

```text
/Users/me/Desktop/sample.fcpxml을 validate하고 inspect해줘.
깨진 리소스 참조, 프로젝트 이름, 클립과 타이틀 개수를 알려줘.
```

직접 도구 인자를 쓸 때:

```json
{
  "path": "/Users/me/Desktop/sample.fcpxml"
}
```

`.fcpxmld` 번들도 받을 수 있습니다. 번들 내부의 `Info.fcpxml` 또는 첫 번째 `.fcpxml` 문서를 제한된 깊이로 찾습니다.

XML 문자열을 파일 없이 검사할 수도 있습니다.

```json
{
  "xml": "<!DOCTYPE fcpxml><fcpxml version=\"1.11\"><resources/></fcpxml>"
}
```

`path`와 `xml` 중 정확히 하나만 전달해야 합니다.

## 5. 새 Final Cut 프로젝트 생성

자연어 예시:

```text
/Users/me/Desktop/interview-selects.fcpxml을 만들어줘.
프로젝트 이름은 Interview Selects, 프레임레이트는 29.97.
A001.mov 처음 12.5초 다음에 A002.mov 3초 지점부터 8초를 이어 붙여줘.
기존 파일은 덮어쓰지 마.
```

동일한 `fcpxml_create_project` 인자:

```json
{
  "outputPath": "/Users/me/Desktop/interview-selects.fcpxml",
  "projectName": "Interview Selects",
  "eventName": "AI Edits",
  "frameRate": "29.97",
  "width": 1920,
  "height": 1080,
  "overwrite": false,
  "allowMissingMedia": false,
  "clips": [
    {
      "path": "/Users/me/Movies/A001.mov",
      "durationSeconds": 12.5
    },
    {
      "path": "/Users/me/Movies/A002.mov",
      "sourceStartSeconds": 3,
      "durationSeconds": 8,
      "hasAudio": true
    }
  ]
}
```

지원 프레임레이트:

```text
23.976, 24, 25, 29.97, 30, 50, 59.94, 60
```

중요한 동작:

- 경로는 절대 경로이거나 `~/`로 시작해야 합니다.
- 미디어 파일은 기본적으로 실제 존재해야 합니다.
- 오프라인 미디어 프로젝트를 의도한 경우에만 `allowMissingMedia: true`를 사용합니다.
- `durationSeconds`와 `sourceStartSeconds`는 선택한 프레임레이트의 프레임 경계로 반올림됩니다.
- 기존 출력 파일은 `overwrite: true`가 없으면 보존됩니다.

생성 후 Final Cut에서 열기:

```text
/Users/me/Desktop/interview-selects.fcpxml을 Final Cut Pro에서 열어줘.
```

또는 직접 호출:

```json
{
  "path": "/Users/me/Desktop/interview-selects.fcpxml"
}
```

이 도구는 셸 문자열을 만들지 않고 다음과 동등한 인자 배열 실행을 사용합니다.

```text
/usr/bin/open -a "Final Cut Pro" /absolute/path/interview-selects.fcpxml
```

Final Cut의 import 확인 창에서 사용자가 내용을 확인하고 승인합니다.

## 6. Motion 템플릿 검색과 조사

기본 검색 폴더:

```text
~/Movies/Motion Templates.localized
~/Movies/Motion Templates
/Library/Application Support/Final Cut Pro/Templates.localized
/Library/Application Support/Final Cut Pro/Templates
```

타이틀만 100개까지 찾기:

```json
{
  "kinds": ["title"],
  "maxResults": 100,
  "maxDepth": 8
}
```

특정 폴더만 조사하기:

```json
{
  "roots": [
    "/Users/me/Movies/Motion Templates.localized/Titles"
  ],
  "kinds": ["title"],
  "maxResults": 100
}
```

찾은 템플릿 조사:

```json
{
  "path": "/Users/me/Movies/Motion Templates.localized/Titles/Custom/Lower Third/Lower Third.moti"
}
```

`motion_inspect_template`은 XML root, 템플릿·프로젝트 메타데이터, 태그 개수와 publish 형태의 파라미터 후보를 반환합니다. 파일을 수정하지 않습니다.

## 안전 동작

- FCPXML 입력은 10MB, Motion 템플릿 입력은 20MB로 제한됩니다.
- custom XML entity, 외부 DTD와 내부 subset DTD를 거부합니다.
- 기존 출력 파일을 기본적으로 덮어쓰지 않습니다.
- 비덮어쓰기 저장은 임시 파일과 exclusive hard link로 충돌을 방지합니다.
- 앱 실행은 `execFile` 인자 배열을 사용하며 셸 interpolation을 사용하지 않습니다.
- Motion 폴더 검색은 symbolic link를 따라가지 않습니다.

이는 실수 방지 장치이지 보안 샌드박스는 아닙니다. 편집 프로젝트에 적절한 macOS 계정과 파일 권한으로 실행하세요.

## 문제 해결

서버가 연결되지 않을 때:

```bash
node --version
npm install
npm run check
node /절대/경로/Apple-Pro-Video-MCP/src/index.js
```

Node는 20 이상이어야 하며 MCP 설정에는 절대 경로를 사용하는 편이 안전합니다.

Final Cut이 열리지 않을 때:

```bash
/usr/bin/open -a "Final Cut Pro" "/Users/me/Desktop/test.fcpxml"
```

이 명령이 터미널에서도 실패하면 앱 이름·설치 상태를 먼저 확인합니다.

Motion 템플릿이 안 보일 때는 Finder에서 실제 폴더가 `Motion Templates.localized`인지 확인하고 `roots`에 절대 경로를 직접 전달합니다.

## 개발과 검증

```bash
npm install
npm run lint
npm test
npm run check
```

자동 테스트는 XML parser 실패 조건, FCPXML 프레임 시간과 생성, 중복 ID·깨진 참조, 덮어쓰기 보호, `.fcpxmld` 읽기, Motion 검색·검사를 다룹니다. CI에서는 공식 MCP SDK 설치 후 stdio `initialize`와 `tools/list` round trip도 실행합니다.

아직 실제 앱에서 확인할 항목:

- 사용하는 Final Cut Pro 버전에서 생성 XML import
- Final Cut export/import round trip 보존
- 실제 Motion 프로젝트의 publish 파라미터 해석
- Motion 템플릿 생성·수정·설치

다음 검증 시작점은 [`memory/CHECKPOINT.md`](memory/CHECKPOINT.md)에 기록합니다.

## License

MIT
