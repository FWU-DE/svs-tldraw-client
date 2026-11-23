import "@bigbluebutton/tldraw/tldraw.css";
import "./styles.css";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { enablePollVoting } from "./poll/pollShape";
import { loadSession } from "./session";

enablePollVoting();

const root = createRoot(document.getElementById("root")!);

loadSession()
  .then((session) => {
    document.title = "Whiteboard";
    // No StrictMode: its double mount would destroy the websocket provider.
    root.render(<App session={session} />);
  })
  .catch((error) => {
    // loadSession redirects on known errors; log anything else
    console.error(error);
  });
