# Vibe Video Analyzer 연동

Apple Pro Video MCP 0.3은 `VibeCoding_VideoAnalyzer`가 내보낸 단어 타임스탬프 JSON을 직접 읽을 수 있습니다.

## 연결 구조

```text
VibeCoding_VideoAnalyzer
  └─ transcribe_cli.py
       ↓
*.vibe-transcript.json
       ↓
Apple Pro Video MCP
  └─ vibe_transcript_import
       ├─ candidateRanges → 모델이 점수 추가 → highlight_rank
       └─ editPlanSegments → 선택/정렬 → edit_plan_build
                                ├─ fcpxml_create_project
                                └─ subtitle_segment → subtitle_write_srt
```

Vibe Analyzer는 전사와 단어 타임스탬프를 담당합니다. Apple Pro Video MCP는 전사 데이터를 편집 후보, 타임라인 구간, FCPXML 클립, SRT 자막으로 변환합니다.

## 1. Vibe Analyzer 브랜치 받기

```bash
git clone https://github.com/kwd421/VibeCoding_VideoAnalyzer.git
cd VibeCoding_VideoAnalyzer
git switch agent/transcript-exchange
```

기존 프로젝트의 Python 환경, 미디어 의존성, 모델을 복구한 뒤 실행합니다. 현재 저장소에는 dependency manifest와 모델 폴더가 없으므로 실제 Mac 환경 설정은 별도로 필요합니다.

CLI 도움말은 무거운 의존성을 import하지 않습니다.

```bash
python transcribe_cli.py --help
```

## 2. 단어 타임스탬프 JSON 생성

기본 예시:

```bash
python transcribe_cli.py "/Users/me/Movies/interview.mov" \
  --language ko \
  --silero-vad \
  --output "/Users/me/Desktop/interview.vibe-transcript.json"
```

WhisperX가 설치되어 있고 정밀 정렬을 시험할 때:

```bash
python transcribe_cli.py "/Users/me/Movies/interview.mov" \
  --language ko \
  --silero-vad \
  --whisperx-align \
  --output "/Users/me/Desktop/interview-aligned.vibe-transcript.json"
```

기존 JSON은 `--overwrite` 없이는 교체하지 않습니다.

출력 스키마:

```text
vibe-video-analyzer/transcript v1
```

핵심 데이터:

```json
{
  "media": {
    "path": "/Users/me/Movies/interview.mov",
    "durationSeconds": 120.5
  },
  "segments": [
    {
      "id": "segment-1",
      "startSeconds": 1.25,
      "endSeconds": 2.5,
      "text": "안녕하세요",
      "words": [
        {
          "text": "안녕",
          "startSeconds": 1.25,
          "endSeconds": 1.8
        }
      ]
    }
  ]
}
```

## 3. Apple Pro Video MCP에서 import

MCP 클라이언트에서:

```text
/Users/me/Desktop/interview.vibe-transcript.json을
vibe_transcript_import로 불러와줘.
```

직접 도구 인자:

```json
{
  "path": "/Users/me/Desktop/interview.vibe-transcript.json"
}
```

JSON이 다른 Mac에서 생성되어 media path가 달라졌다면:

```json
{
  "path": "/Users/me/Desktop/interview.vibe-transcript.json",
  "mediaPath": "/Volumes/Media/interview.mov"
}
```

미디어가 아직 연결되지 않은 상태로 구조만 조사하려면 명시적으로:

```json
{
  "path": "/Users/me/Desktop/interview.vibe-transcript.json",
  "allowMissingMedia": true
}
```

## 4. import 결과

`vibe_transcript_import`는 다음을 반환합니다.

- `segments`: 정규화된 전사 구간
- `words`: 전체 단어 타임스탬프
- `candidateRanges`: 모델이 편집 점수를 붙일 후보 골격
- `editPlanSegments`: `edit_plan_build`에 전달할 수 있는 미디어 구간
- `missingWordSegmentIds`: 단어 데이터가 없는 구간
- `warnings`: 단어가 구간 밖으로 크게 벗어나거나 선언 길이와 맞지 않는 경우

`candidateRanges`에는 의도적으로 점수가 없습니다. 모델이나 사람이 실제 내용을 평가해 다음 지표를 추가해야 합니다.

```text
hook, payoff, clarity, emotion, novelty, editability, visual
```

MCP는 JSON을 읽었다는 이유만으로 영상을 직접 봤거나 내용의 품질을 이해했다고 주장하지 않습니다.

## 5. 실제 쇼츠 생성 요청 예시

```text
interview.vibe-transcript.json을 vibe_transcript_import로 읽어.

각 candidateRange의 텍스트를 보고 interview_short 기준으로
hook, payoff, clarity, emotion, novelty, editability, visual을 평가해.
평가 근거도 한 줄씩 남겨.

highlight_rank로 60초 안의 후보를 선택하고,
Hook → 설명 → Payoff → 결론 순으로 재배치해.

선택한 editPlanSegments를 edit_plan_build에 넣어.
반환된 fcpxmlClips로 interview-short.fcpxml을 만들고,
timelineWords를 subtitle_segment에 넣어 한국어 2줄 자막을 만든 뒤
interview-short.srt로 저장해.

기존 파일은 덮어쓰지 마.
```

## 6. Grok에 맡길 지시문

```text
두 저장소를 확인해.

VibeCoding_VideoAnalyzer:
- branch: agent/transcript-exchange
- CODEX.md, GEMINI.md, HANDOFF.md를 먼저 읽기

Apple-Pro-Video-MCP:
- branch: agent/initial-mcp
- AGENTS.md와 memory/CHECKPOINT.md를 먼저 읽기

Vibe Analyzer의 기존 동기화·GUI·재생 코드는 수정하지 말고,
transcribe_cli.py로 짧은 한국어 인터뷰의
*.vibe-transcript.json을 새 파일명으로 생성해.

Apple Pro Video MCP에서 vibe_transcript_import를 호출하고
highlight_rank → edit_plan_build → fcpxml_create_project,
subtitle_segment → subtitle_write_srt 순서로 실행해.

.claude/skills/fcpxml-roundtrip/SKILL.md에 따라
FCPXML과 SRT를 disposable Final Cut 라이브러리에 import해.
컷 순서, in-point, 길이, 첫/마지막 자막, 컷 경계 자막을 검사하고
모든 입력·출력·오류·Final Cut 재export 파일을
새 test/fixtures/roundtrip/<date>-<case>/에 보존해.

저장소 테스트와 실제 앱 검증을 구분하고,
관찰되지 않은 호환성을 검증됐다고 말하지 마.
```

## 현재 검증 경계

확인 가능한 것:

- Vibe의 기존 `TranscriptSegment`와 `TranscriptWord`는 구간·단어 절대 타임스탬프를 담습니다.
- 교환 모듈은 해당 값을 JSON에 보존하도록 설계되었습니다.
- Apple MCP import 도구는 JSON을 편집·자막 입력 형태로 변환하고 유효성을 검사합니다.

아직 실제 Mac에서 확인해야 하는 것:

- Vibe CLI가 복구된 Python/모델 환경에서 끝까지 전사되는지
- 한국어 단어 타임스탬프의 실질 정확도
- 생성 FCPXML과 SRT의 Final Cut import 및 정렬
- WhisperX on/off 중 어떤 결과가 사용자의 실제 영상에서 더 안정적인지

특히 Vibe 저장소에는 과거 word-highlight sync 수정이 회귀를 일으켰다는 기록이 있습니다. 이번 연동은 기존 타이밍 로직을 바꾸지 않고 현재 결과를 별도 JSON으로 직렬화하는 방식입니다.
