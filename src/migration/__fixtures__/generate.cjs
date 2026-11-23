// Generates src/migration/__fixtures__/bruchrechnen.json: an old whiteboard as the v1 client
// (hpi-schul-cloud/tldraw-client, tldraw 1.29.2) stored it in Yjs – the maps
// `shapes`, `bindings` and `assets` of page `page`. Made with the real v1
// library, so the migration is tested against authentic data.
//
// Not part of the build (tldraw v1 is no dependency here). To regenerate:
//   mkdir /tmp/v1gen && cd /tmp/v1gen && npm i @tldraw/tldraw@1.29.2 react@18 react-dom@18 jsdom@25 global-jsdom@25
//   NODE_PATH=/tmp/v1gen/node_modules node <repo>/src/migration/__fixtures__/generate.cjs
require.extensions[".css"] = () => {};
require("global-jsdom")(undefined, {
  url: "http://localhost/",
  pretendToBeVisual: true,
});
const { writeFileSync } = require("node:fs");
const {
  TldrawApp,
  TDShapeType,
  TDAssetType,
  ColorStyle,
  SizeStyle,
  DashStyle,
  Decoration,
} = require("@tldraw/tldraw");

const app = new TldrawApp();
const style = (color, extra = {}) => ({
  color,
  size: SizeStyle.Medium,
  dash: DashStyle.Draw,
  isFilled: false,
  scale: 1,
  ...extra,
});

// A wavy line drawn with the pen
const wave = Array.from({ length: 40 }, (_, i) => [
  i * 8,
  Math.sin(i / 4) * 18 + 20,
  0.5,
]);

app.createShapes(
  {
    id: "title",
    type: TDShapeType.Text,
    point: [40, 20],
    text: "Bruchrechnen",
    style: style(ColorStyle.Black, { size: SizeStyle.Large }),
  },
  {
    id: "ganzes",
    type: TDShapeType.Rectangle,
    point: [60, 140],
    size: [240, 120],
    label: "Ein Ganzes",
    style: style(ColorStyle.Blue, { isFilled: true }),
  },
  {
    id: "haelfte",
    type: TDShapeType.Ellipse,
    point: [460, 100],
    radius: [110, 60],
    label: "1/2",
    style: style(ColorStyle.Green),
  },
  {
    id: "viertel",
    type: TDShapeType.Triangle,
    point: [480, 300],
    size: [180, 150],
    label: "1/4",
    style: style(ColorStyle.Orange, { dash: DashStyle.Dashed }),
  },
  {
    id: "merke",
    type: TDShapeType.Sticky,
    point: [60, 340],
    size: [200, 200],
    text: "Merke: Nenner gleich machen, dann Zähler addieren!",
    style: style(ColorStyle.Yellow),
  },
  {
    id: "frage",
    type: TDShapeType.Sticky,
    point: [760, 120],
    size: [200, 200],
    text: "Was ist 1/2 + 1/4?",
    style: style(ColorStyle.Red),
  },
  {
    id: "welle",
    type: TDShapeType.Draw,
    point: [300, 560],
    points: wave,
    isComplete: true,
    style: style(ColorStyle.Violet),
  },
  {
    id: "pfeil-1",
    type: TDShapeType.Arrow,
    point: [300, 180],
    handles: {
      start: { id: "start", index: 0, point: [0, 20] },
      end: { id: "end", index: 1, point: [160, 0] },
      bend: { id: "bend", index: 2, point: [80, 10] },
    },
    decorations: { end: Decoration.Arrow },
    label: "teilen",
    style: style(ColorStyle.Black),
  },
  {
    id: "pfeil-2",
    type: TDShapeType.Arrow,
    point: [560, 220],
    handles: {
      start: { id: "start", index: 0, point: [0, 0] },
      end: { id: "end", index: 1, point: [10, 80] },
      bend: { id: "bend", index: 2, point: [5, 40] },
    },
    decorations: { end: Decoration.Arrow },
    label: "nochmal",
    style: style(ColorStyle.Black),
  },
  {
    id: "legende-a",
    type: TDShapeType.Text,
    point: [760, 380],
    text: "Zähler",
    style: style(ColorStyle.Gray, { size: SizeStyle.Small }),
  },
  {
    id: "legende-b",
    type: TDShapeType.Text,
    point: [760, 420],
    text: "Nenner",
    style: style(ColorStyle.Gray, { size: SizeStyle.Small }),
  },
);

// Bind the arrows to the shapes, as dragging them onto the shapes would.
const bind = (arrowId, handleId, toId) => {
  const id = `${arrowId}-${handleId}`;
  app.patchState({
    document: {
      pages: {
        page: {
          shapes: { [arrowId]: { handles: { [handleId]: { bindingId: id } } } },
          bindings: {
            [id]: {
              id,
              fromId: arrowId,
              toId,
              handleId,
              point: [0.5, 0.5],
              distance: 16,
            },
          },
        },
      },
    },
  });
};
bind("pfeil-1", "start", "ganzes");
bind("pfeil-1", "end", "haelfte");
bind("pfeil-2", "start", "haelfte");
bind("pfeil-2", "end", "viertel");

// Group the legend
app.group(["legende-a", "legende-b"], "legende");

// An uploaded image; the seed replaces the src with a file in files-storage.
const assetId = "bild-kuchen";
app.patchState({
  document: {
    assets: {
      [assetId]: {
        id: assetId,
        type: TDAssetType.Image,
        fileName: "kuchen.png",
        src: "__SEED_IMAGE_SRC__",
        size: [480, 300],
      },
    },
  },
});
app.createShapes({
  id: "bild",
  type: TDShapeType.Image,
  point: [760, 480],
  size: [240, 150],
  assetId,
  style: style(ColorStyle.Black),
});

const page = app.document.pages.page;
const out = {
  shapes: page.shapes,
  bindings: page.bindings,
  assets: app.document.assets,
};
writeFileSync(
  require("node:path").join(__dirname, "bruchrechnen.json"),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(
  `v1 board: ${Object.keys(out.shapes).length} shapes, ${Object.keys(out.bindings).length} bindings, ${Object.keys(out.assets).length} assets`,
);
process.exit(0);
