---
title: Interpretab
description: ブラウザが再生している音声や、あなたが話した音声を、70 以上の言語にリアルタイムに翻訳、読み上げと字幕表示する Chrome 拡張です。
---

[English](../) · **日本語**

<h1 style="display:flex;align-items:center;gap:.7rem;margin:0 0 .4rem">
  <img src="../icons/icon-128.png" alt="" width="52" height="52" style="border-radius:11px;flex:none">
  <span>Interpretab</span>
</h1>

**ブラウザが再生している音声や、あなたが話した音声を、70 以上の言語にリアルタイムに翻訳、読み上げと字幕表示する Chrome 拡張です。**

## こんな時に使えます

<div style="margin:1rem 0 1.5rem">
  <p style="margin:0 0 .6rem"><b>ブラウザの音声の翻訳</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem;margin:0 0 1.25rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../store/usecase-1-video.svg" alt="" width="52" height="52" style="flex:none">
      <span>ブラウザで再生している動画や配信、ポッドキャスト等を、好きな言語で視聴したい</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../store/usecase-2-meeting.svg" alt="" width="52" height="52" style="flex:none">
      <span>オンラインミーティングで聞こえてくる音声を、好きな言語に翻訳したい</span>
    </div>
  </div>
  <p style="margin:0 0 .6rem"><b>マイクの音声の翻訳</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../store/usecase-3-presentation.svg" alt="" width="52" height="52" style="flex:none">
      <span>プレゼンテーションやオンライン配信で、自分の声を好きな言語に翻訳して投影画面に字幕表示したい</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../store/usecase-4-room.svg" alt="" width="52" height="52" style="flex:none">
      <span>会議室でのミーティングや友達とのおしゃべりで、みんなの声を好きな言語に翻訳したい</span>
    </div>
  </div>
</div>

[![日本語の動画を英語に翻訳している Interpretab の動作画面。動画上に英語の字幕、サイドパネルに文字起こし](../store/hero-tab-ja-en.png)](../store/hero-tab-ja-en.png)

<p><a href="https://www.youtube.com/watch?v=jiY8WJgeKCA">▶ 動作の様子 (2:45)</a></p>

## Interpretab のしくみとプライバシー

Interpretab のリアルタイム翻訳機能は Google の [Gemini Live API](https://ai.google.dev/gemini-api/docs/live) を使って実現されています。あなたの音声や字幕、キー等は、あなたのブラウザと Google のあいだだけで暗号化してやり取りされており、それ以外のどこへも届きません。アクセス解析や利用状況の収集サーバもありません。なお、Gemini Live API モデルの特性上、不正確な翻訳や、翻訳以外の会話を生成することがあります。

- [プライバシーポリシー](../PRIVACY.html)（英語）

## お試し利用は無料、継続利用は 1 時間あたり約 2 ドル

Interpretab はオープンソースのツールです。翻訳機能を提供する Gemini Live API には費用が発生しますが、**お試し利用であれば無料枠**が使えます。継続利用時には **Gemini Live API の費用があなたの Google アカウントに課金されます**。

2026 年 8 月時点で [Google が公開している](https://ai.google.dev/gemini-api/docs/pricing) Gemini Live API の利用料金は次のとおりです。

| 動かしているもの | 音声入力 | 音声出力 | **1 時間あたり** |
|---|---|---|---|
| タブ音声翻訳、またはマイク音声翻訳の Simultaneous モード | $0.0053/min | $0.0315/min | **約 $2.20** |
| マイク音声翻訳の Two-way conversation モード | $0.005/min | $0.018/min | **約 $1.40** |

これは音声が**途切れずに続いた場合**のおおよその費用です。翻訳の分量が少ない場合は発生する費用も下がります。タブ音声翻訳とマイク音声翻訳を同時に使うとセッションも 2 つになるので、費用は 2 行の合計になります。

## インストール

Interpretab は以下の手順でインストールできます。

1. [リポジトリ](https://github.com/kazunori279/interpretab)をダウンロード、または clone する。
2. `chrome://extensions` を開き、**デベロッパーモード**を ON にして、**パッケージ化されていない拡張機能を
   読み込む**からそのフォルダを選ぶ。
3. [aistudio.google.com/apikey](https://aistudio.google.com/apikey) で無料の Gemini API キーを取得し、
   拡張機能の**オプション**ページに貼り付ける。
4. 翻訳したいページを開き、**そのタブで Interpretab のツールバーアイコンをクリックする**。この
   クリックが「このタブの音声を聞いていいですよ」という許可になります。押さずに始めるとエラーが発生します。
5. サイドパネルで言語を選び、**Start** を押す。

Chrome 116 以降が必要です。サイドパネルを閉じても翻訳は止まりません。**Stop** はどのタブからでも
ツールバーアイコンをクリックすれば届きます。

## 翻訳機能を選ぶ

Interpretab では、タブ音声翻訳とマイク音声翻訳の 2 つの翻訳機能をサポートしています。片方だけでも両方同時でも動きます。

[![Interpretab のサイドパネル。2 つの方向カード、言語セレクタ、元音声の音量、Start ボタン](../store/screenshot-4-panel.png)](../store/screenshot-4-panel.png)

**タブ音声翻訳**は、現在のタブが再生している音声を指定した言語（78 言語から選択）に翻訳します。

**マイク音声翻訳**は、PC や Mac のマイクで拾った声を翻訳します。こちらには 2 つのモードがあります。

- **Simultaneous**（同時翻訳モード）は会話を 1 つの言語へ同時翻訳し、しゃべり終わるのを待ちません。
- **Two-way conversation** （2 言語間翻訳モード）は、2 つの言語で交互に会話するためのモードです。両方の言語を指定して
  ノート PC を机の上に置けば、話者がしゃべり終わるのを待ってから、もう一方の言語へ振り分けます。例えば英語と日本語を設定すれば、英語が聞こえれば日本語に、日本語が聞こえれば英語に翻訳します。切り替え操作は必要ありません。97 言語に対応し、[用語登録機能](#glossary)が利用できます。

タブ音声翻訳とマイク音声翻訳を両方 ON にすると、それぞれ別のセッションとして課金されるので、費用はそれらの合計になります。

### 字幕と読み上げ

字幕はページの下部中央に 3 行分が表示され、フルスクリーン表示にも対応します。タブ音声翻訳とマイク音声翻訳の両方を使用する場合は、マイク音声翻訳の字幕に青い縁が付きます。**オプション → Subtitle size** で 16〜64 px の範囲を、見ながら変更できます。

読み上げ音声は、PC / Mac のオーディオ出力から再生され、ミュートボタンでいつでも消音できます。タブ音声翻訳時、タブが再生している音声は、読み上げのあいだだけ**小さな音量で同時に再生**されます。例えば映画の音楽や効果音なども聞くことができます。

マイク音声入力と読み上げ音声出力のオーディオデバイスは、**オプション → Audio input/output**で選択できます。

### オンラインミーティングで使う

**相手側の音声を聞く際には、このツールによる翻訳が使えます。** ミーティングをタブで開き、タブ音声翻訳を ON にして言語を
選び、Start を押すだけです。相手の発言が指定した言語に翻訳され、読み上げと字幕の両方で届きます。

相手側に自分の声の翻訳を聞いてもらうには、相手側のブラウザにも Interpretab をインストールしてもらう必要があります。なお、このツールは Chrome ブラウザのみ対応しているため、デスクトップアプリやネイティブクライアントには対応していません。

### 翻訳モデルと翻訳品質について

タブ音声翻訳、およびマイク音声翻訳の Simultaneous（同時翻訳モード）には、Gemini Live API の [Live Translate](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview) モデルが使用されています。またマイク音声翻訳の Two-way conversation（2 言語間翻訳モード）には、[Gemini Live モデル](https://aistudio.google.com/docs/live-api)が使用されています。後者は同時翻訳には対応しておらず、話し終わるのを待ってから翻訳する使い方になりますが、翻訳品質は Live Translate モデルよりも高くなります。また下記の用語登録機能も利用可能です。

なおいずれの場合でも、翻訳モデルの誤動作により、誤った内容や言語の字幕が表示される場合もあります。

### 用語登録機能
{: #glossary }

マイク音声翻訳の Two-way conversation（2 言語間翻訳モード）では、製品名・人名・専門用語などの読みや表記の間違いを減らす用語登録機能が利用できます。ただし翻訳モデルの誤動作により、登録した読みと表記が反映されない場合もあります。

**オプション → Glossary** で、以下のような CSV ファイルをアップロードして登録できます。

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

1 列目は対象の文字列、2 列目はモデルに**読み**を伝える内容、3 列目は**字幕に表記**したい内容です。

[![用語集の表が入力されたオプションページ](../store/screenshot-3-glossary.png)](../store/screenshot-3-glossary.png)

### 翻訳機能の注意点

- **マイク音声翻訳で同時翻訳モードを使う場合は、イヤホンやヘッドホンを使ってください。** 同時翻訳モードでは翻訳された音声を
  マイクがまた拾ってしまい（エコーループ）、翻訳品質が大きく下がります。
- **マイク音声翻訳で外部スピーカーを使う場合は、ミュートボタン付きのマイクを使ってください。** マイク音声翻訳時に外部スピーカーを使うと、エコーループが発生して翻訳がうまく動作しないことがあります。ミュートボタン付きのマイクを使い、自分が話すときだけミュートをオフにしてください。
- **タブ音声翻訳とマイク音声翻訳を同時に使う場合は、セッションも 2 つになり、発生する費用もそれに応じて増加**します。
- **Interpretab は同時に 1 つのタブでのみ動作します。** 別のタブで Start すると、先に動いていた翻訳は停止します。
- **Chrome ブラウザの設定ページや PDF ファイルへの字幕表示**は Chrome 拡張の制約上、提供できません。読み上げとサイドパネルの文字起こしはそのまま動作します。

## Gemini Live API の利用について

Interpretab のサイドパネルには、その回の経過時間と利用料金の目安がメーターとして **12 min so far, ~$0.31 of Gemini usage this run — an estimate, not your actual bill.** のように表示されます。Start のたびにゼロに戻ります。無料枠では課金されないため、金額ではなく経過時間を目安にしてください。**実際の請求額はご自身の Google アカウントでご確認ください。**

### 無料枠と有料枠の選び方

Gemini API のキーは、プロジェクトの**利用ティア**によって料金・利用量上限・データの扱いが変わります。ティアは支払い実績に応じて自動的に上がり、[Google が公開している](https://ai.google.dev/gemini-api/docs/rate-limits)条件は次のとおりです。

| ティア | 条件 | 費用と上限 | 入力したデータ | Interpretab での使いどころ |
|---|---|---|---|---|
| **Free** | 課金アカウント不要 | 無料。ただし長時間利用や大規模利用時には使用量制限にかかりエラーが発生する | **Google の製品改善に利用され、人手によるレビューの対象になる** | お試し用途 |
| **Tier 1** | 課金アカウントをリンクする | 従量課金。10 分あたり $10 まで、一ヶ月あたり $250 まで利用可能 | 製品改善には利用されない（不正検知目的で一定期間ログのみ） | **日常的に使うならここ。** ほとんどの用途はこれで足ります |

まずは Free ティアで試して、続けて使うなら課金アカウントをリンクして Tier 1 に上げる、というのがおすすめです。Tier 1 では入力したデータが Google の製品改善に利用されることもなく、また Interpretab の翻訳機能を 25 セッション程度まで同時利用したり、一ヶ月あたり 110 時間程度まで利用可能です。

なお、Free ティアの利用上限は公開されておらず、[AI Studio](https://aistudio.google.com/apikey) で確認する形になっています。Interpretab のような長時間つなぎっぱなしの使い方では上限に達しやすく、その場合は接続時にエラーが発生します。

**接続できない場合、API キーの誤りよりも使用量制限に達しているケースのほうが多くあります。** ブラウザは接続が拒否された理由を知ることができないため、Interpretab はその 2 つを区別できず、両方の可能性を表示します。同じ日に一度でも動いていたのなら使用量制限の可能性が高いので、[AI Studio](https://aistudio.google.com/apikey) で上限を確認し、リセットを待つか、課金アカウントをリンクしてティアを上げてください。なお Interpretab は約 20 秒で再接続をあきらめ、理由をサイドパネルに表示します（制限中のエンドポイントに再接続を繰り返し続けることはありません）。

### Gemini API Key の複数PC/Macや複数ユーザーでの共有

Interpretab はキーを端末内（`chrome.storage.local`）に保存します。Chrome のプロファイル同期では運ばれないので、複数の PC / Mac で使う場合は端末ごとに貼り付けることになります。**自分が使う複数の端末で同じキーを使うことは問題ありません。**

一方で、**他の人にキーを渡して共有することは、Google の [API 利用規約](https://developers.google.com/terms)で認められていません。**

### Gemini Live API 利用時の注意点

- **使用量制限はキー単位ではなくプロジェクト単位です。**[Google のドキュメント](https://ai.google.dev/gemini-api/docs/rate-limits)。Tier 1 の「10 分あたり $10」は Interpretab の同時セッション 25 本程度に相当し、それを超えた分はエラーになります。
- **キーはパスワードと同じです。** もしキーが外部に漏れた場合、[Google のガイダンス](https://ai.google.dev/gemini-api/docs/api-key)にあるとおり「他人があなたのキーを無断で使用し、想定外の請求が発生する」ことになります。端末を手放すときや、キーが漏れた可能性があるときは、[AI Studio](https://aistudio.google.com/apikey) で古いキーを削除して作り直してください。
- **チームで使う場合は 1 人 1 キーが基本です。** Google Cloud の同じ請求先アカウントの下にメンバーごとのプロジェクトを作れば、支払いを 1 つにまとめたまま、キーと使用量制限は各自に分けられます。
- **EEA・スイス・英国のユーザー**に使ってもらう場合は、Gemini API の[追加利用規約](https://ai.google.dev/gemini-api/terms)により有料ティアの利用が必須です。

## オープンソース

Apache 2.0。ソース、上記すべての背景にある技術メモ、そして不具合の報告先はこちらです。

- [github.com/kazunori279/interpretab](https://github.com/kazunori279/interpretab)
- [不具合の報告・機能の要望](https://github.com/kazunori279/interpretab/issues)
