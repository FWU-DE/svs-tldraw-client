import { useEditor } from "@bigbluebutton/tldraw";
import { useState } from "react";
import { createPoll } from "./pollShape";

// Presets like BBB's quick polls
const PRESETS: { label: string; options: string[] }[] = [
  { label: "Ja / Nein", options: ["Ja", "Nein"] },
  { label: "Ja / Nein / Enthaltung", options: ["Ja", "Nein", "Enthaltung"] },
  { label: "A – D", options: ["A", "B", "C", "D"] },
  { label: "Daumen", options: ["👍", "👌", "👎"] },
];

const MAX_OPTIONS = 8;

export function PollDialog({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const [question, setQuestion] = useState("");
  const [optionsText, setOptionsText] = useState("Ja\nNein");

  const options = optionsText
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean)
    .slice(0, MAX_OPTIONS);
  const valid = question.trim().length > 0 && options.length >= 2;

  const submit = () => {
    if (!valid) return;
    createPoll(editor, question.trim(), options);
    onClose();
  };

  return (
    <div className="svs-poll-dialog">
      <div className="tlui-dialog__header">
        <div className="tlui-dialog__header__title">Umfrage erstellen</div>
      </div>
      <div className="tlui-dialog__body svs-poll-dialog__body">
        <label>
          Frage
          <input
            autoFocus
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="z. B. Was verdunstet schneller?"
            maxLength={200}
          />
        </label>
        <div className="svs-poll-dialog__presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setOptionsText(p.options.join("\n"))}>
              {p.label}
            </button>
          ))}
        </div>
        <label>
          Antworten (eine pro Zeile, höchstens {MAX_OPTIONS})
          <textarea
            rows={5}
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
          />
        </label>
        <p className="svs-poll-dialog__hint">
          Alle auf dem Board stimmen direkt an der Umfrage ab. Das Ergebnis
          siehst zuerst nur du; du kannst es veröffentlichen.
        </p>
      </div>
      <div className="tlui-dialog__footer svs-poll-dialog__footer">
        <button type="button" onClick={onClose}>
          Abbrechen
        </button>
        <button
          type="button"
          className="svs-poll-dialog__create"
          disabled={!valid}
          onClick={submit}>
          Umfrage erstellen
        </button>
      </div>
    </div>
  );
}
