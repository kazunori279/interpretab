---
lang: ko
title: 사용 안내
description: 브라우저가 재생하는 소리와 당신이 하는 말을 70개 이상의 언어로 실시간 번역해, 소리로 읽어 주고 페이지에 자막으로 띄우는 Chrome 확장 프로그램입니다.
---

<h1 style="display:flex;align-items:center;gap:.7rem;margin:0 0 .4rem">
  <img src="../assets/icon-128.png" alt="" width="52" height="52" style="border-radius:11px;flex:none">
  <span>Interpretab</span>
</h1>

**브라우저가 재생하는 소리와 당신이 하는 말을 70개 이상의 언어로 실시간 번역해, 소리로 읽어 주고 페이지에 자막으로 띄우는 Chrome 확장 프로그램입니다.**

## 💡 이럴 때 쓸 수 있습니다

<div style="margin:1rem 0 1.5rem">
  <p style="margin:0 0 .6rem"><b>브라우저 오디오 번역</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem;margin:0 0 1.25rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-1-video.svg" alt="" width="52" height="52" style="flex:none">
      <span>브라우저에서 재생 중인 영상, 라이브 스트림, 팟캐스트를 원하는 언어로 보고 듣기.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-2-meeting.svg" alt="" width="52" height="52" style="flex:none">
      <span>상대방이 하는 말을 전부 내 언어로 번역해 온라인 회의를 따라가기.</span>
    </div>
  </div>
  <p style="margin:0 0 .6rem"><b>마이크 오디오 번역</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-3-presentation.svg" alt="" width="52" height="52" style="flex:none">
      <span>발표나 라이브 방송에서 내 목소리를 다른 언어 자막으로 화면에 띄우기.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-4-room.svg" alt="" width="52" height="52" style="flex:none">
      <span>회의실에서 모이거나 친구와 이야기할 때, 모두의 말을 원하는 언어로 통역하기.</span>
    </div>
  </div>
</div>

[![일본어 강연을 영어로 번역 중인 Interpretab: 영상 위에 영어 자막, 사이드 패널에 전사 내용](../assets/hero-tab-ja-en.png)](../assets/hero-tab-ja-en.png)

<p><a href="https://www.youtube.com/watch?v=3TJnSBS3bkE">▶ 동작 영상 보기 (2:02)</a></p>

## 🔒 Interpretab의 작동 방식과 개인정보

Interpretab은 Google의 [Gemini Live API](https://ai.google.dev/gemini-api/docs/live)를 통해 번역합니다. 오디오와 자막, 키는 브라우저와 Google 사이에서만 암호화되어 오가며 다른 어디에도 도달하지 않습니다. 분석이나 데이터 수집 서버도 없습니다. 다만 Gemini Live API 모델의 특성상 부정확하게 번역하거나, 번역이 아닌 말을 만들어 낼 수 있습니다.

- [개인정보처리방침](../PRIVACY.html) (영문)

## 💰 체험은 무료, 계속 쓰면 시간당 약 2달러

Interpretab은 오픈소스 도구입니다. 비용이 드는 쪽은 번역을 담당하는 Gemini Live API이고, 무료 요금제만으로도 충분히 시험해 볼 수 있습니다. 그 이후로는 **Gemini Live API 사용량이 본인의 Google 계정에 청구됩니다**.

2026년 8월 기준으로 [Google이 공개한](https://ai.google.dev/gemini-api/docs/pricing) Gemini Live API 요금은 다음과 같습니다.

| 실행 중인 기능 | 오디오 입력 | 오디오 출력 | **시간당** |
|---|---|---|---|
| 탭 오디오, 또는 Simultaneous 모드의 마이크 | $0.0053/분 | $0.0315/분 | **≈ $2.20** |
| Two-way conversation 모드의 마이크 | $0.005/분 | $0.018/분 | **≈ $1.40** |

*끊김 없이* 이어지는 오디오 기준이므로, 말이 적으면 비용도 줄어듭니다. 탭 오디오와 마이크를 함께 켜면 번역을 두 개 동시에 돌리는 것이므로 요금은 두 줄의 합이 됩니다.

## 🚀 5분 만에 시작하기

Interpretab은 다음과 같이 설치합니다.

{% include install-steps.html %}

Chrome 116 이상이 필요합니다. 사이드 패널을 닫아도 번역은 멈추지 않습니다. **Stop**은 어느 탭에서든 툴바 아이콘 클릭 한 번이면 됩니다.

Interpretab의 인터페이스는 브라우저 언어를 따라가며, 이 페이지에 있는 열 개 언어를 지원합니다.

## 🎛️ 무엇을 번역할지 고르기

Interpretab에는 **탭 오디오**와 **마이크**라는 두 개의 스위치가 있습니다. 하나만 써도 되고 둘 다 동시에 써도 됩니다.

[![Interpretab 사이드 패널: 탭 오디오와 마이크 카드, 언어 선택기, 원음 볼륨 슬라이더, Start](../assets/screenshot-4-panel.png)](../assets/screenshot-4-panel.png)

**탭 오디오**는 현재 탭이 재생 중인 소리를 78개 언어 중 고른 언어로 번역합니다.

**마이크**는 컴퓨터 마이크가 들은 소리를 번역합니다. 두 가지 모드가 있습니다.

- **Simultaneous**는 말이 끝나기를 기다리지 않고 하나의 언어로 동시 통역합니다.
- **Two-way conversation**은 두 사람이 두 언어로 대화할 때를 위한 모드입니다. 두 언어를 지정하고 노트북을 사이에 두면, 각자의 말이 끝난 뒤 다른 언어로 넘겨 줍니다. 한국어와 일본어로 설정하면 한국어가 들리면 일본어로, 일본어가 들리면 한국어로 말합니다. 전환 조작은 필요 없습니다. 97개 언어를 지원하며, [용어집](#glossary)이 적용되는 유일한 모드이기도 합니다.

마이크를 처음 켤 때는 Chrome의 마이크 권한이 한 번 필요합니다. 권한은 확장 프로그램 단위로 부여됩니다. 패널이 이를 안내하며 「마이크 허용」 버튼이 있는 **옵션 → 마이크 사용 권한**로 연결해 줍니다. Chrome의 권한 창은 독립된 페이지에서만 뜨고 사이드 패널에서는 뜨지 않습니다.

탭 오디오와 마이크를 함께 켜면 번역을 두 개 동시에 돌리는 것이므로 Google은 둘 다에 요금을 매기고, 비용은 둘의 합이 됩니다.

### 💬 자막과 읽어 주는 음성

자막은 페이지 하단 가운데에 한 번에 세 줄까지 표시되며, 영상이 전체 화면으로 가면 따라갑니다. 탭 오디오와 마이크를 함께 켜면 마이크 쪽 줄에 파란 테두리가 붙습니다. **옵션 → 자막 크기**에서 16〜64 px 범위로, 보면서 바로 조절할 수 있습니다.

번역된 음성은 컴퓨터의 오디오 출력으로 나오며, 음소거 버튼으로 언제든 끌 수 있습니다.

#### 🔊 탭 오디오 번역의 음성

탭 오디오에서 번역된 음성은 기본 오디오 장치, 즉 컴퓨터가 이미 쓰고 있는 스피커나 헤드폰으로 재생됩니다. 번역이 말하는 동안 탭의 원래 소리는 **작은 음량으로 계속 재생**되므로, 영화의 음악과 효과음도 그대로 들을 수 있습니다.

#### 🎤 마이크 번역의 음성

**옵션 → 오디오 입력/출력**에서 **마이크**가 어느 기기로 소리를 들을지, 그 번역 음성을 어느 기기로 낼지 고를 수 있습니다. 잠깐 번역을 멈추고 싶을 때나, 주변이 시끄러워 번역할 생각이 없던 목소리까지 들어올 때는 마이크 끄기 버튼으로 언제든 입력을 끌 수 있습니다.

### 👥 온라인 회의에서 쓰기

**상대방의 말을 알아듣는 것은 이 도구가 기본으로 해 주는 일입니다.** 회의를 탭에서 열고 탭 오디오를 켜서 언어를 고른 뒤 Start를 누르면 됩니다. 상대가 하는 말이 내 언어로, 음성과 자막 양쪽으로 도착합니다.

#### 🤝 Google Meet에서 쓰기

**상대가 번역된 내 목소리를 듣게 하려면**, Google Meet에서는 설치할 것이 없습니다.

{% include meet-steps.html %}

#### 🔌 그 밖의 회의 서비스

번역 음성을 회의 앱의 마이크 입력으로 보내기 위해 가상 오디오 장치가 필요합니다. 가장 간단한 답은 여전히 상대도 Interpretab을 설치해 자기 쪽에서 번역하는 것이고, 그럴 수 없다면 아래와 같이 합니다.

1. 가상 오디오 장치를 설치합니다. macOS는 [BlackHole](https://existential.audio/blackhole/), Windows는 [VB-Cable](https://vb-audio.com/Cable/).
2. 위와 같이 헤드폰을 연결합니다.
3. **옵션 → 오디오 출력**에서 가상 오디오 장치를 고릅니다. **마이크**에서 번역된 음성이 그쪽으로 가고, **탭 오디오**의 번역은 헤드폰으로 들립니다.
4. 회의 앱의 마이크 입력 설정에서 가상 오디오 장치를 선택합니다.
5. 탭 오디오와 마이크를 켜고 두 언어를 맞춘 뒤 Start를 누릅니다.

이것은 Chrome 확장 프로그램이므로, 위의 내용은 모두 해당 서비스의 웹 버전에서만 동작합니다. 데스크톱 앱이나 네이티브 클라이언트에는 손이 닿지 않습니다.

### 🤖 번역 모델과 번역 품질

탭 오디오와 마이크의 Simultaneous 모드는 Gemini Live API의
[Live Translate](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview)
모델에서 동작합니다. 마이크의 Two-way conversation 모드는
[Gemini Live 모델](https://aistudio.google.com/docs/live-api)에서 동작하는데, 이 모델은 동시 통역은 못 하고 말이 끝나기를 기다리지만, Live Translate보다 번역 품질이 좋고 아래의 용어집을 받아들이는 유일한 모델입니다.

어느 쪽이든 모델이 잘못 동작해 자막에 엉뚱한 내용이나 엉뚱한 언어가 나올 수 있습니다.

### 📖 용어집
{: #glossary }

일반 모델이 가장 자주 틀리는 것은 제품명, 사람 이름, 전문 용어이며, 발음과 표기 양쪽에서 틀립니다. **마이크의 Two-way conversation 모드**는 이런 실수를 줄이기 위한 용어집을 받아들입니다. 다른 모드는 지원하지 않습니다. 그래도 모델은 틀릴 수 있고, 등록한 발음이나 표기가 반영되지 않을 수도 있습니다.

**옵션 → 용어집**에서 다음과 같은 CSV를 받습니다.

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

첫 번째 열은 인식할 대상 문자열, 두 번째 열은 모델에 알려 줄 *발음*, 세 번째 열은 **자막에 표시**하고 싶은 표기입니다.

[![용어집 표가 채워진 옵션 페이지](../assets/screenshot-3-glossary.png)](../assets/screenshot-3-glossary.png)

### ⚠️ 알아 둘 점

- **마이크의 Simultaneous 모드에서는 이어폰이나 헤드폰을 쓰세요.** 이 모드는 말하는 중에 겹쳐서 말하기 때문에 마이크가 자기 번역 음성을 다시 줍게 되고(에코 루프), 번역 품질이 크게 떨어집니다.
- **마이크와 함께 외부 스피커를 쓰려면 음소거 버튼이 있는 마이크를 쓰세요.** 스피커는 번역 음성을 마이크로 되돌려 보내 에코 루프를 만들고, 번역이 제대로 동작하지 않습니다. 말할 때만 음소거를 해제하세요.
- **탭 오디오와 마이크를 동시에 쓰면 번역도 두 개**가 되고, 비용도 대략 두 배가 됩니다.
- **Interpretab은 한 번에 한 탭에서만 동작합니다.** 실행 중에 다른 탭에서 사이드 패널을 열면 어느 탭에서 돌고 있는지 알려 주고 **Stop**만 제공합니다. 거기서 멈추면 Start가 돌아옵니다.
- **Chrome은 확장 프로그램이 자체 페이지나 PDF 위에 그리는 것을 허용하지 않으므로** 그런 곳에는 자막을 띄울 수 없습니다. 음성 번역과 사이드 패널의 전사는 그대로 동작합니다.
- **번역 품질은 언어 조합에 따라 달라집니다.** 장시간 측정을 해 본 조합은 영어와 일본어입니다. 언어적으로 멀거나 사용자가 적은 조합은 결과가 거칠 수 있고, 미리 알 방법은 없으니 직접 시험해 보세요.

## 📊 Gemini Live API 사용에 관하여

사이드 패널에는 이번 실행에서 지금까지 쓴 양이 표시되고, Start를 누를 때마다 0에서 다시 시작합니다. 표시 내용은 **옵션 → Gemini API 요금제** 설정에 따라 달라집니다. 사용 중인 키가 **Free**인지 **Paid**인지 골라 주세요.

- **Free**(기본값): *지금까지 12분, Gemini 오디오 18분. 무료 요금제라 요금이 부과되지 않습니다.* 금액은 나오지 않습니다. 볼 만한 숫자는 오디오 시간 쪽입니다. 무료 요금제는 요금을 매기는 대신 한 번에 쓸 수 있는 양을 제한하므로, 줄어드는 것은 그쪽입니다.
- **Paid**: *지금까지 12분, 이번 실행의 Gemini 사용량 ~$0.31 — 추정치이며 실제 청구액이 아닙니다.*

키를 붙여넣을 때 함께 설정하세요. 키가 속한 Google 계정에 결제 수단이 등록되어 있으면 유료이며, 어느 쪽인지는 Google이 Interpretab에 알려 주지 않기 때문에 여쭤보는 것입니다. **실제 청구액은 본인의 Google 계정에서만 확인할 수 있습니다.**

### 💳 무료 요금제와 유료 요금제 중 고르기

Gemini API 키의 비용, 한 번에 쓸 수 있는 양, 보낸 데이터를 Google이 어떻게 다루는지는 모두 어느 요금제인지에 따라 달라집니다. Google 문서에서는 유료 쪽을 **Tier 1**이라고 부르는데, Interpretab 옵션 페이지의 **Paid**와 같은 것입니다. [Google이 공개한](https://ai.google.dev/gemini-api/docs/rate-limits) 조건은 다음과 같습니다.

| 요금제 | 조건 | 비용과 상한 | Google이 데이터를 다루는 방식 | Interpretab에서의 쓰임새 |
|---|---|---|---|---|
| **Free** | 결제 수단 등록 불필요 | 무료. 다만 장시간·대량 사용 시 상한에 걸려 오류가 납니다 | **Google 제품 개선에 사용되며, 사람이 검토할 수 있습니다** | 체험용 |
| **Paid**(Google이 말하는 Tier 1) | Google 계정에 결제 수단을 등록 | 종량제. 10분당 $10, 월 $250까지 | 제품 개선에 사용되지 않음. 남용 탐지 목적으로만 짧게 기록 | **꾸준히 쓴다면 여기.** 거의 모든 용도에 충분합니다 |

먼저 무료 요금제로 시험하고, 계속 쓰게 되면 결제 수단을 등록하는 것을 권합니다. 유료 요금제에서는 보낸 내용이 Google 제품 개선에 사용되지 않으며, 이런 도구에는 상한도 넉넉합니다. Interpretab 번역을 동시에 25개 정도, 월 110시간 정도까지 쓸 수 있습니다. Google이 [결제 설정 방법](https://ai.google.dev/gemini-api/docs/billing#setup-billing)을 안내하고 있습니다.

### 🔑 여러 대의 기기와 여러 사람이 Gemini API 키를 공유하는 것

Interpretab은 키를 기기 안(`chrome.storage.local`)에 저장합니다. Chrome의 프로필 동기화로는 옮겨지지 않으므로, 여러 대의 컴퓨터에서 쓰려면 기기마다 붙여넣어야 합니다. **본인이 쓰는 여러 기기에서 같은 키를 쓰는 것은 문제없습니다.**

**다른 사람에게 키를 넘기는 것은** Google의 [API 서비스 약관](https://developers.google.com/terms)상 **허용되지 않습니다.**

### 🛡️ Gemini API 키에 관해 알아 둘 점

- **사용량 제한은 키 단위가 아니라 프로젝트 단위입니다.**
  [Google 문서](https://ai.google.dev/gemini-api/docs/rate-limits)에 그대로 적혀 있습니다. 유료 요금제의 「10분당 $10」은 Interpretab 번역 25개 정도를 동시에 돌리는 수준이며, 그것을 넘으면 오류가 납니다.
- **키는 비밀번호와 같습니다.** 밖으로 새면
  [Google의 안내](https://ai.google.dev/gemini-api/docs/api-key)대로 "다른 사람이 프로젝트의 할당량을 소진하고, 예상치 못한 요금을 발생시키며, 비공개 리소스에 접근할 수 있습니다". 기기를 처분할 때나 키가 유출된 것 같을 때는
  [AI Studio](https://aistudio.google.com/apikey)에서 옛 키를 삭제하고 새로 만드세요.
- **팀에서는 1인 1키가 기본입니다.** 같은 Google Cloud 결제 계정 아래에 구성원별 프로젝트를 만들면, 결제는 한곳에 모으면서 키와 사용량 제한은 각자 나눌 수 있습니다.
- **EEA·스위스·영국 사용자**는 Gemini API의 [추가 약관](https://ai.google.dev/gemini-api/terms)에 따라 유료 요금제를 써야 합니다.
- **번역을 시작할 수 없을 때는 메시지에 원인이 나옵니다.** Interpretab은 무언가를 열기 전에 Google에 키 상태를 먼저 물어보므로, 키가 거부된 경우·지금 Google이 허용하는 양을 다 쓴 경우·키에 Gemini API 사용 권한이 없는 경우를 추측하지 않고 각각 구분해 알려 줍니다. 다 써 버리는 것은 무료 요금제에서 흔한 일입니다.
  [AI Studio](https://aistudio.google.com/apikey)에서 남은 양을 확인하고 상한이 초기화되기를 기다리거나, 결제 수단을 등록하세요. 키 자체는 받아들여졌다는 메시지가 나오면 문제는 키가 아니라 Gemini나 네트워크 쪽입니다. **번역 도중에 멈추는 것도 같은 이유입니다.** 이때 Interpretab은 다시 연결하지 않고 그 자리에서 끝내며 같은 메시지를 보여 줍니다. 상한을 다 썼어도 연결 자체는 일단 맺어졌다가 1초쯤 뒤에 끊기기 때문입니다.

## 🛠️ 오픈소스

Apache 2.0. 소스, 위 내용 뒤에 있는 엔지니어링 노트, 그리고 이슈 트래커는 다음과 같습니다.

- [github.com/kazunori279/interpretab](https://github.com/kazunori279/interpretab)
- [문제 신고 및 기능 요청](https://github.com/kazunori279/interpretab/issues)

## ⚖️ 면책 고지

- **Google의 제품이 아닙니다.** Interpretab은 개인 프로젝트입니다. Google이 만들지 않았고, Google의 지원·보증·검수를 받지도 않았습니다. Google, Gemini, Chrome, YouTube는 Google LLC의 상표입니다.
- **기계 번역입니다.** 잘못 알아듣고, 이름은 추측하며, 말한 적 없는 내용을 자신 있고 듣기 좋은 목소리로 말하기도 합니다. 틀리면 대가가 따르는 자리 — 의료, 법률, 금전, 안전, 원래라면 통역사를 부를 자리 — 에서는 쓰지 마세요.
- **누구의 목소리를 번역할지는 사용자의 판단입니다.** 대화를 녹음하거나 번역하려면 참석자 전원의 동의가 필요한 지역이 있고, 사이트 약관이 그 오디오에 대해 따로 정해 두기도 합니다. 그것은 사용자와 상대방 사이의 문제입니다.
- **보증은 없습니다.** Apache 2.0, 있는 그대로 제공됩니다. Gemini 사용은 사용자 본인의 키로 이루어지고, 요금도 본인 계정으로 청구됩니다.
