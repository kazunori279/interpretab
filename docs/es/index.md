---
lang: es
title: Guía de uso
description: Una extensión de Chrome que traduce lo que reproduce tu navegador, y lo que tú dices, a más de 70 idiomas en tiempo real — hablado en voz alta y subtitulado en la página.
---

<h1 style="display:flex;align-items:center;gap:.7rem;margin:0 0 .4rem">
  <img src="../assets/icon-128.png" alt="" width="52" height="52" style="border-radius:11px;flex:none">
  <span>Interpretab</span>
</h1>

**Una extensión de Chrome que traduce lo que reproduce tu navegador, y lo que tú dices, a más de 70
idiomas en tiempo real — hablado en voz alta y subtitulado en la página.**

## Para qué sirve

<div style="margin:1rem 0 1.5rem">
  <p style="margin:0 0 .6rem"><b>Traducir el audio del navegador</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem;margin:0 0 1.25rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-1-video.svg" alt="" width="52" height="52" style="flex:none">
      <span>Ver un vídeo, una retransmisión en directo o un pódcast que suena en tu navegador en el
      idioma que prefieras.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-2-meeting.svg" alt="" width="52" height="52" style="flex:none">
      <span>Seguir una reunión en línea con todo lo que dice la otra parte traducido a tu
      idioma.</span>
    </div>
  </div>
  <p style="margin:0 0 .6rem"><b>Traducir el audio del micrófono</b></p>
  <div style="display:flex;flex-wrap:wrap;gap:1rem 1.5rem">
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-3-presentation.svg" alt="" width="52" height="52" style="flex:none">
      <span>Dar una presentación o una retransmisión con tu propia voz subtitulada en pantalla en
      otro idioma.</span>
    </div>
    <div style="flex:1 1 19rem;display:flex;gap:.9rem;align-items:center">
      <img src="../assets/usecase-4-room.svg" alt="" width="52" height="52" style="flex:none">
      <span>Reunirte en una sala, o charlar con amigos, con todo el mundo interpretado al idioma
      que elijas.</span>
    </div>
  </div>
</div>

[![Interpretab traduciendo una charla en japonés al inglés: subtítulos en inglés sobre el vídeo y la transcripción en el panel lateral](../assets/hero-tab-ja-en.png)](../assets/hero-tab-ja-en.png)

<p><a href="https://www.youtube.com/watch?v=jiY8WJgeKCA">▶ Verlo funcionar (2:45)</a></p>

## Cómo funciona Interpretab, y la privacidad

Interpretab traduce a través de la
[Gemini Live API](https://ai.google.dev/gemini-api/docs/live) de Google. Tu audio, tus subtítulos y
tu clave viajan cifrados entre tu navegador y Google, y no llegan a ningún otro sitio. Tampoco hay
servidor de analítica ni de recogida de datos. Ten en cuenta que, al ser un modelo de la Gemini
Live API, puede traducir de forma inexacta y puede producir habla que no es una traducción en
absoluto.

- [Política de privacidad](../PRIVACY.html) (en inglés)

## Gratis para probarlo, unos 2 $ la hora para seguir usándolo

Interpretab es una herramienta de código abierto. Lo que cuesta dinero es la Gemini Live API que
hay detrás de la traducción, y su plan gratuito basta para probarla — a partir de ahí, **el uso de
la Gemini Live API se factura a tu propia cuenta de Google**.

Estas son las tarifas de la Gemini Live API que
[Google publica](https://ai.google.dev/gemini-api/docs/pricing) en agosto de 2026:

| Qué está funcionando | Audio de entrada | Audio de salida | **Por hora** |
|---|---|---|---|
| Audio de la pestaña, o el micrófono en modo Simultaneous | 0,0053 $/min | 0,0315 $/min | **≈ 2,20 $** |
| El micrófono en modo Two-way conversation | 0,005 $/min | 0,018 $/min | **≈ 1,40 $** |

Son horas de audio *continuo*, así que hablar menos cuesta menos. Encender a la vez el audio de la
pestaña y el micrófono son dos traducciones a la vez, así que el precio es la suma de las dos
filas.

## Instalación

Interpretab se instala así:

1. Abre [Interpretab en Chrome Web
   Store](https://chromewebstore.google.com/detail/interpretab/johnocemcoemdhiogfgmphjmlghgdnbm)
   y pulsa **Añadir a Chrome**.
2. Consigue una clave gratuita de la API de Gemini en
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) y pégala en la página de
   **Opciones** de la extensión.
3. Abre la página que quieras traducir y **pulsa el icono de Interpretab en la barra de
   herramientas estando en esa pestaña**. Ese clic es como das permiso para escuchar la pestaña; si
   te lo saltas, obtendrás un error.
4. Elige tu idioma en el panel lateral y pulsa **Start**.

Chrome 116 o posterior. Cerrar el panel lateral no detiene la traducción: el botón **Stop** está
siempre a un clic del icono de la barra de herramientas, desde cualquier pestaña.

Interpretab es de código abierto, así que también puedes ejecutarlo desde el código: descarga un
ZIP desde [el repositorio](https://github.com/kazunori279/interpretab), descomprímelo, abre
`chrome://extensions`, activa el **modo de desarrollador**, pulsa **Cargar descomprimida** y elige
la carpeta descomprimida.

La interfaz de Interpretab sigue el idioma de tu navegador, en los diez idiomas de esta página.

## Elegir qué traducir

Interpretab tiene dos interruptores, **Audio de la pestaña** y **Micrófono**. Cualquiera por su
cuenta, o los dos a la vez.

[![El panel lateral de Interpretab: las tarjetas Audio de la pestaña y Micrófono, selectores de idioma, el control de volumen original y Start](../assets/screenshot-4-panel.png)](../assets/screenshot-4-panel.png)

**Audio de la pestaña** traduce lo que esté reproduciendo la pestaña actual al idioma que elijas,
entre 78.

**Micrófono** traduce lo que oye el micrófono de tu ordenador. Tiene dos modos:

- **Simultaneous** traduce el habla a un idioma sin esperar a que quien habla termine la frase.
- **Two-way conversation** es para dos personas hablando en dos idiomas. Nombra los dos idiomas,
  pon el portátil sobre la mesa entre vosotros, y espera a que cada persona termine para dirigirla
  al otro idioma: pon español y japonés, y si oye español dice japonés; si oye japonés dice
  español. Sin cambiar nada. 97 idiomas, y es el único modo al que llega un
  [glosario](#glossary).

La primera vez que enciendes el micrófono, Chrome tiene que concederlo: una sola vez, y a la
extensión entera. El panel te lo dice y enlaza a **Opciones → Acceso al micrófono**, donde está el
botón Permitir el micrófono: Chrome solo muestra su aviso de permiso en una página propia, nunca en
el panel lateral.

Encender los dos a la vez son dos traducciones a la vez, así que Google cobra por ambas y el coste
es la suma de las dos.

### Los subtítulos y la traducción hablada

Los subtítulos aparecen abajo en el centro de la página, tres líneas cada vez, y siguen al vídeo a
pantalla completa. Cuando están encendidos el audio de la pestaña y el micrófono, la línea del
micrófono se marca con un borde azul. **Opciones → Tamaño de los subtítulos** fija su altura, de 16
a 64 px, en vivo mientras miras.

La voz traducida sale por la salida de audio de tu ordenador, y un botón de silencio la calla en
cualquier momento.

#### La voz de la traducción del audio de la pestaña

La voz traducida del audio de la pestaña suena por tu dispositivo de audio predeterminado, los
altavoces o auriculares que el ordenador ya esté usando. El sonido propio de la pestaña **sigue
sonando por debajo a menor volumen** mientras habla la traducción, así que la música y los efectos
de una película siguen ahí.

#### La voz de la traducción del micrófono

**Opciones → Entrada / Salida de audio** elige por qué dispositivo escucha **Micrófono** y por
cuál se habla su traducción. Para dejar de traducir un momento, o cuando el sitio
es tan ruidoso que se cuelan voces que no querías traducir, el botón de apagar el micrófono corta
la entrada en cualquier momento.

### Usarlo en reuniones en línea

**Oír a la otra parte es lo que esta herramienta hace de fábrica.** Abre la reunión en una pestaña,
enciende el audio de la pestaña, elige tu idioma y pulsa Start. Lo que digan llega en tu idioma,
hablado y subtitulado.

**Para que ellos oigan tu voz traducida en Google Meet, no hay nada que instalar.**

1. Conecta auriculares al ordenador: con altavoces el micrófono oye la llamada y las dos direcciones
   empiezan a interpretarse la una a la otra.
2. Enciende el audio de la pestaña —de ellos a ti— y ponlo en tu idioma. Enciende el micrófono —de
   ti a ellos— y ponlo en el de ellos.
3. En una pestaña de Meet, la tarjeta Microphone muestra un interruptor más: **Enviar la traducción
   a esta llamada de Meet**. Déjalo encendido.
4. Pulsa Start.
5. En Meet, **Configuración → Audio → Micrófono** → elige **Interpretab (translated)**. Aprovecha
   para desactivar **Studio Sound**.

Tu propia voz va mezclada por debajo, en bajo, así que la llamada te oye a ti además del intérprete.
Cuenta con unos tres segundos entre lo que dices y lo que oye el otro lado.

**En cualquier otro servicio**, la voz traducida tiene que llegar a la aplicación de la reunión como
entrada de micrófono, y eso pide un dispositivo de audio virtual. Lo más sencillo sigue siendo que
instalen Interpretab también y traduzcan tu voz en su lado; si no pueden:

1. Instala un dispositivo de audio virtual: [BlackHole](https://existential.audio/blackhole/) en macOS, [VB-Cable](https://vb-audio.com/Cable/) en Windows.
2. Conecta auriculares, como arriba.
3. **Opciones → Salida de audio** → elige el dispositivo virtual. Allí va la voz traducida de
   **Micrófono**; la de **Audio de la pestaña** llega a tus auriculares.
4. En el ajuste de entrada de micrófono de la aplicación de la reunión, elige el dispositivo
   virtual.
5. Enciende el audio de la pestaña y el micrófono, pon los dos idiomas y pulsa Start.

Como esto es una extensión de Chrome, todo lo anterior solo funciona con las versiones web de estos
servicios; las aplicaciones de escritorio y los clientes nativos quedan fuera de alcance.

### Los modelos detrás de la traducción, y su calidad

El audio de la pestaña y el modo Simultaneous del micrófono funcionan sobre el modelo
[Live Translate](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-live-translate-preview) de
la Gemini Live API. El modo Two-way conversation del micrófono funciona sobre el
[modelo Gemini Live](https://aistudio.google.com/docs/live-api), que no puede traducir de forma
simultánea — espera a que quien habla termine — pero traduce mejor que Live Translate, y es el
único que acepta el glosario de más abajo.

En cualquier caso, el modelo puede fallar, y los subtítulos pueden salir con el contenido
equivocado, o en el idioma equivocado.

### Glosario
{: #glossary }

Los nombres de producto, los nombres de personas y la jerga son lo que un modelo general falla más a
menudo, tanto en pronunciación como en escritura. El **modo Two-way conversation del micrófono**
acepta un glosario para reducir esos fallos; ningún otro modo lo hace. Aun así el modelo puede
fallar, y una pronunciación o una escritura registradas pueden no salir.

**Opciones → Glosario** acepta un CSV como este:

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

La primera columna es el término que hay que reconocer, la segunda es la *pronunciación* que se le
indica al modelo, y la tercera es lo que quieres que **muestren los subtítulos**.

[![La página de Opciones con una tabla de glosario rellena](../assets/screenshot-3-glossary.png)](../assets/screenshot-3-glossary.png)

### Cosas que conviene saber

- **Usa auriculares para el modo Simultaneous del micrófono.** Ese modo habla por encima de ti, así
  que el micrófono vuelve a captar su propia voz traducida — un bucle de eco — y la calidad de la
  traducción cae mucho.
- **Si quieres altavoces externos con el micrófono, usa un micrófono con botón de silencio.** Los
  altavoces devuelven la voz traducida al micrófono — un bucle de eco — y la traducción deja de
  funcionar bien. Quita el silencio solo mientras hablas.
- **El audio de la pestaña y el micrófono a la vez son dos traducciones a la vez**, y más o menos el
  doble de coste.
- **Interpretab funciona en una pestaña a la vez.** Mientras está en marcha, el panel lateral de
  cualquier otra pestaña nombra la pestaña en la que está corriendo y ofrece solo **Stop**. Párala
  allí y Start vuelve.
- **Chrome no deja que las extensiones dibujen sobre sus propias páginas ni sobre los PDF**, así que
  ahí no pueden aparecer subtítulos. La traducción hablada y la transcripción del panel lateral
  siguen funcionando.
- **Lo bien que traduce depende del par de idiomas.** El inglés y el japonés son el par sobre el que
  se ha medido esto, en tandas de una hora; un par más distante o menos común puede salir más
  áspero, y no hay forma de saberlo por adelantado salvo probándolo.

## Más sobre el uso de la Gemini Live API

El panel lateral lleva un medidor de lo que ha consumido la ejecución hasta ahora, y vuelve a
empezar en cero cada vez que pulsas Start. Lo que muestra depende de **Opciones → Plan de la API de
Gemini**, donde dices si tu clave es **Free** o **Paid**.

- **Free** (por defecto): *12 min hasta ahora, 18 min de audio de Gemini. En el plan gratuito no se
  cobra nada por ello.* Sin precio, porque no hay precio. El tiempo de audio es el número que
  merece la pena mirar: el plan gratuito limita cuánto puedes usar a la vez en lugar de cobrarlo,
  así que es eso lo que se gasta.
- **Paid**: *12 min hasta ahora, ~$0.31 de uso de Gemini en esta ejecución: es una estimación, no tu
  factura real.*

Configura el plan cuando pegues la clave. Una clave es de pago en cuanto la cuenta de Google a la
que pertenece tiene un método de pago, y Google no le dice a Interpretab cuál de las dos es: de ahí
la pregunta. **Tu cuenta de Google es el único sitio donde existe tu factura real.**

### Elegir entre el plan gratuito y uno de pago

Lo que cuesta una clave de la API de Gemini, con qué dureza está limitada y qué hace Google con lo
que envías por ella dependen de en qué plan esté. La documentación de Google llama al de pago **Tier
1**, que es lo mismo que la página de Opciones de Interpretab llama **Paid**. Los requisitos que
[Google publica](https://ai.google.dev/gemini-api/docs/rate-limits) son:

| Plan | Cómo se accede | Coste y límites | Qué hace Google con tus datos | Dónde encaja en Interpretab |
|---|---|---|---|---|
| **Free** | No hace falta método de pago | Gratis, pero el uso largo o intenso choca con los límites y da error | **Se usan para mejorar los productos de Google, y están sujetos a revisión humana** | Para probarlo |
| **Paid** (el Tier 1 de Google) | Añade un método de pago a la cuenta de Google | Pago por uso, hasta 10 $ cada 10 minutos y 250 $ al mes | No se usan para mejorar productos; se registran brevemente solo para detectar abusos | **Donde conviene estar si lo usas a menudo.** Suficiente para casi cualquier uso |

Empieza en el plan gratuito, y añade un método de pago cuando veas que lo sigues usando. En el plan
de pago nada de lo que envías se usa para mejorar los productos de Google, y los techos son amplios
para una herramienta como esta: unas 25 ejecuciones de Interpretab a la vez, y unas 110 horas al
mes. Google documenta [cómo configurar la
facturación](https://ai.google.dev/gemini-api/docs/billing#setup-billing).

### Compartir una clave de la API de Gemini entre máquinas y personas

Interpretab guarda la clave en la máquina, en `chrome.storage.local`. La sincronización de perfiles
de Chrome no la lleva, así que usar Interpretab en varios ordenadores significa pegar la clave en
cada uno. **Usar una clave en tus propias varias máquinas está bien.**

**Dar la clave a otra persona no lo está**, según los
[Términos del Servicio de las API](https://developers.google.com/terms) de Google.

### Cosas que conviene saber sobre tu clave de la API de Gemini

- **Los límites de frecuencia son por proyecto, no por clave.** La
  [documentación de Google](https://ai.google.dev/gemini-api/docs/rate-limits) lo dice con esas
  palabras. Los 10 $ cada 10 minutos del plan de pago son unas 25 ejecuciones de Interpretab a la
  vez, y todo lo que pase de ahí da error.
- **Una clave es una contraseña.** Si se filtra, se aplica la
  [guía de Google](https://ai.google.dev/gemini-api/docs/api-key): «otros pueden consumir la cuota
  de tu proyecto, provocar cargos inesperados y acceder a recursos privados». Cuando te deshagas de
  una máquina, o creas que una clave puede haberse filtrado, borra la clave antigua en
  [AI Studio](https://aistudio.google.com/apikey) y crea una nueva.
- **Para un equipo, una clave por persona.** Dale a cada miembro su propio proyecto bajo la misma
  cuenta de facturación de Google Cloud y el pago se queda en un solo sitio mientras las claves y
  los límites de frecuencia no.
- **Para usuarios del EEE, Suiza o el Reino Unido**, los
  [Términos adicionales de la API de Gemini](https://ai.google.dev/gemini-api/terms) exigen un plan de
  pago.
- **Si una ejecución no arranca, el mensaje dice cuál es el problema.** Interpretab le pregunta a
  Google por la clave antes de abrir nada, así que una clave rechazada, una clave que ha agotado lo
  que Google permite por ahora y una clave que no tiene permiso para llamar a la API de Gemini se
  nombran por separado en vez de adivinarse. Agotarlo es lo habitual en el plan gratuito: mira lo
  que te queda en [AI Studio](https://aistudio.google.com/apikey) y espera a que el límite se
  reinicie, o añade un método de pago. Si el mensaje dice que la clave sí fue aceptada, el problema
  es Gemini o tu red, no la clave.

## Código abierto

Apache 2.0. El código, las notas de ingeniería detrás de todo lo anterior y el seguimiento de
incidencias:

- [github.com/kazunori279/interpretab](https://github.com/kazunori279/interpretab)
- [Informar de un problema o pedir una función](https://github.com/kazunori279/interpretab/issues)
