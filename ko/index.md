---
lang: ko
title: Interpretab
description: 브라우저가 재생하는 소리와 당신이 하는 말을 70개 이상의 언어로 실시간 번역해, 소리로 읽어 주고 페이지에 자막으로 띄우는 Chrome 확장 프로그램입니다.
---

<h1 style="display:flex;align-items:center;gap:.7rem;margin:0 0 .4rem">
  <img src="../icons/icon-128.png" alt="" width="52" height="52" style="border-radius:11px;flex:none">
  <span>Interpretab</span>
</h1>

**브라우저가 재생하는 소리와 당신이 하는 말을 70개 이상의 언어로 실시간 번역해, 소리로 읽어 주고 페이지에 자막으로 띄우는 Chrome 확장 프로그램입니다.**

## 이럴 때 쓸 수 있습니다

<div style="margin:1rem 0 1.5rem">
  <p style="margin:0 0 .6rem"><b>브라우저 오디오 번역</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem;margin:0 0 1.25rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../store/usecase-1-video.svg" alt="" width="52" height="52" style="flex:none">
      <span>브라우저에서 재생 중인 영상, 라이브 스트림, 팟캐스트를 원하는 언어로 보고 듣기.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../store/usecase-2-meeting.svg" alt="" width="52" height="52" style="flex:none">
      <span>상대방이 하는 말을 전부 내 언어로 번역해 온라인 회의를 따라가기.</span>
    </div>
  </div>
  <p style="margin:0 0 .6rem"><b>마이크 오디오 번역</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../store/usecase-3-presentation.svg" alt="" width="52" height="52" style="flex:none">
      <span>발표나 라이브 방송에서 내 목소리를 다른 언어 자막으로 화면에 띄우기.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../store/usecase-4-room.svg" alt="" width="52" height="52" style="flex:none">
      <span>회의실에서 모이거나 친구와 이야기할 때, 모두의 말을 원하는 언어로 통역하기.</span>
    </div>
  </div>
</div>

[![일본어 강연을 영어로 번역 중인 Interpretab: 영상 위에 영어 자막, 사이드 패널에 전사 내용](../store/hero-tab-ja-en.png)](../store/hero-tab-ja-en.png)

<p><a href="https://www.youtube.com/watch?v=jiY8WJgeKCA">▶ 동작 영상 보기 (2:45)</a></p>

## Interpretab의 작동 방식과 개인정보

Interpretab은 Google의 [Gemini Live API](https://ai.google.dev/gemini-api/docs/live)를 통해 번역합니다. 오디오와 자막, 키는 브라우저와 Google 사이에서만 암호화되어 오가며 다른 어디에도 도달하지 않습니다. 분석이나 데이터 수집 서버도 없습니다. 다만 Gemini Live API 모델의 특성상 부정확하게 번역하거나, 번역이 아닌 말을 만들어 낼 수 있습니다.

- [개인정보처리방침](../PRIVACY.html) (영문)

## 체험은 무료, 계속 쓰면 시간당 약 2달러

Interpretab은 오픈소스 도구입니다. 비용이 드는 쪽은 번역을 담당하는 Gemini Live API이고, 무료 등급만으로도 충분히 시험해 볼 수 있습니다. 그 이후로는 **Gemini Live API 사용량이 본인의 Google 계정에 청구됩니다**.

2026년 8월 기준으로 [Google이 공개한](https://ai.google.dev/gemini-api/docs/pricing) Gemini Live API 요금은 다음과 같습니다.

| 실행 중인 기능 | 오디오 입력 | 오디오 출력 | **시간당** |
|---|---|---|---|
| 탭 오디오, 또는 Simultaneous 모드의 마이크 | $0.0053/분 | $0.0315/분 | **≈ $2.20** |
| Two-way conversation 모드의 마이크 | $0.005/분 | $0.018/분 | **≈ $1.40** |

*끊김 없이* 이어지는 오디오 기준이므로, 말이 적으면 비용도 줄어듭니다. 탭 오디오와 마이크를 함께 켜면 세션이 두 개가 되므로 요금은 두 줄의 합이 됩니다.

## 설치

Interpretab은 다음과 같이 설치합니다.

1. [Interpretab 저장소](https://github.com/kazunori279/interpretab)에서 `Code` 버튼을 눌러
   `Download ZIP`을 선택하고 압축을 풉니다.
2. Chrome에서 `chrome://extensions`를 열고 **개발자 모드**를 켠 다음, **압축해제된 확장 프로그램을
   로드합니다**를 눌러 압축을 푼 폴더를 고릅니다.
3. [aistudio.google.com/apikey](https://aistudio.google.com/apikey)에서 무료 Gemini API 키를 받아
   확장 프로그램의 **옵션** 페이지에 붙여넣습니다.
4. 번역할 페이지를 열고, **그 탭에서 툴바의 Interpretab 아이콘을 클릭합니다.** 이 클릭이 탭 소리를 들어도 된다는 허가입니다. 건너뛰면 오류가 납니다.
5. 사이드 패널에서 언어를 고르고 **Start**를 누릅니다.

Chrome 116 이상이 필요합니다. 사이드 패널을 닫아도 번역은 멈추지 않습니다. **Stop**은 어느 탭에서든 툴바 아이콘 클릭 한 번이면 됩니다.

Interpretab의 인터페이스는 브라우저 언어를 따라가며, 이 페이지에 있는 열 개 언어를 지원합니다.

## 무엇을 번역할지 고르기

Interpretab에는 탭 오디오와 마이크라는 두 방향이 있습니다. 하나만 써도 되고 둘 다 동시에 써도 됩니다.

[![Interpretab 사이드 패널: 두 개의 방향 카드, 언어 선택기, 원음 볼륨 슬라이더, Start](../store/screenshot-4-panel.png)](../store/screenshot-4-panel.png)

**탭 오디오**는 현재 탭이 재생 중인 소리를 78개 언어 중 고른 언어로 번역합니다.

**마이크**는 컴퓨터 마이크가 들은 소리를 번역합니다. 두 가지 모드가 있습니다.

- **Simultaneous**는 말이 끝나기를 기다리지 않고 하나의 언어로 동시 통역합니다.
- **Two-way conversation**은 두 사람이 두 언어로 대화할 때를 위한 모드입니다. 두 언어를 지정하고 노트북을 사이에 두면, 각자의 말이 끝난 뒤 다른 언어로 넘겨 줍니다. 한국어와 일본어로 설정하면 한국어가 들리면 일본어로, 일본어가 들리면 한국어로 말합니다. 전환 조작은 필요 없습니다. 97개 언어를 지원하며, [용어집](#glossary)이 적용되는 유일한 모드이기도 합니다.

탭 오디오와 마이크를 함께 켜면 별개의 두 세션으로 과금되므로 비용은 둘의 합이 됩니다.

### 자막과 읽어 주는 음성

자막은 페이지 하단 가운데에 한 번에 세 줄까지 표시되며, 영상이 전체 화면으로 가면 따라갑니다. 탭 오디오와 마이크를 함께 켜면 마이크 쪽 줄에 파란 테두리가 붙습니다. **옵션 → 자막 크기**에서 16〜64 px 범위로, 보면서 바로 조절할 수 있습니다.

번역된 음성은 컴퓨터의 오디오 출력으로 나오며, 음소거 버튼으로 언제든 끌 수 있습니다. 탭 오디오를 쓸 때는 번역이 말하는 동안 탭의 원래 소리가 **작은 음량으로 계속 재생**되므로, 영화의 음악과 효과음도 그대로 들을 수 있습니다.

**옵션 → 오디오 입력/출력**에서 마이크를 어느 기기로 들을지, 번역 음성을 어느 기기로 낼지 고를 수 있습니다.

### 온라인 회의에서 쓰기

**상대방의 말을 알아듣는 것은 이 도구가 기본으로 해 주는 일입니다.** 회의를 탭에서 열고 탭 오디오를 켜서 언어를 고른 뒤 Start를 누르면 됩니다. 상대가 하는 말이 내 언어로, 음성과 자막 양쪽으로 도착합니다.

통화에서는 두 방향을 *서로 다른* 언어로 향하게 하세요. 탭 오디오는 내 언어로, 마이크는 상대의 언어로가 기본입니다. 기본값은 둘 다 같은 언어를 향하고 있어서, 그대로 두면 상대에게 자기 말이 바꿔 말해져 돌아갈 뿐입니다. 이때 마이크는 Two-way conversation이 아니라 **Simultaneous** 모드를 쓰세요. 상대의 말은 이미 다른 방향이 번역해서 탭으로 들어옵니다.

**상대가 번역된 내 목소리를 듣게 하려면**, 가장 간단한 답은 상대도 Interpretab을 설치해 자기 쪽에서 내 목소리를 번역하는 것입니다. 그럴 수 없다면 번역 음성이 마이크 입력으로 회의에 들어가야 하는데, Chrome은 확장 프로그램이 마이크 장치를 등록할 방법을 주지 않으므로, 회의가 이미 듣고 있는 곳으로 소리를 흘려보내는 형태가 됩니다.

1. 가상 오디오 장치를 설치합니다. macOS는 [BlackHole](https://existential.audio/blackhole/),
   Windows는 [VB-Cable](https://vb-audio.com/Cable/).
2. **옵션 → 오디오 출력**에서 그 장치를 고릅니다. 그쪽으로 가는 것은 마이크 방향의 음성뿐이고, 탭 방향의 번역은 내가 듣는 것이므로 스피커에 남습니다.
3. 회의에서 같은 장치를 마이크로 선택합니다.
4. 헤드폰을 쓰세요. 스피커를 쓰면 마이크가 통화 소리를 줍고 통화는 방 안 소리를 주워서, 두 방향이 서로를 통역하기 시작합니다.

이 구성에서는 번역된 내 목소리가 나에게는 들리지 않습니다. 확인하고 싶다면 macOS의 다중 출력 기기나 VB-Cable의 리피터를 거쳐 분기하세요.

이것은 Chrome 확장 프로그램이므로, 위의 내용은 모두 해당 서비스의 웹 버전에서만 동작합니다. 데스크톱 앱이나 네이티브 클라이언트에는 손이 닿지 않습니다.

### 번역 모델과 번역 품질

탭 오디오와 마이크의 Simultaneous 모드는 Gemini Live API의
[Live Translate](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview)
모델에서 동작합니다. 마이크의 Two-way conversation 모드는
[Gemini Live 모델](https://aistudio.google.com/docs/live-api)에서 동작하는데, 이 모델은 동시 통역은 못 하고 말이 끝나기를 기다리지만, Live Translate보다 번역 품질이 좋고 아래의 용어집을 받아들이는 유일한 모델입니다.

어느 쪽이든 모델이 잘못 동작해 자막에 엉뚱한 내용이나 엉뚱한 언어가 나올 수 있습니다.

### 용어집
{: #glossary }

일반 모델이 가장 자주 틀리는 것은 제품명, 사람 이름, 전문 용어이며, 발음과 표기 양쪽에서 틀립니다. **마이크의 Two-way conversation 모드**는 이런 실수를 줄이기 위한 용어집을 받아들입니다. 다른 모드는 지원하지 않습니다. 그래도 모델은 틀릴 수 있고, 등록한 발음이나 표기가 반영되지 않을 수도 있습니다.

**옵션 → 용어집**에서 다음과 같은 CSV를 받습니다.

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

첫 번째 열은 인식할 대상 문자열, 두 번째 열은 모델에 알려 줄 *발음*, 세 번째 열은 **자막에 표시**하고 싶은 표기입니다.

[![용어집 표가 채워진 옵션 페이지](../store/screenshot-3-glossary.png)](../store/screenshot-3-glossary.png)

### 알아 둘 점

- **마이크의 Simultaneous 모드에서는 이어폰이나 헤드폰을 쓰세요.** 이 모드는 말하는 중에 겹쳐서 말하기 때문에 마이크가 자기 번역 음성을 다시 줍게 되고(에코 루프), 번역 품질이 크게 떨어집니다.
- **마이크와 함께 외부 스피커를 쓰려면 음소거 버튼이 있는 마이크를 쓰세요.** 스피커는 번역 음성을 마이크로 되돌려 보내 에코 루프를 만들고, 번역이 제대로 동작하지 않습니다. 말할 때만 음소거를 해제하세요.
- **탭 오디오와 마이크를 동시에 쓰면 세션도 두 개**가 되고 비용도 그만큼 올라갑니다.
- **Interpretab은 한 번에 한 탭에서만 동작합니다.** 실행 중에 다른 탭에서 사이드 패널을 열면 어느 탭에서 돌고 있는지 알려 주고 **Stop**만 제공합니다. 거기서 멈추면 Start가 돌아옵니다.
- **Chrome은 확장 프로그램이 자체 페이지나 PDF 위에 그리는 것을 허용하지 않으므로** 그런 곳에는 자막을 띄울 수 없습니다. 음성 번역과 사이드 패널의 전사는 그대로 동작합니다.
- **번역 품질은 언어 조합에 따라 달라집니다.** 장시간 측정을 해 본 조합은 영어와 일본어입니다. 언어적으로 멀거나 사용자가 적은 조합은 결과가 거칠 수 있고, 미리 알 방법은 없으니 직접 시험해 보세요.

## Gemini Live API 사용에 관하여

사이드 패널에는 이번 실행에서 지금까지 쓴 양이 표시되고, Start를 누를 때마다 0에서 다시 시작합니다. 표시 내용은 **옵션 → Gemini API 요금제** 설정에 따라 달라집니다. 사용 중인 키가 무료 등급인지 Tier 1인지 골라 주세요.

- **Free**(기본값): *지금까지 12분, Gemini 오디오 18분. 무료 등급에서는 이에 대해 요금이 부과되지 않습니다.* 금액은 나오지 않습니다. 무료 등급은 금액이 아니라 사용량 제한으로 구분되므로, 볼 만한 숫자는 오디오 시간 쪽입니다.
- **Paid**: *지금까지 12분, 이번 실행의 Gemini 사용량 ~$0.31 — 추정치이며 실제 청구액이 아닙니다.*

키를 붙여넣을 때 함께 설정하세요. 키를 만든 프로젝트를 말하며, 결제 계정이 연결된 프로젝트는 유료 등급입니다. **실제 청구액은 본인의 Google 계정에서만 확인할 수 있습니다.**

### 무료 등급과 유료 등급 중 고르기

Gemini API 키의 비용, 사용량 제한의 강도, 보낸 데이터를 Google이 어떻게 다루는지는 모두 프로젝트의 **사용 등급**에 따라 달라집니다. [Google이 공개한](https://ai.google.dev/gemini-api/docs/rate-limits) 조건은 다음과 같습니다.

| 등급 | 조건 | 비용과 상한 | Google이 데이터를 다루는 방식 | Interpretab에서의 쓰임새 |
|---|---|---|---|---|
| **Free** | 결제 계정 불필요 | 무료. 다만 장시간·대량 사용 시 사용량 제한에 걸려 오류가 납니다 | **Google 제품 개선에 사용되며, 사람이 검토할 수 있습니다** | 체험용 |
| **Tier 1** | 활성 결제 계정을 연결 | 종량제. 10분당 $10, 월 $250까지 | 제품 개선에 사용되지 않음. 남용 탐지 목적으로만 짧게 기록 | **꾸준히 쓴다면 여기.** 거의 모든 용도에 충분합니다 |

먼저 무료 등급으로 시험하고, 계속 쓰게 되면 결제 계정을 연결해 Tier 1로 올리는 것을 권합니다. Tier 1에서는 보낸 내용이 Google 제품 개선에 사용되지 않으며, 이런 도구에는 상한도 넉넉합니다. Interpretab 세션을 동시에 25개 정도, 월 110시간 정도까지 쓸 수 있습니다. Google이 [결제 설정 방법](https://ai.google.dev/gemini-api/docs/billing#setup-billing)을 안내하고 있습니다.

### 여러 대의 기기와 여러 사람이 Gemini API 키를 공유하는 것

Interpretab은 키를 기기 안(`chrome.storage.local`)에 저장합니다. Chrome의 프로필 동기화로는 옮겨지지 않으므로, 여러 대의 컴퓨터에서 쓰려면 기기마다 붙여넣어야 합니다. **본인이 쓰는 여러 기기에서 같은 키를 쓰는 것은 문제없습니다.**

**다른 사람에게 키를 넘기는 것은** Google의 [API 서비스 약관](https://developers.google.com/terms)상 **허용되지 않습니다.**

### Gemini API 키에 관해 알아 둘 점

- **사용량 제한은 키 단위가 아니라 프로젝트 단위입니다.**
  [Google 문서](https://ai.google.dev/gemini-api/docs/rate-limits)에 그대로 적혀 있습니다. Tier 1의 「10분당 $10」은 Interpretab 세션 25개 정도를 동시에 돌리는 수준이며, 그것을 넘으면 오류가 납니다.
- **키는 비밀번호와 같습니다.** 밖으로 새면
  [Google의 안내](https://ai.google.dev/gemini-api/docs/api-key)대로 "다른 사람이 프로젝트의 할당량을 소진하고, 예상치 못한 요금을 발생시키며, 비공개 리소스에 접근할 수 있습니다". 기기를 처분할 때나 키가 유출된 것 같을 때는
  [AI Studio](https://aistudio.google.com/apikey)에서 옛 키를 삭제하고 새로 만드세요.
- **팀에서는 1인 1키가 기본입니다.** 같은 Google Cloud 결제 계정 아래에 구성원별 프로젝트를 만들면, 결제는 한곳에 모으면서 키와 사용량 제한은 각자 나눌 수 있습니다.
- **EEA·스위스·영국 사용자**는 Gemini API의 [추가 약관](https://ai.google.dev/gemini-api/terms)에 따라 유료 등급을 써야 합니다.
- **번역을 시작할 수 없을 때는 메시지에 원인이 나옵니다.** Interpretab은 무언가를 열기 전에 Google에 키 상태를 먼저 물어보므로, 키가 거부된 경우·할당량이 소진된 경우·키에 Gemini API 호출 권한이 없는 경우를 추측하지 않고 각각 구분해 알려 줍니다. 무료 등급에서 흔한 것은 할당량입니다.
  [AI Studio](https://aistudio.google.com/apikey)에서 상한을 확인하고 초기화를 기다리거나, 결제를 설정해 Tier 1로 옮기세요. 키 자체는 받아들여졌다는 메시지가 나오면 문제는 키가 아니라 Live API나 네트워크 쪽입니다.

## 오픈소스

Apache 2.0. 소스, 위 내용 뒤에 있는 엔지니어링 노트, 그리고 이슈 트래커는 다음과 같습니다.

- [github.com/kazunori279/interpretab](https://github.com/kazunori279/interpretab)
- [문제 신고 및 기능 요청](https://github.com/kazunori279/interpretab/issues)
