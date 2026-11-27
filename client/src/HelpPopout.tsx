import { useId } from "preact/hooks";
import adminWords from "../../docs/guides/en/admin.md?help";
import distributionWords from "../../docs/guides/en/distribution.md?help";
import frontDeskWords from "../../docs/guides/en/front-desk.md?help";
import { HELP_TOPICS, type HelpTopic } from "./help-topics.js";

const WORDS = {
  admin: adminWords,
  distribution: distributionWords,
  "front-desk": frontDeskWords,
};

// A ? button that opens a short piece of the guides in the browser's own popover, which
// handles opening, Escape, tapping outside and returning focus. Before iOS 18.3 tapping
// outside does not close it, so it always has a Close button. See ADR 0038.
export function HelpPopout(props: { topic: HelpTopic }) {
  const { title, guide } = HELP_TOPICS[props.topic];
  const id = useId();
  const titleId = `${id}-title`;
  return (
    <>
      <button type="button" class="help-button" popovertarget={id} aria-label={`Help: ${title}`}>
        <span aria-hidden="true">?</span>
      </button>
      <div id={id} popover="auto" class="popout" role="dialog" aria-labelledby={titleId}>
        <h3 id={titleId}>{title}</h3>
        {/* Written in this repository and converted at build time, never user input. */}
        {/* oxlint-disable-next-line react/no-danger */}
        {/* nosemgrep: javascript_react_rule-dangerouslysetinnerhtml, react-dangerouslysetinnerhtml -- the HTML is converted from this repository's guides at build time */}
        <div dangerouslySetInnerHTML={{ __html: WORDS[guide][props.topic] ?? "" }} />
        {/* Focus moves to Close when the card opens, and back to the ? when it closes. */}
        <button
          type="button"
          class="primary"
          popovertarget={id}
          popovertargetaction="hide"
          autofocus
        >
          Close
        </button>
      </div>
    </>
  );
}
