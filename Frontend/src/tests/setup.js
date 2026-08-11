import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement layout, so Element.prototype.scrollIntoView
// doesn't exist at all (this is a well-known jsdom gap, not something
// missing from the app — it works normally in real browsers). Chat.jsx
// calls it to keep the latest message in view as it streams in.
if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = () => {};
}
