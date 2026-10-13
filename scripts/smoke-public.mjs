import { chromium } from '@playwright/test';
import fs from 'node:fs';
import process from 'node:process';
import console from 'node:console';
const url = 'https://office.feezit.softitrend.com';
const evidence = process.env.OFFICE_PUBLIC_EVIDENCE;
if (!evidence) throw new Error('Set OFFICE_PUBLIC_EVIDENCE outside the source repository');
fs.mkdirSync(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const pages = [];
try {
  for (const [name, viewport] of Object.entries({desktop: {width: 1440, height: 1000}, mobile: {width: 390, height: 844}})) {
    const context = await browser.newContext({viewport, locale: 'fr-FR'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /Content Security Policy|Refused to|blocked by/i.test(message.text())) errors.push(message.text());
    });
    const response = await page.goto(url, {waitUntil: 'networkidle'});
    if (response?.status() !== 200) throw new Error('Public page did not return 200');
    await page.getByRole('heading', {name: 'Connexion opérateur', exact: true}).waitFor();
    await page.getByLabel('Identifiant Office').waitFor();
    await page.getByLabel('Mot de passe', {exact: true}).waitFor();
    await page.getByRole('button', {name: 'Se connecter', exact: true}).waitFor();
    const overflow = await page.evaluate(() => globalThis.document.documentElement.scrollWidth > globalThis.innerWidth);
    if (overflow || errors.length) throw new Error(JSON.stringify({name, overflow, errors}));
    await page.screenshot({path: `${evidence}/${name}-public-login.png`, fullPage: true});
    pages.push({name, result: 'PASS', certificateValidation: true, loginFormHydrated: true, horizontalOverflow: false, javascriptOrCspErrors: 0});
    await context.close();
  }
  const report = {result: 'PASS', url, checkedAt: new Date().toISOString(), pages, scope: 'Anonymous real browser; no password entered, no login or business mutation'};
  fs.writeFileSync(`${evidence}/browser-verification.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
