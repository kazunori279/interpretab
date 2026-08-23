---
lang: zh
title: 使用指南
description: 一款 Chrome 扩展，把浏览器正在播放的声音和你说出的话实时翻译成 70 多种语言——朗读出来，并在页面上显示字幕。
---

<h1 style="display:flex;align-items:center;gap:.7rem;margin:0 0 .4rem">
  <img src="../assets/icon-128.png" alt="" width="52" height="52" style="border-radius:11px;flex:none">
  <span>Interpretab</span>
</h1>

**一款 Chrome 扩展，把浏览器正在播放的声音和你说出的话实时翻译成 70 多种语言——朗读出来，并在页面上显示字幕。**

## 💡 可以用来做什么

<div style="margin:1rem 0 1.5rem">
  <p style="margin:0 0 .6rem"><b>翻译浏览器音频</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem;margin:0 0 1.25rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-1-video.svg" alt="" width="52" height="52" style="flex:none">
      <span>用你习惯的语言观看浏览器里播放的视频、直播或播客。</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-2-meeting.svg" alt="" width="52" height="52" style="flex:none">
      <span>参加线上会议，把对方说的每一句都翻译成你的语言。</span>
    </div>
  </div>
  <p style="margin:0 0 .6rem"><b>翻译麦克风音频</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-3-presentation.svg" alt="" width="52" height="52" style="flex:none">
      <span>做演讲或直播时，把自己的声音以另一种语言显示为屏幕字幕。</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-4-room.svg" alt="" width="52" height="52" style="flex:none">
      <span>在会议室开会或和朋友聊天时，把每个人的话都口译成你选定的语言。</span>
    </div>
  </div>
</div>

[![Interpretab 正把一场日语演讲译成英语：视频上是英文字幕，侧边栏是文字记录](../assets/hero-tab-ja-en.png)](../assets/hero-tab-ja-en.png)

<p><a href="https://www.youtube.com/watch?v=3TJnSBS3bkE">▶ 观看实际运行（2:02）</a></p>

## 🔒 Interpretab 的工作方式与隐私

Interpretab 通过 Google 的 [Gemini Live API](https://ai.google.dev/gemini-api/docs/live) 完成翻译。你的音频、字幕和密钥在你的浏览器与 Google 之间加密传输，不会到达任何其他地方。也没有任何分析或数据收集服务器。请注意，作为 Gemini Live API 模型，它可能翻译不准确，也可能生成根本不是翻译的语音。

- [隐私政策](../PRIVACY.html)（英文）

## 💰 试用免费，持续使用约每小时 2 美元

Interpretab 是一款开源工具。真正产生费用的是背后的 Gemini Live API，它的免费方案足够你试用——超出之后，**Gemini Live API 的用量会记在你自己的 Google 账号上**。

以下是 2026 年 8 月 [Google 公布](https://ai.google.dev/gemini-api/docs/pricing)的 Gemini Live API 价格：

| 正在运行的内容 | 音频输入 | 音频输出 | **每小时** |
|---|---|---|---|
| 标签页音频，或 Simultaneous 模式下的麦克风 | $0.0053/分钟 | $0.0315/分钟 | **≈ $2.20** |
| Two-way conversation 模式下的麦克风 | $0.005/分钟 | $0.018/分钟 | **≈ $1.40** |

这是*连续*音频的小时费用，说得少花得也少。同时开启标签页音频和麦克风就是同时做两路翻译，价格是两行之和。

## 🚀 5 分钟上手

Interpretab 这样安装：

{% include install-steps.html %}

需要 Chrome 116 或更高版本。关闭侧边栏并不会停止翻译——在任意标签页点一下工具栏图标，**Stop** 始终触手可及。

Interpretab 的界面跟随浏览器的语言，共支持本页列出的十种语言。

## 🎛️ 选择翻译什么

Interpretab 有两个开关：**标签页音频**和**麦克风**。可以只用其一，也可以两个同时用。

[![Interpretab 侧边栏：标签页音频和麦克风两张卡片、语言选择器、原声音量滑块、Start 按钮](../assets/screenshot-4-panel.png)](../assets/screenshot-4-panel.png)

**标签页音频**把当前标签页正在播放的内容翻译成你选定的语言，共 78 种可选。

**麦克风**翻译电脑麦克风听到的声音。它有两种模式：

- **Simultaneous**（同声传译）把语音译成一种语言，不等说话人把话说完。
- **Two-way conversation**（双向对话）适合两个人用两种语言交谈。指定两种语言，把笔记本电脑放在你们中间的桌上，它会等每个人说完，再转到另一种语言——设成中文和日语，听到中文就说日语，听到日语就说中文。无需切换。支持 97 种语言，也是唯一能用[术语表](#glossary)的模式。

第一次开启麦克风时，需要 Chrome 授予麦克风权限，只需一次，权限是授予整个扩展的。面板会提示这一点，并链接到带有「允许使用麦克风」按钮的**选项 → 麦克风权限**。Chrome 的权限提示只会出现在独立页面上，不会出现在侧边栏里。

同时开启标签页音频和麦克风就是同时做两路翻译，Google 两边都收费，费用是两者之和。

### 💬 字幕与朗读

字幕显示在页面底部中央，一次三行，并会跟随视频进入全屏。当标签页音频和麦克风同时开启时，麦克风那一行会带一道蓝色边线。**选项 → 字幕大小**可设置高度，16〜64 px，边看边改立即生效。

翻译语音从电脑的音频输出播放，静音按钮可随时把它关掉。

#### 🔊 标签页音频翻译的语音

从标签页音频翻译出的语音，会用默认音频设备播放，也就是电脑当前正在用的扬声器或耳机。朗读期间标签页原本的声音会**以较小音量继续播放**，电影的配乐和音效依然听得见。

#### 🎤 麦克风翻译的语音

**选项 → 音频输入／输出**可以指定**麦克风**用哪个设备收音，以及用哪个设备播放它的翻译语音。想暂时停止翻译，或者环境太吵、连不打算翻译的说话声也被收进来时，用麦克风关闭按钮可随时关掉输入。

### 👥 在线上会议中使用

**听懂对方，正是这个工具开箱即用的能力。** 在标签页里打开会议，开启标签页音频，选好语言按 Start。对方说的话会以你的语言到达，既朗读也显示字幕。

**要让对方听到你被翻译后的声音**，在 Google Meet 上不需要装任何东西。

1. 给电脑接上头戴耳机或耳塞——用扬声器的话，麦克风会听到通话，两个方向就开始互相翻译了。
2. 开启标签页音频（对方 → 你），语言设为你的语言；开启麦克风（你 → 对方），语言设为对方的语言。
3. 在 Meet 的标签页上，Microphone 卡片会多出一个开关：**把译文语音送进这个 Meet 通话**。保持开启。
4. 按 Start。
5. 在 Meet 里打开**设置 → 音频 → 麦克风**，选 **Interpretab (translated)**。顺手把 **Studio Sound** 关掉。

你自己的声音也低低地混在下面一起送出，所以通话里既听得到译文，也听得到你。从你开口到对方听见译文，大约三秒。

**在其他服务上**，译文语音要进入会议应用的麦克风输入，就需要虚拟音频设备。最简单的办法仍然是请对方也装上 Interpretab，在他们那一端翻译；做不到的话：

1. 安装虚拟音频设备：macOS 用 [BlackHole](https://existential.audio/blackhole/)，Windows 用 [VB-Cable](https://vb-audio.com/Cable/)。
2. 同上，接上耳机。
3. **选项 → 音频输出** → 选择该虚拟音频设备。**麦克风**翻译出来的语音会送到那里；**标签页音频**的翻译则从耳机里听到。
4. 在会议应用的麦克风输入设置里，选择该虚拟音频设备。
5. 开启标签页音频和麦克风，设好两边的语言，按 Start。

由于这是 Chrome 扩展，以上一切只对这些服务的网页版有效——桌面应用和原生客户端无能为力。

### 🤖 翻译背后的模型与翻译质量

标签页音频和麦克风的 Simultaneous 模式运行在 Gemini Live API 的
[Live Translate](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview)
模型上。麦克风的 Two-way conversation 模式运行在
[Gemini Live 模型](https://aistudio.google.com/docs/live-api)上，后者无法同声传译——它要等说话人讲完——但翻译质量比 Live Translate 更好，而且只有它支持下面的术语表。

无论哪一种，模型都可能出错，字幕可能出现错误内容，或者出现错误的语言。

### 📖 术语表
{: #glossary }

产品名、人名和专业术语是通用模型最常出错的地方，读音和写法都容易错。**麦克风的 Two-way conversation 模式**支持用术语表来减少这类错误；其他模式都不支持。即便如此模型仍可能出错，登记的读音或写法未必一定生效。

**选项 → 术语表**接受这样的 CSV：

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

第一列是要匹配的词，第二列是告诉模型采用的*读音*，第三列是你希望**字幕上显示**的写法。

[![填好术语表的选项页面](../assets/screenshot-3-glossary.png)](../assets/screenshot-3-glossary.png)

### ⚠️ 需要注意的事

- **麦克风的 Simultaneous 模式请使用耳机。** 该模式会在你说话时同时开口，麦克风会把自己的翻译语音重新收进去——形成回声环路——翻译质量会明显下降。
- **如果麦克风要配外接扬声器，请用带静音按钮的麦克风。** 扬声器会把翻译语音送回麦克风——形成回声环路——翻译就无法正常工作。只在自己说话时解除静音。
- **标签页音频和麦克风同时使用就是同时做两路翻译**，费用也差不多翻倍。
- **Interpretab 一次只在一个标签页上运行。** 运行期间，在其他任何标签页打开侧边栏，都会显示它正在哪个标签页运行，并且只提供 **Stop**。在那里停止后，Start 就会回来。
- **Chrome 不允许扩展在自己的页面和 PDF 上绘制内容**，因此那里无法显示字幕。朗读和侧边栏的文字记录仍然正常。
- **翻译质量取决于语言对。** 英语和日语是本项目做过长时间实测的组合；语言距离更远或使用者更少的组合可能更粗糙，事先无从判断，只能实际试一试。

## 📊 关于 Gemini Live API 的更多说明

侧边栏会显示这一次运行到目前为止的用量，每次按 Start 都从零重新开始。显示内容取决于**选项 → Gemini API 方案**：请选择你使用的密钥是 **Free** 还是 **Paid**。

- **Free**（默认）：*已运行 12 分钟，Gemini 音频 18 分钟。免费方案不收费。* 不显示金额，因为本来就没有金额。值得关注的数字是音频时长：免费方案限制的是一次能用多少，而不是收多少钱，用掉的正是这个。
- **Paid**：*已运行 12 分钟，本次 Gemini 用量约 ~$0.31——这是估算值，不是你的实际账单。*

粘贴密钥时顺手设置好即可。密钥所属的 Google 账号一旦有付款方式就属于付费，而 Google 不会把这一点告诉 Interpretab，所以才要问你。**你的实际账单只存在于你的 Google 账号里。**

### 💳 免费方案与付费方案怎么选

Gemini API 密钥的费用、一次能用多少，以及 Google 如何处理你发送的数据，都取决于它属于哪个方案。Google 自己的文档把付费的那个叫做 **Tier 1**，也就是 Interpretab 选项页里的 **Paid**。[Google 公布](https://ai.google.dev/gemini-api/docs/rate-limits)的条件如下：

| 方案 | 如何达到 | 费用与上限 | Google 如何处理你的数据 | 在 Interpretab 中的定位 |
|---|---|---|---|---|
| **Free** | 无需付款方式 | 免费，但长时间或大量使用会触及上限并报错 | **会被用于改进 Google 的产品，且可能经人工审核** | 试用 |
| **Paid**（Google 所说的 Tier 1） | 给 Google 账号添加付款方式 | 按量付费，每 10 分钟最高 $10，每月最高 $250 | 不用于改进产品；仅为滥用检测短期留存日志 | **经常使用就该在这一层。** 几乎所有用途都够用 |

建议先用免费方案试，确定会长期使用后再添加付款方式。在付费方案下，你发送的内容不会被用于改进 Google 的产品，而且对这类工具来说上限相当宽裕：大约可同时运行 25 路 Interpretab 翻译，每月约 110 小时。Google 也提供了[开通结算的说明](https://ai.google.dev/gemini-api/docs/billing#setup-billing)。

### 🔑 在多台设备和多人之间共用一个 Gemini API 密钥

Interpretab 把密钥保存在本机的 `chrome.storage.local` 里。Chrome 的配置同步不会带走它，所以在多台电脑上使用就要在每台上分别粘贴。**在自己的多台设备上使用同一个密钥没有问题。**

**把密钥交给别人则不行**，这不符合 Google 的 [API 服务条款](https://developers.google.com/terms)。

### 🛡️ 关于 Gemini API 密钥需要注意的事

- **速率限制按项目计算，而不是按密钥。**
  [Google 的文档](https://ai.google.dev/gemini-api/docs/rate-limits)就是这么写的。付费方案的「每 10 分钟 $10」大约相当于同时运行 25 路 Interpretab 翻译，超出部分会报错。
- **密钥等同于密码。** 一旦外泄，就会出现
  [Google 指南](https://ai.google.dev/gemini-api/docs/api-key)所说的情况：「他人可以消耗你项目的配额、造成意外账单，并访问私有资源。」处置旧设备时，或怀疑密钥可能泄露时，请在
  [AI Studio](https://aistudio.google.com/apikey) 删除旧密钥并新建一个。
- **团队使用建议一人一个密钥。** 在同一个 Google Cloud 结算账号下给每位成员建立各自的项目，付款集中在一处，而密钥和速率限制彼此分开。
- **对于欧洲经济区、瑞士或英国的用户**，Gemini API 的[附加条款](https://ai.google.dev/gemini-api/terms)要求使用付费方案。
- **如果无法开始翻译，错误信息会告诉你原因。** Interpretab 在打开任何连接之前会先向 Google 查询密钥状态，因此密钥被拒、密钥已用完 Google 当前允许的额度、密钥无权调用 Gemini API 这三种情况会分别指明，而不是靠猜。用完额度是免费方案上最常见的：到
  [AI Studio](https://aistudio.google.com/apikey) 查看还剩多少，等待上限重置，或者添加付款方式。如果提示说密钥本身已被接受，那问题出在 Gemini 或你的网络，而不是密钥。**翻译中途停止也是同样的原因。**这时 Interpretab 不会重连，而是就地结束并显示同样的提示：额度用完后连接仍会先建立起来，一秒左右才被断开。

## 🛠️ 开源

Apache 2.0。源码、上述内容背后的工程笔记，以及问题追踪：

- [github.com/kazunori279/interpretab](https://github.com/kazunori279/interpretab)
- [报告问题或提出功能建议](https://github.com/kazunori279/interpretab/issues)

## ⚖️ 免责声明

- **不是 Google 的产品。** Interpretab 是个人项目，并非由 Google 制作，也未经 Google 支持、认可或审核。Google、Gemini、Chrome、YouTube 是 Google LLC 的商标。
- **这是机器翻译。** 它会听错，会猜名字，有时还会用一把自信而好听的声音说出讲话人没说过的话。凡是错了要付出代价的场合——医疗、法律、金钱、安全，或者本该请口译员的场合——都不要用它。
- **要翻译谁的声音，由你自己判断。** 有些地方录制或翻译一段对话需要在场所有人同意，网站的条款也可能对其音频另有规定。那是你和他们之间的事。
- **不提供任何担保。** Apache 2.0，按现状提供。Gemini 的用量走你自己的密钥，费用记在你自己的账户上。
