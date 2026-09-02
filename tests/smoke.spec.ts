import { test, expect } from '@playwright/test';

test('home redirects to Fraud Control Center', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Amar Bank', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fraud Control Center' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Customer 360' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Governance' })).toBeVisible();
  await expect(page.getByText('Queue Size').first()).toBeVisible({ timeout: 20000 });
});

test('Customer 360 page loads', async ({ page }) => {
  await page.goto('/customer');
  await expect(page.getByRole('heading', { name: 'Customer 360' })).toBeVisible();
  await expect(page.getByPlaceholder('Search customer ID…')).toBeVisible();
});

test('Ops Overview page loads', async ({ page }) => {
  await page.goto('/ops');
  await expect(page.getByRole('heading', { name: 'Retail Banking Ops Overview' })).toBeVisible();
});

test('Ask Amar (Genie) page loads', async ({ page }) => {
  await page.goto('/ask');
  await expect(page.getByRole('heading', { name: 'Ask Amar' })).toBeVisible();
});

test('Governance (RBAC/ABAC) page loads', async ({ page }) => {
  await page.goto('/governance');
  await expect(page.getByRole('heading', { name: 'Governed Data Access — RBAC + ABAC' })).toBeVisible();
  await expect(page.getByText('Fraud Analyst').first()).toBeVisible();
});

test('Architecture page loads', async ({ page }) => {
  await page.goto('/architecture');
  await expect(page.getByRole('heading', { name: 'Solution Architecture' })).toBeVisible();
});

test('AI/BI Dashboard page loads', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'AI/BI Dashboard (embedded)' })).toBeVisible();
});
