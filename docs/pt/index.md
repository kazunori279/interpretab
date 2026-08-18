---
lang: pt
title: Guia de uso
description: Uma extensão do Chrome que traduz o que o seu navegador está reproduzindo, e o que você fala, para mais de 70 idiomas em tempo real — falado em voz alta e legendado na página.
---

<h1 style="display:flex;align-items:center;gap:.7rem;margin:0 0 .4rem">
  <img src="../assets/icon-128.png" alt="" width="52" height="52" style="border-radius:11px;flex:none">
  <span>Interpretab</span>
</h1>

**Uma extensão do Chrome que traduz o que o seu navegador está reproduzindo, e o que você fala, para
mais de 70 idiomas em tempo real — falado em voz alta e legendado na página.**

## Para que serve

<div style="margin:1rem 0 1.5rem">
  <p style="margin:0 0 .6rem"><b>Traduzir o áudio do navegador</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem;margin:0 0 1.25rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-1-video.svg" alt="" width="52" height="52" style="flex:none">
      <span>Assistir a um vídeo, uma transmissão ao vivo ou um podcast tocando no navegador no
      idioma que você preferir.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-2-meeting.svg" alt="" width="52" height="52" style="flex:none">
      <span>Acompanhar uma reunião online com tudo o que o outro lado diz traduzido para o seu
      idioma.</span>
    </div>
  </div>
  <p style="margin:0 0 .6rem"><b>Traduzir o áudio do microfone</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-3-presentation.svg" alt="" width="52" height="52" style="flex:none">
      <span>Fazer uma apresentação ou uma transmissão com a sua própria voz legendada na tela em
      outro idioma.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-4-room.svg" alt="" width="52" height="52" style="flex:none">
      <span>Reunir-se em uma sala, ou conversar com amigos, com todo mundo interpretado para o
      idioma que você escolher.</span>
    </div>
  </div>
</div>

[![Interpretab traduzindo uma palestra em japonês para o inglês: legendas em inglês no vídeo e a transcrição no painel lateral](../assets/hero-tab-ja-en.png)](../assets/hero-tab-ja-en.png)

<p><a href="https://www.youtube.com/watch?v=jiY8WJgeKCA">▶ Veja funcionando (2:45)</a></p>

## Como o Interpretab funciona, e a privacidade

O Interpretab traduz pela
[Gemini Live API](https://ai.google.dev/gemini-api/docs/live) do Google. Seu áudio, suas legendas e
sua chave trafegam criptografados entre o seu navegador e o Google, e não chegam a nenhum outro
lugar. Também não há servidor de análise nem de coleta de dados. Vale lembrar que, por ser um
modelo da Gemini Live API, ele pode traduzir de forma imprecisa e pode produzir fala que não é
tradução alguma.

- [Política de privacidade](../PRIVACY.html) (em inglês)

## Gratuito para experimentar, cerca de US$ 2 por hora para manter rodando

O Interpretab é uma ferramenta de código aberto. O que custa dinheiro é a Gemini Live API por trás
da tradução, e o nível gratuito dela basta para experimentar — depois disso, **o uso da Gemini Live
API é cobrado da sua própria conta do Google**.

Estes são os preços da Gemini Live API que o
[Google publica](https://ai.google.dev/gemini-api/docs/pricing) em agosto de 2026:

| O que está rodando | Áudio de entrada | Áudio de saída | **Por hora** |
|---|---|---|---|
| Áudio da aba, ou o microfone no modo Simultaneous | US$ 0,0053/min | US$ 0,0315/min | **≈ US$ 2,20** |
| O microfone no modo Two-way conversation | US$ 0,005/min | US$ 0,018/min | **≈ US$ 1,40** |

São horas de áudio *contínuo*, então falar menos custa menos. Ligar o áudio da aba e o microfone ao
mesmo tempo abre duas sessões, então o preço é a soma das duas linhas.

## Instalação

O Interpretab se instala assim:

1. No [repositório do Interpretab](https://github.com/kazunori279/interpretab), clique no botão
   `Code`, escolha `Download ZIP` e descompacte.
2. No Chrome, abra `chrome://extensions`, ative o **modo do desenvolvedor**, clique em **Carregar
   sem compactação** e escolha a pasta descompactada.
3. Pegue uma chave de API do Gemini gratuita em
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) e cole na página de **Opções**
   da extensão.
4. Abra a página que quer traduzir e **clique no ícone do Interpretab na barra de ferramentas
   estando naquela aba**. Esse clique é como você dá permissão para ouvir a aba — sem ele, aparece
   um erro.
5. Escolha o seu idioma no painel lateral e aperte **Start**.

Chrome 116 ou mais novo. Fechar o painel lateral não interrompe a tradução — o botão **Stop** está
sempre a um clique no ícone da barra de ferramentas, de qualquer aba.

A interface do Interpretab acompanha o idioma do seu navegador, nos dez idiomas desta página.

## Escolhendo o que traduzir

O Interpretab tem duas direções, áudio da aba e microfone. Cada uma sozinha, ou as duas ao mesmo
tempo.

[![O painel lateral do Interpretab: dois cartões de direção, seletores de idioma, o controle do volume original, Start](../assets/screenshot-4-panel.png)](../assets/screenshot-4-panel.png)

**Áudio da aba** traduz o que a aba atual estiver reproduzindo para o idioma que você escolher,
entre 78.

**Microfone** traduz o que o microfone do seu computador ouve. Tem dois modos:

- **Simultaneous** traduz a fala para um idioma sem esperar que a pessoa termine a frase.
- **Two-way conversation** é para duas pessoas falando em dois idiomas. Nomeie os dois idiomas,
  ponha o notebook na mesa entre vocês, e ele espera cada um terminar e encaminha para o outro
  idioma — configure português e japonês, e ele ouve português, fala japonês; ouve japonês, fala
  português. Sem alternar nada. 97 idiomas, e é o único modo que uma
  [lista de termos](#glossary) alcança.

Ligar o áudio da aba e o microfone ao mesmo tempo cobra as duas como sessões separadas, então o
custo é a soma das duas.

### As legendas e a tradução falada

As legendas aparecem embaixo, no centro da página, três linhas por vez, e acompanham o vídeo em tela
cheia. Quando o áudio da aba e o microfone estão ligados, a linha do microfone é marcada com uma
borda azul. **Opções → Tamanho das legendas** define a altura, de 16 a 64 px, ao vivo enquanto você
assiste.

A voz traduzida sai pela saída de áudio do seu computador, e um botão de mudo a silencia a qualquer
momento. Com o áudio da aba, o som da própria aba **continua tocando por baixo em volume mais
baixo** enquanto a tradução fala, então a música e os efeitos de um filme continuam lá.

**Opções → Entrada / Saída de áudio** escolhe por qual dispositivo o microfone é ouvido e por qual a
tradução é falada.

### Usando em reuniões online

**Ouvir o outro lado é o que esta ferramenta faz de fábrica.** Abra a reunião em uma aba, ligue o
áudio da aba, escolha o seu idioma e aperte Start. O que disserem chega no seu idioma, falado e
legendado.

Aponte as duas direções para idiomas *diferentes* numa chamada — o áudio da aba para o seu idioma, o
microfone para o deles. Os padrões apontam as duas para o mesmo, o que devolveria ao outro lado as
próprias palavras dele parafraseadas. Use aqui o modo **Simultaneous** do microfone, não o Two-way
conversation: o outro lado chega pela aba, já traduzido pela outra direção.

**Para que eles ouçam a sua voz traduzida**, o mais simples é que instalem o Interpretab também e
traduzam a sua voz do lado deles. Se não puderem, a voz traduzida precisa chegar à reunião como um
microfone — e o Chrome não dá às extensões nenhuma forma de registrar um, então ela tem que ser
reproduzida em algum lugar que a reunião já esteja ouvindo:

1. Instale um dispositivo de áudio virtual:
   [BlackHole](https://existential.audio/blackhole/) no macOS,
   [VB-Cable](https://vb-audio.com/Cable/) no Windows.
2. **Opções → Saída de áudio** → escolha ele. Só a voz da direção do microfone vai para lá; a
   tradução da direção da aba fica nas suas caixas de som, porque é essa que você está ouvindo.
3. Na reunião, escolha o mesmo dispositivo como seu microfone.
4. Use fones. Em caixas de som, o microfone ouve a chamada e a chamada ouve a sala, e as duas
   direções começam a interpretar uma à outra.

Você não vai ouvir a sua própria voz traduzida enquanto ela desce pelo cabo. Para monitorar, passe
por um Dispositivo de Saída Múltipla do macOS ou pelo repetidor do VB-Cable.

Como isto é uma extensão do Chrome, tudo isso só funciona com as versões web desses serviços —
aplicativos de desktop e clientes nativos estão fora de alcance.

### Os modelos por trás da tradução, e a qualidade dela

O áudio da aba e o modo Simultaneous do microfone rodam no modelo
[Live Translate](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview) da
Gemini Live API. O modo Two-way conversation do microfone roda no
[modelo Gemini Live](https://aistudio.google.com/docs/live-api), que não consegue traduzir de forma
simultânea — ele espera a pessoa terminar — mas traduz melhor que o Live Translate, e é o único que
aceita a lista de termos abaixo.

De um jeito ou de outro, o modelo pode errar, e as legendas podem sair com o conteúdo errado, ou no
idioma errado.

### Glossário
{: #glossary }

Nomes de produtos, nomes de pessoas e jargão são o que um modelo geral mais erra, tanto na pronúncia
quanto na escrita. O **modo Two-way conversation do microfone** aceita uma lista de termos para
reduzir esses erros; nenhum outro modo aceita. O modelo ainda assim pode errar, e uma pronúncia ou
grafia cadastrada pode não aparecer.

**Opções → Glossário** aceita um CSV assim:

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

A primeira coluna é o termo a reconhecer, a segunda é a *pronúncia* que se manda o modelo usar, e a
terceira é o que você quer que as **legendas mostrem**.

[![A página de Opções com uma tabela de glossário preenchida](../assets/screenshot-3-glossary.png)](../assets/screenshot-3-glossary.png)

### O que é bom saber

- **Use fones de ouvido para o modo Simultaneous do microfone.** Esse modo fala por cima de você,
  então o microfone capta de volta a própria voz traduzida — um loop de eco — e a qualidade da
  tradução cai muito.
- **Se quiser caixas de som externas com o microfone, use um microfone com botão de mudo.** As
  caixas devolvem a voz traduzida para o microfone — um loop de eco — e a tradução para de funcionar
  direito. Tire do mudo só enquanto estiver falando.
- **Áudio da aba e microfone ao mesmo tempo significa duas sessões**, e um custo que sobe junto.
- **O Interpretab roda em uma aba por vez.** Enquanto está rodando, o painel lateral de qualquer
  outra aba diz em qual aba ele está e oferece só **Stop**. Pare por lá e o Start volta.
- **O Chrome não deixa extensões desenharem nas próprias páginas dele nem em PDFs**, então legendas
  não podem aparecer ali. A tradução falada e a transcrição do painel lateral continuam
  funcionando.
- **A qualidade da tradução depende do par de idiomas.** Inglês e japonês é o par em que isto foi
  medido, em execuções de uma hora; um par mais distante ou menos comum pode sair mais tosco, e não
  há como saber de antemão a não ser testando.

## Mais sobre o uso da Gemini Live API

O painel lateral mantém um medidor do que a execução consumiu até agora, e recomeça do zero cada vez
que você aperta Start. O que ele mostra depende de **Opções → Plano da API do Gemini**: escolha se a
chave que você usa está no nível gratuito ou no Tier 1.

- **Free** (o padrão): *12 min até agora, 18 min de áudio do Gemini. No plano gratuito nada disso é
  cobrado.* Sem preço, porque não há preço. O tempo de áudio é o número que vale a pena
  acompanhar: o nível gratuito é limitado por taxa e não por dinheiro, então é nisso que os limites
  dele são gastos.
- **Paid**: *12 min até agora, ~$0.31 de uso do Gemini nesta execução — uma estimativa, não a sua
  fatura real.*

Configure o plano na hora de colar a chave — é o projeto em que você a criou, e um projeto está no
nível pago assim que tem uma conta de faturamento vinculada. **A sua conta do Google é o único lugar
onde a sua fatura real existe.**

### Escolhendo entre o nível gratuito e um pago

Quanto custa uma chave da API do Gemini, com que rigor ela é limitada e o que o Google faz com o que
você envia por ela dependem do **nível de uso** do projeto. Os requisitos que o
[Google publica](https://ai.google.dev/gemini-api/docs/rate-limits) são:

| Nível | Como se qualificar | Custo e limites | O que o Google faz com seus dados | Onde entra no Interpretab |
|---|---|---|---|---|
| **Free** | Não precisa de conta de faturamento | Sem custo, mas uso longo ou intenso esbarra nos limites de taxa e dá erro | **Usados para melhorar os produtos do Google, e sujeitos a revisão humana** | Para experimentar |
| **Tier 1** | Vincular uma conta de faturamento ativa | Pagamento por uso, até US$ 10 a cada 10 minutos e US$ 250 por mês | Não usados para melhorar produtos; registrados brevemente só para detectar abuso | **Onde ficar se você usa com frequência.** Suficiente para quase qualquer uso |

Comece no nível gratuito e vincule uma conta de faturamento para chegar ao Tier 1 quando o uso
virar rotina. No Tier 1 nada do que você envia é usado para melhorar os produtos do Google, e os
tetos são folgados para uma ferramenta como esta: cerca de 25 sessões do Interpretab ao mesmo tempo,
e por volta de 110 horas por mês. O Google documenta [como configurar o
faturamento](https://ai.google.dev/gemini-api/docs/billing#setup-billing).

### Compartilhar uma chave da API do Gemini entre máquinas e pessoas

O Interpretab guarda a chave na máquina, em `chrome.storage.local`. A sincronização de perfil do
Chrome não leva ela junto, então usar o Interpretab em vários computadores significa colar a chave
em cada um. **Usar uma chave nas suas próprias várias máquinas é permitido.**

**Entregar a chave para outra pessoa não é**, pelos
[Termos de Serviço das APIs](https://developers.google.com/terms) do Google.

### O que é bom saber sobre a sua chave da API do Gemini

- **Os limites de taxa são por projeto, não por chave.** A
  [documentação do Google](https://ai.google.dev/gemini-api/docs/rate-limits) diz isso com todas as
  letras. Os US$ 10 a cada 10 minutos do Tier 1 dão cerca de 25 sessões do Interpretab ao mesmo
  tempo, e o que passar disso dá erro.
- **Uma chave é uma senha.** Se ela vazar, vale a
  [orientação do Google](https://ai.google.dev/gemini-api/docs/api-key): "outros podem consumir a
  cota do seu projeto, gerar cobranças inesperadas e acessar recursos privados". Quando se desfizer
  de uma máquina, ou achar que uma chave pode ter vazado, apague a antiga no
  [AI Studio](https://aistudio.google.com/apikey) e crie outra.
- **Para uma equipe, uma chave por pessoa.** Dê a cada integrante o próprio projeto sob a mesma
  conta de faturamento do Google Cloud e o pagamento fica num lugar só, enquanto as chaves e os
  limites de taxa não.
- **Para usuários do EEE, da Suíça ou do Reino Unido**, os
  [Termos adicionais da API do Gemini](https://ai.google.dev/gemini-api/terms) exigem um nível pago.
- **Se uma execução não começa, a mensagem diz qual é o problema.** O Interpretab pergunta ao Google
  sobre a chave antes de abrir qualquer coisa, então uma chave rejeitada, uma cota esgotada e uma
  chave sem permissão para chamar a API do Gemini são nomeadas separadamente em vez de adivinhadas.
  Cota é o caso comum no nível gratuito: veja os limites no
  [AI Studio](https://aistudio.google.com/apikey) e espere eles zerarem, ou configure o faturamento
  e vá para o Tier 1. Se a mensagem disser que a chave em si foi aceita, o problema é a Live API ou
  a sua rede, não a chave.

## Código aberto

Apache 2.0. O código, as notas de engenharia por trás de tudo isso, e o rastreador de problemas:

- [github.com/kazunori279/interpretab](https://github.com/kazunori279/interpretab)
- [Relatar um problema ou pedir um recurso](https://github.com/kazunori279/interpretab/issues)
