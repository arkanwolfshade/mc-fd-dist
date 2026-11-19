import type { ComponentChildren } from "preact";
import { useId, useRef, useState } from "preact/hooks";

// Words for screen readers only, such as the card number a row's button acts on, which the
// row already shows on screen.
export function ScreenReaderText(props: { children: ComponentChildren }) {
  return <span class="sr-only">{props.children}</span>;
}

// An error that screen readers read out as soon as it appears. The region is always there,
// because some screen readers ignore a region that arrives already holding its message.
export function ErrorMessage(props: { text: string }) {
  return (
    <div class="live" role="alert">
      {props.text && <p class="error">{props.text}</p>}
    </div>
  );
}

// Moves keyboard focus to a heading, so that a screen reader says where the user now is.
export function focusHeading(heading: HTMLElement | null | undefined): void {
  if (!heading) return;
  // Reachable by script, not by the Tab key.
  heading.tabIndex = -1;
  heading.focus();
}

// Runs once Preact has put the state changes just made on the page, for example to focus a
// button that they add. Preact renders in a microtask, which a timeout always follows.
export function afterRender(action: () => void): void {
  setTimeout(action, 0);
}

// A button that asks once more before doing something hard to take back. Asking moves focus
// to Cancel, the safe answer; Cancel puts it back on the button; Yes moves it to the heading
// of the section, because the row may disappear.
export function ConfirmButton(props: {
  label: ComponentChildren;
  question: string;
  yes: string;
  onYes: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const questionId = useId();

  if (!asking) {
    return (
      <button
        ref={button}
        onClick={() => {
          setAsking(true);
          afterRender(() => cancel.current?.focus());
        }}
      >
        {props.label}
      </button>
    );
  }
  return (
    <span class="ask">
      <span id={questionId}>{props.question}</span>
      <button
        aria-describedby={questionId}
        onClick={(event) => {
          const heading = event.currentTarget.closest("section")?.querySelector("h2");
          setAsking(false);
          props.onYes();
          focusHeading(heading);
        }}
      >
        {props.yes}
      </button>
      <button
        ref={cancel}
        class="primary"
        onClick={() => {
          setAsking(false);
          afterRender(() => button.current?.focus());
        }}
      >
        Cancel
      </button>
    </span>
  );
}
