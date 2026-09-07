/**
 * Jest-Mock für react-native-purchases (RevenueCat).
 * Das echte SDK ist ein natives Modul und ESM-only → in Tests nicht ladbar.
 *
 * Tests steuern das Verhalten über die Helfer unten
 * (`__setCustomerInfo`, `__emitCustomerInfo`, …).
 */

export enum LOG_LEVEL {
  VERBOSE = 'VERBOSE',
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

type Listener = (info: any) => void;

let customerInfo: any = { entitlements: { active: {} } };
let offerings: any = { current: null, all: {} };
const listeners = new Set<Listener>();

const Purchases = {
  configure: jest.fn(),
  setLogLevel: jest.fn(),
  logIn: jest.fn(async (appUserID: string) => ({ customerInfo, created: false })),
  logOut: jest.fn(async () => customerInfo),
  getCustomerInfo: jest.fn(async () => customerInfo),
  getOfferings: jest.fn(async () => offerings),
  purchasePackage: jest.fn(async (_pkg: any) => ({ customerInfo, productIdentifier: 'mock' })),
  restorePurchases: jest.fn(async () => customerInfo),
  addCustomerInfoUpdateListener: jest.fn((l: Listener) => { listeners.add(l); }),
  removeCustomerInfoUpdateListener: jest.fn((l: Listener) => listeners.delete(l)),
};

// ─── Test-Helfer ─────────────────────────────────────────────────────────────

export function __setCustomerInfo(info: any): void {
  customerInfo = info;
}

export function __setPremium(active: boolean): void {
  customerInfo = { entitlements: { active: active ? { premium: { identifier: 'premium' } } : {} } };
}

export function __emitCustomerInfo(info: any): void {
  customerInfo = info;
  listeners.forEach((l) => l(info));
}

export function __setOfferings(next: any): void {
  offerings = next;
}

export function __reset(): void {
  customerInfo = { entitlements: { active: {} } };
  offerings = { current: null, all: {} };
  listeners.clear();
  Object.values(Purchases).forEach((fn: any) => fn.mockClear?.());
}

export default Purchases;
