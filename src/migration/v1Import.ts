// Migration of whiteboards from the v1 client (tldraw 1.29).
//
// The v1 client kept a board in the Yjs maps `shapes`, `bindings` and `assets`
// (one page, id `page`). The first time such a board is opened here, one
// client converts it with tldraw's own importer (`buildFromV1Document`, part
// of the Apache-licensed BBB fork) into the tldraw-2 records in `tl_records`.
// The v1 maps stay untouched as a backup; `meta.v1Migration` records when and
// by whom the board was converted.
import * as tldraw from "@bigbluebutton/tldraw";
import { Editor } from "@bigbluebutton/tldraw";
import * as Y from "yjs";

export const V1_MAPS = ["shapes", "bindings", "assets"] as const;

/** The v1 document as the importer expects it (LegacyTldrawDocument, not exported). */
export type LegacyTldrawDocument = {
  id: string;
  name: string;
  version: number;
  pages: Record<
    string,
    {
      id: string;
      name?: string;
      childIndex?: number;
      shapes: Record<string, unknown>;
      bindings: Record<string, unknown>;
    }
  >;
  pageStates: Record<
    string,
    {
      id: string;
      selectedIds: string[];
      camera: { point: number[]; zoom: number };
    }
  >;
  assets: Record<string, unknown>;
};

type BuildFromV1 = (editor: Editor, document: LegacyTldrawDocument) => void;
// Exported by the package at runtime, only left out of its type declarations.
const buildFromV1Document = (
  tldraw as unknown as { buildFromV1Document: BuildFromV1 }
).buildFromV1Document;

/** v1 shapes, bindings and assets as plain objects. */
export type V1Content = {
  shapes: Record<string, unknown>;
  bindings: Record<string, unknown>;
  assets: Record<string, unknown>;
};

export function readV1Content(doc: Y.Doc): V1Content {
  const [shapes, bindings, assets] = V1_MAPS.map((name) =>
    doc.getMap(name).toJSON(),
  ) as Record<string, unknown>[];
  return { shapes, bindings, assets };
}

export function hasV1Content(doc: Y.Doc): boolean {
  return doc.getMap("shapes").size > 0;
}

export function toLegacyDocument({
  shapes,
  bindings,
  assets,
}: V1Content): LegacyTldrawDocument {
  return {
    id: "doc",
    name: "",
    version: 15.5, // tldraw 1.29
    pages: {
      page: { id: "page", name: "Seite 1", childIndex: 1, shapes, bindings },
    },
    pageStates: {
      page: { id: "page", selectedIds: [], camera: { point: [0, 0], zoom: 1 } },
    },
    assets,
  };
}

/**
 * Converts the v1 content into the editor's store. Images keep their
 * files-storage URL: the importer re-fetches each image and hands it to the
 * file handler, which would upload a copy; `blockUploads` makes that handler
 * refuse for the duration, so the importer keeps the original asset.
 */
export function importV1(
  editor: Editor,
  content: V1Content,
  blockUploads: (ms: number) => void,
) {
  blockUploads(30_000);
  buildFromV1Document(editor, toLegacyDocument(content));
}

const MIGRATION_KEY = "v1Migration";
const STALE_CLAIM_MS = 15_000;
type Migration = { by: number; since: number; at?: string };

function hasShapes(doc: Y.Doc) {
  return doc
    .getArray<{ key: string; val: { typeName?: string } }>("tl_records")
    .toArray()
    .some((entry) => entry.val?.typeName === "shape");
}

/** v1 content present, not converted yet, no shapes in the new format. */
export function needsV1Migration(doc: Y.Doc): boolean {
  const claim = doc.getMap<unknown>("meta").get(MIGRATION_KEY) as
    Migration | undefined;
  return hasV1Content(doc) && !claim?.at && !hasShapes(doc);
}

/**
 * Exactly one client converts a board, even if several open it at once: each
 * proposes itself in `meta`, Yjs settles concurrent writes the same way on
 * every client, and only the one left standing imports. A claim whose client
 * went away before finishing expires after 15 s.
 */
export async function claimV1Migration(
  doc: Y.Doc,
  settleMs = 1500,
  now = () => Date.now(),
): Promise<boolean> {
  const meta = doc.getMap<unknown>("meta");
  const me = doc.clientID;
  const current = meta.get(MIGRATION_KEY) as Migration | undefined;
  if (current?.at || hasShapes(doc)) return false;
  if (!current || now() - (current.since ?? 0) > STALE_CLAIM_MS) {
    meta.set(MIGRATION_KEY, { by: me, since: now() } satisfies Migration);
  }
  await new Promise((resolve) => setTimeout(resolve, settleMs));
  const claim = meta.get(MIGRATION_KEY) as Migration | undefined;
  return claim?.by === me && !claim.at && !hasShapes(doc);
}

export function markV1Migrated(doc: Y.Doc) {
  const meta = doc.getMap<unknown>("meta");
  const claim = meta.get(MIGRATION_KEY) as Migration | undefined;
  meta.set(MIGRATION_KEY, {
    by: doc.clientID,
    since: claim?.since ?? Date.now(),
    at: new Date().toISOString(),
  } satisfies Migration);
}
