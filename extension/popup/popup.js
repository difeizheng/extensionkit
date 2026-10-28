'use strict';

const badge = document.getElementById('status-badge');
const output = document.getElementById('pro-output');
const runButton = document.getElementById('run-pro');

async function refresh() {
  const result = await LicenseClient.validate();
  if (result.licensed) {
    badge.textContent = 'ACTIVE';
    badge.className = 'badge on';
    output.textContent = 'License is active. Pro feature unlocked.';
  } else {
    badge.textContent = 'INACTIVE';
    badge.className = 'badge off';
    output.textContent = `Locked (${result.reason}). Activate a license key to unlock.`;
  }
}

runButton.addEventListener('click', async () => {
  if (await LicenseClient.isLicensed()) {
    // ── Your real Pro feature goes here ──
    output.textContent = '✓ Pro feature executed at ' + new Date().toLocaleTimeString();
  } else {
    output.textContent = 'Locked. Activate a license in Options first.';
  }
});

refresh();
