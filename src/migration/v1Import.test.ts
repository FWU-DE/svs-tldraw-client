// @vitest-environment jsdom
import {
  Editor,
  TLArrowShape,
  createTLStore,
  defaultShapeUtils,
  defaultTools,
} from "@bigbluebutton/tldraw";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import fixture from "./__fixtures__/bruchrechnen.json";
import {
  V1Content,
  claimV1Migration,
  hasV1Content,
  importV1,
  needsV1Migration,
  readV1Content,
} from "./v1Import";

// jsdom has no canvas; tldraw only measures text with it
HTMLCanvasElement.prototype.getContext = (() => null) as never;

function headlessEditor() {
  const store = createTLStore({ shapeUtils: defaultShapeUtils });
  const container = document.createElement("div");
  document.body.appendChild(container);
  // initialState 'select' as in the UI: tldraw only groups shapes with the select tool
  return new Editor({
    store,
    shapeUtils: defaultShapeUtils,
    tools: defaultTools,
    getContainer: () => container,
    initialState: "select",
  });
}

/** A Yjs doc as the v1 client left it. */
function v1Doc(content: V1Content = fixture as V1Content) {
  const doc = new Y.Doc();
  doc.transact(() => {
    for (const [map, entries] of Object.entries(content)) {
      for (const [id, value] of Object.entries(entries))
        doc.getMap(map).set(id, value);
    }
  });
  return doc;
}

describe("v1 migration", () => {
  it("reads the v1 maps of the old client", () => {
    const doc = v1Doc();
    expect(hasV1Content(doc)).toBe(true);
    expect(hasV1Content(new Y.Doc())).toBe(false);
    const content = readV1Content(doc);
    expect(Object.keys(content.shapes)).toHaveLength(13);
    expect(Object.keys(content.bindings)).toHaveLength(4);
  });

  it("converts every v1 shape, keeps labels, arrow bindings, the group and the image", () => {
    const editor = headlessEditor();
    const blockUploads = vi.fn();
    importV1(editor, readV1Content(v1Doc()), blockUploads);

    expect(blockUploads).toHaveBeenCalledWith(30_000);
    const shapes = editor.getCurrentPageShapes();
    const byType = (type: string) => shapes.filter((s) => s.type === type);
    // 13 v1 shapes: the group becomes a group, its two texts its children
    expect(shapes).toHaveLength(13);
    expect(byType("geo")).toHaveLength(3); // rectangle, ellipse, triangle
    expect(byType("note")).toHaveLength(2);
    expect(byType("text")).toHaveLength(3);
    expect(byType("draw")).toHaveLength(1);
    expect(byType("arrow")).toHaveLength(2);
    expect(byType("group")).toHaveLength(1);
    expect(byType("image")).toHaveLength(1);

    const labels = byType("geo")
      .map((s) => (s.props as { text: string }).text)
      .sort();
    expect(labels).toEqual(["1/2", "1/4", "Ein Ganzes"]);
    expect(
      byType("note").map((s) => (s.props as { text: string }).text),
    ).toContain("Was ist 1/2 + 1/4?");

    for (const arrow of byType("arrow") as TLArrowShape[]) {
      expect(arrow.props.start.type).toBe("binding");
      expect(arrow.props.end.type).toBe("binding");
    }

    const group = byType("group")[0];
    expect(editor.getSortedChildIdsForParent(group.id)).toHaveLength(2);

    const image = byType("image")[0] as { props: { assetId: string } };
    const asset = editor.getAsset(image.props.assetId as never) as {
      props: { src: string; name: string };
    };
    expect(asset.props.src).toBe("__SEED_IMAGE_SRC__"); // original URL, no re-upload
    expect(asset.props.name).toBe("kuchen.png");
    editor.dispose();
  });

  it("lets exactly one of two clients that open a v1 board at once convert it", async () => {
    const a = v1Doc();
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    // connect both docs like tldraw-server would
    a.on("update", (u: Uint8Array) => Y.applyUpdate(b, u));
    b.on("update", (u: Uint8Array) => Y.applyUpdate(a, u));

    const [mineA, mineB] = await Promise.all([
      claimV1Migration(a, 50),
      claimV1Migration(b, 50),
    ]);
    expect([mineA, mineB].filter(Boolean)).toHaveLength(1);
  });

  it("converts although the editor already wrote its empty document and page", async () => {
    const doc = v1Doc();
    doc.getArray("tl_records").push([
      { key: "document:document", val: { typeName: "document" } },
      { key: "page:page", val: { typeName: "page" } },
    ]);
    expect(await claimV1Migration(doc, 10)).toBe(true);
  });

  it("does not convert a board that already has shapes", async () => {
    const doc = v1Doc();
    doc
      .getArray("tl_records")
      .push([{ key: "shape:a", val: { typeName: "shape" } }]);
    expect(await claimV1Migration(doc, 10)).toBe(false);
  });

  it("takes over a claim left behind by a client that went away", async () => {
    const doc = v1Doc();
    doc.getMap("meta").set("v1Migration", { by: 12345, since: 1_000 });
    expect(await claimV1Migration(doc, 10, () => 1_000 + 5_000)).toBe(false); // still fresh
    expect(await claimV1Migration(doc, 10, () => 1_000 + 20_000)).toBe(true); // stale
  });

  it("detects an old board, also after an unfinished attempt left empty records", () => {
    const doc = v1Doc();
    expect(needsV1Migration(doc)).toBe(true);
    doc
      .getArray("tl_records")
      .push([{ key: "page:page", val: { typeName: "page" } }]);
    doc.getMap("meta").set("v1Migration", { by: 1, since: 1 });
    expect(needsV1Migration(doc)).toBe(true);
    doc
      .getMap("meta")
      .set("v1Migration", { by: 1, since: 1, at: "2026-11-23T00:00:00Z" });
    expect(needsV1Migration(doc)).toBe(false);
    expect(needsV1Migration(new Y.Doc())).toBe(false);
  });

  it("does not convert again after a finished migration", async () => {
    const doc = v1Doc();
    doc
      .getMap("meta")
      .set("v1Migration", { by: 1, since: 1, at: "2026-11-23T00:00:00Z" });
    expect(await claimV1Migration(doc, 10)).toBe(false);
  });
});
