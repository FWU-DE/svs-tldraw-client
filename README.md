## Whiteboard der SVS

Zeichenoberfläche für das Whiteboard-Element der Schulcloud-Verbund-Software.
Seit dieser Fassung auf dem **BigBlueButton-Fork von tldraw**
([`@bigbluebutton/tldraw`](https://github.com/bigbluebutton/tldraw) 2.0.0-alpha.36,
Apache-2.0) statt tldraw 1.29: dem letzten frei lizenzierten tldraw-Stand
(19.12.2023) plus der Pflege durch BigBlueButton. Neuere tldraw-Versionen
brauchen einen kostenpflichtigen Lizenzschlüssel.

### Schnittstellen (unverändert zum v1-Client)

Nuxt-Client, Server, tldraw-server und Deployment bleiben unverändert:

- Seite `/tldraw?parentId=<Zeichen-Element-ID>`, Assets unter `/assets`
- Konfiguration von `/api/tldraw/config/public`, Nutzer von `/api/v3/me`
- Yjs über `TLDRAW_WEBSOCKET_URL/<parentId>`, Anmeldung per `jwt`-Cookie;
  die Textnachricht `action:delete` und die Close-Codes des tldraw-servers
  führen wie bisher zur `/error`-Seite des Nuxt-Clients
- Bilder nach files-storage (`/api/v3/file/upload/school/…/boardnodes/<parentId>`)

Neu ist nur das Dokumentformat: tldraw-2-Datensätze im Y.Array `tl_records`
(`src/useYjsStore.ts`) statt der v1-Maps `shapes`/`bindings`/`assets`.

### Umstellung alter Boards

`src/migration/`: Ein Board mit nur v1-Inhalt wird beim ersten Öffnen mit
`buildFromV1Document` aus dem BBB-Fork umgewandelt. Öffnen mehrere Personen es
gleichzeitig, wandelt nur eine um (Absprache über die Y.Map `meta`, verwaiste
Absprachen verfallen nach 15 s). Die v1-Maps bleiben als Sicherung im Dokument,
Bilder behalten ihre files-storage-Adresse. Testdaten:
`src/migration/__fixtures__/bruchrechnen.json`, erzeugt mit der echten
v1-Bibliothek (`generate.cjs` daneben).

### Umfragen

`src/poll/`: Werkzeug „Umfrage“ in der Leiste. Die Umfrage ist BigBlueButtons
eigene Form `poll` mit unveränderten Feldern, damit Boards mit BBB kompatibel
bleiben; die Abstimmleiste unter dem Diagramm wird ohne Fork ergänzt. Stimmen
liegen pro Person in der Y.Map `svs_poll_votes`; die Auszählung kommt erst mit
„Ergebnis veröffentlichen“ in die Felder der Form, wie in BBB.

### Datenschutz

`src/editorSetup.ts`, ohne Fork der Bibliothek: keine Einbettungen fremder
Seiten, keine Linkvorschau, die der Browser selbst lädt, Schriften, Icons und
Übersetzungen vom eigenen Server (`scripts/copy-assets.mjs`); die CSP in
`nginx.conf.template` erlaubt keine fremden Quellen und keine Frames.

### Entwicklung

```bash
npm ci
npm run dev      # http://localhost:3046/tldraw?parentId=… (Proxy auf lokale Dienste, vite.config.ts)
npm test         # Vitest
npm run lint
npm run build
docker build -t tldraw-client .
```

### Lizenz

AGPL-3.0, siehe LICENSE.md. `@bigbluebutton/tldraw` steht unter Apache-2.0.
