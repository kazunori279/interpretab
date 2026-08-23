---
lang: de
title: Anleitung
description: Eine Chrome-Erweiterung, die das, was Ihr Browser abspielt, und das, was Sie sagen, in Echtzeit in über 70 Sprachen übersetzt — laut gesprochen und auf der Seite untertitelt.
---

<h1 style="display:flex;align-items:center;gap:.7rem;margin:0 0 .4rem">
  <img src="../assets/icon-128.png" alt="" width="52" height="52" style="border-radius:11px;flex:none">
  <span>Interpretab</span>
</h1>

**Eine Chrome-Erweiterung, die das, was Ihr Browser abspielt, und das, was Sie sagen, in Echtzeit in
über 70 Sprachen übersetzt — laut gesprochen und auf der Seite untertitelt.**

## 💡 Wofür Sie es benutzen können

<div style="margin:1rem 0 1.5rem">
  <p style="margin:0 0 .6rem"><b>Browser-Audio übersetzen</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem;margin:0 0 1.25rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-1-video.svg" alt="" width="52" height="52" style="flex:none">
      <span>Ein Video, einen Livestream oder einen Podcast, der im Browser läuft, in Ihrer
      Wunschsprache verfolgen.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-2-meeting.svg" alt="" width="52" height="52" style="flex:none">
      <span>Einem Online-Meeting folgen, mit allem, was die Gegenseite sagt, in Ihre Sprache
      übersetzt.</span>
    </div>
  </div>
  <p style="margin:0 0 .6rem"><b>Mikrofon-Audio übersetzen</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-3-presentation.svg" alt="" width="52" height="52" style="flex:none">
      <span>Einen Vortrag oder Livestream halten, mit der eigenen Stimme in einer anderen Sprache
      auf dem Bildschirm untertitelt.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-4-room.svg" alt="" width="52" height="52" style="flex:none">
      <span>Sich in einem Raum treffen oder mit Freunden reden, wobei alle in die von Ihnen
      gewählte Sprache gedolmetscht werden.</span>
    </div>
  </div>
</div>

[![Interpretab übersetzt einen japanischen Vortrag ins Englische: englische Untertitel auf dem Video und das Transkript im Seitenbereich](../assets/hero-tab-ja-en.png)](../assets/hero-tab-ja-en.png)

<p><a href="https://www.youtube.com/watch?v=3TJnSBS3bkE">▶ In Aktion ansehen (2:02)</a></p>

## 🔒 Wie Interpretab arbeitet, und der Datenschutz

Interpretab übersetzt über Googles
[Gemini Live API](https://ai.google.dev/gemini-api/docs/live). Ihr Audio, Ihre Untertitel und Ihr
Schlüssel laufen verschlüsselt zwischen Ihrem Browser und Google und erreichen sonst nichts. Es gibt
auch keinen Analyse- oder Datensammelserver. Beachten Sie: Als Modell der Gemini Live API kann es
ungenau übersetzen und Sprache erzeugen, die überhaupt keine Übersetzung ist.

- [Datenschutzerklärung](../PRIVACY.html) (auf Englisch)

## 💰 Kostenlos zum Ausprobieren, etwa 2 $ pro Stunde im Dauerbetrieb

Interpretab ist ein Open-Source-Werkzeug. Geld kostet die Gemini Live API hinter der Übersetzung,
und ihr kostenloser Tarif reicht zum Ausprobieren — danach wird **die Nutzung der Gemini Live
API Ihrem eigenen Google-Konto in Rechnung gestellt**.

Dies sind die Preise für die Gemini Live API, die
[Google veröffentlicht](https://ai.google.dev/gemini-api/docs/pricing), Stand August 2026:

| Was läuft | Audio ein | Audio aus | **Pro Stunde** |
|---|---|---|---|
| Tab-Audio, oder das Mikrofon im Modus Simultaneous | 0,0053 $/min | 0,0315 $/min | **≈ 2,20 $** |
| Das Mikrofon im Modus Two-way conversation | 0,005 $/min | 0,018 $/min | **≈ 1,40 $** |

Das sind Stunden *durchgehenden* Audios, weniger Reden kostet also weniger. Tab-Audio und Mikrofon
zusammen einzuschalten sind zwei Übersetzungen gleichzeitig, der Preis ist dann die Summe beider
Zeilen.

## 🚀 In 5 Minuten loslegen

Interpretab installieren Sie so:

{% include install-steps.html %}

Chrome 116 oder neuer. Das Schließen des Seitenbereichs beendet die Übersetzung nicht — die
Schaltfläche **Stop** ist von jedem Tab aus immer einen Klick auf das Symbolleisten-Symbol entfernt.

Die Oberfläche von Interpretab folgt der Sprache Ihres Browsers, in den zehn Sprachen dieser Seite.

## 🎛️ Auswählen, was übersetzt wird

Interpretab hat zwei Schalter, **Tab-Audio** und **Mikrofon**. Jeder für sich oder beide gleichzeitig.

[![Der Seitenbereich von Interpretab: die Karten Tab-Audio und Mikrofon, Sprachauswahl, der Regler für die Originallautstärke, Start](../assets/screenshot-4-panel.png)](../assets/screenshot-4-panel.png)

**Tab-Audio** übersetzt alles, was der aktuelle Tab abspielt, in die Sprache Ihrer Wahl, aus 78
Möglichkeiten.

**Mikrofon** übersetzt, was das Mikrofon Ihres Rechners hört. Es hat zwei Modi:

- **Simultaneous** übersetzt Sprache in eine Sprache, ohne abzuwarten, bis der Satz zu Ende ist.
- **Two-way conversation** ist für zwei Personen, die zwei Sprachen sprechen. Benennen Sie beide
  Sprachen, stellen Sie den Laptop zwischen sich auf den Tisch, und es wartet, bis jemand ausgeredet
  hat, und leitet ihn in die jeweils andere Sprache: stellen Sie Deutsch und Japanisch ein, dann
  hört es Deutsch und sagt Japanisch; hört es Japanisch, sagt es Deutsch. Kein Umschalten. 97
  Sprachen, und es ist der einzige Modus, den ein [Glossar](#glossary) erreicht.

Wenn Sie das Mikrofon zum ersten Mal einschalten, muss Chrome es erlauben — einmalig, und der
Erweiterung als Ganzem. Das Panel sagt das und verlinkt auf **Optionen → Mikrofonzugriff**, wo die
Schaltfläche „Mikrofon erlauben“ steht: Chrome zeigt seine Berechtigungsabfrage nur auf einer
eigenen Seite an, nie im Seitenbereich.

Beide zusammen einzuschalten sind zwei Übersetzungen gleichzeitig, Google berechnet also beide und
die Kosten sind die Summe der beiden.

### 💬 Untertitel und die gesprochene Übersetzung

Untertitel erscheinen unten mittig auf der Seite, drei Zeilen auf einmal, und folgen dem Video in
den Vollbildmodus. Wenn Tab-Audio und Mikrofon beide laufen, wird die Zeile des Mikrofons mit einer
blauen Kante markiert. **Optionen → Untertitelgröße** legt die Höhe fest, 16–64 px, live beim
Zuschauen.

Die übersetzte Stimme kommt aus dem Audioausgang Ihres Rechners, und eine Stummschalttaste bringt
sie jederzeit zum Schweigen.

#### 🔊 Die Stimme der Tab-Audio-Übersetzung

Die aus dem Tab-Audio übersetzte Stimme kommt über Ihr Standard-Audiogerät — die Lautsprecher oder
Kopfhörer, die der Rechner ohnehin benutzt. Der eigene Ton des Tabs **läuft leiser darunter
weiter**, während die Übersetzung spricht, sodass Musik und Effekte eines Films weiter zu hören
sind.

#### 🎤 Die Stimme der Mikrofonübersetzung

**Optionen → Audioeingang/-ausgang** wählt, über welches Gerät **Mikrofon** hört und über welches
seine Übersetzung gesprochen wird. Wenn Sie kurz nicht übersetzen wollen oder es so laut im
Raum ist, dass ungewollte Stimmen mit übersetzt werden, schaltet die Mikrofon-Aus-Taste den Eingang
jederzeit ab.

### 👥 Einsatz in Online-Meetings

**Die Gegenseite zu hören ist das, was dieses Werkzeug von Haus aus tut.** Öffnen Sie das Meeting in
einem Tab, schalten Sie Tab-Audio ein, wählen Sie Ihre Sprache und drücken Sie Start. Was gesagt
wird, kommt in Ihrer Sprache an, gesprochen und untertitelt.

**Damit die anderen Ihre übersetzte Stimme hören, ist auf Google Meet nichts zu installieren.**

1. Kopfhörer oder Ohrhörer an den Rechner anschließen — über Lautsprecher hört das Mikrofon das
   Gespräch, und die beiden Richtungen fangen an, einander zu dolmetschen.
2. Tab-Audio einschalten — von ihnen zu Ihnen — und auf Ihre Sprache stellen. Das Mikrofon
   einschalten — von Ihnen zu ihnen — und auf deren Sprache stellen.
3. Auf einem Meet-Tab zeigt die Karte Microphone einen zusätzlichen Schalter: **Die Übersetzung in
   dieses Meet-Gespräch senden**. Eingeschaltet lassen.
4. Start drücken.
5. In Meet **Einstellungen → Audio → Mikrofon** öffnen und **Interpretab (translated)** wählen. Schalten Sie bei der Gelegenheit **Studio Sound** aus.

Ihre eigene Stimme liegt leise darunter, das Gespräch hört also Sie und die Dolmetscherstimme.
Rechnen Sie mit etwa drei Sekunden zwischen dem, was Sie sagen, und dem, was drüben ankommt.

**Bei jedem anderen Dienst** muss die übersetzte Stimme als Mikrofoneingang in die Meeting-App
gelangen, und dafür braucht es ein virtuelles Audiogerät. Am einfachsten ist es nach wie vor, wenn
die anderen Interpretab ebenfalls installieren; geht das nicht:

1. Ein virtuelles Audiogerät installieren: [BlackHole](https://existential.audio/blackhole/) unter macOS, [VB-Cable](https://vb-audio.com/Cable/) unter Windows.
2. Kopfhörer anschließen, wie oben.
3. **Optionen → Audioausgang** → das virtuelle Gerät wählen. Dorthin geht die übersetzte Stimme
   von **Mikrofon**; die von **Tab-Audio** kommt in Ihren Kopfhörern an.
4. In der Mikrofoneingangs-Einstellung der Meeting-App das virtuelle Gerät auswählen.
5. Tab-Audio und Mikrofon einschalten, beide Sprachen einstellen und Start drücken.

Weil dies eine Chrome-Erweiterung ist, funktioniert all das nur mit den Browser-Versionen dieser
Dienste — Desktop-Apps und native Clients sind außer Reichweite.

### 🤖 Die Modelle hinter der Übersetzung, und ihre Qualität

Tab-Audio und der Modus Simultaneous des Mikrofons laufen auf dem Modell
[Live Translate](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview) der
Gemini Live API. Der Modus Two-way conversation des Mikrofons läuft auf dem
[Gemini-Live-Modell](https://aistudio.google.com/docs/live-api), das nicht simultan übersetzen kann
— es wartet, bis jemand ausgeredet hat — dafür aber besser übersetzt als Live Translate und als
einziges das Glossar weiter unten annimmt.

In beiden Fällen kann das Modell danebenliegen, und Untertitel können mit falschem Inhalt oder in
der falschen Sprache herauskommen.

### 📖 Glossar
{: #glossary }

Produktnamen, Personennamen und Fachjargon sind das, was ein allgemeines Modell am häufigsten falsch
macht, in Aussprache wie in Schreibweise. Der **Modus Two-way conversation des Mikrofons** nimmt ein
Glossar an, um diese Fehler zu verringern; kein anderer Modus tut das. Auch hier kann das Modell
danebenliegen, und eine hinterlegte Aussprache oder Schreibweise kommt vielleicht nicht durch.

**Optionen → Glossar** nimmt eine CSV wie diese:

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

Die erste Spalte ist der zu erkennende Begriff, die zweite die *Aussprache*, die dem Modell
vorgegeben wird, und die dritte das, was die **Untertitel zeigen sollen**.

[![Die Optionsseite mit einer ausgefüllten Glossartabelle](../assets/screenshot-3-glossary.png)](../assets/screenshot-3-glossary.png)

### ⚠️ Wissenswertes

- **Für den Modus Simultaneous des Mikrofons Ohr- oder Kopfhörer benutzen.** Dieser Modus spricht
  über Sie hinweg, das Mikrofon fängt also seine eigene übersetzte Stimme wieder ein — eine
  Rückkopplungsschleife — und die Übersetzungsqualität bricht stark ein.
- **Wenn Sie mit dem Mikrofon externe Lautsprecher wollen, nehmen Sie ein Mikrofon mit
  Stummschalttaste.** Lautsprecher speisen die übersetzte Stimme zurück ins Mikrofon — eine
  Rückkopplungsschleife — und die Übersetzung arbeitet nicht mehr richtig. Nur beim Sprechen die
  Stummschaltung aufheben.
- **Tab-Audio und Mikrofon gleichzeitig sind zwei Übersetzungen gleichzeitig**, und ungefähr die
  doppelten Kosten.
- **Interpretab läuft auf einem Tab zur Zeit.** Während es läuft, nennt der Seitenbereich jedes
  anderen Tabs den Tab, auf dem es läuft, und bietet nur **Stop** an. Dort anhalten, dann kommt
  Start zurück.
- **Chrome lässt Erweiterungen weder auf seinen eigenen Seiten noch auf PDFs zeichnen**, dort können
  also keine Untertitel erscheinen. Die gesprochene Übersetzung und das Transkript im Seitenbereich
  funktionieren weiter.
- **Wie gut übersetzt wird, hängt vom Sprachpaar ab.** Englisch und Japanisch ist das Paar, an dem
  das hier gemessen wurde, in stundenlangen Läufen; ein entfernteres oder selteneres Paar kann
  rauer ausfallen, und das lässt sich vorher nicht wissen, nur ausprobieren.

## 📊 Mehr zur Nutzung der Gemini Live API

Der Seitenbereich führt einen Zähler dessen, was der Lauf bisher verbraucht hat, und beginnt bei
jedem Start wieder bei null. Was er zeigt, hängt von **Optionen → Gemini-API-Tarif** ab, wo Sie
angeben, ob Ihr Schlüssel **Free** oder **Paid** ist.

- **Free** (die Voreinstellung): *12 Min. bisher, 18 Min. Gemini-Audio. Im kostenlosen Tarif wird
  dafür nichts berechnet.* Kein Preis, weil es keinen gibt. Die Audiozeit ist die Zahl, die sich zu
  beobachten lohnt: der kostenlose Tarif begrenzt, wie viel Sie auf einmal nutzen können, statt es
  zu berechnen, und genau das wird aufgebraucht.
- **Paid**: *12 Min. bisher, ~$0.31 Gemini-Nutzung in diesem Lauf — eine Schätzung, nicht Ihre
  tatsächliche Rechnung.*

Stellen Sie den Tarif ein, wenn Sie den Schlüssel einfügen. Ein Schlüssel ist kostenpflichtig,
sobald das Google-Konto, zu dem er gehört, eine Zahlungsmethode hat, und Google sagt Interpretab
nicht, welches von beiden es ist — daher die Frage. **Ihr Google-Konto ist der einzige Ort,
an dem Ihre tatsächliche Rechnung existiert.**

### 💳 Die Wahl zwischen dem kostenlosen und einem kostenpflichtigen Tarif

Was ein Gemini-API-Schlüssel kostet, wie hart er begrenzt wird und was Google mit dem macht, was Sie
darüber senden, hängt alles davon ab, in welchem Tarif er ist. Googles eigene Dokumentation nennt
den kostenpflichtigen **Tier 1** — dasselbe, was die Optionsseite von Interpretab **Paid** nennt.
Die Bedingungen, die [Google veröffentlicht](https://ai.google.dev/gemini-api/docs/rate-limits), lauten:

| Tarif | Wie man dorthin kommt | Kosten und Grenzen | Was Google mit Ihren Daten macht | Wo es zu Interpretab passt |
|---|---|---|---|---|
| **Free** | Keine Zahlungsmethode nötig | Kostenlos, aber lange oder starke Nutzung läuft in die Grenzen und bricht mit Fehler ab | **Werden zur Verbesserung von Google-Produkten verwendet und unterliegen menschlicher Prüfung** | Zum Ausprobieren |
| **Paid** (Googles Tier 1) | Dem Google-Konto eine Zahlungsmethode hinzufügen | Nutzungsabhängig, bis 10 $ je 10 Minuten und 250 $ im Monat | Nicht zur Produktverbesserung verwendet; nur kurz zur Missbrauchserkennung protokolliert | **Der richtige Ort bei regelmäßiger Nutzung.** Für fast jeden Einsatz genug |

Fangen Sie im kostenlosen Tarif an und fügen Sie eine Zahlungsmethode hinzu, sobald Sie
dabeibleiben. Im kostenpflichtigen Tarif wird nichts, was Sie senden, zur Verbesserung von
Google-Produkten verwendet, und die Obergrenzen sind für ein Werkzeug wie dieses großzügig: etwa 25
Interpretab-Läufe gleichzeitig und rund 110 Stunden im Monat. Google dokumentiert, [wie man die
Abrechnung einrichtet](https://ai.google.dev/gemini-api/docs/billing#setup-billing).

### 🔑 Einen Gemini-API-Schlüssel zwischen Rechnern und Personen teilen

Interpretab hält den Schlüssel auf dem Rechner, in `chrome.storage.local`. Chromes Profilsynchronisierung
nimmt ihn nicht mit, Interpretab auf mehreren Rechnern zu nutzen heißt also, den Schlüssel in jeden
einzufügen. **Einen Schlüssel auf Ihren eigenen mehreren Rechnern zu verwenden ist in Ordnung.**

**Den Schlüssel jemand anderem zu geben ist es nicht**, nach Googles
[API-Nutzungsbedingungen](https://developers.google.com/terms).

### 🛡️ Wissenswertes zu Ihrem Gemini-API-Schlüssel

- **Ratenbegrenzungen gelten pro Projekt, nicht pro Schlüssel.** Googles
  [Dokumentation](https://ai.google.dev/gemini-api/docs/rate-limits) sagt das wörtlich. Die 10 $ je
  10 Minuten des kostenpflichtigen Tarifs sind etwa 25 gleichzeitige Interpretab-Läufe, alles
  darüber bricht mit Fehler ab.
- **Ein Schlüssel ist ein Passwort.** Wenn er nach außen gerät, gilt
  [Googles Hinweis](https://ai.google.dev/gemini-api/docs/api-key): „Andere können das Kontingent
  Ihres Projekts verbrauchen, unerwartete Kosten verursachen und auf private Ressourcen zugreifen.“
  Wenn Sie sich von einem Rechner trennen oder vermuten, dass ein Schlüssel abgeflossen ist, löschen
  Sie den alten in [AI Studio](https://aistudio.google.com/apikey) und legen einen neuen an.
- **Im Team ein Schlüssel pro Person.** Geben Sie jedem Mitglied ein eigenes Projekt unter demselben
  Google-Cloud-Rechnungskonto, dann bleibt die Zahlung an einer Stelle, während Schlüssel und
  Ratenbegrenzungen es nicht tun.
- **Für Nutzer im EWR, in der Schweiz oder im Vereinigten Königreich** verlangen die
  [zusätzlichen Bedingungen der Gemini API](https://ai.google.dev/gemini-api/terms) einen
  kostenpflichtigen Tarif.
- **Wenn ein Lauf nicht startet, sagt die Meldung, welches Problem es ist.** Interpretab fragt
  Google nach dem Schlüssel, bevor es irgendetwas öffnet, sodass ein abgelehnter Schlüssel, ein
  Schlüssel, der aufgebraucht hat, was Google im Moment erlaubt, und ein Schlüssel ohne Berechtigung
  für die Gemini API getrennt benannt und nicht geraten werden. Aufgebraucht ist der übliche Fall im
  kostenlosen Tarif: in [AI Studio](https://aistudio.google.com/apikey) nachsehen, was übrig ist,
  und auf das Zurücksetzen der Grenze warten, oder eine Zahlungsmethode hinzufügen. Sagt die
  Meldung, der Schlüssel selbst sei angenommen worden, liegt das Problem bei Gemini oder Ihrem Netz,
  nicht am Schlüssel. **Ein Lauf kann aus demselben Grund auch mittendrin abbrechen.** Interpretab
  beendet ihn dann und sagt dasselbe, statt neu zu verbinden: Eine aufgebrauchte Grenze lässt die
  Verbindung noch zustande kommen und schließt sie eine Sekunde später.

## 🛠️ Open Source

Apache 2.0. Quellcode, die technischen Notizen hinter alldem und der Issue-Tracker:

- [github.com/kazunori279/interpretab](https://github.com/kazunori279/interpretab)
- [Ein Problem melden oder eine Funktion vorschlagen](https://github.com/kazunori279/interpretab/issues)

## ⚖️ Haftungsausschluss

- **Kein Google-Produkt.** Interpretab ist ein privates Projekt. Es stammt nicht von Google und
  wird von Google weder unterstützt noch empfohlen noch geprüft. Google, Gemini, Chrome und
  YouTube sind Marken von Google LLC.
- **Es ist maschinelle Übersetzung.** Sie verhört sich, rät bei Namen und sagt manchmal etwas, das
  so nie gesagt wurde — überzeugt und mit angenehmer Stimme. Nicht dort einsetzen, wo ein Fehler
  etwas kostet: Medizin, Recht, Geld, Sicherheit, oder alles, wofür Sie sonst einen Dolmetscher
  bezahlen würden.
- **Wessen Stimme Sie übersetzen, entscheiden Sie.** Mancherorts braucht das Aufzeichnen oder
  Übersetzen eines Gesprächs das Einverständnis aller, und die Bedingungen einer Website können zu
  ihrem Ton eigene Vorgaben machen. Das ist zwischen Ihnen und ihnen zu klären.
- **Keine Gewährleistung.** Apache 2.0, wie besehen. Die Gemini-Nutzung läuft über Ihren eigenen
  Schlüssel und wird Ihrem Konto berechnet.
