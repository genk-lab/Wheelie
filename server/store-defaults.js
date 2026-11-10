export const emptyStore = {
  demos: [],
  purchases: [],
  contacts: [],
  events: [],
};

export function normalizeStore(value) {
  return { ...structuredClone(emptyStore), ...(value && typeof value === "object" ? value : {}) };
}
