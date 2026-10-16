export function selectedEvents() {
  return Array.from(document.querySelectorAll("#dropEventsWrap input[type=checkbox]:checked")).map((input) => input.value);
}

export function bindDropEvents(handler) {
  document.querySelectorAll("#dropEventsWrap input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", handler);
  });
}

export function fromDroppedEvent(hero) {
  const blocked = new Set(selectedEvents());
  if (!blocked.size) {
    return false;
  }
  return (hero.events || []).some((label) => blocked.has(label));
}
