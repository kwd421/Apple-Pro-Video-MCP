# 편집 판단과 자막 파이프라인

이 문서는 Apple Pro Video MCP 0.2의 편집 기초 도구를 연결하는 방법을 설명합니다.

현재 MCP는 영상을 직접 시청하거나 음성을 전사하지 않습니다. 대신 모델이나 외부 ASR이 제공한 후보 점수와 단어별 타임스탬프를 검증·정규화하고, Final Cut용 FCPXML 클립 목록과 SRT 자막을 생성할 수 있습니다.

## 전체 흐름

```text
영상/오디오
  ↓ 외부 ASR 또는 전사 모델
단어별 타임스탬프
  ↓ 모델이 후보 구간과 평가 항목 작성
highlight_rank
  ↓ 선택된 구간을 원하는 이야기 순서로 배치
edit_plan_build
  ├─ fcpxmlClips → fcpxml_create_project
  └─ timelineWords → subtitle_segment → subtitle_write_srt
  ↓
FCPXML + SRT
  ↓ 실제 Mac에서 검증
Final Cut Pro import
```

## 1. 좋은 구간의 기준을 점수로 만들기

`highlight_rank`는 다음 일곱 항목을 0~100으로 받습니다.

| 항목 | 의미 |
|---|---|
| `hook` | 시작 몇 초 안에 관심을 끄는 힘 |
| `payoff` | 정보, 반전, 웃음, 결론 등 시청 보상 |
| `clarity` | 앞뒤 문맥 없이도 이해되는 정도 |
| `emotion` | 표정, 말투, 강세, 감정의 생동감 |
| `novelty` | 뻔하지 않고 해당 화자·영상만의 내용인 정도 |
| `editability` | 말 꼬임·긴 침묵 없이 깔끔하게 편집 가능한 정도 |
| `visual` | 화면 변화, 표정, 데모 등 시각적 가치 |

지원 프로필:

- `interview_short`
- `lecture`
- `entertainment`
- `vlog`
- `product`

프로필마다 가중치가 다릅니다. 예를 들어 인터뷰 쇼츠는 `hook`과 `payoff`를 각각 25%로 가장 크게 봅니다.

감점 항목:

- `contextDependency`
- `repetition`
- `disfluency`
- `noise`
- `longSetup`
- `weakEnding`

예시:

```json
{
  "profile": "interview_short",
  "targetDurationSeconds": 60,
  "candidates": [
    {
      "id": "c1",
      "sourceId": "interview-a",
      "startSeconds": 212.0,
      "endSeconds": 229.5,
      "text": "제일 큰 실수는 돈이 없는 게 아니었어요...",
      "metrics": {
        "hook": 92,
        "payoff": 90,
        "clarity": 88,
        "emotion": 75,
        "novelty": 82,
        "editability": 90,
        "visual": 65
      },
      "penalties": {
        "contextDependency": 10,
        "disfluency": 5
      }
    }
  ]
}
```

이 도구는 전달받은 평가를 투명하게 계산할 뿐, 자체적으로 영상을 보거나 사실 여부를 판단하지 않습니다. 점수의 품질은 후보를 평가한 모델·사람·분석기의 품질에 달려 있습니다.

## 2. 선택 구간을 실제 타임라인으로 재배치

`edit_plan_build`는 선택된 구간을 지정한 순서대로 이어 붙이고 각 구간의 타임라인 시작·끝을 계산합니다.

입력 단어 타임스탬프는 원본 미디어 기준의 절대 시간이어야 합니다. 도구는 선택 구간 안의 단어만 남기고 새 타임라인 시간으로 재매핑합니다.

```json
{
  "targetDurationSeconds": 60,
  "segments": [
    {
      "id": "hook",
      "path": "/Users/me/Movies/interview.mov",
      "sourceStartSeconds": 212,
      "durationSeconds": 17.5,
      "score": 91.2,
      "rationale": "강한 주장과 명확한 결론",
      "words": [
        {
          "text": "제일",
          "startSeconds": 212.1,
          "endSeconds": 212.35
        }
      ]
    }
  ]
}
```

주요 출력:

- `segments`: 타임라인 시작·끝이 붙은 정규화 구간
- `fcpxmlClips`: `fcpxml_create_project`에 전달할 수 있는 클립 목록
- `timelineWords`: 새 타임라인에 맞춰 재배치된 단어 타임스탬프
- `warnings`: 목표 길이보다 길거나 짧을 때의 경고

`edit_plan_build` 자체는 Final Cut 프로젝트를 수정하지 않습니다. 출력된 `fcpxmlClips`를 사용해 별도로 FCPXML을 생성합니다.

## 3. 단어 타임스탬프를 읽기 좋은 자막으로 분할

`subtitle_segment`는 다음 조건을 함께 사용합니다.

- 문장 부호
- 단어 사이의 긴 공백
- 큐 최대 길이
- 한 줄 최대 글자 수
- 최대 줄 수
- 큐당 최대 단어 수

한국어 쇼츠의 시작값으로는 다음 설정이 무난합니다.

```json
{
  "maxCharactersPerLine": 18,
  "maxLines": 2,
  "maxCueDurationSeconds": 3.5,
  "minCueDurationSeconds": 0.7,
  "gapBreakSeconds": 0.45,
  "maxWordsPerCue": 10,
  "punctuationBreak": true,
  "omitTokens": ["음", "어"]
}
```

`omitTokens`는 정확히 일치하는 토큰만 제거합니다. 중요한 말까지 자동으로 지우지 않도록 기본값은 빈 배열입니다.

출력에는 구조화된 `cues`와 미리 렌더링된 `srt` 문자열이 모두 포함됩니다.

## 4. SRT 파일 쓰기

`subtitle_write_srt`에 `subtitle_segment`의 `cues`를 전달합니다.

```json
{
  "outputPath": "/Users/me/Desktop/interview-selects.srt",
  "overwrite": false,
  "cues": [
    {
      "startSeconds": 0.0,
      "endSeconds": 1.8,
      "lines": ["제일 큰 실수는", "돈이 아니었어요"]
    }
  ]
}
```

기존 SRT 파일은 `overwrite: true`를 명시하지 않는 한 교체하지 않습니다.

## 5. FCPXML과 SRT를 함께 만들기

모델에게 다음처럼 요청할 수 있습니다.

```text
전사 결과에서 인터뷰 쇼츠 후보를 점수화해 60초 안으로 골라줘.
선택 구간을 Hook → 설명 → 결론 순으로 edit_plan_build에 넣어.
반환된 fcpxmlClips로 FCPXML을 만들고,
timelineWords로 한국어 2줄 자막을 만들어 같은 이름의 SRT로 저장해.
기존 파일은 덮어쓰지 마.
```

결과 예시:

```text
interview-selects.fcpxml
interview-selects.srt
```

## 현재 검증 경계

저장소 테스트가 확인하는 것:

- 점수 가중치와 감점 계산
- 같은 원본의 겹치는 후보 제외
- 목표 길이에 맞춘 선택
- 선택 구간의 타임라인 재배치
- 원본 단어 타임스탬프의 새 타임라인 매핑
- 문장 부호·공백·길이 기반 자막 분할
- SRT 타임코드 렌더링
- 기존 SRT 덮어쓰기 방지
- MCP stdio에서 새 도구 등록과 호출

아직 실제 앱에서 확인되지 않은 것:

- 생성한 FCPXML이 특정 Final Cut Pro 버전에서 정상 import되는지
- 생성한 SRT가 해당 프로젝트와 정확히 맞아 들어가는지
- Final Cut에서 다시 export했을 때 컷과 자막 의미가 보존되는지
- 어떤 ASR이 한국어에서 충분한 정확도와 단어 타임스탬프를 제공하는지

따라서 현재 상태는 **편집 결정과 자막 파일을 생성할 수 있는 기반**이며, 완전한 자동 영상 분석기나 검증 완료된 Final Cut 자동편집기는 아닙니다.
