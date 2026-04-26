/**
 * Stub for react-native-health-connect.
 * All SDK calls are replaced with jest.fn() so tests never hit native code.
 */

export const SdkAvailabilityStatus = {
  SDK_AVAILABLE: 3,
  SDK_UNAVAILABLE: 1,
  SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
} as const;

export const getSdkStatus = jest.fn().mockResolvedValue(SdkAvailabilityStatus.SDK_AVAILABLE);
export const initialize = jest.fn().mockResolvedValue(true);
export const requestPermission = jest.fn().mockResolvedValue([]);
export const readRecords = jest.fn().mockResolvedValue({ records: [] });
