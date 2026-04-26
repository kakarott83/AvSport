/**
 * In-memory AsyncStorage mock for Jest.
 * Replaces the native module so tests run without a device.
 */

let store: Record<string, string> = {};

const AsyncStorageMock = {
  getItem: jest.fn(async (key: string): Promise<string | null> => {
    return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
  }),
  setItem: jest.fn(async (key: string, value: string): Promise<void> => {
    store[key] = value;
  }),
  removeItem: jest.fn(async (key: string): Promise<void> => {
    delete store[key];
  }),
  clear: jest.fn(async (): Promise<void> => {
    Object.keys(store).forEach((k) => delete store[k]);
  }),
  /** Helper for tests: reset all stored data AND all call counts. */
  __reset(): void {
    Object.keys(store).forEach((k) => delete store[k]);
    this.getItem.mockClear();
    this.setItem.mockClear();
    this.removeItem.mockClear();
    this.clear.mockClear();
  },
};

export default AsyncStorageMock;
