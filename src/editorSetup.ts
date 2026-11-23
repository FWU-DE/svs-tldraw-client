// Privacy and storage rules for the SVS whiteboard, applied without forking
// the library: no embeds of third-party sites, no link previews fetched by the
// browser, images stored in SVS files-storage instead of inline in the doc.
import {
  AssetRecordType,
  Editor,
  TLAsset,
  TLAssetId,
  TLShapeId,
  TLUiMenuSchema,
  TLUiOverrides,
  TLUiTranslationKey,
  createShapeId,
  getHashForString,
  isGifAnimated,
  toolbarItem,
} from "@bigbluebutton/tldraw";
import { createElement } from "react";
import { PollDialog } from "./poll/PollDialog";
import { Session } from "./session";

const EMBED_ITEMS = new Set(["insert-embed", "convert-to-embed"]);

type MenuItem = TLUiMenuSchema[number];

function withoutEmbeds(items: TLUiMenuSchema): TLUiMenuSchema {
  return items
    .filter((item: MenuItem) => !EMBED_ITEMS.has(item.id))
    .map((item: MenuItem) =>
      "children" in item && Array.isArray(item.children)
        ? ({
            ...item,
            children: withoutEmbeds(item.children as TLUiMenuSchema),
          } as MenuItem)
        : item,
    );
}

const POLL_TOOL = "poll-create";

export const uiOverrides: TLUiOverrides = {
  tools(_editor, tools, helpers) {
    delete tools.embed;
    tools[POLL_TOOL] = {
      id: POLL_TOOL,
      label: "tool.poll-create" as TLUiTranslationKey,
      icon: "checkbox-checked",
      readonlyOk: false,
      onSelect: () => {
        helpers.addDialog({
          component: ({ onClose }) => createElement(PollDialog, { onClose }),
        });
      },
    };
    return tools;
  },
  // Poll after the image tool, directly in the bar
  toolbar(_editor, schema, { tools }) {
    const at = schema.findIndex((item) => item.id === "asset");
    schema.splice(at + 1, 0, toolbarItem(tools[POLL_TOOL]));
    return schema;
  },
  translations: {
    de: { "tool.poll-create": "Umfrage" },
    en: { "tool.poll-create": "Poll" },
  },
  // The menu builder looks the actions up before our menu filter runs, so they
  // must exist; they just do nothing and never show up in a menu.
  actions(_editor, actions) {
    for (const id of EMBED_ITEMS) {
      if (actions[id])
        actions[id] = { ...actions[id], kbd: undefined, onSelect: () => {} };
    }
    return actions;
  },
  menu: (_editor, schema) => withoutEmbeds(schema),
  contextMenu: (_editor, schema) => withoutEmbeds(schema),
  actionsMenu: (_editor, schema) => withoutEmbeds(schema),
  keyboardShortcutsMenu: (_editor, schema) => withoutEmbeds(schema),
};

function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ w: img.naturalWidth || 300, h: img.naturalHeight || 200 });
    img.onerror = () => resolve({ w: 300, h: 200 });
    img.src = src;
  });
}

async function uploadImage(
  session: Session,
  assetId: TLAssetId,
  file: File,
): Promise<string> {
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()
    : file.type.split("/")[1];
  const body = new FormData();
  body.append(
    "file",
    new File([file], `${assetId.replace("asset:", "")}.${ext}`, {
      type: file.type,
    }),
  );
  const res = await fetch(
    `/api/v3/file/upload/school/${session.user.schoolId}/boardnodes/${session.parentId}`,
    { method: "POST", body, credentials: "same-origin" },
  );
  if (!res.ok) throw new Error(`Upload fehlgeschlagen (${res.status})`);
  const json = await res.json();
  return json.url as string;
}

let uploadsBlockedUntil = 0;

/** Lets the file handler refuse for a while (used by the v1 migration). */
export function blockUploads(ms: number) {
  uploadsBlockedUntil = Date.now() + ms;
}

export function setupEditor(editor: Editor, session: Session) {
  const { config } = session;

  // Links: a text shape with the URL; never an embed, never a bookmark that
  // makes the browser fetch the page.
  editor.registerExternalContentHandler("url", ({ point, url }) => {
    const at = point ?? editor.getViewportPageCenter();
    const id: TLShapeId = createShapeId();
    editor.createShapes([
      {
        id,
        type: "text",
        x: at.x,
        y: at.y,
        props: { text: url, autoSize: true },
      },
    ]);
    editor.select(id);
  });
  editor.registerExternalContentHandler("embed", null);
  editor.registerExternalAssetHandler("url", async ({ url }) => ({
    id: AssetRecordType.createId(getHashForString(url)),
    typeName: "asset",
    type: "bookmark",
    props: { src: url, title: url, description: "", image: "" },
    meta: {},
  }));

  // Images go to files-storage; the doc keeps only the download URL.
  editor.registerExternalAssetHandler(
    "file",
    async ({ file }): Promise<TLAsset> => {
      if (Date.now() < uploadsBlockedUntil)
        throw new Error(
          "Upload während der Umstellung des Whiteboards gesperrt.",
        );
      if (!config.TLDRAW_ASSETS_ENABLED)
        throw new Error("Bilder sind auf diesem Whiteboard nicht erlaubt.");
      if (!config.TLDRAW_ASSETS_ALLOWED_MIME_TYPES_LIST.includes(file.type)) {
        throw new Error(
          `Dateityp ${file.type || "unbekannt"} ist nicht erlaubt.`,
        );
      }
      if (file.size > config.TLDRAW_ASSETS_MAX_SIZE_BYTES)
        throw new Error("Die Datei ist zu groß.");
      const assetId = AssetRecordType.createId(
        getHashForString(`${file.name}${file.size}${Date.now()}`),
      );
      const src = await uploadImage(session, assetId, file);
      const { w, h } = await imageSize(src);
      return AssetRecordType.create({
        id: assetId,
        type: "image",
        typeName: "asset",
        props: {
          name: file.name,
          src,
          w,
          h,
          mimeType: file.type,
          isAnimated:
            file.type === "image/gif" ? await isGifAnimated(file) : false,
        },
      });
    },
  );

  editor.user.updateUserPreferences({ locale: "de" });
}
