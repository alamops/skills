import appsFlyer from 'react-native-appsflyer';

// Initialise attribution as early as possible so we never miss an install.
export function initAnalytics() {
  appsFlyer.initSdk({
    devKey: process.env.EXPO_PUBLIC_APPSFLYER_KEY ?? '',
    isDebug: false,
    appId: '6501234567',
    onInstallConversionDataListener: true,
    timeToWaitForATTUserAuthorization: 0,
  });
}

export function trackEvent(name: string, values: Record<string, unknown> = {}) {
  appsFlyer.logEvent(name, values);
}
