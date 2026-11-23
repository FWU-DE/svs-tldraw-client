// Syncs a tldraw store with a Yjs document on tldraw-server.
//
// Adapted from tldraw-yjs-example (commit cc34889, Apache-2.0, written against
// tldraw 2.0.0-beta.4, whose API matches @bigbluebutton/tldraw 2.0.0-alpha.36).
// Changes for SVS:
// - fixed array name `tl_records` (the doc does not embed its own id; the seed
//   script writes the same layout)
// - the websocket contract of the v1 client: `action:delete` frames and the
//   close codes of tldraw-server lead to the Nuxt error page
// - the user's name from the SVS session as presence name
import {
  InstancePresenceRecordType,
  SerializedSchema,
  TLInstancePresence,
  TLRecord,
  TLStoreWithStatus,
  compareSchemas,
  computed,
  createPresenceStateDerivation,
  createTLStore,
  defaultShapeUtils,
  defaultUserPreferences,
  getUserPreferences,
  react,
  setUserPreferences,
} from "@bigbluebutton/tldraw";
import { useEffect, useMemo, useState } from "react";
import { YKeyValue } from "y-utility/y-keyvalue";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import { needsV1Migration } from "./migration/v1Import";
import { attachPollVotes } from "./poll/pollVotes";
import { Session, showError } from "./session";

export const RECORDS_ARRAY = "tl_records";

// tldraw-server close codes (hpi-schul-cloud/tldraw-server, websocket gateway)
const CLOSE_ERRORS: Record<number, [number, string]> = {
  4401: [401, "error.4401"],
  4404: [404, "tldraw.error.ws.4404"],
  4500: [500, "error.4500"],
  1011: [500, "error.4500"],
};

export function useYjsStore(session: Session): {
  storeWithStatus: TLStoreWithStatus;
  connectionLost: boolean;
  /** Set when the board still holds only v1 content (App runs the migration). */
  v1Doc: Y.Doc | null;
} {
  const [store] = useState(() =>
    createTLStore({ shapeUtils: defaultShapeUtils }),
  );
  const [storeWithStatus, setStoreWithStatus] = useState<TLStoreWithStatus>({
    status: "loading",
  });
  const [connectionLost, setConnectionLost] = useState(false);
  const [v1Doc, setV1Doc] = useState<Y.Doc | null>(null);

  const { yDoc, yStore, meta, room } = useMemo(() => {
    const yDoc = new Y.Doc({ gc: true });
    const yArr = yDoc.getArray<{ key: string; val: TLRecord }>(RECORDS_ARRAY);
    return {
      yDoc,
      yStore: new YKeyValue(yArr),
      meta: yDoc.getMap<SerializedSchema>("meta"),
      room: new WebsocketProvider(
        session.config.TLDRAW_WEBSOCKET_URL,
        session.parentId,
        yDoc,
        {
          connect: true,
        },
      ),
    };
  }, [session]);

  useEffect(() => {
    const unsubs: (() => void)[] = [];
    unsubs.push(attachPollVotes(yDoc, session.user.id));

    /* --------------- server contract (as v1) --------------- */

    // tldraw-server sends the text frame "action:delete" when the board element
    // is deleted; y-websocket would fail to parse it, so intercept it first.
    const interceptDelete = ({ status }: { status: string }) => {
      const ws = room.ws;
      if (status !== "connected" || !ws?.onmessage) return;
      const original = ws.onmessage.bind(ws);
      ws.onmessage = (event: MessageEvent) => {
        if (event.data === "action:delete") {
          room.disconnect();
          showError(404, "tldraw.error.ws.4404");
        } else {
          original(event);
        }
      };
    };
    room.on("status", interceptDelete);
    unsubs.push(() => room.off("status", interceptDelete));

    const handleClose = (event: CloseEvent | null) => {
      if (!event) return;
      const known = CLOSE_ERRORS[event.code];
      if (known) {
        room.disconnect();
        showError(known[0], known[1]);
      }
      // anything else: y-websocket reconnects by itself; the UI shows a hint
      setConnectionLost(true);
    };
    room.on("connection-close", handleClose);
    unsubs.push(() => room.off("connection-close", handleClose));

    /* -------------------- initial sync -------------------- */

    function handleSync() {
      // Store -> Yjs (only the user's document changes)
      unsubs.push(
        store.listen(
          ({ changes }) => {
            yDoc.transact(() => {
              Object.values(changes.added).forEach((record) =>
                yStore.set(record.id, record),
              );
              Object.values(changes.updated).forEach(([, record]) =>
                yStore.set(record.id, record),
              );
              Object.values(changes.removed).forEach((record) =>
                yStore.delete(record.id),
              );
            });
          },
          { source: "user", scope: "document" },
        ),
      );

      // Yjs -> store
      const handleChange = (
        changes: Map<string, { action: "delete" | "update" | "add" }>,
        transaction: Y.Transaction,
      ) => {
        if (transaction.local) return;
        const toRemove: TLRecord["id"][] = [];
        const toPut: TLRecord[] = [];
        changes.forEach((change, id) => {
          if (change.action === "delete") toRemove.push(id as TLRecord["id"]);
          else toPut.push(yStore.get(id)!);
        });
        store.mergeRemoteChanges(() => {
          if (toRemove.length) store.remove(toRemove);
          if (toPut.length) store.put(toPut);
        });
      };
      yStore.on("change", handleChange);
      unsubs.push(() => yStore.off("change", handleChange));

      /* ---------------- awareness / presence ---------------- */

      const yClientId = room.awareness.clientID.toString();
      const name = `${session.user.firstName} ${session.user.lastName}`.trim();
      setUserPreferences({
        ...getUserPreferences(),
        id: yClientId,
        name,
        locale: "de",
      });

      const userPreferences = computed<{
        id: string;
        color: string;
        name: string;
      }>("userPreferences", () => {
        const user = getUserPreferences();
        return {
          id: user.id,
          color: user.color ?? defaultUserPreferences.color,
          name: user.name ?? defaultUserPreferences.name,
        };
      });
      const presenceId = InstancePresenceRecordType.createId(yClientId);
      const presenceDerivation = createPresenceStateDerivation(
        userPreferences,
        presenceId,
      )(store);
      room.awareness.setLocalStateField("presence", presenceDerivation.get());
      unsubs.push(
        react("when presence changes", () => {
          const presence = presenceDerivation.get();
          requestAnimationFrame(() =>
            room.awareness.setLocalStateField("presence", presence),
          );
        }),
      );

      const handleAwareness = (update: {
        added: number[];
        updated: number[];
        removed: number[];
      }) => {
        const states = room.awareness.getStates() as Map<
          number,
          { presence?: TLInstancePresence }
        >;
        const toRemove: TLInstancePresence["id"][] = [];
        const toPut: TLInstancePresence[] = [];
        for (const clientId of [...update.added, ...update.updated]) {
          const presence = states.get(clientId)?.presence;
          if (presence && presence.id !== presenceId) toPut.push(presence);
        }
        for (const clientId of update.removed) {
          toRemove.push(
            InstancePresenceRecordType.createId(clientId.toString()),
          );
        }
        store.mergeRemoteChanges(() => {
          if (toRemove.length) store.remove(toRemove);
          if (toPut.length) store.put(toPut);
        });
      };
      room.awareness.on("update", handleAwareness);
      unsubs.push(() => room.awareness.off("update", handleAwareness));

      const handleMetaUpdate = () => {
        const theirSchema = meta.get("schema");
        if (
          theirSchema &&
          compareSchemas(theirSchema, store.schema.serialize()) === 1
        ) {
          window.alert(
            "Das Whiteboard wurde aktualisiert. Bitte lade die Seite neu.",
          );
          yDoc.destroy();
        }
      };
      meta.observe(handleMetaUpdate);
      unsubs.push(() => meta.unobserve(handleMetaUpdate));

      /* ------------- load the doc or initialise it ------------- */

      // An old v1 board (possibly with the empty records of an earlier,
      // unfinished attempt): the App converts it once the editor exists.
      const v1Pending = needsV1Migration(yDoc);

      if (yStore.yarray.length) {
        const ourSchema = store.schema.serialize();
        const theirSchema = meta.get("schema") ?? ourSchema;
        const records = yStore.yarray
          .toJSON()
          .map(({ val }) => val as TLRecord);
        const migration = store.schema.migrateStoreSnapshot({
          schema: theirSchema,
          store: Object.fromEntries(records.map((r) => [r.id, r])),
        });
        if (migration.type === "error") {
          console.error(migration.reason);
          window.alert(
            "Das Whiteboard wurde aktualisiert. Bitte lade die Seite neu.",
          );
          return;
        }
        yDoc.transact(() => {
          for (const r of records)
            if (!migration.value[r.id]) yStore.delete(r.id);
          for (const r of Object.values(migration.value) as TLRecord[])
            yStore.set(r.id, r);
          meta.set("schema", ourSchema);
        });
        store.loadSnapshot({ store: migration.value, schema: ourSchema });
      } else if (v1Pending) {
        yDoc.transact(() => meta.set("schema", store.schema.serialize()));
      } else {
        yDoc.transact(() => {
          for (const record of store.allRecords())
            yStore.set(record.id, record);
          meta.set("schema", store.schema.serialize());
        });
      }

      if (v1Pending) setV1Doc(yDoc);
      setStoreWithStatus({
        store,
        status: "synced-remote",
        connectionStatus: "online",
      });
    }

    let hasConnectedBefore = false;
    const handleStatus = ({
      status,
    }: {
      status: "disconnected" | "connecting" | "connected";
    }) => {
      if (status === "disconnected") {
        setStoreWithStatus({
          store,
          status: "synced-remote",
          connectionStatus: "offline",
        });
        return;
      }
      if (status !== "connected") return;
      setConnectionLost(false);
      if (hasConnectedBefore) {
        setStoreWithStatus({
          store,
          status: "synced-remote",
          connectionStatus: "online",
        });
        return;
      }
      hasConnectedBefore = true;
      room.once("sync", (isSynced: boolean) => isSynced && handleSync());
    };
    room.on("status", handleStatus);
    unsubs.push(() => room.off("status", handleStatus));

    return () => {
      unsubs.forEach((fn) => fn());
      unsubs.length = 0;
    };
  }, [room, yDoc, store, yStore, meta, session]);

  useEffect(() => () => room.destroy(), [room]);

  return { storeWithStatus, connectionLost, v1Doc };
}
