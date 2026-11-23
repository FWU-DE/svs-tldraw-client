import { Tldraw } from "@bigbluebutton/tldraw";
import { getAssetUrls } from "@bigbluebutton/assets/selfHosted";
import { blockUploads, setupEditor, uiOverrides } from "./editorSetup";
import {
  claimV1Migration,
  importV1,
  markV1Migrated,
  readV1Content,
} from "./migration/v1Import";
import { Session } from "./session";
import { useYjsStore } from "./useYjsStore";

// Fonts, icons and translations are served from our own origin (the CSP
// allows no CDN); scripts/copy-assets.mjs puts them into public/.
const assetUrls = getAssetUrls({ baseUrl: "/assets/tldraw" });

export function App({ session }: { session: Session }) {
  const { storeWithStatus, connectionLost, v1Doc } = useYjsStore(session);
  const { config } = session;

  return (
    <div className="whiteboard">
      <Tldraw
        store={storeWithStatus}
        assetUrls={assetUrls}
        overrides={uiOverrides}
        acceptedImageMimeTypes={config.TLDRAW_ASSETS_ALLOWED_MIME_TYPES_LIST}
        acceptedVideoMimeTypes={[]}
        maxAssetSize={config.TLDRAW_ASSETS_MAX_SIZE_BYTES}
        onMount={(editor) => {
          setupEditor(editor, session);
          if (v1Doc) {
            // An old v1 board: one client converts it, the others receive the result.
            void claimV1Migration(v1Doc).then((mine) => {
              if (!mine) return;
              importV1(editor, readV1Content(v1Doc), blockUploads);
              markV1Migrated(v1Doc);
              editor.zoomToFit();
            });
            return;
          }
          // Tldraw mounts the editor once the doc has synced. The camera is
          // per user, not part of the doc: start with the whole board in view.
          requestAnimationFrame(() => {
            if (editor.getCurrentPageShapeIds().size) editor.zoomToFit();
          });
        }}
      />
      {connectionLost && (
        <div className="connection-banner" role="status">
          Verbindung unterbrochen. Änderungen werden übertragen, sobald sie
          wieder steht.
        </div>
      )}
    </div>
  );
}
