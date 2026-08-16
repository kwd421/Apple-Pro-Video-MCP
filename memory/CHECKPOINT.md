# Checkpoint — Apple Pro Video MCP MVP — 2026-08-16

## The story so far
공식 MCP TypeScript SDK v2 기반 stdio 서버와 7개 도구가 구성됐다. FCPXML은 구조 검사·요약·기본 프로젝트 생성을 지원하고, Motion은 템플릿 검색과 읽기 전용 XML 조사를 지원한다.

## Decided
- MCP 전송은 직접 재구현하지 않고 공식 `@modelcontextprotocol/server` v2를 사용한다.
- XML 검사는 dependency-free 구조 검사로 유지하며 Apple DTD 전체 검증이라고 주장하지 않는다.
- Motion 프로젝트는 실제 앱 round trip이 확보될 때까지 읽기 전용이다.
- 기존 FCPXML 출력은 `overwrite: true`가 없으면 교체하지 않는다.

## Waiting on the user
- 편집용 Mac에서 생성된 FCPXML을 Final Cut Pro로 import하고 다시 export한 fixture가 필요하다.

## Next first action
`npm install && npm run check` 후 MCP 클라이언트에 `src/index.js` 절대 경로를 등록하고 `system_capabilities`를 호출한다.

## Tried
- 현재 실행 환경에는 Final Cut Pro와 Motion이 없어 실제 앱 수준 round trip은 수행하지 못했다.
