// Polls on BigBlueButton's own `poll` shape, so boards stay interoperable:
// same shape type, same props, same rendering as in BBB. A board's polls look
// the same in the BBB whiteboard, and BBB poll results display here.
//
// BBB only shows results there (voting happens in BBB's meeting poll). Here
// people vote right on the board, through a strip under the chart that this
// module adds to the shape's rendering — without forking the library and
// without changing the shape's schema:
// - votes per person live in the Y.Map `svs_poll_votes` (pollVotes.ts), which
//   BBB ignores
// - the tally is written into the standard props (answers[].numVotes,
//   numResponders) once the creator publishes the result, like BBB's
//   "publish poll"
// - creator and publish state live in shape.meta, which BBB ignores too
import {
  Editor,
  TLShape,
  TLShapeId,
  defaultShapeUtils,
  stopEventPropagation,
  useEditor,
} from "@bigbluebutton/tldraw";
import { ReactElement, useEffect } from "react";
import {
  castVote,
  currentUserId,
  usePollTally,
  withdrawVote,
} from "./pollVotes";

export const POLL_TYPE = "poll" as const;

export type PollAnswer = {
  id: number;
  key: string;
  numVotes: number;
  isCorrectAnswer?: boolean;
};

// IPollShape of the BBB fork (not exported by the package)
export type PollShape = TLShape & {
  type: typeof POLL_TYPE;
  props: {
    w: number;
    h: number;
    color: string;
    fill: string;
    question: string;
    numRespondents: number;
    numResponders: number;
    questionText: string;
    questionType: string;
    answers: PollAnswer[];
  };
  meta: { svsPoll?: { creatorId: string; published: boolean } };
};

export function isPoll(shape: TLShape | undefined): shape is PollShape {
  return shape?.type === POLL_TYPE;
}

/** Creates a poll in BBB's format; questionType CUSTOM as for free answers in BBB. */
export function createPoll(
  editor: Editor,
  question: string,
  options: string[],
): TLShapeId {
  const h = Math.max(220, 90 + options.length * 44);
  const id = `shape:${crypto.randomUUID()}` as TLShapeId;
  // Into free space right of the content (not on top of it, not into a frame),
  // or the middle of the view on an empty board.
  const content = editor.getCurrentPageBounds();
  const center = editor.getViewportPageCenter();
  const x = content ? content.maxX + 80 : center.x - 200;
  const y = content ? content.minY : center.y - h / 2;
  editor.createShapes([
    {
      id,
      type: POLL_TYPE,
      parentId: editor.getCurrentPageId(),
      x,
      y,
      props: {
        w: 400,
        h,
        question,
        questionText: question,
        questionType: "CUSTOM",
        numRespondents: 0,
        numResponders: 0,
        answers: options.map((key, i) => ({ id: i, key, numVotes: 0 })),
      },
      meta: { svsPoll: { creatorId: currentUserId(), published: false } },
    },
  ]);
  editor.select(id);
  editor.zoomToSelection({ duration: 200 });
  return id;
}

function sameTally(
  answers: PollAnswer[],
  counts: number[],
  total: number,
  shape: PollShape,
) {
  return (
    shape.props.numResponders === total &&
    answers.every((a, i) => a.numVotes === (counts[i] ?? 0))
  );
}

function VoteStrip({ shape }: { shape: PollShape }) {
  const editor = useEditor();
  const { answers } = shape.props;
  const poll = shape.meta.svsPoll;
  const { counts, total, mine } = usePollTally(shape.id, answers.length);
  const isCreator = poll?.creatorId === currentUserId();
  const published = poll ? poll.published : true; // BBB's own result shapes: shown as is

  // Published polls follow the votes. Every client writes the same tally, so
  // whoever sees the newest votes last leaves the right numbers.
  useEffect(() => {
    if (!poll || !published || sameTally(answers, counts, total, shape)) return;
    editor.updateShape({
      id: shape.id,
      type: POLL_TYPE,
      props: {
        numResponders: total,
        answers: answers.map((a, i) => ({ ...a, numVotes: counts[i] ?? 0 })),
      },
    });
  }, [editor, poll, published, answers, counts, total, shape]);

  if (!poll) return null; // a result BBB published: nothing to vote on

  const togglePublished = () => {
    const next = !published;
    editor.updateShape({
      id: shape.id,
      type: POLL_TYPE,
      meta: { ...shape.meta, svsPoll: { ...poll, published: next } },
      props: next
        ? {
            numResponders: total,
            answers: answers.map((a, i) => ({
              ...a,
              numVotes: counts[i] ?? 0,
            })),
          }
        : {
            numResponders: 0,
            answers: answers.map((a) => ({ ...a, numVotes: 0 })),
          },
    });
  };

  return (
    <div
      className="svs-vote"
      style={{ top: shape.props.h + 8, width: shape.props.w }}>
      <div className="svs-vote__options">
        {answers.map((answer, i) => (
          <button
            key={answer.id}
            type="button"
            className={`svs-vote__option${mine === i ? " svs-vote__option--mine" : ""}`}
            onPointerDown={stopEventPropagation}
            onClick={() =>
              mine === i ? withdrawVote(shape.id) : castVote(shape.id, i)
            }
            title={mine === i ? "Stimme zurückziehen" : "Abstimmen"}>
            {mine === i ? "✓ " : ""}
            {answer.key}
            {isCreator && !published ? ` · ${counts[i]}` : ""}
          </button>
        ))}
      </div>
      <div className="svs-vote__footer">
        <span>
          {total} {total === 1 ? "Stimme" : "Stimmen"}
          {!published && !isCreator
            ? " · Ergebnis noch nicht veröffentlicht"
            : ""}
        </span>
        {isCreator && (
          <button
            type="button"
            className="svs-vote__publish"
            onPointerDown={stopEventPropagation}
            onClick={togglePublished}>
            {published ? "Ergebnis verbergen" : "Ergebnis veröffentlichen"}
          </button>
        )}
      </div>
    </div>
  );
}

let patched = false;

/** Adds the vote strip to BBB's poll shape rendering (call once at start). */
export function enablePollVoting() {
  if (patched) return;
  const PollUtil = defaultShapeUtils.find((util) => util.type === POLL_TYPE);
  if (!PollUtil) throw new Error("@bigbluebutton/tldraw has no poll shape");
  const original = PollUtil.prototype.component as (
    shape: TLShape,
  ) => ReactElement;
  PollUtil.prototype.component = function (this: unknown, shape: TLShape) {
    return (
      <>
        {original.call(this, shape)}
        <VoteStrip shape={shape as PollShape} />
      </>
    );
  };
  patched = true;
}
