/// <reference types="jest" />

/**
 * Unit-Tests: RevenueCat-Wrapper (lib/purchases.ts)
 * `react-native-purchases` ist über __mocks__/react-native-purchases.ts gemockt.
 */

type PurchasesMock = typeof import('react-native-purchases') & {
  __setPremium: (v: boolean, productIdentifier?: string) => void;
  __emitCustomerInfo: (info: unknown) => void;
  __setOfferings: (o: unknown) => void;
  __reset: () => void;
};

function load() {
  let mod!: typeof import('./purchases');
  let mock!: PurchasesMock;
  jest.isolateModules(() => {
    mock = require('react-native-purchases') as PurchasesMock;
    mod = require('./purchases');
  });
  return { mod, mock };
}

const KEYS = {
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_test',
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: 'goog_test',
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(process.env, KEYS);
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
  delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
});

describe('configurePurchases', () => {
  it('konfiguriert das SDK, wenn ein Key gesetzt ist', () => {
    const { mod, mock } = load();
    expect(mod.configurePurchases()).toBe(true);
    expect(mod.isPurchasesConfigured()).toBe(true);
    expect((mock.default.configure as jest.Mock)).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: expect.any(String) }),
    );
  });

  it('ist ein No-op ohne Key', () => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
    const { mod, mock } = load();
    expect(mod.configurePurchases()).toBe(false);
    expect(mod.isPurchasesConfigured()).toBe(false);
    expect(mock.default.configure).not.toHaveBeenCalled();
  });
});

describe('Premium-Status', () => {
  it('isPremiumFromInfo erkennt aktives Entitlement', () => {
    const { mod } = load();
    expect(mod.isPremiumFromInfo({ entitlements: { active: { premium: {} } } } as never)).toBe(true);
    expect(mod.isPremiumFromInfo({ entitlements: { active: {} } } as never)).toBe(false);
    expect(mod.isPremiumFromInfo(null)).toBe(false);
  });

  it('getPremiumStatus liest den CustomerInfo aus dem SDK', async () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    mock.__setPremium(true);
    await expect(mod.getPremiumStatus()).resolves.toBe(true);
    mock.__setPremium(false);
    await expect(mod.getPremiumStatus()).resolves.toBe(false);
  });

  it('getPremiumStatus ist false, solange nicht konfiguriert', async () => {
    const { mod, mock } = load();
    mock.__setPremium(true);
    await expect(mod.getPremiumStatus()).resolves.toBe(false);
  });
});

describe('identifyUser / resetUser', () => {
  it('ruft logIn/logOut nur nach configure', async () => {
    const { mod, mock } = load();
    await mod.identifyUser('u1');
    expect(mock.default.logIn).not.toHaveBeenCalled();

    mod.configurePurchases();
    await mod.identifyUser('u1');
    expect(mock.default.logIn).toHaveBeenCalledWith('u1');

    await mod.resetUser();
    expect(mock.default.logOut).toHaveBeenCalled();
  });
});

describe('purchasePackage', () => {
  it('gibt CustomerInfo zurück', async () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    mock.__setPremium(true);
    const info = await mod.purchasePackage({ identifier: 'annual' } as never);
    expect(mod.isPremiumFromInfo(info)).toBe(true);
  });

  it('wirft PurchaseCancelledError bei Nutzer-Abbruch', async () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    (mock.default.purchasePackage as jest.Mock).mockRejectedValueOnce({ userCancelled: true });
    await expect(mod.purchasePackage({ identifier: 'x' } as never)).rejects.toBeInstanceOf(
      mod.PurchaseCancelledError,
    );
  });

  it('reicht andere Fehler durch', async () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    (mock.default.purchasePackage as jest.Mock).mockRejectedValueOnce(new Error('store down'));
    await expect(mod.purchasePackage({ identifier: 'x' } as never)).rejects.toThrow('store down');
  });
});

describe('addPremiumListener', () => {
  it('meldet Statusänderungen und lässt sich abmelden', () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    const seen: boolean[] = [];
    const off = mod.addPremiumListener((v) => seen.push(v));

    mock.__emitCustomerInfo({ entitlements: { active: { premium: {} } } });
    mock.__emitCustomerInfo({ entitlements: { active: {} } });
    off();
    mock.__emitCustomerInfo({ entitlements: { active: { premium: {} } } });

    expect(seen).toEqual([true, false]);
  });
});

describe('activeProductId', () => {
  it('liefert die Produkt-ID des aktiven Entitlements', () => {
    const { mod } = load();
    expect(mod.activeProductId({
      entitlements: { active: { premium: { productIdentifier: 'avorasport_premium_monthly' } } },
    } as never)).toBe('avorasport_premium_monthly');
  });

  it('liefert null ohne aktives Entitlement', () => {
    const { mod } = load();
    expect(mod.activeProductId({ entitlements: { active: {} } } as never)).toBeNull();
    expect(mod.activeProductId(null)).toBeNull();
  });
});

describe('describePackage', () => {
  it('beschriftet Jahres- und Monatspakete', () => {
    const { mod } = load();
    expect(mod.describePackage({
      packageType: 'ANNUAL', identifier: 'ann', product: { priceString: '49,99 €' },
    } as never)).toEqual({ title: 'Jährlich', sub: '49,99 € / Jahr' });
    expect(mod.describePackage({
      packageType: 'MONTHLY', identifier: 'mon', product: { priceString: '4,99 €' },
    } as never)).toEqual({ title: 'Monatlich', sub: '4,99 € / Monat' });
  });

  it('fällt bei unbekanntem Typ auf Produkttitel/ID zurück', () => {
    const { mod } = load();
    expect(mod.describePackage({
      packageType: 'CUSTOM', identifier: 'custom_id', product: { priceString: '9,99 €', title: '' },
    } as never)).toEqual({ title: 'custom_id', sub: '9,99 €' });
  });
});

describe('getActivePlanLabel', () => {
  it('liefert null, solange nicht konfiguriert', async () => {
    const { mod } = load();
    await expect(mod.getActivePlanLabel()).resolves.toBeNull();
  });

  it('liefert null, wenn nicht Premium', async () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    mock.__setPremium(false);
    await expect(mod.getActivePlanLabel()).resolves.toBeNull();
  });

  it('matcht das aktive Produkt gegen das aktuelle Offering', async () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    mock.__setPremium(true, 'avorasport_premium_monthly');
    mock.__setOfferings({
      current: {
        availablePackages: [
          { identifier: 'monthly', packageType: 'MONTHLY', product: { identifier: 'avorasport_premium_monthly', priceString: '4,99 €' } },
          { identifier: 'annual', packageType: 'ANNUAL', product: { identifier: 'avorasport_premium_annual', priceString: '49,99 €' } },
        ],
      },
    });
    await expect(mod.getActivePlanLabel()).resolves.toBe('Monatlich · 4,99 € / Monat');
  });

  it('liefert null, wenn kein passendes Paket im Offering gefunden wird', async () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    mock.__setPremium(true, 'unbekanntes_produkt');
    mock.__setOfferings({ current: { availablePackages: [] } });
    await expect(mod.getActivePlanLabel()).resolves.toBeNull();
  });
});

describe('restorePurchases', () => {
  it('gibt true zurück, wenn danach Premium aktiv ist', async () => {
    const { mod, mock } = load();
    mod.configurePurchases();
    mock.__setPremium(true);
    await expect(mod.restorePurchases()).resolves.toBe(true);
  });
});
