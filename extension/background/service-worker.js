'use strict';

importScripts('../lib/license-client.js');

// Periodic license revalidation. The client is offline-first, so this alarm is
// a convenience refresh, not a hard requirement.
const REVALIDATION_PERIOD_MINUTES = 720; // 12 hours

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create('revalidate-license', { periodInMinutes: REVALIDATION_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'revalidate-license') return;
  const result = await self.LicenseClient.validate();
  console.log('[license] periodic revalidation:', result.licensed ? 'licensed' : result.reason);
});
